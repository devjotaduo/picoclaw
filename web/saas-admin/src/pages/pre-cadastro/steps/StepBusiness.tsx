import { ChipGroup } from "../components/ChipGroup";
import { TextAreaField } from "../components/Field";
import { businessModels, businessSegments } from "../constants";
import { toStringArray } from "../helpers";

type StepBusinessProps = {
  answers: Record<string, unknown>;
  onToggle: (key: string, value: string) => void;
  onAnswerChange: (key: string, value: unknown) => void;
};

export function StepBusiness({ answers, onToggle, onAnswerChange }: StepBusinessProps) {
  const segments = toStringArray(answers.segments);
  const models = toStringArray(answers.business_models);
  const offer = String(answers.offer ?? "");

  return (
    <div className="space-y-6">
      <ChipGroup
        label="Segmento"
        description="Selecione todos que se aplicam."
        values={businessSegments}
        selected={segments}
        onToggle={(value) => onToggle("segments", value)}
      />
      <ChipGroup
        label="Modelo de negócio"
        description="Como vocês vendem hoje."
        values={businessModels}
        selected={models}
        onToggle={(value) => onToggle("business_models", value)}
      />
      <TextAreaField
        label="Oferta principal"
        hint="Uma frase é suficiente. A Clara complementa depois."
        value={offer}
        onChange={(event) => onAnswerChange("offer", event.target.value)}
        placeholder="Ex.: vendemos móveis planejados para apartamentos pequenos, com visita técnica e projeto sob medida."
      />
    </div>
  );
}
