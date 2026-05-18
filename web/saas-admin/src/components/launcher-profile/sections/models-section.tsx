import { Plus, Trash2 } from "lucide-react";

import { Field, SwitchCardField } from "@/components/shared-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { SectionCard } from "@/components/launcher-profile/section-card";
import type { ModelForm } from "@/lib/launcher-profile-form";

interface ModelsSectionProps {
  models: ModelForm[];
  onChange: (next: ModelForm[]) => void;
}

export function ModelsSection({ models, onChange }: ModelsSectionProps) {
  const updateAt = (id: string, patch: Partial<ModelForm>) =>
    onChange(models.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => onChange(models.filter((m) => m.id !== id));
  const add = () =>
    onChange([
      ...models,
      {
        id: `model-${Date.now()}`,
        provider: "openai",
        modelName: "novo-modelo",
        model: "gpt-4o-mini",
        apiBase: "https://api.openai.com/v1",
        enabled: true,
        extrasJSON: "{}",
      },
    ]);

  return (
    <SectionCard
      title="Modelos disponíveis"
      description="model_list: provedores LLM acessíveis pelos agentes deste perfil."
    >
      <div className="space-y-3 py-4">
        {models.length === 0 && (
          <p className="text-sm text-zinc-500">Nenhum modelo configurado.</p>
        )}
        {models.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto_auto] items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
          >
            <Input
              value={m.modelName}
              placeholder="alias (model_name)"
              onChange={(e) => updateAt(m.id, { modelName: e.target.value })}
            />
            <Input
              value={m.provider}
              placeholder="provider"
              onChange={(e) => updateAt(m.id, { provider: e.target.value })}
            />
            <Input
              value={m.apiBase}
              placeholder="api_base"
              onChange={(e) => updateAt(m.id, { apiBase: e.target.value })}
            />
            <label className="flex items-center gap-1 text-[11px] text-zinc-500">
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => updateAt(m.id, { enabled: e.target.checked })}
                className="size-4 accent-emerald-500"
              />
              ativo
            </label>
            <Button variant="ghost" size="sm" onClick={() => remove(m.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={add}>
          <Plus className="size-4" /> Adicionar modelo
        </Button>
      </div>
    </SectionCard>
  );
}
