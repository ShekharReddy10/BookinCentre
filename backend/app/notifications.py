"""Telegram + email senders. Every function is a safe no-op (logs and returns False)
when the relevant credentials aren't configured, so the app runs fine without them.
"""
import logging
import smtplib
from email.mime.text import MIMEText

import httpx

from app.config import settings

logger = logging.getLogger("bcc.notifications")


def send_telegram_message(text: str) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.info("Telegram not configured, skipping message: %s", text[:80])
        return False
    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json={"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.warning("Telegram send failed: %s", e)
        return False


def _send_via_resend(to: list[str], subject: str, html: str) -> bool:
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.resend_from_email, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.warning("Resend send failed: %s", e)
        return False


def _send_via_smtp(to: list[str], subject: str, html: str) -> bool:
    try:
        msg = MIMEText(html, "html")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email or settings.smtp_user
        msg["To"] = ", ".join(to)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to, msg.as_string())
        return True
    except (smtplib.SMTPException, OSError) as e:
        logger.warning("SMTP send failed: %s", e)
        return False


def send_email(to: list[str], subject: str, html: str) -> bool:
    if not to:
        logger.info("No email recipients configured, skipping: %s", subject)
        return False
    if settings.resend_api_key:
        return _send_via_resend(to, subject, html)
    if settings.smtp_host:
        return _send_via_smtp(to, subject, html)
    logger.info("No email provider configured, skipping: %s", subject)
    return False
