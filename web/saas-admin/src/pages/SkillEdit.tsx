import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import {
  getSkill,
  saveSkill,
  setSkillActive,
  setSkillVisible,
} from "@/api/skills";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

export function SkillEdit() {
  const { id = "", name = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["skill", id, name],
    queryFn: () => getSkill(id, name),
  });

  const [content, setContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) {
      setContent(q.data.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveSkill(id, name, content),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["skill", id, name] });
      qc.invalidateQueries({ queryKey: ["skills", id] });
      toast({ type: "success", message: "Skill saved." });
    },
    onError: (e: { error?: string }) => {
      toast({ type: "error", message: `Save failed: ${e?.error ?? "unknown error"}` });
    },
  });

  const activeM = useMutation({
    mutationFn: (active: boolean) => setSkillActive(id, name, active),
    onSuccess: (_, active) => {
      qc.invalidateQueries({ queryKey: ["skill", id, name] });
      qc.invalidateQueries({ queryKey: ["skills", id] });
      toast({ type: "info", message: active ? "Skill activated in agent." : "Skill deactivated." });
    },
  });

  const visibleM = useMutation({
    mutationFn: (visible: boolean) => setSkillVisible(id, name, visible),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill", id, name] });
      qc.invalidateQueries({ queryKey: ["skills", id] });
    },
  });

  if (q.isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (q.isError || !q.data) return <div className="p-6 text-sm text-red-300">Failed to load skill.</div>;

  const handleBack = () => {
    if (dirty) { setConfirmDiscard(true); return; }
    nav(`/tenants/${id}/skills`);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button
        onClick={handleBack}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to skills
      </button>

      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">
            {q.data.emoji && <span className="mr-2">{q.data.emoji}</span>}
            <code className="font-mono text-zinc-100">{name}</code>
          </h1>
          {q.data.description && (
            <p className="mt-1 truncate text-sm text-zinc-400">{q.data.description}</p>
          )}
        </div>
        <Button onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}>
          <Save className="h-4 w-4" />
          {saveM.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
        </Button>
      </header>

      <div className="mb-4 flex items-center gap-6 rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Toggle
            checked={q.data.active}
            onChange={(next) => activeM.mutate(next)}
            label="Active in agent"
          />
          <span className="text-zinc-300">Active in agent</span>
          <span className="text-xs text-zinc-500">(adds to AGENT.md)</span>
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            checked={q.data.visible}
            onChange={(next) => visibleM.mutate(next)}
            disabled={!q.data.active}
            label="Visible"
          />
          <span className={q.data.active ? "text-zinc-300" : "text-zinc-500"}>Visible</span>
          <span className="text-xs text-zinc-500">(shown in user-facing listing)</span>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950" data-color-mode="dark">
        <MDEditor
          value={content}
          onChange={(v) => {
            setContent(v ?? "");
            setDirty(true);
          }}
          height={620}
          preview="live"
          visibleDragbar={false}
        />
      </div>

      <p className="mt-3 text-[11px] text-zinc-600">
        The file is saved verbatim, frontmatter included. The activation and visibility toggles edit
        AGENT.md and the SKILL.md <code>metadata.visible</code> flag respectively.
      </p>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard changes?" size="sm">
        <p className="text-sm text-zinc-300">You have unsaved changes. Leave without saving?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button variant="danger" onClick={() => { setConfirmDiscard(false); nav(`/tenants/${id}/skills`); }}>
            Discard
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
