import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import {
  createSkill,
  deleteSkill,
  listSkills,
  setSkillActive,
  setSkillVisible,
  type SkillSummary,
} from "@/api/skills";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { SkeletonRow } from "@/components/ui/skeleton";
import { getSkillDisplay } from "@/lib/skill-display";

export function SkillsList() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const key = ["skills", id];

  const q = useQuery({ queryKey: key, queryFn: () => listSkills(id) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const activateM = useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) =>
      setSkillActive(id, name, active),
    onMutate: async ({ name, active }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ skills: SkillSummary[] }>(key);
      qc.setQueryData<{ skills: SkillSummary[] }>(key, (old) =>
        old ? { skills: old.skills.map((s) => (s.name === name ? { ...s, active } : s)) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });

  const visibleM = useMutation({
    mutationFn: ({ name, visible }: { name: string; visible: boolean }) =>
      setSkillVisible(id, name, visible),
    onMutate: async ({ name, visible }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ skills: SkillSummary[] }>(key);
      qc.setQueryData<{ skills: SkillSummary[] }>(key, (old) =>
        old ? { skills: old.skills.map((s) => (s.name === name ? { ...s, visible } : s)) } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: refresh,
  });

  const deleteM = useMutation({
    mutationFn: (name: string) => deleteSkill(id, name),
    onSuccess: refresh,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const skillPendingDelete = q.data?.skills.find((s) => s.name === confirmDelete);
  const deleteDisplay = skillPendingDelete
    ? getSkillDisplay(skillPendingDelete)
    : confirmDelete
      ? getSkillDisplay({ name: confirmDelete })
      : null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        to={`/tenants/${id}`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to tenant
      </Link>

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Skills</h1>
          <p className="text-xs text-zinc-500">
            Edit SKILL.md files, toggle activation in the agent template, and choose what is visible.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New skill
        </Button>
      </header>

      {q.isError && <div className="text-sm text-red-300">Failed to load skills.</div>}

      {q.isLoading && (
        <Card>
          <CardContent className="px-0 py-0">
            <table className="w-full">
              <tbody className="divide-y divide-zinc-800/60">
                <SkeletonRow cols={4} />
                <SkeletonRow cols={4} />
                <SkeletonRow cols={4} />
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {q.data && q.data.skills.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-500">
            No skills yet. Create one to expose a capability to the agent.
          </CardContent>
        </Card>
      )}

      {q.data && q.data.skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {q.data.skills.length} skill{q.data.skills.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-950/50 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Skill</th>
                  <th className="px-4 py-2 font-medium">Active in agent</th>
                  <th className="px-4 py-2 font-medium">Visible</th>
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {q.data.skills.map((s) => {
                  const display = getSkillDisplay(s);
                  return (
                    <tr key={s.name} className="hover:bg-zinc-900/40">
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {s.emoji && <span>{s.emoji}</span>}
                          <Link
                            to={`/tenants/${id}/skills/${s.name}`}
                            className="font-medium text-zinc-100 hover:text-brand-500"
                          >
                            {display.name}
                          </Link>
                          <code className="rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-500">
                            {s.name}
                          </code>
                        </div>
                        {display.description && (
                          <div className="mt-0.5 text-xs text-zinc-500">{display.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Toggle
                          checked={s.active}
                          onChange={(next) => activateM.mutate({ name: s.name, active: next })}
                          label={`Ativar ${display.name}`}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Toggle
                          checked={s.visible}
                          onChange={(next) => visibleM.mutate({ name: s.name, visible: next })}
                          disabled={!s.active}
                          label={`Mostrar ${display.name}`}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Link to={`/tenants/${id}/skills/${s.name}`}>
                            <Button variant="ghost" size="icon" aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => setConfirmDelete(s.name)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="mt-3 text-[11px] text-zinc-600">
        “Active” adds the skill to <code>AGENT.md</code>. “Visible” only takes effect when the skill is
        active and controls whether it shows up in the user-facing listing.
      </p>

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tenantId={id}
        onCreated={refresh}
      />

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete skill?"
        size="sm"
      >
        <p className="text-sm text-zinc-300">
          Permanently delete {deleteDisplay?.name ?? "this skill"}{" "}
          {confirmDelete && <code>{confirmDelete}</code>}? This removes the folder from the workspace
          and drops it from <code>AGENT.md</code>.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirmDelete) {
                deleteM.mutate(confirmDelete);
                setConfirmDelete(null);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  tenantId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => createSkill(tenantId, name.trim(), desc.trim()),
    onSuccess: () => {
      setName("");
      setDesc("");
      setErr(null);
      onCreated();
      onClose();
    },
    onError: (e: { error?: string }) => setErr(e?.error ?? "Failed to create skill"),
  });

  return (
    <Dialog open={open} onClose={onClose} title="New skill">
      <div className="space-y-3">
        <div>
          <Label htmlFor="skill-name">Name</Label>
          <Input
            id="skill-name"
            placeholder="my-skill (lowercase-kebab)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="skill-desc">Description</Label>
          <Input
            id="skill-desc"
            placeholder="One short sentence."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        {err && <div className="rounded bg-red-950/40 px-3 py-2 text-xs text-red-300">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>
            {m.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
