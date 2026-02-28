from __future__ import annotations

import logging

from supabase import create_client, Client

from .config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()

supabase: Client | None = None

if _settings.supabase_url and _settings.supabase_anon_key:
    supabase = create_client(_settings.supabase_url, _settings.supabase_anon_key)
    logger.info("Supabase client initialized")
else:
    logger.warning("SUPABASE_URL or SUPABASE_ANON_KEY not set — database features disabled")


def get_db() -> Client:
    """FastAPI dependency that provides the Supabase client."""
    if supabase is None:
        raise RuntimeError("Database not configured — set SUPABASE_URL and SUPABASE_ANON_KEY")
    return supabase
