"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useCluster } from "@/lib/cluster-context";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#64748b"];

function Widget({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { clusterParam } = useCluster();

  const { data: summary } = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", clusterParam],
    queryFn: async () => (await api.get("/dashboard/summary", { params: clusterParam })).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: monthlyRevenue } = useQuery({
    queryKey: ["monthly-revenue", clusterParam],
    queryFn: async () => (await api.get("/dashboard/monthly-revenue", { params: clusterParam })).data,
    refetchInterval: 60_000,
  });

  const { data: sourceDist } = useQuery({
    queryKey: ["source-distribution", clusterParam],
    queryFn: async () => (await api.get("/dashboard/booking-source-distribution", { params: clusterParam })).data,
    refetchInterval: 60_000,
  });

  if (!summary) return <div className="text-sm text-slate-400">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Widget label="Today's Check-ins" value={summary.todays_checkins} />
        <Widget label="Today's Check-outs" value={summary.todays_checkouts} />
        <Widget label="Occupied Rooms" value={`${summary.occupied_rooms}/${summary.total_rooms}`} />
        <Widget label="Available Rooms" value={summary.available_rooms} />
        <Widget label="Cleaning" value={summary.cleaning_rooms} />
        <Widget label="Maintenance" value={summary.maintenance_rooms} />
        <Widget label="Occupancy %" value={`${summary.occupancy_pct}%`} />
        <Widget label="Pending Payments" value={formatCurrency(summary.pending_payments)} />
        <Widget label="Revenue Today" value={formatCurrency(summary.revenue_today)} />
        <Widget label="Revenue This Month" value={formatCurrency(summary.revenue_month)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue || []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Booking Source Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sourceDist || []}
                  dataKey="revenue"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => (entry as unknown as { source: string }).source}
                >
                  {(sourceDist || []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Arrivals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.upcoming_arrivals.length === 0 && <p className="text-sm text-slate-400">None</p>}
            {summary.upcoming_arrivals.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{b.guest_name}</span>
                <span className="text-slate-400">{formatDate(b.checkin_date)}</span>
                <Badge>{b.booking_status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Departures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.upcoming_departures.length === 0 && <p className="text-sm text-slate-400">None</p>}
            {summary.upcoming_departures.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span>{b.guest_name}</span>
                <span className="text-slate-400">{formatDate(b.checkout_date)}</span>
                <Badge>{b.booking_status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
