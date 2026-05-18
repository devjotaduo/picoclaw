export type SkillDisplaySource = {
  name: string;
  description?: string | null;
};

export type SkillDisplay = {
  name: string;
  description: string;
  slug: string;
  hasLocalizedName: boolean;
};

const SKILL_DISPLAY_OVERRIDES: Record<
  string,
  { name: string; description?: string }
> = {
  "agent-browser": {
    name: "Navegador automatizado",
    description:
      "Automação de navegador via CLI agent-browser. Use quando precisar navegar em sites, preencher formulários, clicar em botões, tirar screenshots, extrair dados ou testar apps web.",
  },
  "appointment-triage": { name: "Triagem de agendamento" },
  "bant-spin-discovery": { name: "Descoberta BANT/SPIN" },
  "bug-report-builder": { name: "Relatório de bug" },
  "clinic-scheduling": { name: "Agendamento de clínica" },
  "conduct-case-routing": { name: "Encaminhamento de conduta" },
  "confidentiality-check": { name: "Checagem de confidencialidade" },
  "customer-identity-verification": { name: "Verificação de identidade do cliente" },
  "faq-answering": { name: "Respostas de FAQ" },
  github: {
    name: "GitHub",
    description:
      "Interação com GitHub usando a CLI gh. Use gh issue, gh pr, gh run e gh api para issues, PRs, execuções de CI e consultas avançadas.",
  },
  hardware: {
    name: "Hardware",
    description:
      "Leitura e controle de periféricos I2C e SPI em placas Sipeed, como LicheeRV Nano, MaixCAM e NanoKVM.",
  },
  "health-safety-routing": { name: "Encaminhamento de urgência em saúde" },
  "human-handoff-brief": { name: "Resumo para atendimento humano" },
  "intent-routing": { name: "Roteamento de intenção" },
  "internal-policy-search": { name: "Busca de políticas internas" },
  "knowledge-base-resolution": { name: "Solução pela base de conhecimento" },
  "lead-qualification": { name: "Qualificação de leads" },
  "lgpd-check": { name: "Checagem LGPD" },
  "log-sanitizer": { name: "Sanitização de logs" },
  "memory-and-knowledge-check": { name: "Checagem de memória e conhecimento" },
  "objection-handling": { name: "Tratamento de objeções" },
  "order-status-triage": { name: "Triagem de pedido" },
  "product-interest-extraction": { name: "Extração de interesse em produto" },
  "returns-and-refunds-policy": { name: "Trocas, devoluções e reembolsos" },
  "sector-routing": { name: "Encaminhamento por setor" },
  "security-incident-routing": { name: "Encaminhamento de incidente de segurança" },
  "sensitive-data-protection": { name: "Proteção de dados sensíveis" },
  "severity-classification": { name: "Classificação de severidade" },
  "skill-creator": {
    name: "Criador de habilidades",
    description:
      "Cria ou atualiza AgentSkills. Use ao desenhar, estruturar ou empacotar habilidades com scripts, referências e recursos.",
  },
  summarize: {
    name: "Resumo e extração de texto",
    description:
      "Resume ou extrai texto e transcrições de URLs, podcasts e arquivos locais, inclusive como fallback para vídeos ou YouTube.",
  },
  "technical-troubleshooting": { name: "Triagem técnica" },
  tmux: {
    name: "Controle tmux",
    description:
      "Controle remoto de sessões tmux para CLIs interativas, enviando teclas e lendo a saída do painel.",
  },
  weather: {
    name: "Clima e previsão",
    description:
      "Consulta clima atual e previsões com verificação de local, sem precisar de chave de API.",
  },
  "whatsapp-business-memory": { name: "Memória do negócio pelo WhatsApp" },
  "whatsapp-contact-profile": { name: "Perfil de contato do WhatsApp" },
  "whatsapp-conversation-summary": { name: "Resumo de conversa do WhatsApp" },
  "whatsapp-follow-up-planner": { name: "Planejador de follow-up no WhatsApp" },
  "whatsapp-lead-capture": { name: "Captação de leads pelo WhatsApp" },
  "whatsapp-lgpd-consent": { name: "Consentimento LGPD no WhatsApp" },
  "whatsapp-report-builder": { name: "Relatórios de WhatsApp" },
};

const WORD_OVERRIDES: Record<string, string> = {
  api: "API",
  bant: "BANT",
  faq: "FAQ",
  github: "GitHub",
  lgpd: "LGPD",
  pr: "PR",
  prs: "PRs",
  spin: "SPIN",
  whatsapp: "WhatsApp",
};

function capitalizeWord(word: string) {
  return word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word;
}

function humanizeSkillName(slug: string) {
  const words = slug
    .split(/[-_\s]+/)
    .map((word) => WORD_OVERRIDES[word.toLowerCase()] ?? word.toLowerCase())
    .filter(Boolean);

  if (words.length === 0) return slug;
  return [capitalizeWord(words[0]), ...words.slice(1)].join(" ");
}

export function getSkillDisplay(skill: SkillDisplaySource): SkillDisplay {
  const override = SKILL_DISPLAY_OVERRIDES[skill.name];
  const description = override?.description ?? skill.description?.trim() ?? "";

  return {
    name: override?.name ?? humanizeSkillName(skill.name),
    description,
    slug: skill.name,
    hasLocalizedName: Boolean(override?.name),
  };
}
