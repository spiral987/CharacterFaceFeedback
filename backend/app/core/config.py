from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Feedback Art Backend"
    app_env: str = "dev"
    allowed_origins: str = "http://localhost:3000"
    app_log_level: str = "INFO"
    bo_debug: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
