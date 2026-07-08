"""Daily reminders: arrivals/checkouts tomorrow, pending payments, cleaning flags, and a summary.

Runs are idempotent-ish (best effort) — designed to be triggered once/day by a
scheduler (GitHub Actions cron hitting /automation/run-daily-reminders, or the
`app.send_reminders` CLI). Running it twice in a day just sends duplicate
notifications; it won't corrupt data.
"""
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, BookingStatus, Reminder, ReminderType, Room, RoomStatus, User, UserRole
from app.notifications import send_email, send_telegram_message

ACTIVE_STATUSES = [BookingStatus.reserved, BookingStatus.confirmed, BookingStatus.checked_in]
REVENUE_STATUSES = [BookingStatus.checked_in, BookingStatus.checked_out, BookingStatus.confirmed]


def _recipients(db: Session) -> list[str]:
    if settings.notification_email_to:
        return [e.strip() for e in settings.notification_email_to.split(",") if e.strip()]
    admins = db.query(User).filter(User.role == UserRole.admin, User.is_active == True).all()  # noqa: E712
    return [a.email for a in admins]


def _log(db: Session, booking_id, reminder_type: ReminderType):
    db.add(Reminder(booking_id=booking_id, reminder_type=reminder_type, sent=True, sent_at=datetime.utcnow()))


def run_daily_reminders(db: Session) -> dict:
    today = date.today()
    tomorrow = today + timedelta(days=1)
    recipients = _recipients(db)

    # Flag rooms needing cleaning after a same-day checkout
    checked_out_today = db.query(Booking).filter(
        Booking.checkout_date == today, Booking.booking_status == BookingStatus.checked_out
    ).all()
    cleaned_rooms = []
    for b in checked_out_today:
        if b.room.status == RoomStatus.occupied:
            b.room.status = RoomStatus.cleaning
            cleaned_rooms.append(b.room.room_number)
            _log(db, b.id, ReminderType.cleaning_required)
    if cleaned_rooms:
        send_telegram_message(f"🧹 Cleaning required: room(s) {', '.join(cleaned_rooms)} just checked out.")

    # Arrivals tomorrow
    arrivals = db.query(Booking).filter(
        Booking.checkin_date == tomorrow, Booking.booking_status.in_(ACTIVE_STATUSES)
    ).all()
    if arrivals:
        lines = [f"• Room {b.room.room_number} — {b.guest_name} ({b.booking_source.value})" for b in arrivals]
        send_telegram_message(f"🛬 *Arrivals tomorrow* ({tomorrow.isoformat()})\n" + "\n".join(lines))
        send_email(recipients, f"Arrivals tomorrow — {tomorrow.isoformat()}", "<br>".join(lines))
        for b in arrivals:
            _log(db, b.id, ReminderType.arrival)

    # Check-outs tomorrow
    departures = db.query(Booking).filter(
        Booking.checkout_date == tomorrow, Booking.booking_status.in_(ACTIVE_STATUSES)
    ).all()
    if departures:
        lines = [f"• Room {b.room.room_number} — {b.guest_name}" for b in departures]
        send_telegram_message(f"🛫 *Check-outs tomorrow* ({tomorrow.isoformat()})\n" + "\n".join(lines))
        send_email(recipients, f"Check-outs tomorrow — {tomorrow.isoformat()}", "<br>".join(lines))
        for b in departures:
            _log(db, b.id, ReminderType.checkout)

    # Pending payments
    pending = db.query(Booking).filter(
        Booking.pending_amount > 0, Booking.booking_status.in_(ACTIVE_STATUSES + [BookingStatus.checked_out])
    ).all()
    if pending:
        total = sum(b.pending_amount for b in pending)
        lines = [f"• {b.guest_name} (Room {b.room.room_number}): ₹{b.pending_amount:,.0f}" for b in pending]
        send_telegram_message(f"💰 *Pending payments* — total ₹{total:,.0f}\n" + "\n".join(lines))
        send_email(recipients, "Pending payments summary", "<br>".join(lines))

    # Daily summary
    revenue_today = sum(
        b.total_amount for b in db.query(Booking).filter(
            Booking.checkin_date <= today, Booking.checkout_date > today,
            Booking.booking_status.in_(REVENUE_STATUSES),
        ).all()
    )
    checkins_today = db.query(Booking).filter(
        Booking.checkin_date == today, Booking.booking_status.in_(ACTIVE_STATUSES)
    ).count()
    checkouts_today = db.query(Booking).filter(
        Booking.checkout_date == today, Booking.booking_status.in_(ACTIVE_STATUSES + [BookingStatus.checked_out])
    ).count()
    occupied = db.query(Room).filter(Room.status == RoomStatus.occupied).count()
    total_rooms = db.query(Room).filter(Room.is_active == True).count()  # noqa: E712

    summary_text = (
        f"Daily Summary — {today.isoformat()}\n"
        f"Check-ins: {checkins_today} | Check-outs: {checkouts_today}\n"
        f"Occupied: {occupied}/{total_rooms}\n"
        f"Revenue today: ₹{revenue_today:,.0f}"
    )
    send_telegram_message("📊 " + summary_text)
    send_email(recipients, f"Daily Summary — {today.isoformat()}", summary_text.replace("\n", "<br>"))
    _log(db, None, ReminderType.daily_summary)

    db.commit()
    return {
        "arrivals_notified": len(arrivals),
        "departures_notified": len(departures),
        "pending_payment_bookings": len(pending),
        "rooms_flagged_for_cleaning": len(cleaned_rooms),
    }
