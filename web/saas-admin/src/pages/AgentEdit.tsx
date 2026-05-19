import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCw } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { getAgent, saveAgent } from "@/api/skills";
import { restartTenant } from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

const DEFAULT_TEMPLATE = `---
name: Ana
description: >
  Olá! Ana, assistente da Sua Empresa. Como posso ajudar hoje?
---

You are, a customer service assistant for Sua Empresa.

## Role

Olá! Sou Ana, assistente da Sua Empresa. Como posso ajudar hoje?

## Mission / Capabilities

Descreva aqui o que este agente deve fazer, seu tom de voz, objetivos e limitações.
`;

export function AgentEdit() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const q = useQuery({
    queryKey: ["agent", id],
    queryFn: () => getAgent(id),
  });

  const [content, setContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  useEffect(() => {
    if (q.data && !dirty) {
      setContent(q.data.exists ? q.data.content : DEFAULT_TEMPLATE);
      setDirty(!q.data.exists);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveAgent(id, content),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["agent", id] });
      qc.invalidateQueries({ queryKey: ["skills", id] });
      toast({ type: "success", message: "Agent template saved." });
    },
    onError: (e: { error?: string }) => {
      toast({ type: "error", message: `Save failed: ${e?.error ?? "unknown error"}` });
    },
  });

  const restartM = useMutation({
    mutationFn: () => restartTenant(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant", id] });
      toast({ type: "success", message: "Restart requested — the agent will be back online shortly." });
    },
    onError: (e: { error?: string }) => {
      toast({ type: "error", message: `Restart failed: ${e?.error ?? "unknown error"}` });
    },
  });

  if (q.isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (q.isError || !q.data)
    return <div className="p-6 text-sm text-red-300">Failed to load agent template.</div>;

  const handleBack = () => {
    if (dirty) { setConfirmDiscard(true); return; }
    nav(`/tenants/${id}`);
  };

  const handleRestartClick = () => {
    setConfirmRestart(true);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <button
        onClick={handleBack}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to tenant
      </button>

      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Agent template</h1>
          <p className="mt-1 text-sm text-zinc-500">
            <code>{q.data.source}</code>
            {!q.data.exists && (
              <span className="ml-2 rounded bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-300">
                not yet on disk — will be created on save
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRestartClick}
            disabled={restartM.isPending}
            title="Restart the tenant container so picoclaw reloads AGENT.md and skills"
          >
            <RotateCw className={restartM.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {restartM.isPending ? "Restarting…" : "Restart agent"}
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}>
            <Save className="h-4 w-4" />
            {saveM.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </header>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950" data-color-mode="dark">
        <MDEditor
          value={content}
          onChange={(v) => {
            setContent(v ?? "");
            setDirty(true);
          }}
          height={680}
          preview="live"
          visibleDragbar={false}
        />
      </div>

      <p className="mt-3 text-[11px] text-zinc-600">
        The frontmatter at the top (between <code>---</code>) is YAML and is validated on save. The
        body is the agent's system prompt. Skills enabled in the <code>skills:</code> array become
        available to the agent.
      </p>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard changes?" size="sm">
        <p className="text-sm text-zinc-300">You have unsaved changes. Leave without saving?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button variant="danger" onClick={() => { setConfirmDiscard(false); nav(`/tenants/${id}`); }}>
            Discard
          </Button>
        </div>
      </Dialog>

      <Dialog open={confirmRestart} onClose={() => setConfirmRestart(false)} title="Restart agent?" size="sm">
        <p className="text-sm text-zinc-300">
          The tenant container will be restarted. The agent will be briefly offline (~5s).
          {dirty && <span className="mt-1 block text-amber-300">You have unsaved changes that won't be applied.</span>}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmRestart(false)}>Cancel</Button>
          <Button onClick={() => { setConfirmRestart(false); restartM.mutate(); }} disabled={restartM.isPending}>
            Restart
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
