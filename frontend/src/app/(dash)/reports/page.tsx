"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useCluster } from "@/lib/cluster-context";
import { Download } from "lucide-react";

interface RevenueReport {
  total_revenue: number;
  total_bookings: number;
  average_stay_nights: number;
  revenue_by_room: Record<string, { bookings: number; revenue: number }>;
  revenue_by_source: Record<string, { bookings: number; revenue: number }>;
}

interface TeamRow {
  user_id: string;
  name: string;
  total_bookings: number;
  revenue: number;
  average_stay_nights: number;
  pending_payments: number;
  todays_checkins: number;
}

interface ExpensesSummary {
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  expenses_by_category: Record<string, number>;
}

export default function ReportsPage() {
  const { clusterParam } = useCluster();
  const [range, setRange] = useState({ from_date: "", to_date: "" });

  const params = { ...clusterParam, ...Object.fromEntries(Object.entries(range).filter(([, v]) => v)) };

  const { data: revenue } = useQuery<RevenueReport>({
    queryKey: ["report-revenue", range, clusterParam],
    queryFn: async () => (await api.get("/reports/revenue", { params })).data,
  });

  const { data: team } = useQuery<TeamRow[]>({
    queryKey: ["report-team", range, clusterParam],
    queryFn: async () => (await api.get("/reports/team-performance", { params })).data,
  });

  const { data: expenses } = useQuery<ExpensesSummary>({
    queryKey: ["report-expenses", range, clusterParam],
    queryFn: async () => (await api.get("/reports/expenses-summary", { params })).data,
  });

  async function download(kind: "bookings" | "expenses") {
    const res = await api.get(`/reports/export/${kind}.csv`, { params, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>From</Label>
          <Input type="date" value={range.from_date} onChange={(e) => setRange({ ...range, from_date: e.target.value })} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={range.to_date} onChange={(e) => setRange({ ...range, to_date: e.target.value })} />
        </div>
        <Button variant="outline" onClick={() => download("bookings")}>
          <Download className="h-4 w-4" /> Export Bookings CSV
        </Button>
        <Button variant="outline" onClick={() => download("expenses")}>
          <Download className="h-4 w-4" /> Export Expenses CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle>Total Revenue</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(revenue?.total_revenue || 0)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Total Bookings</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{revenue?.total_bookings ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Avg Stay (nights)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{revenue?.average_stay_nights ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle>Net Profit</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(expenses?.net_profit || 0)}</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue by Source</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(revenue?.revenue_by_source || {}).map(([source, v]) => (
              <div key={source} className="flex items-center justify-between text-sm">
                <span className="capitalize">{source.replace("_", " ")}</span>
                <span className="text-slate-400">{v.bookings} bookings</span>
                <span className="font-medium">{formatCurrency(v.revenue)}</span>
              </div>
            ))}
            {Object.keys(revenue?.revenue_by_source || {}).length === 0 && <p className="text-sm text-slate-400">No data</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(expenses?.expenses_by_category || {}).map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="capitalize">{category}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
            {Object.keys(expenses?.expenses_by_category || {}).length === 0 && <p className="text-sm text-slate-400">No data</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Team Performance</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1 pr-4">Name</th>
                <th className="py-1 pr-4">Bookings</th>
                <th className="py-1 pr-4">Revenue</th>
                <th className="py-1 pr-4">Avg Stay</th>
                <th className="py-1 pr-4">Pending</th>
                <th className="py-1 pr-4">Today Check-ins</th>
              </tr>
            </thead>
            <tbody>
              {(team || []).map((t) => (
                <tr key={t.user_id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4 font-medium">{t.name}</td>
                  <td className="py-2 pr-4">{t.total_bookings}</td>
                  <td className="py-2 pr-4">{formatCurrency(t.revenue)}</td>
                  <td className="py-2 pr-4">{t.average_stay_nights}</td>
                  <td className="py-2 pr-4">{formatCurrency(t.pending_payments)}</td>
                  <td className="py-2 pr-4">{t.todays_checkins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
