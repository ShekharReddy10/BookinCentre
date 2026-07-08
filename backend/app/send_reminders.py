"""Run the daily reminders job from the shell (or a cron job on your own server).

Usage: python -m app.send_reminders
"""
from app.database import SessionLocal
from app.reminders import run_daily_reminders


def main():
    db = SessionLocal()
    try:
        result = run_daily_reminders(db)
        print(result)
    finally:
        db.close()


if __name__ == "__main__":
    main()
