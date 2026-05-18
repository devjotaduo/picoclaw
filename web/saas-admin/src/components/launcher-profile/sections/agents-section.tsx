import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Field, SwitchCardField } from "@/components/shared-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { SectionCard } from "@/components/launcher-profile/section-card";
import type { AgentForm } from "@/lib/launcher-profile-form";

interface AgentsSectionProps {
  agents: AgentForm[];
  onChange: (next: AgentForm[]) => void;
}

function newAgent(index: number): AgentForm {
  return {
    id: `agent-${Date.now()}-${index}`,
    name: "Novo agente",
    model: "openrouter-sonnet-4.5",
    default: false,
    avatar: {
      type: "preset",
      icon: "headset",
      initials: "NA",
      background: "#2563eb",
      foreground: "#ffffff",
    },
    roleKind: "attendant",
    description: "",
    skills: [],
    workspace: "",
    subagentsAllow: [],
    extrasJSON: "{}",
  };
}

export function AgentsSection({ agents, onChange }: AgentsSectionProps) {
  const [openId, setOpenId] = useState<string | null>(agents[0]?.id ?? null);

  const updateAt = (id: string, patch: Partial<AgentForm>) =>
    onChange(agents.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const remove = (id: string) => {
    const next = agents.filter((a) => a.id !== id);
    onChange(next);
    if (openId === id) setOpenId(next[0]?.id ?? null);
  };

  const add = () => {
    const a = newAgent(agents.length);
    onChange([...agents, a]);
    setOpenId(a.id);
  };

  return (
    <SectionCard
      title="Agentes"
      description="Quem o tenant terá. Use vários agentes para vendas, marketing, suporte, etc."
    >
      <div className="space-y-3 py-4">
        {agents.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum agente configurado. Clique abaixo para adicionar.</p>
        )}
        {agents.map((agent) => {
          const isOpen = openId === agent.id;
          return (
            <Card key={agent.id} className="overflow-hidden">
              <div
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
                onClick={() => setOpenId(isOpen ? null : agent.id)}
              >
                <div
                  className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
                  style={{ background: agent.avatar.background, color: agent.avatar.foreground }}
                  title={agent.avatar.icon}
                >
                  {agent.avatar.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-100">{agent.name}</span>
                    {agent.default && (
                      <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        padrão
                      </span>
                    )}
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {agent.roleKind}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500">{agent.id} · {agent.model}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(agent.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {isOpen && (
                <CardContent className="border-t border-zinc-800">
                  <Field
                    label="ID interno"
                    hint="Identificador estável. Não use espaços. Roteamento e workspaces dependem disso."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.id}
                      onChange={(e) => updateAt(agent.id, { id: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Nome exibido"
                    hint="Aparece na lista de agentes para o usuário final."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.name}
                      onChange={(e) => updateAt(agent.id, { name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Modelo"
                    hint="Chave de model_list ou alias do LiteLLM (ex.: 'default', 'openrouter-sonnet-4.5')."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.model}
                      onChange={(e) => updateAt(agent.id, { model: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Tipo (kind)"
                    hint="attendant, sales, marketing, assistant, ou um custom. Define quais campos extras o agente espera."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.roleKind}
                      onChange={(e) => updateAt(agent.id, { roleKind: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Descrição funcional"
                    hint="Uma frase descrevendo o que esse agente faz. Aparece na UI quando o usuário escolhe entre agentes."
                    layout="setting-row"
                  >
                    <Textarea
                      rows={2}
                      value={agent.description}
                      onChange={(e) => updateAt(agent.id, { description: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Skills (uma por linha)"
                    hint="IDs de skills disponíveis. Devem existir no seed para serem aplicadas."
                    layout="setting-row"
                  >
                    <Textarea
                      rows={4}
                      value={agent.skills.join("\n")}
                      onChange={(e) =>
                        updateAt(agent.id, {
                          skills: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                      className="font-mono text-xs"
                    />
                  </Field>
                  <Field
                    label="Workspace dedicado"
                    hint="Caminho absoluto. Vazio = compartilha o workspace padrão. Use 'workspace-<id>' para isolar."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.workspace}
                      onChange={(e) => updateAt(agent.id, { workspace: e.target.value })}
                    />
                  </Field>
                  <SwitchCardField
                    label="Agente padrão"
                    hint="Marca este como o agente recebedor inicial de mensagens. Apenas um deveria ser padrão."
                    checked={agent.default}
                    onCheckedChange={(v) => updateAt(agent.id, { default: v })}
                  />
                  <Field
                    label="Avatar — iniciais"
                    hint="Até 2 letras exibidas dentro do círculo do avatar."
                    layout="setting-row"
                  >
                    <Input
                      value={agent.avatar.initials}
                      maxLength={2}
                      onChange={(e) =>
                        updateAt(agent.id, {
                          avatar: { ...agent.avatar, initials: e.target.value.toUpperCase() },
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Avatar — cor de fundo"
                    hint="Cor em hex (#RRGGBB) do círculo do avatar."
                    layout="setting-row"
                  >
                    <Input
                      type="color"
                      value={agent.avatar.background}
                      onChange={(e) =>
                        updateAt(agent.id, {
                          avatar: { ...agent.avatar, background: e.target.value },
                        })
                      }
                    />
                  </Field>
                </CardContent>
              )}
            </Card>
          );
        })}
        <Button variant="outline" onClick={add}>
          <Plus className="size-4" /> Adicionar agente
        </Button>
      </div>
    </SectionCard>
  );
}
