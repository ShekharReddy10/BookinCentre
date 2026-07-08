from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import (
    UserRole, RoomType, RoomStatus, BookingSource, BookingStatus,
    PaymentStatus, ExpenseCategory, ReminderType,
)


# ---------- Auth / Users ----------

class AdminUserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: UserRole = UserRole.staff
    cluster_ids: list[str] = []


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    must_change_password: bool
    created_at: datetime


class UserWithClusters(UserOut):
    cluster_ids: list[str] = []


class UserCreatedOut(BaseModel):
    user: UserOut
    temporary_password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class SetUserClustersRequest(BaseModel):
    cluster_ids: list[str]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    permissions: list[str] = []


# ---------- Clusters ----------

class ClusterBase(BaseModel):
    name: str
    location: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ClusterOut(ClusterBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


# ---------- Rooms ----------

class RoomBase(BaseModel):
    cluster_id: str
    room_number: str
    room_name: str
    room_type: RoomType = RoomType.single
    daily_price: float = 0
    weekly_price: float = 0
    monthly_price: float = 0
    maximum_guests: int = 2
    floor: Optional[str] = None
    amenities: Optional[str] = None
    has_ac: bool = False
    status: RoomStatus = RoomStatus.available
    image_url: Optional[str] = None
    is_active: bool = True


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    cluster_id: Optional[str] = None
    room_number: Optional[str] = None
    room_name: Optional[str] = None
    room_type: Optional[RoomType] = None
    daily_price: Optional[float] = None
    weekly_price: Optional[float] = None
    monthly_price: Optional[float] = None
    maximum_guests: Optional[int] = None
    floor: Optional[str] = None
    amenities: Optional[str] = None
    has_ac: Optional[bool] = None
    status: Optional[RoomStatus] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class RoomOut(RoomBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


# ---------- Bookings ----------

class BookingBase(BaseModel):
    room_id: Optional[str] = None
    # Alternative to room_id: auto-allocate any available room of this
    # category within this cluster (e.g. "any AC room"). Provide both
    # cluster_id and has_ac when room_id is omitted.
    cluster_id: Optional[str] = None
    has_ac: Optional[bool] = None
    guest_name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    checkin_date: date
    checkout_date: date
    adults: int = 1
    children: int = 0
    booking_source: BookingSource = BookingSource.direct
    managed_by_user_id: Optional[str] = None
    booking_reference: Optional[str] = None
    total_amount: float = 0
    advance_amount: float = 0
    payment_status: PaymentStatus = PaymentStatus.pending
    booking_status: BookingStatus = BookingStatus.reserved
    notes: Optional[str] = None


class BookingCreate(BookingBase):
    pass


class BookingUpdate(BaseModel):
    room_id: Optional[str] = None
    guest_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    checkin_date: Optional[date] = None
    checkout_date: Optional[date] = None
    adults: Optional[int] = None
    children: Optional[int] = None
    booking_source: Optional[BookingSource] = None
    managed_by_user_id: Optional[str] = None
    booking_reference: Optional[str] = None
    total_amount: Optional[float] = None
    advance_amount: Optional[float] = None
    payment_status: Optional[PaymentStatus] = None
    booking_status: Optional[BookingStatus] = None
    notes: Optional[str] = None


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    room_id: str
    guest_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    checkin_date: date
    checkout_date: date
    adults: int
    children: int
    booking_source: BookingSource
    managed_by_user_id: Optional[str] = None
    booking_reference: Optional[str] = None
    total_amount: float
    advance_amount: float
    pending_amount: float
    payment_status: PaymentStatus
    booking_status: BookingStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ---------- Expenses ----------

class ExpenseBase(BaseModel):
    category: ExpenseCategory = ExpenseCategory.misc
    amount: float
    date: date
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


# ---------- Guest notes ----------

class GuestNoteCreate(BaseModel):
    guest_phone: str
    note: str


class GuestNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    guest_phone: str
    note: str
    created_at: datetime


# ---------- Reminders ----------

class ReminderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    booking_id: Optional[str] = None
    reminder_type: ReminderType
    sent: bool
    sent_at: Optional[datetime] = None
    created_at: datetime


# ---------- iCal Feeds ----------

class ICalFeedCreate(BaseModel):
    label: Optional[str] = None
    cluster_id: str
    managed_by_user_id: Optional[str] = None
    has_ac: bool
    source: BookingSource
    url: str
    is_active: bool = True


class ICalFeedUpdate(BaseModel):
    label: Optional[str] = None
    cluster_id: Optional[str] = None
    managed_by_user_id: Optional[str] = None
    has_ac: Optional[bool] = None
    source: Optional[BookingSource] = None
    url: Optional[str] = None
    is_active: Optional[bool] = None


class ICalFeedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: Optional[str] = None
    cluster_id: str
    managed_by_user_id: Optional[str] = None
    has_ac: bool
    source: BookingSource
    url: str
    is_active: bool
    last_synced_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    created_at: datetime


# ---------- Teams / Permissions ----------

class TeamCreate(BaseModel):
    name: str
    notes: Optional[str] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    notes: Optional[str] = None
    created_at: datetime


class TeamWithPermissions(TeamOut):
    permissions: list[str] = []
    user_ids: list[str] = []


class SetTeamPermissionsRequest(BaseModel):
    permissions: list[str]


class SetUserTeamsRequest(BaseModel):
    team_ids: list[str]


class SetTeamUsersRequest(BaseModel):
    user_ids: list[str]
