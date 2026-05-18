import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const officialAgentOrder = ["main", "vendas", "marketing", "assistente"] as const;
const officialAgentNames: Record<string, string> = {
  main: "Ana — atendente",
  vendas: "Leo — vendas",
  marketing: "Maya — marketing",
  assistente: "Sofia — assistente",
};

type AgentEntry = {
  id: string;
  name?: string;
  skills?: unknown;
  [key: string]: unknown;
};

type ConfigShape = {
  agents?: {
    list?: AgentEntry[];
  };
} & Record<string, unknown>;

export function AgentSkillsEditor({
  configText,
  onConfigChange,
}: {
  configText: string;
  onConfigChange: (next: string) => void;
}) {
  const parsed = useMemo(() => parseConfig(configText), [configText]);
  const allKnownSkills = useMemo(() => collectKnownSkills(parsed.value), [parsed.value]);

  if (parsed.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Skills por agente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-300">
            Corrija o config.json antes de editar skills aqui: {parsed.error}
          </p>
        </CardContent>
      </Card>
    );
  }

  const agentList = parsed.value?.agents?.list ?? [];
  const orderedAgents = orderAgentsForDisplay(agentList);

  const updateAgentSkills = (agentId: string, nextSkills: string[]) => {
    const next = cloneConfig(parsed.value ?? {});
    if (!next.agents) next.agents = {};
    if (!Array.isArray(next.agents.list)) next.agents.list = [];
    const list = next.agents.list as AgentEntry[];
    const idx = list.findIndex((a) => a.id === agentId);
    if (idx === -1) return;
    list[idx] = { ...list[idx], skills: nextSkills };
    onConfigChange(JSON.stringify(next, null, 2));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills por agente</CardTitle>
        <p className="mt-1 text-xs text-zinc-500">
          Escolha as skills que cada agente default usa. Edite essas skills
          antes de mexer no config.json bruto — esse painel apenas reflete e
          atualiza <code>agents.list[*].skills</code>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {orderedAgents.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Nenhum agente em agents.list. Salve o profile para que o backend
            normalize os 4 agentes default.
          </p>
        ) : (
          orderedAgents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              suggestions={allKnownSkills}
              onChange={(next) => updateAgentSkills(agent.id, next)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AgentRow({
  agent,
  suggestions,
  onChange,
}: {
  agent: AgentEntry;
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const current = normalizeSkills(agent.skills);
  const [draft, setDraft] = useState("");
  const headerLabel = officialAgentNames[agent.id] ?? agent.id;
  const personaName = typeof agent.name === "string" ? agent.name : "";
  const availableSuggestions = suggestions.filter((s) => !current.includes(s));

  const addSkill = (raw: string) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    if (current.includes(name)) return;
    onChange([...current, name]);
    setDraft("");
  };

  const removeSkill = (name: string) => {
    onChange(current.filter((s) => s !== name));
  };

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-zinc-200">{headerLabel}</div>
          {personaName && personaName !== "" ? (
            <div className="text-[11px] text-zinc-500">
              {personaName} · id <code className="text-zinc-600">{agent.id}</code>
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500">
              id <code className="text-zinc-600">{agent.id}</code>
            </div>
          )}
        </div>
        <div className="text-[11px] text-zinc-500">
          {current.length} {current.length === 1 ? "skill" : "skills"}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {current.length === 0 ? (
          <span className="text-[11px] text-zinc-600">Sem skills ativas.</span>
        ) : (
          current.map((skill) => (
            <span
              key={skill}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-200"
            >
              {skill}
              <button
                type="button"
                onClick={() => removeSkill(skill)}
                className="rounded-full p-0.5 text-zinc-500 hover:bg-red-950/40 hover:text-red-300"
                aria-label={`Remover ${skill}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addSkill(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="nome-da-skill"
          className="h-8 w-56 font-mono text-xs"
          list={`skills-${agent.id}`}
        />
        {availableSuggestions.length > 0 ? (
          <datalist id={`skills-${agent.id}`}>
            {availableSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
        <Button type="submit" variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </form>
    </div>
  );
}

function parseConfig(text: string): { value: ConfigShape | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { value: {}, error: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: null, error: "config.json precisa ser um objeto JSON" };
    }
    return { value: parsed as ConfigShape, error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function cloneConfig(input: ConfigShape): ConfigShape {
  return JSON.parse(JSON.stringify(input)) as ConfigShape;
}

function normalizeSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function collectKnownSkills(config: ConfigShape | null): string[] {
  const list = config?.agents?.list;
  if (!Array.isArray(list)) return [];
  const acc = new Set<string>();
  for (const agent of list) {
    for (const s of normalizeSkills((agent as AgentEntry).skills)) {
      acc.add(s);
    }
  }
  return Array.from(acc).sort();
}

function orderAgentsForDisplay(list: AgentEntry[]): AgentEntry[] {
  const byId = new Map<string, AgentEntry>();
  const extras: AgentEntry[] = [];
  for (const agent of list) {
    if (!agent || typeof agent.id !== "string") continue;
    const id = agent.id;
    if (officialAgentOrder.includes(id as (typeof officialAgentOrder)[number])) {
      if (!byId.has(id)) byId.set(id, agent);
    } else {
      extras.push(agent);
    }
  }
  const ordered: AgentEntry[] = [];
  for (const id of officialAgentOrder) {
    const a = byId.get(id);
    if (a) ordered.push(a);
  }
  return [...ordered, ...extras];
}
