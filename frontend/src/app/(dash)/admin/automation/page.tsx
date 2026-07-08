"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { BookingSource, ICalFeed, UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, RefreshCw, Send, Trash2 } from "lucide-react";

const SOURCES: BookingSource[] = ["airbnb", "booking_com", "oyo", "makemytrip"];

const emptyForm = {
  label: "", cluster_id: "", managed_by_user_id: "", has_ac: false, source: "airbnb" as BookingSource, url: "",
};

export default function AdminAutomationPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { clusters } = useCluster();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  const { data: feeds, isLoading } = useQuery<ICalFeed[]>({
    queryKey: ["ical-feeds"],
    queryFn: async () => (await api.get("/ical-feeds")).data,
  });
  const { data: users } = useQuery<UserOut[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });

  const clusterName = (clusterId: string) => clusters.find((c) => c.id === clusterId)?.name || clusterId;
  const userName = (userId?: string | null) => (userId ? users?.find((u) => u.id === userId)?.name : null);

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) =>
      (await api.post("/ical-feeds", { ...payload, managed_by_user_id: payload.managed_by_user_id || null })).data,
    onSuccess: () => {
      toast.success("Feed added");
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
      setModalOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to add feed"),
  });

  const syncMutation = useMutation({
    mutationFn: async (feedId: string) => (await api.post(`/ical-feeds/${feedId}/sync`)).data,
    onSuccess: (data) => {
      toast.success(`Synced: ${data.created} created, ${data.updated} updated`);
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Sync failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (feedId: string) => (await api.delete(`/ical-feeds/${feedId}`)).data,
    onSuccess: () => {
      toast.success("Feed removed");
      qc.invalidateQueries({ queryKey: ["ical-feeds"] });
    },
  });

  const testNotifMutation = useMutation({
    mutationFn: async () => (await api.post("/automation/test-notification")).data,
    onSuccess: (data) => {
      if (data.telegram_sent || data.email_sent) {
        toast.success(`Sent — Telegram: ${data.telegram_sent ? "yes" : "no"}, Email: ${data.email_sent ? "yes" : "no"}`);
      } else {
        toast.error("Nothing configured — set TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID or RESEND_API_KEY in backend/.env");
      }
    },
  });

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin · Automation</h1>

      <Card>
        <CardHeader>
          <CardTitle>Notifications (Telegram / Email)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Configure <code>TELEGRAM_BOT_TOKEN</code> / <code>TELEGRAM_CHAT_ID</code> and/or{" "}
            <code>RESEND_API_KEY</code> (or SMTP settings) in <code>backend/.env</code>, then send yourself a test
            message to confirm it works. Daily arrival/checkout/pending-payment/summary reminders reuse the same
            config — see the README for how to schedule them.
          </p>
          <Button onClick={() => testNotifMutation.mutate()} disabled={testNotifMutation.isPending}>
            <Send className="h-4 w-4" /> Send Test Notification
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>iCal Sync (Airbnb / Booking.com / OYO / MakeMyTrip)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Paste each listing&apos;s calendar export URL (Airbnb: Calendar → Availability → Export Calendar ·
            Booking.com: Extranet → Calendar → Sync calendars). Bookings created from a feed arrive with a generic
            guest name — fill in the real details once known.
          </p>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Feed
          </Button>

          {isLoading && <p className="text-sm text-slate-400">Loading...</p>}

          <div className="space-y-2">
            {(feeds || []).map((feed) => (
              <div
                key={feed.id}
                className="flex flex-col gap-2 rounded-md border border-slate-200 dark:border-slate-800 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {feed.label ? `${feed.label} · ` : ""}
                    {clusterName(feed.cluster_id)} · {feed.has_ac ? "AC" : "Non-AC"} rooms ·{" "}
                    <span className="capitalize">{feed.source.replace("_", " ")}</span>
                  </div>
                  {userName(feed.managed_by_user_id) && (
                    <div className="text-xs text-slate-400">Managed by {userName(feed.managed_by_user_id)}</div>
                  )}
                  <div className="truncate text-xs text-slate-400">{feed.url}</div>
                  <div className="text-xs text-slate-400">
                    {feed.last_synced_at ? `Last synced ${formatDate(feed.last_synced_at)}` : "Never synced"}
                    {feed.last_sync_status ? ` — ${feed.last_sync_status}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => syncMutation.mutate(feed.id)} disabled={syncMutation.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" /> Sync Now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(feed.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {!isLoading && (feeds || []).length === 0 && <p className="text-sm text-slate-400">No feeds added yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add iCal Feed">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div>
            <Label>Label (optional, helps tell feeds apart)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Account 2 - AC Listing" />
          </div>
          <div>
            <Label>Cluster (Property)</Label>
            <Select required value={form.cluster_id} onChange={(e) => setForm({ ...form, cluster_id: e.target.value })}>
              <option value="">Select cluster</option>
              {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Managed By (optional)</Label>
            <Select value={form.managed_by_user_id} onChange={(e) => setForm({ ...form, managed_by_user_id: e.target.value })}>
              <option value="">Unassigned</option>
              {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Room Category</Label>
            <Select value={form.has_ac ? "ac" : "nonac"} onChange={(e) => setForm({ ...form, has_ac: e.target.value === "ac" })}>
              <option value="ac">AC rooms</option>
              <option value="nonac">Non-AC rooms</option>
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              This listing represents a room category, not one physical room — a matching free room is
              auto-allocated each time a booking syncs in.
            </p>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as BookingSource })}>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label>Calendar Export URL</Label>
            <Input required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.airbnb.com/calendar/ical/..." />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>Add Feed</Button>
        </form>
      </Modal>
    </div>
  );
}
