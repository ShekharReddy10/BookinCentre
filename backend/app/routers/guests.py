from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids, get_current_user
from app.database import get_db
from app.models import Booking, GuestNote, Room, User, BookingStatus
from app.schemas import GuestNoteCreate, GuestNoteOut

router = APIRouter(prefix="/guests", tags=["guests"])

REVENUE_STATUSES = [BookingStatus.checked_in, BookingStatus.checked_out, BookingStatus.confirmed]


@router.get("/{phone}/history")
def guest_history(phone: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Booking).join(Room, Booking.room_id == Room.id).filter(Booking.phone == phone)
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    bookings = q.order_by(Booking.checkin_date.desc()).all()
    total_revenue = sum(b.total_amount for b in bookings if b.booking_status in REVENUE_STATUSES)
    last_stay = bookings[0].checkout_date.isoformat() if bookings else None
    notes = db.query(GuestNote).filter(GuestNote.guest_phone == phone).order_by(GuestNote.created_at.desc()).all()
    return {
        "phone": phone,
        "total_bookings": len(bookings),
        "total_revenue": total_revenue,
        "last_stay": last_stay,
        "bookings": [
            {
                "id": b.id, "guest_name": b.guest_name, "room_id": b.room_id,
                "checkin_date": b.checkin_date.isoformat(), "checkout_date": b.checkout_date.isoformat(),
                "total_amount": b.total_amount, "booking_status": b.booking_status.value,
            } for b in bookings
        ],
        "notes": [GuestNoteOut.model_validate(n) for n in notes],
    }


@router.post("/notes", response_model=GuestNoteOut)
def add_guest_note(payload: GuestNoteCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    note = GuestNote(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
