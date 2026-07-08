import csv
import io
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids
from app.database import get_db
from app.models import Booking, Expense, Room, User, BookingStatus
from app.permissions import require_permission

router = APIRouter(prefix="/reports", tags=["reports"])

REVENUE_STATUSES = [BookingStatus.checked_in, BookingStatus.checked_out, BookingStatus.confirmed]


def _scoped_bookings(db: Session, current_user: User, cluster_id: Optional[str], from_date: Optional[date], to_date: Optional[date]):
    q = db.query(Booking).join(Room, Booking.room_id == Room.id).filter(Booking.booking_status.in_(REVENUE_STATUSES))
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    if cluster_id:
        q = q.filter(Room.cluster_id == cluster_id)
    if from_date:
        q = q.filter(Booking.checkin_date >= from_date)
    if to_date:
        q = q.filter(Booking.checkin_date <= to_date)
    return q


@router.get("/revenue")
def revenue_report(
    cluster_id: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    bookings = _scoped_bookings(db, current_user, cluster_id, from_date, to_date).all()
    total_revenue = sum(b.total_amount for b in bookings)
    total_nights = sum((b.checkout_date - b.checkin_date).days for b in bookings)
    avg_stay = round(total_nights / len(bookings), 1) if bookings else 0

    by_room = {}
    for b in bookings:
        by_room.setdefault(b.room_id, {"bookings": 0, "revenue": 0.0})
        by_room[b.room_id]["bookings"] += 1
        by_room[b.room_id]["revenue"] += b.total_amount

    by_source = {}
    for b in bookings:
        key = b.booking_source.value
        by_source.setdefault(key, {"bookings": 0, "revenue": 0.0})
        by_source[key]["bookings"] += 1
        by_source[key]["revenue"] += b.total_amount

    return {
        "total_revenue": total_revenue,
        "total_bookings": len(bookings),
        "average_stay_nights": avg_stay,
        "revenue_by_room": by_room,
        "revenue_by_source": by_source,
    }


@router.get("/team-performance")
def team_performance(
    cluster_id: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
    today = date.today()
    results = []
    for u in users:
        bookings = _scoped_bookings(db, current_user, cluster_id, from_date, to_date).filter(Booking.managed_by_user_id == u.id).all()
        total_revenue = sum(b.total_amount for b in bookings)
        pending = sum(b.pending_amount for b in bookings)
        nights = sum((b.checkout_date - b.checkin_date).days for b in bookings)
        avg_stay = round(nights / len(bookings), 1) if bookings else 0
        todays_checkins = _scoped_bookings(db, current_user, cluster_id, None, None).filter(
            Booking.managed_by_user_id == u.id, Booking.checkin_date == today,
        ).count()
        results.append({
            "user_id": u.id,
            "name": u.name,
            "total_bookings": len(bookings),
            "revenue": total_revenue,
            "average_stay_nights": avg_stay,
            "pending_payments": pending,
            "todays_checkins": todays_checkins,
        })
    return sorted(results, key=lambda r: r["revenue"], reverse=True)


@router.get("/expenses-summary")
def expenses_summary(
    cluster_id: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    q = db.query(Expense)
    if from_date:
        q = q.filter(Expense.date >= from_date)
    if to_date:
        q = q.filter(Expense.date <= to_date)
    expenses = q.all()
    total_expenses = sum(e.amount for e in expenses)

    revenue = _scoped_bookings(db, current_user, cluster_id, from_date, to_date).all()
    total_revenue = sum(b.total_amount for b in revenue)

    by_category = {}
    for e in expenses:
        by_category.setdefault(e.category.value, 0.0)
        by_category[e.category.value] += e.amount

    return {
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": total_revenue - total_expenses,
        "expenses_by_category": by_category,
    }


@router.get("/export/bookings.csv")
def export_bookings_csv(
    cluster_id: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("reports.view")),
):
    bookings = _scoped_bookings(db, current_user, cluster_id, None, None)
    if from_date:
        bookings = bookings.filter(Booking.checkin_date >= from_date)
    if to_date:
        bookings = bookings.filter(Booking.checkin_date <= to_date)
    bookings = bookings.order_by(Booking.checkin_date).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Guest Name", "Phone", "Email", "Room ID", "Check-in", "Check-out", "Source",
        "Status", "Payment Status", "Total Amount", "Advance", "Pending",
    ])
    for b in bookings:
        writer.writerow([
            b.guest_name, b.phone, b.email, b.room_id, b.checkin_date, b.checkout_date,
            b.booking_source.value, b.booking_status.value, b.payment_status.value,
            b.total_amount, b.advance_amount, b.pending_amount,
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )


@router.get("/export/expenses.csv")
def export_expenses_csv(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("reports.view")),
):
    q = db.query(Expense)
    if from_date:
        q = q.filter(Expense.date >= from_date)
    if to_date:
        q = q.filter(Expense.date <= to_date)
    expenses = q.order_by(Expense.date).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Category", "Amount", "Notes"])
    for e in expenses:
        writer.writerow([e.date, e.category.value, e.amount, e.notes])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=expenses.csv"},
    )
