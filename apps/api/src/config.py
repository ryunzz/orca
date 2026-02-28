from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv
import os

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://worldgen:worldgen@localhost:5432/worldgen").replace("postgresql://", "postgresql+asyncpg://")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    modal_token_id: str | None = os.getenv("MODAL_TOKEN_ID")
    modal_token_secret: str | None = os.getenv("MODAL_TOKEN_SECRET")
    solana_rpc_url: str = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    solana_payer_private_key: str | None = os.getenv("SOLANA_PAYER_PRIVATE_KEY")
    openclaw_api_key: str | None = os.getenv("OPENCLAW_API_KEY")
    world_model_api_key: str | None = os.getenv("WORLD_MODEL_API_KEY")
    world_model_endpoint: str | None = os.getenv("WORLD_MODEL_ENDPOINT")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
