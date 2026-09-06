"""
Application configuration using pydantic-settings.
Loads from .env file and environment variables.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Apply Flow application settings."""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    # Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "applyflow"
    db_user: str = "applyflow_user"
    db_password: str = "strong_password"
    database_url_raw: str | None = Field(default=None, alias="database_url")
    database_url_override: str | None = None
    use_sqlite: bool = False

    # Redis / Production Cache
    redis_url: str | None = None

    # JWT
    jwt_secret_key: str = "applyflow-dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Cloudflare R2 Resume Storage
    r2_account_id: str | None = Field(default=None, alias="r2_account_id")
    r2_access_key_id: str | None = Field(default=None, alias="r2_access_key_id")
    r2_secret_access_key: str | None = Field(default=None, alias="r2_secret_access_key")
    r2_bucket_name: str = Field(default="applyflow-resumes", alias="r2_bucket_name")
    r2_endpoint_url: str | None = Field(default=None, alias="r2_endpoint_url")
    r2_public_url: str | None = Field(default=None, alias="r2_public_url")
    resume_retention_days: int = Field(default=120, alias="resume_retention_days")

    # Legacy Google Apps Script Web App Storage (fallback)
    google_apps_script_url: str = ""
    google_drive_root_folder_id: str = ""

    # Groq & Multi-Provider AI Gateway Keys
    ai_provider: str | None = Field(default=None, alias="ai_provider")
    groq_api_key: str | None = None
    groq_api_key_1: str | None = Field(default=None, alias="groq_api_key_1")
    groq_api_key_2: str | None = Field(default=None, alias="groq_api_key_2")
    groq_api_key_3: str | None = Field(default=None, alias="groq_api_key_3")
    openai_api_key: str | None = Field(default=None, alias="openai_api_key")
    gemini_api_key: str | None = Field(default=None, alias="gemini_api_key")
    groq_model: str = "llama-3.3-70b-versatile"
    openai_model: str = "gpt-4o-mini"
    gemini_model: str = "gemini-1.5-flash"

    # Supabase Storage (Interview Intelligence Dataset & Models)
    supabase_url: str | None = "https://ztcmimbnadojqehiocgd.supabase.co"
    supabase_secret_key: str | None = None
    supabase_bucket: str = "applyflow-storage"

    # CORS
    frontend_url: str = "http://localhost:5173"

    # Web Push (VAPID)
    vapid_public_key: str | None = Field(default=None, alias="vapid_public_key")
    vapid_private_key: str | None = Field(default=None, alias="vapid_private_key")
    vapid_email: str = "mailto:admin@applyflow.com"

    # Initial Admin Seed
    admin_email: str = "harishabblu@gmail.com"
    admin_password: str = "Harish@2007"
    admin_name: str = "Harish Admin"

    @property
    def computed_r2_endpoint(self) -> str | None:
        """Returns the Cloudflare R2 S3-compatible API endpoint."""
        if self.r2_endpoint_url:
            return self.r2_endpoint_url.strip()
        if self.r2_account_id:
            return f"https://{self.r2_account_id.strip()}.r2.cloudflarestorage.com"
        return None

    @property
    def database_url(self) -> str:
        """Async connection URL for SQLAlchemy asyncpg engine."""
        if self.use_sqlite:
            return "sqlite+aiosqlite:///./applyflow.db"

        import re

        raw = (self.database_url_override or self.database_url_raw or "").strip()
        if raw:
            if raw.startswith("postgres://"):
                raw = "postgresql+asyncpg://" + raw[len("postgres://"):]
            elif raw.startswith("postgresql://") and not raw.startswith("postgresql+asyncpg://"):
                raw = "postgresql+asyncpg://" + raw[len("postgresql://"):]
            # asyncpg expects 'ssl=require' instead of 'sslmode=require'
            raw = raw.replace("sslmode=require", "ssl=require")
            raw = raw.replace("sslmode=prefer", "ssl=prefer")
            raw = raw.replace("sslmode=disable", "ssl=disable")
            # Remove channel_binding (Neon copy string includes it, unsupported by asyncpg)
            raw = re.sub(r'[?&]channel_binding=[^&]*', '', raw)
            if '?' not in raw and '&' in raw:
                raw = raw.replace('&', '?', 1)
            return raw

        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync URL for Alembic and migration scripts."""
        if self.use_sqlite:
            return "sqlite:///./applyflow.db"

        import re

        raw = (self.database_url_override or self.database_url_raw or "").strip()
        if raw:
            if raw.startswith("postgresql+asyncpg://"):
                raw = "postgresql+psycopg2://" + raw[len("postgresql+asyncpg://"):]
            elif raw.startswith("postgres://"):
                raw = "postgresql+psycopg2://" + raw[len("postgres://"):]
            elif raw.startswith("postgresql://") and not raw.startswith("postgresql+psycopg2://"):
                raw = "postgresql+psycopg2://" + raw[len("postgresql://"):]
            # psycopg2 expects 'sslmode=require'
            raw = raw.replace("?ssl=require", "?sslmode=require").replace("&ssl=require", "&sslmode=require")
            raw = re.sub(r'[?&]channel_binding=[^&]*', '', raw)
            if '?' not in raw and '&' in raw:
                raw = raw.replace('&', '?', 1)
            return raw

        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()


def ensure_vapid_keys() -> None:
    """
    Ensures VAPID keys exist. If not configured in environment, generates a valid
    URL-safe Base64 EC keypair in memory and prints instructions.
    """
    if settings.vapid_public_key and settings.vapid_private_key:
        return

    try:
        import base64

        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            NoEncryption,
            PrivateFormat,
            PublicFormat,
        )
        from py_vapid import Vapid

        v = Vapid()
        v.generate_keys()

        raw_priv = v.private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
        b64_priv = base64.urlsafe_b64encode(raw_priv).rstrip(b"=").decode("utf-8")

        raw_pub = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        b64_pub = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode("utf-8")

        settings.vapid_public_key = b64_pub
        settings.vapid_private_key = b64_priv

        print("\n=== APPLYFLOW AUTO-GENERATED VAPID KEYS ===")
        print(f"VAPID_PUBLIC_KEY={b64_pub}")
        print(f"VAPID_PRIVATE_KEY={b64_priv}")
        print("VAPID_EMAIL=mailto:admin@applyflow.com")
        print("Save these in backend/.env for persistent production use.\n")
    except Exception as exc:
        print(f"⚠️ Note during auto VAPID key generation: {exc}")


