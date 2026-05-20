# Melhorias percebidas

## Modelo

Data:
Origem:
O que foi percebido:
Por que importa:
Sugestão:
Prioridade:
Agente recomendado:
Status:

---

## Registro de melhorias implementadas

---

id: MEL-20260520-001
data: 2026-05-20
origem: sessão de desenvolvimento
status: implementado

O que foi feito:
Implementado sistema de onboarding dinâmico por segmento. Sofia agora identifica o tipo de negócio (saúde, alimentação, varejo, serviços, beleza, educação, imobiliária) e decide quais campos são bloqueantes para aquele segmento específico, em vez de usar uma lista fixa genérica.

Arquivos criados/modificados:
- web/backend/api/workspace_memory.go — lógica de detectSegment + segmentFields + parseEmpresaStatus dinâmico
- workspace/skills/onboarding/decidir-bloqueios-por-segmento/SKILL.md — dispatcher de playbooks
- workspace/skills/onboarding/playbooks/{saude,alimentacao,varejo,servicos,beleza,educacao,imobiliaria,default}/SKILL.md — 8 playbooks
- workspace/skills/onboarding/cadastrar-empresa/SKILL.md — adicionado Bloco 4 (específico do segmento)
- workspace/agents/sofia/AGENT.md — fluxo com decisão de segmento + lista de skills
- workspace/memory/empresa.md — campo "Segmento detectado" documentado
- workspace/AGENTS.md — responsabilidades e skills da Sofia atualizadas

Por que importa:
Uma clínica precisa saber o canal de agendamento. Um restaurante precisa do cardápio e área de entrega. Usar campos genéricos fazia o cadastro ficar incompleto para o que realmente importa no dia a dia de cada negócio.

---

id: MEL-20260520-002
data: 2026-05-20
origem: sessão de desenvolvimento
status: implementado

O que foi feito:
Corrigido bug em pkg/analytics/service.go (time.Now().UTC().ISOWeek() retorna 2 valores, não 3) e removidas variáveis declaradas mas não usadas em pkg/analytics/patterns.go.

Por que importa:
O pacote analytics não compilava, impedindo build do backend.

---

id: MEL-20260520-003
data: 2026-05-20
origem: sessão de desenvolvimento
status: implementado

O que foi feito:
Criada agente Lia (marketing). Capabilities: gerar posts Instagram com legenda, criar sites HTML com link público, sugerir campanhas por data/evento, gerar imagens, ser proativa, ler memória da empresa para personalizar conteúdo.

Por que importa:
Empresa não tinha suporte a marketing automatizado. Lia fecha essa lacuna sem precisar de agência.

---

id: MEL-20260520-004
data: 2026-05-20
origem: sessão de desenvolvimento
status: a fazer — prioridade baixa

O que foi percebido:
Campo "Formas de pagamento" aparece nos campos base do core (opcional) e também nos campos bloqueantes do segmento "alimentacao" (obrigatório). Isso pode causar duplicata visual no dialog do painel.

Sugestão:
Remover "Formas de pagamento" dos campos base do core ou adicionar dedup no frontend (empresa-setup-dialog.tsx) ao renderizar a lista de campos missing.

Agente recomendado: Rafael (para alertar se der problema na UI)

---

id: MEL-20260520-005
data: 2026-05-20
origem: sessão de desenvolvimento
status: pendente

O que foi percebido:
config/company-profile.md e config/authorized-channels.md ainda não foram preenchidos com dados reais. Sistema está em modo de setup.

Sugestão:
Antes do go-live, Sofia deve conduzir o preenchimento de ambos. Rafael deve bloquear atendimento externo até isso estar completo.

Agente recomendado: Sofia (coleta), Rafael (verifica e alerta)

