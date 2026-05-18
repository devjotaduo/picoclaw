export const STORAGE_KEY = "picoclaw_pre_cadastro_clara";
export const TOTAL_STEPS = 5;

export const businessSegments = [
  "serviços",
  "produtos",
  "restaurante/cardápio",
  "clínica",
  "loja",
  "indústria",
  "educação",
  "imobiliária",
  "eventos",
  "outro",
];

export const businessModels = ["B2B", "B2C", "misto"];

export const materials = [
  "catálogo",
  "tabela de preços",
  "cardápio",
  "lista de serviços",
  "orçamento personalizado",
  "não tenho material ainda",
];

export const budgetFactors = [
  "medida",
  "quantidade",
  "pacote",
  "distância/frete",
  "mão de obra",
  "taxas",
  "combos",
  "regras internas",
];

export const channels = [
  "WhatsApp",
  "Instagram",
  "site",
  "telefone",
  "loja física",
  "marketplace",
  "indicação",
  "outros",
];

export const systems = [
  "nenhum",
  "planilha",
  "CRM",
  "ERP",
  "agenda online",
  "sistema próprio",
  "banco de dados",
  "loja virtual",
  "outro",
];

export const pains = [
  "demora para responder",
  "lead sem qualificação",
  "falta de follow-up",
  "agendamento confuso",
  "dúvidas repetidas",
  "orçamento manual",
  "marketing parado",
  "dono sobrecarregado",
  "falta de relatórios",
];

export const rules = [
  "horários definidos",
  "preço público",
  "preço sob consulta",
  "descontos com regra",
  "precisa aprovação humana",
  "assuntos que a IA não deve responder",
];

export const uploadKinds = [
  "catálogo",
  "tabela de preços",
  "cardápio",
  "lista de serviços",
  "documento",
];

export const productSegments = new Set(["produtos", "restaurante/cardápio", "loja"]);

export type StepKey = "identity" | "business" | "operation" | "details" | "review";

export const STEP_ORDER: StepKey[] = ["identity", "business", "operation", "details", "review"];

export const STEP_TITLES: Record<StepKey, { title: string; subtitle: string }> = {
  identity: {
    title: "Quem é você?",
    subtitle: "Dados básicos para identificar o cadastro e permitir retomada.",
  },
  business: {
    title: "O que vocês fazem?",
    subtitle: "Conte rapidamente o segmento, o modelo e a oferta principal.",
  },
  operation: {
    title: "Como funciona hoje?",
    subtitle: "Canais que recebem clientes, sistemas em uso e maiores gargalos.",
  },
  details: {
    title: "Detalhes e diferenciais",
    subtitle: "Materiais, regras de orçamento e a alma da empresa.",
  },
  review: {
    title: "Tudo certo para revisar?",
    subtitle: "Confira o resumo gerado e confirme o envio.",
  },
};
