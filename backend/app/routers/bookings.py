from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.allocation import allocate_available_room
from app.auth import get_accessible_cluster_ids, get_current_user
from app.database import get_db
from app.models import Booking, Cluster, Room, User, BookingStatus, BookingSource, PaymentStatus
from app.reminders import check_category_fully_booked, check_cluster_fully_booked, notify_checkout_availability
from app.schemas import BookingCreate, BookingOut, BookingUpdate

router = APIRouter(prefix="/bookings", tags=["bookings"])

ACTIVE_STATUSES = [
    BookingStatus.reserved,
    BookingStatus.confirmed,
    BookingStatus.checked_in,
]


def check_conflict(db: Session, room_id: str, checkin: date, checkout: date, exclude_booking_id: Optional[str] = None):
    q = db.query(Booking).filter(
        Booking.room_id == room_id,
        Booking.booking_status.in_(ACTIVE_STATUSES),
        Booking.checkin_date < checkout,
        Booking.checkout_date > checkin,
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)
    conflict = q.first()
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Room already booked for {conflict.guest_name} from {conflict.checkin_date} to {conflict.checkout_date}",
        )


def recompute_pending(booking: Booking):
    booking.pending_amount = max(0.0, (booking.total_amount or 0) - (booking.advance_amount or 0))
    if booking.pending_amount <= 0 and booking.total_amount > 0:
        booking.payment_status = PaymentStatus.paid
    elif booking.advance_amount and booking.advance_amount > 0:
        booking.payment_status = PaymentStatus.partial
    else:
        booking.payment_status = PaymentStatus.pending


@router.get("", response_model=List[BookingOut])
def list_bookings(
    room_id: Optional[str] = None,
    cluster_id: Optional[str] = None,
    guest_name: Optional[str] = None,
    phone: Optional[str] = None,
    booking_source: Optional[BookingSource] = None,
    booking_status: Optional[BookingStatus] = None,
    managed_by_user_id: Optional[str] = None,
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Booking).join(Room, Booking.room_id == Room.id)
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    if cluster_id:
        q = q.filter(Room.cluster_id == cluster_id)
    if room_id:
        q = q.filter(Booking.room_id == room_id)
    if guest_name:
        q = q.filter(Booking.guest_name.ilike(f"%{guest_name}%"))
    if phone:
        q = q.filter(Booking.phone.ilike(f"%{phone}%"))
    if booking_source:
        q = q.filter(Booking.booking_source == booking_source)
    if booking_status:
        q = q.filter(Booking.booking_status == booking_status)
    if managed_by_user_id:
        q = q.filter(Booking.managed_by_user_id == managed_by_user_id)
    if from_date:
        q = q.filter(Booking.checkout_date >= from_date)
    if to_date:
        q = q.filter(Booking.checkin_date <= to_date)
    return q.order_by(Booking.checkin_date.desc()).all()


def _check_room_access(room: Room, current_user: User, db: Session):
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None and room.cluster_id not in accessible:
        raise HTTPException(status_code=403, detail="No access to this cluster")


@router.post("", response_model=BookingOut)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.checkout_date <= payload.checkin_date:
        raise HTTPException(status_code=400, detail="Checkout date must be after checkin date")

    data = payload.model_dump()
    room_id = data.pop("room_id", None)
    cluster_id = data.pop("cluster_id", None)
    has_ac = data.pop("has_ac", None)

    if room_id:
        room = db.query(Room).filter(Room.id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        _check_room_access(room, current_user, db)
        check_conflict(db, room_id, payload.checkin_date, payload.checkout_date)
    else:
        if not cluster_id or has_ac is None:
            raise HTTPException(status_code=400, detail="Provide either room_id, or both cluster_id and has_ac")
        cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        accessible = get_accessible_cluster_ids(current_user, db)
        if accessible is not None and cluster_id not in accessible:
            raise HTTPException(status_code=403, detail="No access to this cluster")
        room = allocate_available_room(db, cluster_id, has_ac, payload.checkin_date, payload.checkout_date)
        if not room:
            label = "AC" if has_ac else "Non-AC"
            raise HTTPException(status_code=409, detail=f"No available {label} rooms for these dates")

    booking = Booking(**data, room_id=room.id)
    recompute_pending(booking)
    db.add(booking)
    db.commit()
    db.refresh(booking)

    if booking.booking_status in ACTIVE_STATUSES:
        check_cluster_fully_booked(db, room.cluster_id, booking.checkin_date)
        check_category_fully_booked(db, room.cluster_id, room.has_ac, booking.checkin_date)

    return booking


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    _check_room_access(booking.room, current_user, db)
    return booking


@router.patch("/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: str,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    _check_room_access(booking.room, current_user, db)

    previous_status = booking.booking_status
    previous_room = booking.room

    data = payload.model_dump(exclude_unset=True)
    new_room_id = data.get("room_id", booking.room_id)
    new_checkin = data.get("checkin_date", booking.checkin_date)
    new_checkout = data.get("checkout_date", booking.checkout_date)

    if new_checkout <= new_checkin:
        raise HTTPException(status_code=400, detail="Checkout date must be after checkin date")

    if "room_id" in data:
        new_room = db.query(Room).filter(Room.id == new_room_id).first()
        if not new_room:
            raise HTTPException(status_code=404, detail="Room not found")
        _check_room_access(new_room, current_user, db)

    if "room_id" in data or "checkin_date" in data or "checkout_date" in data:
        check_conflict(db, new_room_id, new_checkin, new_checkout, exclude_booking_id=booking.id)

    for field, value in data.items():
        setattr(booking, field, value)

    recompute_pending(booking)
    db.commit()
    db.refresh(booking)

    current_room = db.query(Room).filter(Room.id == booking.room_id).first()

    if booking.booking_status in ACTIVE_STATUSES:
        check_cluster_fully_booked(db, current_room.cluster_id, booking.checkin_date)
        check_category_fully_booked(db, current_room.cluster_id, current_room.has_ac, booking.checkin_date)

    if previous_status != BookingStatus.checked_out and booking.booking_status == BookingStatus.checked_out:
        notify_checkout_availability(db, previous_room.cluster_id, previous_room.room_number)

    return booking


@router.delete("/{booking_id}")
def cancel_booking(booking_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    _check_room_access(booking.room, current_user, db)
    booking.booking_status = BookingStatus.cancelled
    db.commit()
    return {"ok": True}
