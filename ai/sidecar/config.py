from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from the environment. Off unless AI_ENABLED is set (ADR #64)."""

    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    ai_enabled: bool = False
    diary_api_base: str = "http://diary-web/api/v1"
    database_url: str | None = None  # mysql://diary_ai:...@rddb.darkovski.dev:3306/diary_ai
    daily_cap_usd: Decimal = Decimal("5.00")
    model: str = "claude-haiku-5-5"
