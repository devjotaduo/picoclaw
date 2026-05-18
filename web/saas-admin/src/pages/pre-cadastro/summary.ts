import { formatList, textValue, toStringArray } from "./helpers";
import type { Basic, SummaryPreview } from "./types";

export function buildPublicSummaryPreview(
  summary: Record<string, unknown> | undefined,
  basic: Basic,
  answers: Record<string, unknown>,
  attachments: { name: string; kind: string }[],
  transcript: string,
): SummaryPreview {
  const segments = toStringArray(answers.segments);
  const models = toStringArray(answers.business_models);
  const channelsList = toStringArray(answers.channels);
  const systemsList = toStringArray(answers.systems);
  const painsList = toStringArray(answers.pains);
  const materialsList = toStringArray(answers.materials);

  const title = textValue(summary?.title) || "Resumo da Clara";
  const headline =
    textValue(summary?.headline) ||
    `Entendi a base da ${basic.company_name || "empresa"} e já existe informação suficiente para uma primeira revisão.`;

  const fallbackHighlights = [
    basic.company_name ? `Empresa: ${basic.company_name}` : "",
    [...segments, ...models].length > 0 ? `Perfil: ${formatList([...segments, ...models])}` : "",
    textValue(answers.offer) ? `Oferta principal: ${textValue(answers.offer)}` : "",
    channelsList.length > 0 ? `Canais atuais: ${formatList(channelsList)}` : "",
    systemsList.length > 0 ? `Sistemas citados: ${formatList(systemsList)}` : "",
    painsList.length > 0 ? `Gargalos: ${formatList(painsList)}` : "",
    materialsList.length > 0 ? `Materiais: ${formatList(materialsList)}` : "",
    attachments.length > 0
      ? `Arquivos enviados: ${attachments.map((a) => `${a.kind} (${a.name})`).join(", ")}`
      : "",
    transcript.trim() ? "Complemento por voz/texto incluído no rascunho." : "",
  ].filter(Boolean);

  const fallbackNext = [
    "Revisar os pontos entendidos e confirmar o envio.",
    "O time interno analisará o relatório completo antes de qualquer configuração.",
    "Nenhum agente será alterado automaticamente nesta etapa.",
  ];

  return {
    title,
    headline,
    highlights:
      toStringArray(summary?.highlights).length > 0
        ? toStringArray(summary?.highlights)
        : fallbackHighlights,
    next_steps:
      toStringArray(summary?.next_steps).length > 0
        ? toStringArray(summary?.next_steps)
        : fallbackNext,
  };
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Rascunho salvo",
    report_ready: "Resumo pronto",
    submitted: "Enviado",
    reviewed: "Revisado",
    linked: "Vinculado",
  };
  return labels[status] ?? status;
}
