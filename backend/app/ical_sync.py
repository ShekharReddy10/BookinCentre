"""Import bookings from Airbnb/Booking.com/etc iCal export URLs.

These are read-only calendar feeds each platform publishes per listing (no
partner API approval needed) — we poll them and mirror their busy dates into
Booking rows so the calendar/dashboard reflect reality across all channels.
Guest identity isn't in the feed (platforms redact it for privacy), so
imported bookings get a generic guest name and zero amounts; staff fill in
the rest once they know who's arriving.
"""
from datetime import date, datetime

import httpx
from icalendar import Calendar
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, ICalFeed
from app.reminders import check_cluster_fully_booked


def _to_date(value) -> date:
    return value if isinstance(value, date) and not isinstance(value, datetime) else value.date()


def sync_feed(db: Session, feed: ICalFeed) -> dict:
    resp = httpx.get(feed.url, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    cal = Calendar.from_ical(resp.content)

    created = 0
    updated = 0
    seen_uids = []
    touched_checkin_dates = set()

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        uid = str(component.get("UID"))
        checkin = _to_date(component.get("DTSTART").dt)
        checkout = _to_date(component.get("DTEND").dt)
        summary = str(component.get("SUMMARY") or "Reserved")
        seen_uids.append(uid)

        existing = db.query(Booking).filter(Booking.external_uid == uid, Booking.room_id == feed.room_id).first()
        if existing:
            if existing.checkin_date != checkin or existing.checkout_date != checkout:
                existing.checkin_date = checkin
                existing.checkout_date = checkout
                updated += 1
                touched_checkin_dates.add(checkin)
        else:
            db.add(Booking(
                room_id=feed.room_id,
                guest_name=summary[:120],
                checkin_date=checkin,
                checkout_date=checkout,
                booking_source=feed.source,
                booking_status=BookingStatus.confirmed,
                total_amount=0,
                advance_amount=0,
                pending_amount=0,
                external_uid=uid,
                notes=f"Auto-imported from {feed.source.value} iCal feed. Fill in guest details when known.",
            ))
            created += 1
            touched_checkin_dates.add(checkin)

    feed.last_synced_at = datetime.utcnow()
    feed.last_sync_status = f"ok — {created} created, {updated} updated"
    db.commit()

    if touched_checkin_dates:
        room = feed.room
        for checkin_date in touched_checkin_dates:
            check_cluster_fully_booked(db, room.cluster_id, checkin_date)

    return {"created": created, "updated": updated, "total_events": len(seen_uids)}


def sync_all_feeds(db: Session) -> list[dict]:
    feeds = db.query(ICalFeed).filter(ICalFeed.is_active == True).all()  # noqa: E712
    results = []
    for feed in feeds:
        try:
            result = sync_feed(db, feed)
            results.append({"feed_id": feed.id, "room_id": feed.room_id, **result})
        except Exception as e:  # noqa: BLE001 — one bad feed shouldn't abort the rest
            feed.last_sync_status = f"error: {e}"
            db.commit()
            results.append({"feed_id": feed.id, "room_id": feed.room_id, "error": str(e)})
    return results
