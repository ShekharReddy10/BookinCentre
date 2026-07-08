"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface GuestHistory {
  phone: string;
  total_bookings: number;
  total_revenue: number;
  last_stay: string | null;
  bookings: {
    id: string; guest_name: string; checkin_date: string; checkout_date: string;
    total_amount: number; booking_status: string;
  }[];
  notes: { id: string; note: string; created_at: string }[];
}

export default function GuestsPage() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [note, setNote] = useState("");

  const { data: history, isFetching } = useQuery<GuestHistory>({
    queryKey: ["guest-history", searchedPhone],
    queryFn: async () => (await api.get(`/guests/${searchedPhone}/history`)).data,
    enabled: !!searchedPhone,
  });

  const addNote = useMutation({
    mutationFn: async () => (await api.post("/guests/notes", { guest_phone: searchedPhone, note })).data,
    onSuccess: () => {
      toast.success("Note added");
      setNote("");
      qc.invalidateQueries({ queryKey: ["guest-history", searchedPhone] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Guest History</h1>

      <div className="flex gap-3">
        <Input
          placeholder="Search by phone number..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => setSearchedPhone(phone)}>Search</Button>
      </div>

      {isFetching && <p className="text-sm text-slate-400">Loading...</p>}

      {history && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-5"><div className="text-xs text-slate-400">Total Bookings</div><div className="text-2xl font-semibold">{history.total_bookings}</div></CardContent></Card>
            <Card><CardContent className="pt-5"><div className="text-xs text-slate-400">Total Revenue</div><div className="text-2xl font-semibold">{formatCurrency(history.total_revenue)}</div></CardContent></Card>
            <Card><CardContent className="pt-5"><div className="text-xs text-slate-400">Last Stay</div><div className="text-2xl font-semibold">{history.last_stay ? formatDate(history.last_stay) : "-"}</div></CardContent></Card>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-2">
              <h3 className="mb-2 text-sm font-medium text-slate-500">Booking History</h3>
              {history.bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 py-2 text-sm first:border-t-0">
                  <span>{formatDate(b.checkin_date)} → {formatDate(b.checkout_date)}</span>
                  <span>{formatCurrency(b.total_amount)}</span>
                  <Badge>{b.booking_status}</Badge>
                </div>
              ))}
              {history.bookings.length === 0 && <p className="text-sm text-slate-400">No bookings found</p>}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-3">
              <h3 className="text-sm font-medium text-slate-500">Guest Notes</h3>
              {history.notes.map((n) => (
                <div key={n.id} className="rounded-md bg-slate-50 dark:bg-slate-800 p-2 text-sm">
                  {n.note}
                  <div className="text-xs text-slate-400">{formatDate(n.created_at)}</div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Add a note..." value={note} onChange={(e) => setNote(e.target.value)} />
                <Button onClick={() => addNote.mutate()} disabled={!note}>Add</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
