"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { api } from "@/lib/api";
import { Booking, Room } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { useCluster } from "@/lib/cluster-context";

const STATUS_COLOR: Record<string, string> = {
  reserved: "#a855f7",
  confirmed: "#3b82f6",
  checked_in: "#22c55e",
  checked_out: "#64748b",
  cancelled: "#ef4444",
  no_show: "#ef4444",
};

export default function CalendarPage() {
  const { clusterParam } = useCluster();
  const { data: bookings } = useQuery<Booking[]>({
    queryKey: ["bookings-all", clusterParam],
    queryFn: async () => (await api.get("/bookings", { params: clusterParam })).data,
    refetchInterval: 30_000,
  });
  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["rooms", clusterParam],
    queryFn: async () => (await api.get("/rooms", { params: clusterParam })).data,
  });

  const roomMap = useMemo(() => Object.fromEntries((rooms || []).map((r) => [r.id, r])), [rooms]);

  const events = useMemo(
    () =>
      (bookings || [])
        .filter((b) => b.booking_status !== "cancelled")
        .map((b) => ({
          id: b.id,
          title: `${roomMap[b.room_id]?.room_number || ""} · ${b.guest_name}`,
          start: b.checkin_date,
          end: b.checkout_date,
          backgroundColor: STATUS_COLOR[b.booking_status],
          borderColor: STATUS_COLOR[b.booking_status],
        })),
    [bookings, roomMap]
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Booking Calendar</h1>
      <Card>
        <CardContent className="pt-5">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
            events={events}
            height="auto"
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_COLOR).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <span className="capitalize text-slate-500">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
