"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

const emptyForm = { name: "", location: "", notes: "", is_active: true };

export default function AdminClustersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { clusters } = useCluster();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => (await api.post("/clusters", payload)).data,
    onSuccess: () => {
      toast.success("Cluster created");
      qc.invalidateQueries({ queryKey: ["clusters"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create cluster"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) =>
      (await api.patch(`/clusters/${id}`, payload)).data,
    onSuccess: () => {
      toast.success("Cluster updated");
      qc.invalidateQueries({ queryKey: ["clusters"] });
      closeModal();
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(c: (typeof clusters)[number]) {
    setEditingId(c.id);
    setForm({ name: c.name, location: c.location || "", notes: c.notes || "", is_active: c.is_active });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin · Clusters</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Cluster
        </Button>
      </div>
      <p className="text-sm text-slate-400">
        A cluster is a property, building, or area (e.g. &quot;Sunrise Villa - MG Road&quot;). Each room belongs to
        exactly one cluster, and staff/manager accounts only see the clusters they&apos;re granted access to from
        Admin &gt; Users.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-5">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.location}</div>
                </div>
                {!c.is_active && <Badge>inactive</Badge>}
              </div>
              {c.notes && <div className="text-sm text-slate-500">{c.notes}</div>}
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openEdit(c)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "Edit Cluster" : "Add Cluster"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sunrise Villa" />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="MG Road, Bengaluru" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Save Changes" : "Create Cluster"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
