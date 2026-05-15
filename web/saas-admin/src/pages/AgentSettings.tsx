import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, RotateCw, FileText, Sparkles } from "lucide-react";
import { getAgentInfo, saveAgentInfo, listSkills, type AgentInfo } from "@/api/skills";
import { restartTenant } from "@/api/tenants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";

// Models picoclaw understands out of the box (matches deploy/litellm/config.yaml).
// Free-text is still allowed via the input below.
const MODEL_PRESETS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "gemini-2.0-flash",
  "llama-3.3-70b",
  "deepseek-chat",
  "auto",
];

const EMPTY: AgentInfo = { name: "", description: "" };

export function AgentSettings() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["agent-info", id],
    queryFn: () => getAgentInfo(id),
  });
  const skillsQ = useQuery({
    queryKey: ["skills", id],
    queryFn: () => listSkills(id),
  });

  const [form, setForm] = useState<AgentInfo>(EMPTY);
  const [dirty, setDirty] = useState(false);

  // Only push server state into the form when the user hasn't started editing.
  useEffect(() => {
    if (q.data && !dirty) {
      setForm({
        name: q.data.name ?? "",
        description: q.data.description ?? "",
        model: q.data.model,
        max_turns: q.data.max_turns,
        tools: q.data.tools,
        skills: q.data.skills,
        mcp_servers: q.data.mcp_servers,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveAgentInfo(id, form),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["agent-info", id] });
      qc.invalidateQueries({ queryKey: ["agent", id] });
      qc.invalidateQueries({ queryKey: ["skills", id] });
    },
  });

  const restartM = useMutation({
    mutationFn: () => restartTenant(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant", id] }),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (q.isError) return <div className="p-6 text-sm text-red-300">Failed to load agent settings.</div>;

  const update = <K extends keyof AgentInfo>(key: K, value: AgentInfo[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const handleBack = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    nav(`/tenants/${id}`);
  };

  const activeSkills = new Set(form.skills ?? []);
  const allSkills = skillsQ.data?.skills ?? [];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <button
        onClick={handleBack}
        className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200"
      >
        <ArrowLeft className="h-3 w-3" /> Back to tenant
      </button>

      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Agent settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Structured editor for the fields saved in <code>AGENT.md</code>. The body of the prompt
            (after the frontmatter) is preserved.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/tenants/${id}/agent`}>
            <Button variant="ghost" size="sm" title="Edit raw markdown template">
              <FileText className="h-4 w-4" /> Raw
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (dirty && !confirm("You have unsaved changes. Restart anyway?")) return;
              if (!confirm("Restart the tenant container? The agent will be briefly offline (~5s).")) return;
              restartM.mutate();
            }}
            disabled={restartM.isPending}
          >
            <RotateCw className={restartM.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {restartM.isPending ? "Restarting…" : "Restart"}
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}>
            <Save className="h-4 w-4" />
            {saveM.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </header>

      {saveM.isError && (
        <div className="mb-3 rounded bg-red-950/40 px-3 py-2 text-xs text-red-300">
          Save failed: {(saveM.error as { error?: string })?.error ?? "unknown error"}
        </div>
      )}
      {restartM.isSuccess && !restartM.isPending && (
        <div className="mb-3 rounded bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">
          Restart requested.
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="pico"
            />
          </div>
          <div>
            <Label htmlFor="agent-desc">Description</Label>
            <textarea
              id="agent-desc"
              className="flex min-h-[80px] w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-brand-500"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="One or two sentences describing the agent and its goal."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="agent-model">Model name</Label>
            <Input
              id="agent-model"
              list="model-presets"
              value={form.model ?? ""}
              onChange={(e) => update("model", e.target.value || undefined)}
              placeholder="leave blank to use the workspace default"
            />
            <datalist id="model-presets">
              {MODEL_PRESETS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-zinc-600">
              Must match a <code>model_name</code> in <code>litellm/config.yaml</code>.
            </p>
          </div>
          <div>
            <Label htmlFor="agent-maxturns">Max tool iterations</Label>
            <Input
              id="agent-maxturns"
              type="number"
              min={1}
              max={200}
              value={form.max_turns ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                update("max_turns", v === "" ? undefined : Number.parseInt(v, 10));
              }}
              placeholder="leave blank for the default"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Skills enabled in this agent</span>
            <Link to={`/tenants/${id}/skills`} className="text-xs font-normal text-zinc-500 hover:text-zinc-200">
              Manage all skills →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allSkills.length === 0 ? (
            <div className="text-sm text-zinc-500">
              No skills in this workspace yet. Create one in the Skills page.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {allSkills.map((s) => {
                const isOn = activeSkills.has(s.name);
                return (
                  <li key={s.name} className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      {s.emoji && <span>{s.emoji}</span>}
                      <span className="truncate font-mono text-sm">{s.name}</span>
                      {s.description && (
                        <span className="truncate text-xs text-zinc-500">— {s.description}</span>
                      )}
                    </div>
                    <Toggle
                      checked={isOn}
                      onChange={(next) => {
                        const set = new Set(activeSkills);
                        if (next) set.add(s.name);
                        else set.delete(s.name);
                        update("skills", Array.from(set).sort());
                      }}
                      label={`Toggle ${s.name}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-zinc-600">
        <Sparkles className="mr-1 inline h-3 w-3" />
        Saving updates only the frontmatter — any custom keys and the body of <code>AGENT.md</code>{" "}
        are preserved. After saving, click <strong>Restart</strong> to make picoclaw reload the
        template.
      </p>
    </div>
  );
}
