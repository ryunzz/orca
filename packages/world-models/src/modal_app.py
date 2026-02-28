"""Modal app for running Ollama vision inference on cloud GPUs.

Self-contained — no local imports. Runs entirely inside the Modal container.
"""

from __future__ import annotations

import json
import subprocess
import time

import modal

ollama_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.0-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("curl", "zstd")
    .run_commands(
        "curl -fsSL https://ollama.com/install.sh | sh",
    )
    .run_commands(
        "ollama serve & sleep 5 && ollama pull llama3.2-vision:11b; pkill ollama || true",
        gpu="T4",
    )
)

app = modal.App("orca-vision")


@app.cls(
    image=ollama_image,
    gpu="T4",
    scaledown_window=300,
    timeout=180,
    max_containers=2,
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
        # Wait for Ollama to become responsive
        from urllib.request import urlopen
        from urllib.error import URLError

        for _ in range(30):
            try:
                urlopen("http://127.0.0.1:11434/api/tags", timeout=2)
                break
            except (URLError, OSError):
                time.sleep(1)
        else:
            raise RuntimeError("Ollama failed to start within 30 seconds")

        # Warm up the model so weights are loaded into GPU memory
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Warming up llama3.2-vision:11b...")
        warmup_payload = json.dumps({
            "model": "llama3.2-vision:11b",
            "prompt": "hi",
            "stream": False,
        }).encode()
        from urllib.request import Request
        warmup_req = Request(
            "http://127.0.0.1:11434/api/generate",
            data=warmup_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(warmup_req, timeout=120) as resp:
            resp.read()
        logger.info("Model warmed up")

    @modal.exit()
    def stop_ollama(self) -> None:
        """Terminate the Ollama server process."""
        if self._proc is not None:
            self._proc.terminate()
            self._proc.wait(timeout=10)

    @modal.method()
    def analyze(self, image_data_b64: str, prompt: str) -> dict:
        """Run vision analysis on an image.

        Args:
            image_data_b64: Base64-encoded image data.
            prompt: The analysis prompt to send to the model.

        Returns:
            Parsed JSON dict from the model response.
        """
        from urllib.request import Request, urlopen

        payload = json.dumps({
            "model": "llama3.2-vision:11b",
            "prompt": prompt,
            "images": [image_data_b64],
            "stream": False,
        }).encode()

        req = Request(
            "http://127.0.0.1:11434/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())

        raw = body.get("response", "").strip()
        if not raw:
            raise ValueError(f"Ollama returned empty response. Keys: {list(body.keys())}, done: {body.get('done')}")
        return self._parse_json_response(raw)

    @staticmethod
    def _parse_json_response(raw: str) -> dict:
        """Parse JSON from model response, stripping markdown fences if present."""
        if raw.startswith("```"):
            lines = raw.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines)
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        return json.loads(raw)


@app.local_entrypoint()
def test_vision() -> None:
    """Quick smoke test — encode a tiny red image and run analysis."""
    import base64
    from io import BytesIO

    try:
        from PIL import Image
    except ImportError:
        print("Pillow not installed locally, using placeholder image")
        # 1x1 red pixel PNG
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
