from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.config import settings
from app.database import get_db
from app.ical_sync import sync_all_feeds
from app.models import User, UserRole
from app.notifications import send_email, send_telegram_message
from app.reminders import run_daily_reminders

router = APIRouter(prefix="/automation", tags=["automation"])


def verify_automation_secret(x_automation_secret: str = Header(default="")):
    if not settings.automation_secret:
        raise HTTPException(status_code=503, detail="AUTOMATION_SECRET is not configured on the server")
    if x_automation_secret != settings.automation_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Automation-Secret header")


@router.post("/run-daily-reminders")
def trigger_daily_reminders(db: Session = Depends(get_db), _: None = Depends(verify_automation_secret)):
    """Intended to be called by a scheduler (e.g. GitHub Actions cron) once a day."""
    return {"ok": True, **run_daily_reminders(db)}


@router.post("/sync-ical-feeds")
def trigger_ical_sync(db: Session = Depends(get_db), _: None = Depends(verify_automation_secret)):
    """Intended to be called by a scheduler on a regular interval (e.g. hourly)."""
    return {"ok": True, "results": sync_all_feeds(db)}


@router.post("/test-notification")
def test_notification(current_user: User = Depends(require_roles(UserRole.admin))):
    """Lets an admin verify Telegram/email config from the app without waiting for the cron."""
    telegram_sent = send_telegram_message(
        f"✅ Test message from Booking Control Center, triggered by {current_user.name}."
    )
    email_sent = send_email(
        [current_user.email],
        "Booking Control Center — test notification",
        f"Hello {current_user.name}, this is a test notification from Booking Control Center.",
    )
    return {"telegram_sent": telegram_sent, "email_sent": email_sent}
