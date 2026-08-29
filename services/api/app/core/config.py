from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Postgres
    database_url: str = "postgresql+asyncpg://mindspace:mindspace@localhost:5432/mindspace"

    # API
    api_port: int = 8000
    api_env: str = "development"
    api_log_level: str = "info"
    api_jwt_secret: str = "change-me-openssl-rand-base64-48-secret-for-jwt-signing"
    api_jwt_issuer: str = "mindspace-api"
    api_access_token_ttl_seconds: int = 3600
    api_refresh_token_ttl_days: int = 30
    api_cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    run_scheduler: bool = False

    # Cutover
    supabase_jwt_secret: str | None = None

    # Storage (MinIO / S3)
    s3_bucket: str = "recordings"
    s3_region: str = "us-east-1"
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = "http://localhost:9000"
    s3_max_upload_bytes: int = 26_214_400  # 25 MiB
    s3_presign_ttl_seconds: int = 600

    # BYOK Encryption (32-byte base64)
    byok_master_key: str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

    # Platform AI Provider Keys
    platform_openrouter_key: str | None = None
    platform_openai_key: str | None = None
    platform_google_key: str | None = None
    platform_anthropic_key: str | None = None
    platform_nvidia_key: str | None = None

    # Payments
    allow_test_pay: bool = True
    google_play_service_account_json: str | None = None
    google_play_package_name: str | None = None
    apple_iap_issuer_id: str | None = None
    apple_iap_key_id: str | None = None
    apple_iap_private_key: str | None = None
    apple_iap_bundle_id: str | None = None
    instapay_gateway_api_key: str | None = None
    instapay_merchant_id: str | None = None

    # Email & Password Reset
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "no-reply@mindspace.app"
    password_reset_url: str = "mindspace://reset-password"

    @computed_field
    @property
    def cors_origins_list(self) -> list[str]:
        if not self.api_cors_origins:
            return ["*"]
        return [origin.strip() for origin in self.api_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
