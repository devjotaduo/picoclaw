import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCw } from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import { getAgent, saveAgent } from "@/api/skills";
import { restartTenant } from "@/api/tenants";
import { Button } from "@/components/ui/button";

const DEFAULT_TEMPLATE = `---
name: pico
description: >
  Olá! Sou Pico, assistente da Sua Empresa. Como posso ajudar hoje?
---

You are Pico, a customer service assistant for Sua Empresa.

## Role

Olá! Sou Pico, assistente da Sua Empresa. Como posso ajudar hoje?

## Mission / Capabilities

Descreva aqui o que este agente deve fazer, seu tom de voz, objetivos e limitações.
`;

export function AgentEdit() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["agent", id],
    queryFn: () => getAgent(id),
  });

  const [content, setContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  // Push server state into the editor only when the user has no unsaved edits.
  // After save we explicitly reset dirty=false, so the next refetch flows in;
  // mid-edit refetches (e.g. window focus) won't clobber the draft.
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
    },
  });

  const restartM = useMutation({
    mutationFn: () => restartTenant(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", id] }),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (q.isError || !q.data)
    return <div className="p-6 text-sm text-red-300">Failed to load agent template.</div>;

  const handleBack = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    nav(`/tenants/${id}`);
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
            onClick={() => {
              if (dirty && !confirm("You have unsaved changes. Restart anyway?")) return;
              if (!confirm("Restart the tenant container? The agent will be briefly offline (~5s).")) return;
              restartM.mutate();
            }}
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

      {restartM.isError && (
        <div className="mb-3 rounded bg-red-950/40 px-3 py-2 text-xs text-red-300">
          Restart failed: {(restartM.error as { error?: string })?.error ?? "unknown error"}
        </div>
      )}
      {restartM.isSuccess && !restartM.isPending && (
        <div className="mb-3 rounded bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
          Restart requested — the agent should be back online shortly.
        </div>
      )}

      {saveM.isError && (
        <div className="mb-3 rounded bg-red-950/40 px-3 py-2 text-xs text-red-300">
          Save failed: {(saveM.error as { error?: string })?.error ?? "unknown error"}
        </div>
      )}

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
    </div>
  );
}
