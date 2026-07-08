"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PermissionKey, TeamWithPermissions, UserOut } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, ShieldCheck, Trash2, UsersRound } from "lucide-react";

const emptyForm = { name: "", notes: "" };

export default function AdminTeamsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [permsModalTeam, setPermsModalTeam] = useState<TeamWithPermissions | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const [membersModalTeam, setMembersModalTeam] = useState<TeamWithPermissions | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [user, router]);

  const { data: teams, isLoading } = useQuery<TeamWithPermissions[]>({
    queryKey: ["teams"],
    queryFn: async () => (await api.get("/teams")).data,
  });
  const { data: permissionKeys } = useQuery<PermissionKey[]>({
    queryKey: ["team-permission-keys"],
    queryFn: async () => (await api.get("/teams/permissions")).data,
  });
  const { data: users } = useQuery<UserOut[]>({ queryKey: ["users"], queryFn: async () => (await api.get("/users")).data });

  const userName = (id: string) => users?.find((u) => u.id === id)?.name || id;

  const createMutation = useMutation({
    mutationFn: async (payload: typeof emptyForm) => (await api.post("/teams", payload)).data,
    onSuccess: () => {
      toast.success("Team created");
      qc.invalidateQueries({ queryKey: ["teams"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to create team"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: typeof emptyForm }) =>
      (await api.patch(`/teams/${id}`, payload)).data,
    onSuccess: () => {
      toast.success("Team updated");
      qc.invalidateQueries({ queryKey: ["teams"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update team"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/teams/${id}`)).data,
    onSuccess: () => {
      toast.success("Team deleted");
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const setPermsMutation = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: string[] }) =>
      (await api.put(`/teams/${id}/permissions`, { permissions })).data,
    onSuccess: () => {
      toast.success("Permissions updated");
      qc.invalidateQueries({ queryKey: ["teams"] });
      setPermsModalTeam(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update permissions"),
  });

  const setMembersMutation = useMutation({
    mutationFn: async ({ id, user_ids }: { id: string; user_ids: string[] }) =>
      (await api.put(`/teams/${id}/users`, { user_ids })).data,
    onSuccess: () => {
      toast.success("Members updated");
      qc.invalidateQueries({ queryKey: ["teams"] });
      setMembersModalTeam(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || "Failed to update members"),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(team: TeamWithPermissions) {
    setEditingId(team.id);
    setForm({ name: team.name, notes: team.notes || "" });
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

  function openPermsModal(team: TeamWithPermissions) {
    setPermsModalTeam(team);
    setSelectedPerms(team.permissions);
  }

  function openMembersModal(team: TeamWithPermissions) {
    setMembersModalTeam(team);
    setSelectedMembers(team.user_ids);
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin · Teams</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Team
        </Button>
      </div>
      <p className="text-sm text-slate-400">
        A team is a set of sidebar permissions (e.g. &quot;Front Desk&quot;, &quot;Finance&quot;). Assign users to a
        team here, or from Admin → Users — their sidebar shows exactly what the union of their teams&apos;
        permissions allows. Admin-role accounts always see everything regardless of team membership.
      </p>

      {isLoading && <p className="text-sm text-slate-400">Loading...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(teams || []).map((team) => (
          <Card key={team.id}>
            <CardContent className="pt-5 space-y-2">
              <div className="font-semibold">{team.name}</div>
              {team.notes && <div className="text-sm text-slate-500">{team.notes}</div>}

              <div className="flex flex-wrap gap-1">
                {team.permissions.length === 0 ? (
                  <span className="text-xs text-amber-500">No permissions granted yet</span>
                ) : (
                  team.permissions.map((p) => (
                    <span key={p} className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs">
                      {permissionKeys?.find((pk) => pk.key === p)?.label || p}
                    </span>
                  ))
                )}
              </div>

              <div className="text-xs text-slate-400">
                {team.user_ids.length === 0
                  ? "No members yet"
                  : `Members: ${team.user_ids.map(userName).join(", ")}`}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => openPermsModal(team)}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Permissions
                </Button>
                <Button variant="outline" size="sm" onClick={() => openMembersModal(team)}>
                  <UsersRound className="h-3.5 w-3.5" /> Members
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(team)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(team.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (teams || []).length === 0 && <p className="text-sm text-slate-400">No teams created yet.</p>}
      </div>

      {/* Create/edit team modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingId ? "Edit Team" : "Add Team"}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Front Desk" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId ? "Save Changes" : "Create Team"}
          </Button>
        </form>
      </Modal>

      {/* Permissions modal */}
      <Modal open={!!permsModalTeam} onClose={() => setPermsModalTeam(null)} title="Team Permissions">
        {permsModalTeam && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Checked permissions determine which sidebar sections members of <strong>{permsModalTeam.name}</strong> can see.
            </p>
            <div className="space-y-2">
              {(permissionKeys || []).map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.key)}
                    onChange={(e) =>
                      setSelectedPerms(
                        e.target.checked ? [...selectedPerms, p.key] : selectedPerms.filter((k) => k !== p.key)
                      )
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => setPermsMutation.mutate({ id: permsModalTeam.id, permissions: selectedPerms })}
              disabled={setPermsMutation.isPending}
            >
              Save Permissions
            </Button>
          </div>
        )}
      </Modal>

      {/* Members modal */}
      <Modal open={!!membersModalTeam} onClose={() => setMembersModalTeam(null)} title="Team Members">
        {membersModalTeam && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Users checked below will have <strong>{membersModalTeam.name}</strong>&apos;s permissions added to
              their sidebar (in addition to any other teams they belong to).
            </p>
            <div className="space-y-2">
              {(users || []).map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(u.id)}
                    onChange={(e) =>
                      setSelectedMembers(
                        e.target.checked ? [...selectedMembers, u.id] : selectedMembers.filter((id) => id !== u.id)
                      )
                    }
                  />
                  {u.name} <span className="text-slate-400">({u.role})</span>
                </label>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => setMembersMutation.mutate({ id: membersModalTeam.id, user_ids: selectedMembers })}
              disabled={setMembersMutation.isPending}
            >
              Save Members
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
