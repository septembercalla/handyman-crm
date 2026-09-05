from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from the environment / .env (SPEC §8)."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/handyman"

    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    ALGORITHM: str = "HS256"

    GOOGLE_MAPS_API_KEY: str = ""
    GOOGLE_MAPS_SERVER_API_KEY: str = ""
    BUSINESS_TIMEZONE: str = "America/Chicago"

    # Private worker documents. `local` is intended for development only; the
    # interface in app.services.storage can be swapped for R2/S3 in production.
    FILE_STORAGE_BACKEND: str = "local"
    FILE_STORAGE_LOCAL_PATH: str = ".private-storage"
    FILE_STORAGE_MAX_MB: int = 10

    CORS_ORIGINS: str = "http://localhost:3000"

    PORT: int = 8000
    ENV: str = "development"

    @field_validator("BUSINESS_TIMEZONE")
    @classmethod
    def validate_business_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("BUSINESS_TIMEZONE must be a valid IANA timezone") from exc
        return value

    @field_validator("DATABASE_URL")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """
        Railway hands out `postgresql://...` (and sometimes `postgres://...`).
        SQLAlchemy needs an explicit driver, so we pin psycopg3 here instead of
        asking anyone to remember the `+psycopg` suffix.
        """
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() in {"production", "prod"}

    @property
    def google_server_api_key(self) -> str:
        """Dedicated server key, with the old variable kept as a safe fallback."""
        return self.GOOGLE_MAPS_SERVER_API_KEY or self.GOOGLE_MAPS_API_KEY


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
