from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    frontend_origin: str = "http://localhost:5173"
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    ai_provider: str = "gemini"
    gemini_api_key: str | None = None
    openai_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
