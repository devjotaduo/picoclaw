import {
  budgetFactors,
  businessModels,
  businessSegments,
  channels,
  materials,
  pains,
  productSegments,
  rules,
  systems,
} from "../constants";
import { toStringArray } from "../helpers";

export type ComposerSpec =
  | {
      kind: "intro";
      ctaLabel: string;
    }
  | {
      kind: "form";
    }
  | {
      kind: "chips";
      key: string;
      options: string[];
      min: number;
      // when true the user submits with a "send" button; otherwise as soon as min reached
      requireConfirm?: boolean;
    }
  | {
      kind: "text";
      key: string;
      placeholder: string;
      multiline: boolean;
      optional: boolean;
      requiredMessage?: string;
    }
  | {
      kind: "upload";
    }
  | {
      kind: "voice";
    }
  | {
      kind: "confirm";
      action: "generate" | "submit";
      ctaLabel: string;
    };

export type ScriptNode = {
  id: string;
  // Up to 2 short Clara messages, shown sequentially with typing pauses.
  prompts: string[];
  composer: ComposerSpec;
  // Skip the node entirely when it doesn't apply.
  shouldSkip?: (state: ScriptState) => boolean;
  // Allow user to "pular" — only valid for clearly optional questions.
  skippable?: boolean;
  // After submitting, optional acknowledgement from Clara.
  ack?: (state: ScriptState) => string | null;
};

export type ScriptState = {
  basic: {
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_whatsapp: string;
  };
  answers: Record<string, unknown>;
  attachmentsCount: number;
  hasSummary: boolean;
};

export const SCRIPT: ScriptNode[] = [
  {
    id: "intro",
    prompts: [
      "Oi! Sou a Clara, sua consultora de pré-cadastro. 👋",
      "Vou conhecer sua empresa em uma conversa curta — sem perguntas técnicas. É só tocar nas respostas que se aplicam. Pronto pra começar?",
    ],
    composer: { kind: "intro", ctaLabel: "Vamos começar" },
  },
  {
    id: "identity",
    prompts: [
      "Pra começar, me conta um pouquinho sobre quem está respondendo.",
      "Preciso do nome da empresa, do responsável e um canal de contato (e-mail ou WhatsApp).",
    ],
    composer: { kind: "form" },
    ack: (state) => {
      const contact = state.basic.contact_email.trim() || state.basic.contact_whatsapp.trim();
      return contact
        ? `Beleza! Salvei o rascunho vinculado a ${contact}. Você pode fechar e retomar pelo link.`
        : "Beleza! Rascunho salvo automaticamente — você pode retomar pelo link na barra do navegador.";
    },
  },
  {
    id: "segments",
    prompts: ["Em quais segmentos vocês atuam? Pode marcar mais de um."],
    composer: { kind: "chips", key: "segments", options: businessSegments, min: 1 },
  },
  {
    id: "models",
    prompts: ["E o modelo de negócio — como vocês vendem hoje?"],
    composer: { kind: "chips", key: "business_models", options: businessModels, min: 1 },
  },
  {
    id: "offer",
    prompts: [
      "Em uma frase, o que a empresa vende ou faz?",
      "Não precisa caprichar — uma descrição simples já me ajuda muito.",
    ],
    composer: {
      kind: "text",
      key: "offer",
      placeholder: "Ex.: móveis planejados para apartamentos pequenos, com visita técnica.",
      multiline: true,
      optional: false,
      requiredMessage: "Conte rapidinho o que vocês vendem antes de seguirmos.",
    },
  },
  {
    id: "channels",
    prompts: ["Por quais canais os clientes chegam até vocês hoje?"],
    composer: { kind: "chips", key: "channels", options: channels, min: 1 },
    skippable: true,
  },
  {
    id: "systems",
    prompts: [
      "Onde ficam hoje clientes, pedidos ou agenda?",
      "Pode marcar 'nenhum' se ainda não tem nada formal.",
    ],
    composer: { kind: "chips", key: "systems", options: systems, min: 1 },
    skippable: true,
  },
  {
    id: "system_notes",
    prompts: ["Conta rapidinho qual sistema é e pra que serve. Nada de senha, ok?"],
    composer: {
      kind: "text",
      key: "system_notes",
      placeholder: "Ex.: planilha do Google pra acompanhar pedidos; Sympla pra agenda.",
      multiline: true,
      optional: true,
    },
    skippable: true,
    shouldSkip: (state) => {
      const list = toStringArray(state.answers.systems);
      return list.length === 0 || list.every((item) => item === "nenhum");
    },
  },
  {
    id: "pains",
    prompts: ["Quais gargalos mais atrapalham o dia a dia? Marque tudo o que dói."],
    composer: { kind: "chips", key: "pains", options: pains, min: 1 },
    skippable: true,
  },
  {
    id: "materials",
    prompts: [
      "Vocês usam algum material de apoio — catálogo, tabela, cardápio ou lista de serviços?",
    ],
    composer: { kind: "chips", key: "materials", options: materials, min: 0 },
    skippable: true,
  },
  {
    id: "upload",
    prompts: [
      "Quer enviar um arquivo agora pra análise interna? É opcional.",
      "Aceito PDF, imagem, planilha ou documento.",
    ],
    composer: { kind: "upload" },
    skippable: true,
    shouldSkip: (state) => {
      const segments = toStringArray(state.answers.segments);
      const materialsList = toStringArray(state.answers.materials);
      const hasProductSegment = segments.some((segment) => productSegments.has(segment));
      const hasRealMaterial = materialsList.some(
        (item) => item && item !== "não tenho material ainda",
      );
      return !hasProductSegment && !hasRealMaterial;
    },
    ack: (state) =>
      state.attachmentsCount > 0
        ? `Material recebido! Já são ${state.attachmentsCount} arquivo${
            state.attachmentsCount > 1 ? "s" : ""
          } no rascunho.`
        : null,
  },
  {
    id: "budget_factors",
    prompts: ["O orçamento muda conforme alguma regra? Marque o que se aplica."],
    composer: { kind: "chips", key: "budget_factors", options: budgetFactors, min: 0 },
    skippable: true,
  },
  {
    id: "budget_rules",
    prompts: ["Me dá um exemplo simples: quando muda o preço? O que precisa perguntar antes?"],
    composer: {
      kind: "text",
      key: "budget_rules",
      placeholder: "Ex.: acima de 50 km cobramos frete; combos têm 10% off.",
      multiline: true,
      optional: true,
    },
    skippable: true,
    shouldSkip: (state) => toStringArray(state.answers.budget_factors).length === 0,
  },
  {
    id: "rules",
    prompts: ["Quais regras a IA precisa respeitar?"],
    composer: { kind: "chips", key: "rules", options: rules, min: 0 },
    skippable: true,
  },
  {
    id: "brand_soul",
    prompts: [
      "Pra fechar, me conta a alma da empresa.",
      "Como gostam de atender? O que fazem diferente?",
    ],
    composer: {
      kind: "text",
      key: "brand_soul",
      placeholder: "Atendimento próximo, sempre em até 1h, sem promessas exageradas.",
      multiline: true,
      optional: true,
    },
    skippable: true,
  },
  {
    id: "voice",
    prompts: [
      "Quer complementar por voz? Só o texto da transcrição entra no rascunho — o áudio não fica gravado.",
    ],
    composer: { kind: "voice" },
    skippable: true,
  },
  {
    id: "summary",
    prompts: [
      "Show! Já tenho tudo o que preciso.",
      "Posso montar um resumo pra você revisar antes de enviar?",
    ],
    composer: { kind: "confirm", action: "generate", ctaLabel: "Gerar resumo" },
  },
  {
    id: "confirm",
    prompts: ["Aqui está o resumo. Se algo importante ficou de fora, é só voltar e complementar."],
    composer: { kind: "confirm", action: "submit", ctaLabel: "Confirmar envio" },
  },
];

export function nextScriptIndex(state: ScriptState, currentIndex: number): number {
  let i = currentIndex + 1;
  while (i < SCRIPT.length && SCRIPT[i].shouldSkip?.(state)) {
    i += 1;
  }
  return Math.min(i, SCRIPT.length - 1);
}
