"""Seed the database with demo data for local development.

Run with: python -m app.seed
"""
from datetime import date, timedelta

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import (
    Booking, BookingSource, BookingStatus, Cluster, Expense, ExpenseCategory,
    PaymentStatus, Room, RoomStatus, RoomType, User, UserClusterAccess, UserRole,
)

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded. Skipping.")
            return

        admin = User(name="Shekhar", email="admin@bcc-demo.com", phone="9999999999",
                     hashed_password=hash_password("admin123"), role=UserRole.admin,
                     must_change_password=False)
        rahul = User(name="Rahul", email="rahul@bcc-demo.com", phone="8888888888",
                     hashed_password=hash_password("staff123"), role=UserRole.manager,
                     must_change_password=False)
        db.add_all([admin, rahul])
        db.commit()

        cluster_a = Cluster(name="Sunrise Villa", location="MG Road, Bengaluru")
        cluster_b = Cluster(name="Garden Heights", location="Whitefield, Bengaluru")
        db.add_all([cluster_a, cluster_b])
        db.commit()

        # Rahul (manager) only has access to Sunrise Villa — demonstrates cluster-scoped permissions.
        # Admin implicitly sees every cluster.
        db.add(UserClusterAccess(user_id=rahul.id, cluster_id=cluster_a.id))
        db.commit()

        rooms_data = [
            ("101", "Sunrise Single", RoomType.single, 1500, 9000, 30000, 1, cluster_a),
            ("102", "Sunrise Double", RoomType.double, 2200, 13000, 45000, 2, cluster_a),
            ("201", "Garden Triple", RoomType.triple, 3000, 18000, 60000, 3, cluster_b),
            ("202", "Family Suite", RoomType.family, 4500, 27000, 90000, 4, cluster_b),
            ("301", "Executive Suite", RoomType.suite, 6000, 36000, 120000, 2, cluster_b),
        ]
        rooms = []
        for number, name, rtype, daily, weekly, monthly, max_guests, cluster in rooms_data:
            room = Room(
                cluster_id=cluster.id,
                room_number=number, room_name=name, room_type=rtype,
                daily_price=daily, weekly_price=weekly, monthly_price=monthly,
                maximum_guests=max_guests, floor=number[0], status=RoomStatus.available,
                amenities="WiFi,AC,TV",
            )
            db.add(room)
            rooms.append(room)
        db.commit()

        today = date.today()
        bookings_data = [
            ("Amit Sharma", "9000000001", rooms[0], -2, 1, BookingSource.airbnb, admin, BookingStatus.checked_in, 4500, 4500),
            ("Priya Singh", "9000000002", rooms[1], 0, 3, BookingSource.booking_com, rahul, BookingStatus.checked_in, 6600, 3000),
            ("Rohit Verma", "9000000003", rooms[2], 1, 4, BookingSource.direct, admin, BookingStatus.confirmed, 12000, 12000),
            ("Sana Khan", "9000000004", rooms[3], 3, 6, BookingSource.oyo, rahul, BookingStatus.reserved, 27000, 5000),
            ("John Doe", "9000000005", rooms[4], -5, -1, BookingSource.makemytrip, admin, BookingStatus.checked_out, 24000, 24000),
        ]
        for guest, phone, room, ci_off, co_off, source, manager, status, total, advance in bookings_data:
            b = Booking(
                room_id=room.id, guest_name=guest, phone=phone, email=f"{guest.split()[0].lower()}@example.com",
                checkin_date=today + timedelta(days=ci_off), checkout_date=today + timedelta(days=co_off),
                adults=2, children=0, booking_source=source, managed_by_user_id=manager.id,
                booking_reference=f"REF-{phone[-4:]}", total_amount=total, advance_amount=advance,
                pending_amount=max(0, total - advance),
                payment_status=PaymentStatus.paid if advance >= total else PaymentStatus.partial,
                booking_status=status,
            )
            db.add(b)
        rooms[0].status = RoomStatus.occupied
        rooms[1].status = RoomStatus.occupied
        db.commit()

        expenses_data = [
            (ExpenseCategory.electricity, 3200, today.replace(day=1)),
            (ExpenseCategory.water, 800, today.replace(day=1)),
            (ExpenseCategory.cleaning, 1500, today - timedelta(days=3)),
            (ExpenseCategory.maintenance, 2200, today - timedelta(days=10)),
        ]
        for category, amount, edate in expenses_data:
            db.add(Expense(category=category, amount=amount, date=edate, notes="Seed data"))
        db.commit()

        print("Seed complete.")
        print("Clusters: Sunrise Villa (rooms 101,102), Garden Heights (rooms 201,202,301)")
        print("Login: admin@bcc-demo.com / admin123 (admin, sees all clusters)")
        print("Login: rahul@bcc-demo.com / staff123 (manager, scoped to Sunrise Villa only)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
