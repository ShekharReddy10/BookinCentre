"""Shared room-allocation logic: given a cluster + AC/non-AC category, find
whichever matching room is actually free for a date range. Used by both
manual "book any AC room" bookings and iCal-synced bookings (where the
platform listing represents a category, not one physical room).
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Room

ACTIVE_STATUSES = [BookingStatus.reserved, BookingStatus.confirmed, BookingStatus.checked_in]


def allocate_available_room(
    db: Session,
    cluster_id: str,
    has_ac: bool,
    checkin: date,
    checkout: date,
    exclude_booking_id: Optional[str] = None,
) -> Optional[Room]:
    """Returns the first active room in the cluster matching has_ac that has no
    conflicting active booking for [checkin, checkout), or None if all are taken.
    """
    candidates = (
        db.query(Room)
        .filter(Room.cluster_id == cluster_id, Room.has_ac == has_ac, Room.is_active == True)  # noqa: E712
        .order_by(Room.room_number)
        .all()
    )
    for room in candidates:
        q = db.query(Booking).filter(
            Booking.room_id == room.id,
            Booking.booking_status.in_(ACTIVE_STATUSES),
            Booking.checkin_date < checkout,
            Booking.checkout_date > checkin,
        )
        if exclude_booking_id:
            q = q.filter(Booking.id != exclude_booking_id)
        if not q.first():
            return room
    return None


def available_room_counts(db: Session, cluster_id: str, on_date: date) -> dict:
    """Counts of currently-free AC and non-AC rooms in a cluster for a given date."""
    rooms = db.query(Room).filter(Room.cluster_id == cluster_id, Room.is_active == True).all()  # noqa: E712
    if not rooms:
        return {"ac_available": 0, "non_ac_available": 0}

    room_ids = [r.id for r in rooms]
    booked_room_ids = {
        row[0]
        for row in db.query(Booking.room_id).filter(
            Booking.room_id.in_(room_ids),
            Booking.booking_status.in_(ACTIVE_STATUSES),
            Booking.checkin_date <= on_date,
            Booking.checkout_date > on_date,
        ).all()
    }
    ac_free = sum(1 for r in rooms if r.has_ac and r.id not in booked_room_ids)
    non_ac_free = sum(1 for r in rooms if not r.has_ac and r.id not in booked_room_ids)
    return {"ac_available": ac_free, "non_ac_available": non_ac_free}
