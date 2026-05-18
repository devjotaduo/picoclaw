import { SwitchCardField } from "@/components/shared-form";

import { SectionCard } from "@/components/launcher-profile/section-card";
import type { DisplayForm } from "@/lib/launcher-profile-form";

interface DisplaySectionProps {
  value: DisplayForm;
  onChange: (next: DisplayForm) => void;
}

export function DisplaySection({ value, onChange }: DisplaySectionProps) {
  const update = <K extends keyof DisplayForm>(key: K, v: DisplayForm[K]) =>
    onChange({ ...value, [key]: v });
  return (
    <SectionCard
      title="Display do launcher"
      description="O que aparece para o usuário final dentro do dashboard do launcher."
    >
      <SwitchCardField
        label="Mostrar seletor de modelo"
        hint="Permite ao usuário trocar o modelo LLM diretamente na barra do chat."
        checked={value.showModelSelector}
        onCheckedChange={(v) => update("showModelSelector", v)}
      />
      <SwitchCardField
        label="Mostrar raciocínio"
        hint="Exibe o chain-of-thought do modelo (útil para depuração; pode confundir usuários comuns)."
        checked={value.showReasoning}
        onCheckedChange={(v) => update("showReasoning", v)}
      />
      <SwitchCardField
        label="Mostrar chamadas de ferramenta"
        hint="Lista cada tool call do agente (read_file, web_fetch, etc.) na thread do chat."
        checked={value.showToolCalls}
        onCheckedChange={(v) => update("showToolCalls", v)}
      />
    </SectionCard>
  );
}
