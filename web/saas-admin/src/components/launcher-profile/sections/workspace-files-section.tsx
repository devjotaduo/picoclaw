import { Field } from "@/components/shared-form";
import { Textarea } from "@/components/ui/textarea";

import { SectionCard } from "@/components/launcher-profile/section-card";

interface WorkspaceFilesSectionProps {
  agentMD: string;
  soulMD: string;
  onAgentMDChange: (value: string) => void;
  onSoulMDChange: (value: string) => void;
}

function lineCount(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

export function WorkspaceFilesSection({
  agentMD,
  soulMD,
  onAgentMDChange,
  onSoulMDChange,
}: WorkspaceFilesSectionProps) {
  return (
    <SectionCard
      title="Arquivos do workspace"
      description="Prompt principal e identidade do agente. Aplicados a todo novo tenant."
    >
      <Field
        label="AGENT.md"
        hint="Prompt principal + frontmatter (model, skills, allowlists). É o que o agente lê a cada turno."
        layout="default"
      >
        <Textarea
          rows={12}
          value={agentMD}
          onChange={(e) => onAgentMDChange(e.target.value)}
          className="font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-zinc-500">{lineCount(agentMD)} linhas · {agentMD.length} caracteres</p>
      </Field>
      <Field
        label="SOUL.md"
        hint="Identidade, personalidade, tom de voz, valores. Costuma ser estável entre versões do prompt."
        layout="default"
      >
        <Textarea
          rows={10}
          value={soulMD}
          onChange={(e) => onSoulMDChange(e.target.value)}
          className="font-mono text-xs"
        />
        <p className="mt-1 text-[11px] text-zinc-500">{lineCount(soulMD)} linhas · {soulMD.length} caracteres</p>
      </Field>
    </SectionCard>
  );
}
