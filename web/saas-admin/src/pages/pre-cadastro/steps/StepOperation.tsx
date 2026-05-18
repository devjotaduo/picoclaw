import { ChipGroup } from "../components/ChipGroup";
import { TextAreaField } from "../components/Field";
import { channels, pains, systems } from "../constants";
import { toStringArray } from "../helpers";

type StepOperationProps = {
  answers: Record<string, unknown>;
  onToggle: (key: string, value: string) => void;
  onAnswerChange: (key: string, value: unknown) => void;
};

export function StepOperation({ answers, onToggle, onAnswerChange }: StepOperationProps) {
  const selectedChannels = toStringArray(answers.channels);
  const selectedSystems = toStringArray(answers.systems);
  const selectedPains = toStringArray(answers.pains);

  return (
    <div className="space-y-6">
      <ChipGroup
        label="Canais que recebem clientes hoje"
        description="Pode marcar mais de um."
        values={channels}
        selected={selectedChannels}
        onToggle={(value) => onToggle("channels", value)}
      />

      <ChipGroup
        label="Onde ficam clientes, pedidos ou agenda"
        description="Não precisamos de senha, host ou dado técnico."
        values={systems}
        selected={selectedSystems}
        onToggle={(value) => onToggle("systems", value)}
      />

      {selectedSystems.length > 0 && !selectedSystems.includes("nenhum") && (
        <TextAreaField
          label="Detalhe rápido sobre os sistemas"
          optional
          hint="Diga só o nome e para que serve. Nada de credenciais."
          value={String(answers.system_notes ?? "")}
          onChange={(event) => onAnswerChange("system_notes", event.target.value)}
          placeholder="Ex.: usamos uma planilha do Google para acompanhar pedidos e o Sympla para agenda."
        />
      )}

      <ChipGroup
        label="Quais gargalos mais atrapalham?"
        description="Selecione tudo que dói."
        values={pains}
        selected={selectedPains}
        onToggle={(value) => onToggle("pains", value)}
      />
    </div>
  );
}
