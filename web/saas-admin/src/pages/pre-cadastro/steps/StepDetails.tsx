import { useMemo } from "react";
import { AudioBlock } from "../components/AudioBlock";
import { ChipGroup } from "../components/ChipGroup";
import { TextAreaField } from "../components/Field";
import { UploadDropzone } from "../components/UploadDropzone";
import { budgetFactors, materials, productSegments, rules } from "../constants";
import { toStringArray } from "../helpers";
import type { CompanyIntake } from "@/api/company-intakes";

type StepDetailsProps = {
  answers: Record<string, unknown>;
  onToggle: (key: string, value: string) => void;
  onAnswerChange: (key: string, value: unknown) => void;
  uploadKind: string;
  setUploadKind: (value: string) => void;
  onUpload: (file: File | null) => void;
  attachments: CompanyIntake["attachments"];
  busy: boolean;
  transcript: string;
  setTranscript: (value: string) => void;
  onSpeech: () => void;
  listening: boolean;
};

export function StepDetails(props: StepDetailsProps) {
  const {
    answers,
    onToggle,
    onAnswerChange,
    uploadKind,
    setUploadKind,
    onUpload,
    attachments,
    busy,
    transcript,
    setTranscript,
    onSpeech,
    listening,
  } = props;

  const selectedMaterials = toStringArray(answers.materials);
  const selectedSegments = toStringArray(answers.segments);
  const selectedBudgetFactors = toStringArray(answers.budget_factors);
  const selectedRules = toStringArray(answers.rules);

  const wantsUpload = useMemo(() => {
    const hasProductSegment = selectedSegments.some((segment) => productSegments.has(segment));
    const hasRealMaterial = selectedMaterials.some(
      (material) => material && material !== "não tenho material ainda",
    );
    return hasProductSegment || hasRealMaterial;
  }, [selectedSegments, selectedMaterials]);

  return (
    <div className="space-y-6">
      <ChipGroup
        label="Materiais que vocês usam"
        description="Catálogo, tabela, cardápio ou lista de serviços."
        values={materials}
        selected={selectedMaterials}
        onToggle={(value) => onToggle("materials", value)}
      />

      {wantsUpload && (
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
          <UploadDropzone
            uploadKind={uploadKind}
            setUploadKind={setUploadKind}
            onUpload={onUpload}
            attachments={attachments}
            disabled={busy}
          />
        </div>
      )}

      <ChipGroup
        label="O orçamento muda conforme alguma regra?"
        description="Marque o que se aplica. Pule se não houver."
        values={budgetFactors}
        selected={selectedBudgetFactors}
        onToggle={(value) => onToggle("budget_factors", value)}
      />

      {selectedBudgetFactors.length > 0 && (
        <TextAreaField
          label="Exemplo simples"
          optional
          hint="Quando muda o preço? O que precisa perguntar antes?"
          value={String(answers.budget_rules ?? "")}
          onChange={(event) => onAnswerChange("budget_rules", event.target.value)}
          placeholder="Ex.: acima de 50 km de distância cobramos frete por km; combos têm 10% off."
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
        />
      )}

      <ChipGroup
        label="Regras e limites importantes"
        description="O que a IA deve respeitar."
        values={rules}
        selected={selectedRules}
        onToggle={(value) => onToggle("rules", value)}
      />

      <TextAreaField
        label="Alma da empresa"
        optional
        hint="Como gostam de atender? O que fazem diferente?"
        value={String(answers.brand_soul ?? "")}
        onChange={(event) => onAnswerChange("brand_soul", event.target.value)}
        placeholder="Atendimento próximo, sempre em até 1h, linguagem informal, sem promessas exageradas."
      />

      <AudioBlock
        transcript={transcript}
        setTranscript={setTranscript}
        onSpeech={onSpeech}
        listening={listening}
      />
    </div>
  );
}
