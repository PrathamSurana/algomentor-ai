from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    frontend_origin: str = "http://localhost:5173"
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    ai_provider: str = "gemini"
    gemini_model: str = "gemini-2.5-flash"
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str | None) -> str | None:
        if value and not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use postgresql+psycopg://")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
