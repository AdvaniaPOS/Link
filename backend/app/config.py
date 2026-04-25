from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., alias="DATABASE_URL")

    redis_url: str = Field("redis://localhost:6379/0", alias="REDIS_URL")
    celery_broker_url: str = Field("memory://", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field("cache+memory://", alias="CELERY_RESULT_BACKEND")

    resend_api_key: str = Field("re_REPLACE_ME", alias="RESEND_API_KEY")
    resend_from_email: str = Field("onboarding@resend.dev", alias="RESEND_FROM_EMAIL")
    resend_from_name: str = Field("Betala Link", alias="RESEND_FROM_NAME")

    public_base_url: str = Field("https://betala.link", alias="PUBLIC_BASE_URL")
    cors_origins: str = Field("http://localhost:5173", alias="CORS_ORIGINS")
    admin_token: str = Field("dev-admin-token-change-me-please", alias="ADMIN_TOKEN")
    celery_eager: bool = Field(True, alias="CELERY_EAGER")
    uploads_dir: str = Field("uploads", alias="UPLOADS_DIR")
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    debug_endpoints: bool = Field(False, alias="DEBUG_ENDPOINTS")
    # Comma-separated list. Empty string disables TrustedHostMiddleware (dev default).
    trusted_hosts: str = Field("", alias="TRUSTED_HOSTS")
    gzip_min_size: int = Field(500, alias="GZIP_MIN_SIZE")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_host_list(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts.split(",") if h.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
