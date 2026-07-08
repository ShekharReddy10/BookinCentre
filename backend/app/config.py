from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./bcc.db"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 1440
    frontend_origin: str = "http://localhost:3000"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    resend_api_key: str = ""
    resend_from_email: str = "BCC <onboarding@resend.dev>"

    # SMTP fallback, used only if resend_api_key is empty
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""

    # Recipient(s) for reminder/summary emails (comma-separated). Falls back to all active admins if empty.
    notification_email_to: str = ""

    # Shared secret required to trigger /automation/* endpoints (e.g. from a GitHub Actions cron job)
    automation_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator(
        "database_url", "secret_key", "frontend_origin", "telegram_bot_token", "telegram_chat_id",
        "resend_api_key", "resend_from_email", "smtp_host", "smtp_user", "smtp_password",
        "smtp_from_email", "notification_email_to", "automation_secret",
        mode="before",
    )
    @classmethod
    def _strip_whitespace(cls, value):
        # Dashboard env-var UIs (Render, etc.) sometimes sneak in a trailing
        # newline/space on paste — strip defensively so it can never break a
        # connection string or secret comparison again.
        return value.strip() if isinstance(value, str) else value


settings = Settings()
