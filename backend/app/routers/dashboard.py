from datetime import date, timedelta
from calendar import monthrange
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids, get_current_user
from app.database import get_db
from app.models import Booking, Room, User, BookingStatus, RoomStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ACTIVE_STATUSES = [BookingStatus.reserved, BookingStatus.confirmed, BookingStatus.checked_in]
REVENUE_STATUSES = [BookingStatus.checked_in, BookingStatus.checked_out, BookingStatus.confirmed]


def _room_query(db: Session, current_user: User, cluster_id: Optional[str]):
    q = db.query(Room)
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    if cluster_id:
        q = q.filter(Room.cluster_id == cluster_id)
    return q


def _booking_query(db: Session, current_user: User, cluster_id: Optional[str]):
    q = db.query(Booking).join(Room, Booking.room_id == Room.id)
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    if cluster_id:
        q = q.filter(Room.cluster_id == cluster_id)
    return q


@router.get("/summary")
def summary(cluster_id: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    month_start = today.replace(day=1)
    month_end = today.replace(day=monthrange(today.year, today.month)[1])

    total_rooms = _room_query(db, current_user, cluster_id).filter(Room.is_active == True).count()  # noqa: E712

    todays_checkins = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkin_date == today, Booking.booking_status.in_(ACTIVE_STATUSES)
    ).count()
    todays_checkouts = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkout_date == today, Booking.booking_status.in_(ACTIVE_STATUSES + [BookingStatus.checked_out])
    ).count()

    occupied_rooms = _room_query(db, current_user, cluster_id).filter(Room.status == RoomStatus.occupied).count()
    available_rooms = _room_query(db, current_user, cluster_id).filter(Room.status == RoomStatus.available, Room.is_active == True).count()  # noqa: E712
    cleaning_rooms = _room_query(db, current_user, cluster_id).filter(Room.status == RoomStatus.cleaning).count()
    maintenance_rooms = _room_query(db, current_user, cluster_id).filter(Room.status == RoomStatus.maintenance).count()

    revenue_today = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkin_date <= today, Booking.checkout_date > today,
        Booking.booking_status.in_(REVENUE_STATUSES),
    ).with_entities(func.coalesce(func.sum(Booking.total_amount), 0.0)).scalar()

    revenue_month = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkin_date <= month_end, Booking.checkin_date >= month_start,
        Booking.booking_status.in_(REVENUE_STATUSES),
    ).with_entities(func.coalesce(func.sum(Booking.total_amount), 0.0)).scalar()

    pending_payments = _booking_query(db, current_user, cluster_id).filter(
        Booking.booking_status.in_(ACTIVE_STATUSES + [BookingStatus.checked_out])
    ).with_entities(func.coalesce(func.sum(Booking.pending_amount), 0.0)).scalar()

    upcoming_arrivals = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkin_date > today, Booking.checkin_date <= today + timedelta(days=7),
        Booking.booking_status.in_(ACTIVE_STATUSES),
    ).order_by(Booking.checkin_date).limit(10).all()

    upcoming_departures = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkout_date > today, Booking.checkout_date <= today + timedelta(days=7),
        Booking.booking_status.in_(ACTIVE_STATUSES),
    ).order_by(Booking.checkout_date).limit(10).all()

    days_in_month = (month_end - month_start).days + 1
    occupied_room_nights = _booking_query(db, current_user, cluster_id).filter(
        Booking.checkin_date <= month_end, Booking.checkout_date > month_start,
        Booking.booking_status.in_(REVENUE_STATUSES),
    ).count()
    occupancy_pct = round((occupied_room_nights / (total_rooms * days_in_month)) * 100, 1) if total_rooms else 0

    def booking_brief(b: Booking):
        return {
            "id": b.id, "guest_name": b.guest_name, "room_id": b.room_id,
            "checkin_date": b.checkin_date.isoformat(), "checkout_date": b.checkout_date.isoformat(),
            "booking_status": b.booking_status.value,
        }

    return {
        "todays_checkins": todays_checkins,
        "todays_checkouts": todays_checkouts,
        "occupied_rooms": occupied_rooms,
        "available_rooms": available_rooms,
        "cleaning_rooms": cleaning_rooms,
        "maintenance_rooms": maintenance_rooms,
        "total_rooms": total_rooms,
        "revenue_today": revenue_today,
        "revenue_month": revenue_month,
        "pending_payments": pending_payments,
        "occupancy_pct": occupancy_pct,
        "upcoming_arrivals": [booking_brief(b) for b in upcoming_arrivals],
        "upcoming_departures": [booking_brief(b) for b in upcoming_departures],
    }


@router.get("/monthly-revenue")
def monthly_revenue(cluster_id: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    results = []
    for i in range(11, -1, -1):
        year = today.year
        month = today.month - i
        while month <= 0:
            month += 12
            year -= 1
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
        total = _booking_query(db, current_user, cluster_id).filter(
            Booking.checkin_date >= start, Booking.checkin_date <= end,
            Booking.booking_status.in_(REVENUE_STATUSES),
        ).with_entities(func.coalesce(func.sum(Booking.total_amount), 0.0)).scalar()
        results.append({"month": start.strftime("%b %Y"), "revenue": total})
    return results


@router.get("/booking-source-distribution")
def booking_source_distribution(cluster_id: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = _booking_query(db, current_user, cluster_id).filter(
        Booking.booking_status.in_(REVENUE_STATUSES)
    ).with_entities(
        Booking.booking_source, func.count(Booking.id), func.coalesce(func.sum(Booking.total_amount), 0.0)
    ).group_by(Booking.booking_source).all()
    return [{"source": r[0].value, "bookings": r[1], "revenue": r[2]} for r in rows]
