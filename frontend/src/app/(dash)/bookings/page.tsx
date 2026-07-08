"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Booking, BookingCreatePayload, BookingSource, BookingStatus, PaymentStatus, Room, UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useCluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import { Plus, Pencil, X } from "lucide-react";

const SOURCES: BookingSource[] = ["airbnb", "booking_com", "oyo", "makemytrip", "direct", "walk_in", "phone", "other"];
const STATUSES: BookingStatus[] = ["reserved", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
const PAYMENT_STATUSES: PaymentStatus[] = ["paid", "partial", "pending"];

const emptyForm = {
  room_id: "", cluster_id: "", guest_name: "", phone: "", email: "", checkin_date: "", checkout_date: "",
  adults: 1, children: 0, booking_source: "direct" as BookingSource, managed_by_user_id: "",
  booking_reference: "", total_amount: 0, advance_amount: 0, booking_status: "reserved" as BookingStatus,
  notes: "",
};

type BookingMode = "specific" | "ac" | "nonac";

export default function BookingsPage() {
  const qc = useQueryClient();
  const { clusters, clusterParam } = useCluster();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [bookingMode, setBookingMode] = useState<BookingMode>("specific");
  const [filters, setFilters] = useState({ guest_name: "", booking_status: "", booking_source: "" });

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["rooms", clusterParam],
    queryFn: async () => (await api.get("/rooms", { params: clusterParam })).data,
  });
  const { data: users } = useQuery<UserOut[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["bookings", filters, clusterParam],
    queryFn: async () => {
      const params: Record<string, string> = { ...clusterParam };
      if (filters.guest_name) params.guest_name = filters.guest_name;
      if (filters.booking_status) params.booking_status = filters.booking_status;
      if (filters.booking_source) params.booking_source = filters.booking_source;
      return (await api.get("/bookings", { params })).data;
    },
    refetchInterval: 30_000,
  });

  const roomMap = useMemo(() => Object.fromEntries((rooms || []).map((r) => [r.id, r])), [rooms]);
  const userMap = useMemo(() => Object.fromEntries((users || []).map((u) => [u.id, u])), [users]);

  const createMutation = useMutation({
    mutationFn: async (payload: BookingCreatePayload) => (await api.post("/bookings", payload)).data,
    onSuccess: () => {
      toast.success("Booking created");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create booking"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Booking> }) =>
      (await api.patch(`/bookings/${id}`, payload)).data,
    onSuccess: () => {
      toast.success("Booking updated");
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update booking"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/bookings/${id}`)).data,
    onSuccess: () => {
      toast.success("Booking cancelled");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  function cleanPayload(payload: typeof emptyForm) {
    return { ...payload, managed_by_user_id: payload.managed_by_user_id || null, email: payload.email || null };
  }

  function openCreate() {
    setEditing(null);
    setBookingMode("specific");
    setForm({ ...emptyForm, room_id: rooms?.[0]?.id || "", cluster_id: (clusterParam.cluster_id as string) || "" });
    setModalOpen(true);
  }

  function openEdit(b: Booking) {
    setEditing(b);
    setBookingMode("specific");
    setForm({
      room_id: b.room_id, cluster_id: "", guest_name: b.guest_name, phone: b.phone || "", email: b.email || "",
      checkin_date: b.checkin_date, checkout_date: b.checkout_date, adults: b.adults, children: b.children,
      booking_source: b.booking_source, managed_by_user_id: b.managed_by_user_id || "",
      booking_reference: b.booking_reference || "", total_amount: b.total_amount, advance_amount: b.advance_amount,
      booking_status: b.booking_status, notes: b.notes || "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: cleanPayload(form) });
      return;
    }
    const cleaned = cleanPayload(form);
    if (bookingMode === "specific") {
      const { cluster_id: _cluster_id, ...rest } = cleaned;
      createMutation.mutate(rest as BookingCreatePayload);
    } else {
      const { room_id: _room_id, ...rest } = cleaned;
      createMutation.mutate({ ...rest, has_ac: bookingMode === "ac" } as BookingCreatePayload);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Booking
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search guest name..."
          className="w-52"
          value={filters.guest_name}
          onChange={(e) => setFilters({ ...filters, guest_name: e.target.value })}
        />
        <Select className="w-40" value={filters.booking_status} onChange={(e) => setFilters({ ...filters, booking_status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="w-40" value={filters.booking_source} onChange={(e) => setFilters({ ...filters, booking_source: e.target.value })}>
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Guest</th>
              <th className="px-3 py-2">Room</th>
              <th className="px-3 py-2">Check-in</th>
              <th className="px-3 py-2">Check-out</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Managed By</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Payment</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td className="px-3 py-4 text-slate-400" colSpan={10}>Loading...</td></tr>
            )}
            {(bookings || []).map((b) => (
              <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium">{b.guest_name}</div>
                  <div className="text-xs text-slate-400">{b.phone}</div>
                </td>
                <td className="px-3 py-2">{roomMap[b.room_id]?.room_number || "-"}</td>
                <td className="px-3 py-2">{formatDate(b.checkin_date)}</td>
                <td className="px-3 py-2">{formatDate(b.checkout_date)}</td>
                <td className="px-3 py-2 capitalize">{b.booking_source.replace("_", " ")}</td>
                <td className="px-3 py-2">{userMap[b.managed_by_user_id || ""]?.name || "-"}</td>
                <td className="px-3 py-2">{formatCurrency(b.total_amount)}</td>
                <td className="px-3 py-2"><Badge>{b.payment_status}</Badge></td>
                <td className="px-3 py-2"><Badge>{b.booking_status}</Badge></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {b.booking_status !== "cancelled" && b.booking_status !== "checked_out" && (
                      <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(b.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Edit Booking" : "New Booking"} className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Guest Name</Label>
              <Input required value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
            </div>
            <div>
              <Label>Room</Label>
              {!editing && (
                <Select
                  className="mb-2"
                  value={bookingMode}
                  onChange={(e) => setBookingMode(e.target.value as BookingMode)}
                >
                  <option value="specific">Specific room</option>
                  <option value="ac">Any available AC room</option>
                  <option value="nonac">Any available Non-AC room</option>
                </Select>
              )}
              {bookingMode === "specific" || editing ? (
                <Select required value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                  <option value="">Select room</option>
                  {(rooms || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_number} · {r.room_name} ({r.has_ac ? "AC" : "Non-AC"})
                    </option>
                  ))}
                </Select>
              ) : (
                <Select required value={form.cluster_id} onChange={(e) => setForm({ ...form, cluster_id: e.target.value })}>
                  <option value="">Select cluster</option>
                  {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Check-in Date</Label>
              <Input type="date" required value={form.checkin_date} onChange={(e) => setForm({ ...form, checkin_date: e.target.value })} />
            </div>
            <div>
              <Label>Check-out Date</Label>
              <Input type="date" required value={form.checkout_date} onChange={(e) => setForm({ ...form, checkout_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Adults</Label>
              <Input type="number" min={1} value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Children</Label>
              <Input type="number" min={0} value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Booking Source</Label>
              <Select value={form.booking_source} onChange={(e) => setForm({ ...form, booking_source: e.target.value as BookingSource })}>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label>Managed By</Label>
              <Select value={form.managed_by_user_id} onChange={(e) => setForm({ ...form, managed_by_user_id: e.target.value })}>
                <option value="">Unassigned</option>
                {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Booking Reference</Label>
            <Input value={form.booking_reference} onChange={(e) => setForm({ ...form, booking_reference: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Total Amount</Label>
              <Input type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Advance Paid</Label>
              <Input type="number" value={form.advance_amount} onChange={(e) => setForm({ ...form, advance_amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Booking Status</Label>
              <Select value={form.booking_status} onChange={(e) => setForm({ ...form, booking_status: e.target.value as BookingStatus })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
            {editing ? "Save Changes" : "Create Booking"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
