from __future__ import annotations

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

WORLD_MODELS_DIR = Path(__file__).resolve().parents[2] / "world-models"
MODAL_APP_PATH = WORLD_MODELS_DIR / "src" / "modal_app.py"


def deploy_world_model(name: str) -> dict:
    """Deploy the Modal vision app.

    Runs `modal deploy` on the modal_app.py file in packages/world-models/.

    Args:
        name: Deployment label (for logging/status tracking).

    Returns:
        Status dict with name, status, and output or error details.
    """
    if not MODAL_APP_PATH.exists():
        return {
            "name": name,
            "status": "error",
            "error": f"Modal app not found at {MODAL_APP_PATH}",
        }

    logger.info("Deploying Modal app '%s' from %s", name, MODAL_APP_PATH)

    try:
        result = subprocess.run(
            ["uv", "run", "modal", "deploy", str(MODAL_APP_PATH)],
            cwd=str(WORLD_MODELS_DIR),
            capture_output=True,
            text=True,
            timeout=600,
        )
    except FileNotFoundError:
        return {
            "name": name,
            "status": "error",
            "error": "uv or modal CLI not found — ensure both are installed",
        }
    except subprocess.TimeoutExpired:
        return {
            "name": name,
            "status": "error",
            "error": "Deployment timed out after 10 minutes",
        }

    if result.returncode == 0:
        logger.info("Modal deploy succeeded for '%s'", name)
        return {
            "name": name,
            "status": "deployed",
            "output": result.stdout.strip(),
        }

    logger.error("Modal deploy failed for '%s': %s", name, result.stderr)
    return {
        "name": name,
        "status": "error",
        "error": result.stderr.strip(),
        "output": result.stdout.strip(),
    }
