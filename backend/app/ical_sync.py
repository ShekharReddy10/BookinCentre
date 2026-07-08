"""Import bookings from Airbnb/Booking.com/etc iCal export URLs.

These are read-only calendar feeds each platform publishes per listing (no
partner API approval needed) — we poll them and mirror their busy dates into
Booking rows so the calendar/dashboard reflect reality across all channels.

Each feed represents a room CATEGORY (AC or non-AC) within a cluster, not one
specific physical room — most hosts list "AC Room" / "Non-AC Room" generically
and decide which physical room to actually give the guest. So each synced
event auto-allocates whichever matching room is free for those dates, same
allocation logic used for manual "book any AC room" bookings.

Guest identity isn't in the feed (platforms redact it for privacy), so
imported bookings get a generic guest name and zero amounts; staff fill in
the rest once they know who's arriving.
"""
from datetime import date, datetime

import httpx
from icalendar import Calendar
from sqlalchemy.orm import Session

from app.allocation import allocate_available_room
from app.models import Booking, BookingStatus, ICalFeed
from app.reminders import check_category_fully_booked, check_cluster_fully_booked


def _to_date(value) -> date:
    return value if isinstance(value, date) and not isinstance(value, datetime) else value.date()


# Platforms (Airbnb especially) include non-reservation entries in the same feed —
# e.g. a "Not available" placeholder marking the edge of the booking window, or a
# host-set block. These aren't guests; skip them rather than creating fake bookings.
_BLOCK_KEYWORDS = ("not available", "unavailable", "blocked", "closed")


def _is_real_reservation(summary: str) -> bool:
    lowered = summary.lower()
    return not any(keyword in lowered for keyword in _BLOCK_KEYWORDS)


def sync_feed(db: Session, feed: ICalFeed) -> dict:
    resp = httpx.get(feed.url, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    cal = Calendar.from_ical(resp.content)

    created = 0
    updated = 0
    unallocated = 0
    skipped_blocks = 0
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

        if not _is_real_reservation(summary):
            skipped_blocks += 1
            continue

        existing = db.query(Booking).filter(Booking.external_uid == uid, Booking.ical_feed_id == feed.id).first()
        if existing:
            if existing.checkin_date != checkin or existing.checkout_date != checkout:
                # Re-check the same room still works for the new dates; if not, try to reallocate.
                room = existing.room
                conflict = db.query(Booking).filter(
                    Booking.room_id == room.id,
                    Booking.id != existing.id,
                    Booking.booking_status.in_([BookingStatus.reserved, BookingStatus.confirmed, BookingStatus.checked_in]),
                    Booking.checkin_date < checkout,
                    Booking.checkout_date > checkin,
                ).first()
                if conflict:
                    new_room = allocate_available_room(db, feed.cluster_id, feed.has_ac, checkin, checkout, exclude_booking_id=existing.id)
                    if new_room:
                        existing.room_id = new_room.id
                    else:
                        unallocated += 1
                        continue
                existing.checkin_date = checkin
                existing.checkout_date = checkout
                updated += 1
                touched_checkin_dates.add(checkin)
        else:
            room = allocate_available_room(db, feed.cluster_id, feed.has_ac, checkin, checkout)
            if not room:
                unallocated += 1
                continue
            db.add(Booking(
                room_id=room.id,
                guest_name=summary[:120],
                checkin_date=checkin,
                checkout_date=checkout,
                booking_source=feed.source,
                booking_status=BookingStatus.confirmed,
                total_amount=0,
                advance_amount=0,
                pending_amount=0,
                external_uid=uid,
                ical_feed_id=feed.id,
                notes=f"Auto-imported from {feed.source.value} iCal feed. Fill in guest details when known.",
            ))
            created += 1
            touched_checkin_dates.add(checkin)

    feed.last_synced_at = datetime.utcnow()
    status = f"ok — {created} created, {updated} updated"
    if skipped_blocks:
        status += f", {skipped_blocks} non-reservation blocks skipped"
    if unallocated:
        status += f", {unallocated} could NOT be allocated (no free room — check for overbooking)"
    feed.last_sync_status = status
    db.commit()

    for checkin_date in touched_checkin_dates:
        check_cluster_fully_booked(db, feed.cluster_id, checkin_date)
        check_category_fully_booked(db, feed.cluster_id, feed.has_ac, checkin_date)

    return {
        "created": created,
        "updated": updated,
        "unallocated": unallocated,
        "skipped_blocks": skipped_blocks,
        "total_events": len(seen_uids),
    }


def sync_all_feeds(db: Session) -> list[dict]:
    feeds = db.query(ICalFeed).filter(ICalFeed.is_active == True).all()  # noqa: E712
    results = []
    for feed in feeds:
        try:
            result = sync_feed(db, feed)
            results.append({"feed_id": feed.id, "cluster_id": feed.cluster_id, **result})
        except Exception as e:  # noqa: BLE001 — one bad feed shouldn't abort the rest
            feed.last_sync_status = f"error: {e}"
            db.commit()
            results.append({"feed_id": feed.id, "cluster_id": feed.cluster_id, "error": str(e)})
    return results
