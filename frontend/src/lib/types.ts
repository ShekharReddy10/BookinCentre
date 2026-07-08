export type UserRole = "admin" | "manager" | "staff";

export interface UserOut {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface UserWithClusters extends UserOut {
  cluster_ids: string[];
}

export interface UserCreatedOut {
  user: UserOut;
  temporary_password: string;
}

export interface Cluster {
  id: string;
  name: string;
  location?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
}

export type RoomType = "single" | "double" | "triple" | "family" | "suite" | "studio" | "dormitory";
export type RoomStatus = "available" | "occupied" | "cleaning" | "maintenance" | "blocked";

export interface Room {
  id: string;
  cluster_id: string;
  room_number: string;
  room_name: string;
  room_type: RoomType;
  daily_price: number;
  weekly_price: number;
  monthly_price: number;
  maximum_guests: number;
  floor?: string | null;
  amenities?: string | null;
  has_ac: boolean;
  status: RoomStatus;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export type BookingSource =
  | "airbnb" | "booking_com" | "oyo" | "makemytrip" | "direct" | "walk_in" | "phone" | "other";
export type BookingStatus =
  | "reserved" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type PaymentStatus = "paid" | "partial" | "pending";

export interface BookingCreatePayload {
  room_id?: string;
  cluster_id?: string;
  has_ac?: boolean;
  guest_name: string;
  phone?: string | null;
  email?: string | null;
  checkin_date: string;
  checkout_date: string;
  adults: number;
  children: number;
  booking_source: BookingSource;
  managed_by_user_id?: string | null;
  booking_reference?: string | null;
  total_amount: number;
  advance_amount: number;
  booking_status: BookingStatus;
  notes?: string | null;
}

export interface Booking {
  id: string;
  room_id: string;
  guest_name: string;
  phone?: string | null;
  email?: string | null;
  checkin_date: string;
  checkout_date: string;
  adults: number;
  children: number;
  booking_source: BookingSource;
  managed_by_user_id?: string | null;
  booking_reference?: string | null;
  total_amount: number;
  advance_amount: number;
  pending_amount: number;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory =
  | "electricity" | "water" | "cleaning" | "laundry" | "repairs" | "maintenance" | "misc";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes?: string | null;
  created_at: string;
}

export interface DashboardSummary {
  todays_checkins: number;
  todays_checkouts: number;
  occupied_rooms: number;
  available_rooms: number;
  cleaning_rooms: number;
  maintenance_rooms: number;
  total_rooms: number;
  revenue_today: number;
  revenue_month: number;
  pending_payments: number;
  occupancy_pct: number;
  upcoming_arrivals: BookingBrief[];
  upcoming_departures: BookingBrief[];
}

export interface BookingBrief {
  id: string;
  guest_name: string;
  room_id: string;
  checkin_date: string;
  checkout_date: string;
  booking_status: BookingStatus;
}

export interface ICalFeed {
  id: string;
  label?: string | null;
  cluster_id: string;
  managed_by_user_id?: string | null;
  has_ac: boolean;
  source: BookingSource;
  url: string;
  is_active: boolean;
  last_synced_at?: string | null;
  last_sync_status?: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  notes?: string | null;
  created_at: string;
}

export interface TeamWithPermissions extends Team {
  permissions: string[];
  user_ids: string[];
}

export interface PermissionKey {
  key: string;
  label: string;
}
