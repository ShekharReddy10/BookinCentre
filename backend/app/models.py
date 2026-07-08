import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Date, DateTime, ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    staff = "staff"


class RoomType(str, enum.Enum):
    single = "single"
    double = "double"
    triple = "triple"
    family = "family"
    suite = "suite"
    studio = "studio"
    dormitory = "dormitory"


class RoomStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    cleaning = "cleaning"
    maintenance = "maintenance"
    blocked = "blocked"


class BookingSource(str, enum.Enum):
    airbnb = "airbnb"
    booking_com = "booking_com"
    oyo = "oyo"
    makemytrip = "makemytrip"
    direct = "direct"
    walk_in = "walk_in"
    phone = "phone"
    other = "other"


class BookingStatus(str, enum.Enum):
    reserved = "reserved"
    confirmed = "confirmed"
    checked_in = "checked_in"
    checked_out = "checked_out"
    cancelled = "cancelled"
    no_show = "no_show"


class PaymentStatus(str, enum.Enum):
    paid = "paid"
    partial = "partial"
    pending = "pending"


class ExpenseCategory(str, enum.Enum):
    electricity = "electricity"
    water = "water"
    cleaning = "cleaning"
    laundry = "laundry"
    repairs = "repairs"
    maintenance = "maintenance"
    misc = "misc"


class ReminderType(str, enum.Enum):
    arrival = "arrival"
    checkout = "checkout"
    pending_payment = "pending_payment"
    cleaning_required = "cleaning_required"
    daily_summary = "daily_summary"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    phone = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.staff, nullable=False)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="managed_by")
    cluster_access = relationship("UserClusterAccess", back_populates="user", cascade="all, delete-orphan")


class Cluster(Base):
    """A physical property / building / area grouping a set of rooms."""
    __tablename__ = "clusters"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    rooms = relationship("Room", back_populates="cluster")
    user_access = relationship("UserClusterAccess", back_populates="cluster", cascade="all, delete-orphan")


class UserClusterAccess(Base):
    """Grants a user (manager/staff) visibility into a specific cluster. Admins bypass this and see all clusters."""
    __tablename__ = "user_cluster_access"

    id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    cluster_id = Column(String, ForeignKey("clusters.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="cluster_access")
    cluster = relationship("Cluster", back_populates="user_access")


class Room(Base):
    __tablename__ = "rooms"

    id = Column(String, primary_key=True, default=gen_uuid)
    cluster_id = Column(String, ForeignKey("clusters.id"), nullable=False)
    room_number = Column(String, nullable=False, unique=True)
    room_name = Column(String, nullable=False)
    room_type = Column(Enum(RoomType), default=RoomType.single, nullable=False)
    daily_price = Column(Float, default=0)
    weekly_price = Column(Float, default=0)
    monthly_price = Column(Float, default=0)
    maximum_guests = Column(Integer, default=2)
    floor = Column(String, nullable=True)
    amenities = Column(Text, nullable=True)  # comma-separated
    has_ac = Column(Boolean, default=False, nullable=False)
    status = Column(Enum(RoomStatus), default=RoomStatus.available, nullable=False)
    image_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cluster = relationship("Cluster", back_populates="rooms")
    bookings = relationship("Booking", back_populates="room")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(String, primary_key=True, default=gen_uuid)
    room_id = Column(String, ForeignKey("rooms.id"), nullable=False)
    guest_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    checkin_date = Column(Date, nullable=False)
    checkout_date = Column(Date, nullable=False)
    adults = Column(Integer, default=1)
    children = Column(Integer, default=0)
    booking_source = Column(Enum(BookingSource), default=BookingSource.direct, nullable=False)
    managed_by_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    booking_reference = Column(String, nullable=True)
    total_amount = Column(Float, default=0)
    advance_amount = Column(Float, default=0)
    pending_amount = Column(Float, default=0)
    payment_status = Column(Enum(PaymentStatus), default=PaymentStatus.pending, nullable=False)
    booking_status = Column(Enum(BookingStatus), default=BookingStatus.reserved, nullable=False)
    notes = Column(Text, nullable=True)
    external_uid = Column(String, nullable=True, index=True)  # set when auto-imported via iCal sync
    ical_feed_id = Column(String, ForeignKey("ical_feeds.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    room = relationship("Room", back_populates="bookings")
    managed_by = relationship("User", back_populates="bookings")


class ICalFeed(Base):
    """A read-only calendar export URL from Airbnb/Booking.com/etc.

    Represents a listing for a room CATEGORY (AC or non-AC) within a cluster,
    not one specific physical room — the actual room is auto-allocated from
    whichever matching room is free when each booking syncs in.
    """
    __tablename__ = "ical_feeds"

    id = Column(String, primary_key=True, default=gen_uuid)
    cluster_id = Column(String, ForeignKey("clusters.id"), nullable=False)
    has_ac = Column(Boolean, nullable=False)
    source = Column(Enum(BookingSource), nullable=False)
    url = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    last_synced_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cluster = relationship("Cluster")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(String, primary_key=True, default=gen_uuid)
    category = Column(Enum(ExpenseCategory), default=ExpenseCategory.misc, nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String, primary_key=True, default=gen_uuid)
    booking_id = Column(String, ForeignKey("bookings.id"), nullable=True)
    reminder_type = Column(Enum(ReminderType), nullable=False)
    sent = Column(Boolean, default=False)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking")


class GuestNote(Base):
    __tablename__ = "guest_notes"

    id = Column(String, primary_key=True, default=gen_uuid)
    guest_phone = Column(String, nullable=False, index=True)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
