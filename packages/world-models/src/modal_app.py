"""Modal app for running Ollama vision inference on cloud GPUs.

Self-contained — no local imports. Runs entirely inside the Modal container.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any

import modal

ollama_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("curl", "zstd")
    .pip_install("fastapi[standard]")
    .run_commands(
        "curl -fsSL https://ollama.com/install.sh | sh",
    )
    .run_commands(
        "ollama serve & sleep 5 && ollama pull llama3.2-vision:11b; pkill ollama || true",
        gpu="H100",
    )
)

app = modal.App("orca-vision")

OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2-vision:11b")
STARTUP_WAIT_SECONDS = int(os.environ.get("OLLAMA_STARTUP_WAIT_SECONDS", "60"))
INFERENCE_TIMEOUT_SECONDS = int(os.environ.get("OLLAMA_INFERENCE_TIMEOUT_SECONDS", "420"))
SCALEDOWN_WINDOW_SECONDS = int(os.environ.get("MODAL_SCALEDOWN_WINDOW_SECONDS", "1800"))
MAX_CONTAINERS = int(os.environ.get("MODAL_MAX_CONTAINERS", "2"))
OLLAMA_NUM_PREDICT = int(os.environ.get("OLLAMA_NUM_PREDICT", "2048"))
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "30m")


@app.cls(
    image=ollama_image,
    gpu="H100",
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    timeout=600,
    max_containers=MAX_CONTAINERS,
)
class VisionModel:
    """Runs Ollama vision model inside a Modal container."""

    _proc: subprocess.Popen | None = None

    @modal.enter()
    def start_ollama(self) -> None:
        """Start the Ollama server and wait until it's ready."""
        self._proc = subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        from urllib.request import urlopen
        from urllib.error import URLError

        max_attempts = max(1, STARTUP_WAIT_SECONDS)
        for _ in range(max_attempts):
            try:
                urlopen("http://127.0.0.1:11434/api/tags", timeout=2)
                break
            except (URLError, OSError):
                time.sleep(1)
        else:
            raise RuntimeError(f"Ollama failed to start within {STARTUP_WAIT_SECONDS} seconds")

        # Text-only warmup — preloads model weights into GPU memory.
        from urllib.request import Request
        warmup_payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": "hi",
            "stream": False,
        }).encode()
        warmup_req = Request(
            "http://127.0.0.1:11434/api/generate",
            data=warmup_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(warmup_req, timeout=180) as resp:
            resp.read()

    @modal.exit()
    def stop_ollama(self) -> None:
        """Terminate the Ollama server process."""
        if self._proc is not None:
            self._proc.terminate()
            self._proc.wait(timeout=10)

    def _run_inference(self, image_data_b64: str, prompt: str) -> dict[str, Any]:
        """Core inference logic — calls Ollama locally. No Modal decorators."""
        from urllib.request import Request, urlopen

        payload = json.dumps({
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "images": [image_data_b64],
            "stream": False,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "options": {
                "num_predict": OLLAMA_NUM_PREDICT,
                "repeat_penalty": 1.3,
                "temperature": 0.1,
            },
        }).encode()

        req = Request(
            "http://127.0.0.1:11434/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=INFERENCE_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read())

        raw = body.get("response", "").strip()
        if not raw:
            raise ValueError(
                f"Ollama returned empty response. Keys: {list(body.keys())}, done: {body.get('done')}"
            )

        # Not all prompts force JSON output; avoid 500s by returning raw content.
        try:
            return self._parse_json_response(raw)
        except Exception:
            return {
                "raw_response": raw,
                "model": OLLAMA_MODEL,
                "parse_error": "response was not valid JSON",
            }

    @modal.method()
    def analyze(self, image_data_b64: str, prompt: str) -> dict:
        """Modal RPC method for vision analysis (called via .remote())."""
        return self._run_inference(image_data_b64, prompt)

    @modal.fastapi_endpoint(method="POST")
    def web_analyze(self, item: dict) -> dict:
        """Public HTTP endpoint for vision analysis.

        POST JSON: {"image": "<base64>", "prompt": "..."}
        Returns: parsed JSON from the vision model.
        """
        image_data = item.get("image", "")
        prompt = item.get("prompt", "")
        if not image_data or not prompt:
            return {"error": "Both 'image' (base64) and 'prompt' fields are required."}

        try:
            return self._run_inference(image_data, prompt)
        except Exception as exc:
            # Keep error payload structured so callers can debug quickly from curl.
            return {"error": str(exc), "model": OLLAMA_MODEL}

    @staticmethod
    def _parse_json_response(raw: str) -> dict:
        """Parse JSON from model response, stripping markdown fences if present.

        Falls back to wrapping raw text if JSON parsing fails.
        """
        text = raw
        if text.startswith("```"):
            lines = text.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end])
            except json.JSONDecodeError:
                pass
        # Model didn't return valid JSON — wrap the raw text
        return {"raw_response": raw}


@app.local_entrypoint()
def test_vision() -> None:
    """Quick smoke test — encode a tiny red image and run analysis."""
    import base64
    from io import BytesIO

    try:
        from PIL import Image
    except ImportError:
        print("Pillow not installed locally, using placeholder image")
        red_pixel = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
            b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
            b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        image_b64 = base64.b64encode(red_pixel).decode()
    else:
        img = Image.new("RGB", (64, 64), color=(255, 50, 0))
        buf = BytesIO()
        img.save(buf, format="PNG")
        image_b64 = base64.b64encode(buf.getvalue()).decode()

    model = VisionModel()
    result = model.analyze.remote(
        image_b64,
        "Describe what you see in this image. Respond with JSON: {\"description\": \"...\"}",
    )
    print(f"Result: {json.dumps(result, indent=2)}")
