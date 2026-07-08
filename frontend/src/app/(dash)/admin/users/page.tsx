"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { UserCreatedOut, UserRole, UserWithClusters } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, KeyRound, Building2, Copy } from "lucide-react";

const ROLES: UserRole[] = ["admin", "manager", "staff"];

const emptyForm = { name: "", email: "", phone: "", role: "staff" as UserRole, cluster_ids: [] as string[] };

export default function AdminUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const { clusters } = useCluster();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [credsOpen, setCredsOpen] = useState(false);
  const [creds, setCreds] = useState<UserCreatedOut | null>(null);
  const [clustersModalUser, setClustersModalUser] = useState<UserWithClusters | null>(null);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  const { data: users, isLoading } = useQuery<UserWithClusters[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => (await api.post("/users", payload)).data as UserCreatedOut,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreateOpen(false);
      setForm(emptyForm);
      setCreds(data);
      setCredsOpen(true);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create user"),
  });

  const resetMutation = useMutation({
    mutationFn: async (userId: string) => (await api.post(`/users/${userId}/reset-password`)).data as UserCreatedOut,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreds(data);
      setCredsOpen(true);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      (await api.patch(`/users/${id}`, { is_active })).data,
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const setClustersMutation = useMutation({
    mutationFn: async ({ id, cluster_ids }: { id: string; cluster_ids: string[] }) =>
      (await api.put(`/users/${id}/clusters`, { cluster_ids })).data,
    onSuccess: () => {
      toast.success("Cluster access updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      setClustersModalUser(null);
    },
  });

  function openClustersModal(u: UserWithClusters) {
    setClustersModalUser(u);
    setSelectedClusters(u.cluster_ids);
  }

  function copyCreds() {
    if (!creds) return;
    navigator.clipboard.writeText(`Email: ${creds.user.email}\nTemporary password: ${creds.temporary_password}`);
    toast.success("Copied to clipboard");
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin · Users</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>
      <p className="text-sm text-slate-400">
        Team members don&apos;t self-register. Create their account here (or via <code>python -m app.create_user</code>
        {" "}in the backend shell) — a temporary password is generated for you to share with them directly.
      </p>

      {isLoading && <p className="text-sm text-slate-400">Loading...</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(users || []).map((u) => (
          <Card key={u.id}>
            <CardContent className="pt-5 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.email}</div>
                </div>
                <Badge>{u.role}</Badge>
              </div>
              <div className="flex flex-wrap gap-1 text-xs text-slate-400">
                {u.role === "admin" ? (
                  <span>All clusters</span>
                ) : u.cluster_ids.length === 0 ? (
                  <span className="text-amber-500">No cluster access yet</span>
                ) : (
                  u.cluster_ids.map((cid) => (
                    <span key={cid} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                      {clusters.find((c) => c.id === cid)?.name || cid}
                    </span>
                  ))
                )}
              </div>
              {!u.is_active && <Badge>disabled</Badge>}
              {u.must_change_password && <div className="text-xs text-amber-500">Awaiting first login / password change</div>}
              <div className="flex flex-wrap gap-2 pt-1">
                {u.role !== "admin" && (
                  <Button variant="outline" size="sm" onClick={() => openClustersModal(u)}>
                    <Building2 className="h-3.5 w-3.5" /> Clusters
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => resetMutation.mutate(u.id)}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset Password
                </Button>
                {u.id !== user.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActiveMutation.mutate({ id: u.id, is_active: !u.is_active })}
                  >
                    {u.is_active ? "Disable" : "Enable"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create user modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Team Member">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email (used to login)</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          {form.role !== "admin" && (
            <div>
              <Label>Cluster Access</Label>
              <div className="flex flex-wrap gap-2">
                {clusters.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={form.cluster_ids.includes(c.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cluster_ids: e.target.checked
                            ? [...form.cluster_ids, c.id]
                            : form.cluster_ids.filter((id) => id !== c.id),
                        })
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            Create User
          </Button>
        </form>
      </Modal>

      {/* Credentials display modal */}
      <Modal open={credsOpen} onClose={() => setCredsOpen(false)} title="Share these credentials">
        {creds && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              This password is shown only once. Share it with {creds.user.name} directly (in person, chat, etc.) —
              they&apos;ll be required to set their own password on first login.
            </p>
            <div className="rounded-md bg-slate-50 dark:bg-slate-800 p-3 text-sm font-mono">
              <div>Email: {creds.user.email}</div>
              <div>Password: {creds.temporary_password}</div>
            </div>
            <Button variant="outline" className="w-full" onClick={copyCreds}>
              <Copy className="h-4 w-4" /> Copy to clipboard
            </Button>
          </div>
        )}
      </Modal>

      {/* Cluster access modal */}
      <Modal open={!!clustersModalUser} onClose={() => setClustersModalUser(null)} title="Assign Cluster Access">
        {clustersModalUser && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{clustersModalUser.name} will only see rooms, bookings, and reports for the clusters checked below.</p>
            <div className="space-y-2">
              {clusters.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedClusters.includes(c.id)}
                    onChange={(e) =>
                      setSelectedClusters(
                        e.target.checked ? [...selectedClusters, c.id] : selectedClusters.filter((id) => id !== c.id)
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => setClustersMutation.mutate({ id: clustersModalUser.id, cluster_ids: selectedClusters })}
              disabled={setClustersMutation.isPending}
            >
              Save Access
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
