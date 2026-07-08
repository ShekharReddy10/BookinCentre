"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Room, RoomStatus, RoomType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useCluster } from "@/lib/cluster-context";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

const ROOM_TYPES: RoomType[] = ["single", "double", "triple", "family", "suite", "studio", "dormitory"];
const ROOM_STATUSES: RoomStatus[] = ["available", "occupied", "cleaning", "maintenance", "blocked"];

const emptyForm = {
  cluster_id: "", room_number: "", room_name: "", room_type: "single" as RoomType,
  daily_price: 0, weekly_price: 0, monthly_price: 0, maximum_guests: 2,
  floor: "", amenities: "", has_ac: false, status: "available" as RoomStatus,
};

export default function RoomsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { clusters, clusterParam } = useCluster();
  const canEdit = user?.role === "admin" || user?.role === "manager";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["rooms", clusterParam],
    queryFn: async () => (await api.get("/rooms", { params: clusterParam })).data,
  });

  const clusterName = (id: string) => clusters.find((c) => c.id === id)?.name || "-";

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => (await api.post("/rooms", payload)).data,
    onSuccess: () => {
      toast.success("Room created");
      qc.invalidateQueries({ queryKey: ["rooms"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create room"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Room> }) =>
      (await api.patch(`/rooms/${id}`, payload)).data,
    onSuccess: () => {
      toast.success("Room updated");
      qc.invalidateQueries({ queryKey: ["rooms"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update room"),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, cluster_id: (clusterParam.cluster_id as string) || clusters[0]?.id || "" });
    setModalOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setForm({
      cluster_id: room.cluster_id,
      room_number: room.room_number, room_name: room.room_name, room_type: room.room_type,
      daily_price: room.daily_price, weekly_price: room.weekly_price, monthly_price: room.monthly_price,
      maximum_guests: room.maximum_guests, floor: room.floor || "", amenities: room.amenities || "",
      has_ac: room.has_ac, status: room.status,
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
      updateMutation.mutate({ id: editing.id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rooms</h1>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Room
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-400">Loading rooms...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(rooms || []).map((room) => (
          <Card key={room.id}>
            <CardContent className="pt-5">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="font-semibold">{room.room_number} · {room.room_name}</div>
                  <div className="text-xs text-slate-400 capitalize">{room.room_type} · Floor {room.floor || "-"}</div>
                  <div className="text-xs text-slate-400">{clusterName(room.cluster_id)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge>{room.status}</Badge>
                  <Badge>{room.has_ac ? "AC" : "Non-AC"}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">Daily</div>
                  {formatCurrency(room.daily_price)}
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Weekly</div>
                  {formatCurrency(room.weekly_price)}
                </div>
                <div>
                  <div className="text-slate-400 text-xs">Monthly</div>
                  {formatCurrency(room.monthly_price)}
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">Max guests: {room.maximum_guests}</div>
              {room.amenities && <div className="mt-1 text-xs text-slate-400">{room.amenities}</div>}
              {canEdit && (
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openEdit(room)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing ? "Edit Room" : "Add Room"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Cluster (Property)</Label>
            <Select required value={form.cluster_id} onChange={(e) => setForm({ ...form, cluster_id: e.target.value })}>
              <option value="">Select cluster</option>
              {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Room Number</Label>
              <Input required value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} />
            </div>
            <div>
              <Label>Room Name</Label>
              <Input required value={form.room_name} onChange={(e) => setForm({ ...form, room_name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Room Type</Label>
              <Select value={form.room_type} onChange={(e) => setForm({ ...form, room_type: e.target.value as RoomType })}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as RoomStatus })}>
                {ROOM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Daily Price</Label>
              <Input type="number" value={form.daily_price} onChange={(e) => setForm({ ...form, daily_price: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Weekly Price</Label>
              <Input type="number" value={form.weekly_price} onChange={(e) => setForm({ ...form, weekly_price: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Monthly Price</Label>
              <Input type="number" value={form.monthly_price} onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max Guests</Label>
              <Input type="number" value={form.maximum_guests} onChange={(e) => setForm({ ...form, maximum_guests: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Amenities (comma separated)</Label>
            <Input value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.has_ac}
              onChange={(e) => setForm({ ...form, has_ac: e.target.checked })}
            />
            Has AC
          </label>
          <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
            {editing ? "Save Changes" : "Create Room"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
