"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Expense, ExpenseCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const CATEGORIES: ExpenseCategory[] = ["electricity", "water", "cleaning", "laundry", "repairs", "maintenance", "misc"];

const emptyForm = { category: "misc" as ExpenseCategory, amount: 0, date: new Date().toISOString().slice(0, 10), notes: "" };

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => (await api.get("/expenses")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => (await api.post("/expenses", payload)).data,
    onSuccess: () => {
      toast.success("Expense added");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setModalOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to add expense"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const total = (expenses || []).reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="text-sm text-slate-400">Total Expenses</div>
          <div className="text-2xl font-semibold">{formatCurrency(total)}</div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 dark:bg-slate-800 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="px-3 py-4 text-slate-400" colSpan={5}>Loading...</td></tr>}
            {(expenses || []).map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{formatDate(e.date)}</td>
                <td className="px-3 py-2 capitalize">{e.category}</td>
                <td className="px-3 py-2">{formatCurrency(e.amount)}</td>
                <td className="px-3 py-2 text-slate-400">{e.notes}</td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(e.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Expense">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div>
            <Label>Category</Label>
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>Add Expense</Button>
        </form>
      </Modal>
    </div>
  );
}
