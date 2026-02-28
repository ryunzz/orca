"""Cloud inference client for ORCA agent teams.

This module provides async HTTP clients for calling cloud-deployed vision agents.
Supports Modal endpoints, OpenClaw API, or any HTTP-based inference endpoint.

Usage:
    client = CloudInferenceClient()
    result = await client.analyze("fire_severity", frame_path, frame_id="001")
"""
from __future__ import annotations

import asyncio
import base64
import logging
from pathlib import Path
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

# Default timeout for inference calls (seconds)
DEFAULT_TIMEOUT = 120.0


class CloudInferenceClient:
    """Async HTTP client for cloud-deployed ORCA agents.

    Supports multiple backends:
    - Modal: Serverless GPU inference
    - OpenClaw: Third-party vision API
    - Custom: Any HTTP endpoint returning structured JSON
    """

    def __init__(self):
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _get_endpoint_url(self) -> str:
        """Get the inference endpoint URL."""
        # Priority: WORLD_MODEL_ENDPOINT > default Modal URL
        if self.settings.world_model_endpoint:
            return self.settings.world_model_endpoint
        # Default Modal endpoint (update after deployment)
        return "https://orca-vision--analyze-endpoint.modal.run"

    def _get_headers(self) -> dict[str, str]:
        """Build request headers with auth if configured."""
        headers = {"Content-Type": "application/json"}

        # Add API key if configured
        if self.settings.world_model_api_key:
            headers["Authorization"] = f"Bearer {self.settings.world_model_api_key}"
        elif self.settings.openclaw_api_key:
            headers["X-OpenClaw-Key"] = self.settings.openclaw_api_key

        return headers

    async def analyze(
        self,
        team_type: str,
        frame_path: str | bytes,
        context: dict[str, Any] | None = None,
        frame_id: str = "unknown",
    ) -> dict[str, Any]:
        """Send frame to cloud endpoint for analysis.

        Args:
            team_type: One of fire_severity, structural, evacuation, personnel
            frame_path: Path to image file or raw bytes
            context: Upstream team results (for dependent teams)
            frame_id: Identifier for the frame

        Returns:
            Structured JSON matching the team's output schema

        Raises:
            CloudInferenceError: If the request fails
        """
        # Encode the frame
        if isinstance(frame_path, bytes):
            frame_base64 = base64.standard_b64encode(frame_path).decode()
        elif isinstance(frame_path, str):
            path = Path(frame_path)
            if path.exists():
                frame_base64 = base64.standard_b64encode(path.read_bytes()).decode()
            else:
                # Mock frame for demo/testing
                logger.warning(f"Frame not found: {frame_path}, using empty placeholder")
                frame_base64 = ""
        else:
            raise ValueError(f"Invalid frame type: {type(frame_path)}")

        payload = {
            "frame_base64": frame_base64,
            "team_type": team_type,
            "context": context,
            "frame_id": frame_id,
        }

        client = await self._get_client()
        url = self._get_endpoint_url()
        headers = self._get_headers()

        try:
            logger.info(f"Calling cloud inference: {team_type} at {url}")
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()
            logger.info(f"Cloud inference complete: {team_type}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Cloud inference HTTP error: {e.response.status_code} - {e.response.text}")
            raise CloudInferenceError(f"HTTP {e.response.status_code}: {e.response.text}") from e
        except httpx.RequestError as e:
            logger.error(f"Cloud inference request error: {e}")
            raise CloudInferenceError(f"Request failed: {e}") from e

    async def analyze_batch(
        self,
        team_type: str,
        frames: list[str | bytes],
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Analyze multiple frames concurrently.

        Args:
            team_type: Team type for all frames
            frames: List of frame paths or bytes
            context: Shared context for all frames

        Returns:
            List of results in same order as input frames
        """
        tasks = [
            self.analyze(team_type, frame, context, frame_id=f"frame_{i:03d}")
            for i, frame in enumerate(frames)
        ]
        return await asyncio.gather(*tasks, return_exceptions=True)

    async def health_check(self) -> bool:
        """Check if the cloud endpoint is reachable."""
        try:
            client = await self._get_client()
            url = self._get_endpoint_url()
            response = await client.get(url.replace("/analyze", "/health"))
            return response.status_code < 500
        except Exception:
            return False


class CloudInferenceError(Exception):
    """Raised when cloud inference fails."""
    pass


# Singleton client
_client: CloudInferenceClient | None = None


def get_cloud_client() -> CloudInferenceClient:
    """Get the singleton cloud inference client."""
    global _client
    if _client is None:
        _client = CloudInferenceClient()
    return _client


async def analyze_remote(
    team_type: str,
    frame_path: str | bytes,
    context: dict[str, Any] | None = None,
    frame_id: str = "unknown",
) -> dict[str, Any]:
    """Convenience function for remote analysis."""
    client = get_cloud_client()
    return await client.analyze(team_type, frame_path, context, frame_id)
