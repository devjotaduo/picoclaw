# Segmento: Serviços profissionais

Use para advocacia, contabilidade, arquitetura, engenharia, agência de
marketing, consultoria, salão de beleza, estética, prestador autônomo.

## Vocabulário

Cliente, projeto, contrato, honorários, mensalidade, escopo, briefing,
proposta, orçamento.

## Perguntas específicas

1. "Vocês trabalham com mensalidade recorrente (avença, contrato fixo)
   ou projeto pontual?"
2. "Como o cliente chega — indicação, site, Google, anúncio?"
3. "Quanto tempo leva do primeiro contato até fechar contrato?"
4. "Vocês fazem proposta personalizada para cada cliente?"
5. "Qual sistema de gestão / financeiro? (Conta Azul, Omie, Asaas,
   ContaPro, planilha)"
6. "Tem agenda — atendimentos, audiências, reuniões? Como é gerida?"
7. "Inadimplência é uma dor? Mensalidade ou projeto?"

## Dores típicas

- Lead chega e demora dias para receber proposta.
- Proposta enviada e esquecida, sem follow-up.
- Cliente recorrente que cancela sem ninguém ligar antes.
- Cobrança de mensalidade manual, atrasada.
- Profissional sênior gastando tempo em triagem de cliente novo.
- Agenda de atendimentos / reuniões bagunçada.

## Integrações comuns

- **Gestão/financeiro**: Conta Azul, Omie, Bling, Asaas, Vindi.
- **Atendimento**: WhatsApp Business, e-mail, site.
- **Agenda**: Google Calendar, Calendly.
- **Documentos**: Google Drive, Docusign, ClickSign.

## Time típico de agentes para serviços

1. **`clara`** (entra primeiro) — atende dúvida inicial,
   tria o caso, agenda reunião de avaliação.
2. ⚠️ **agendamento** — `agente-agendador` não existe no roster atual.
   Gestão de agenda / confirmação 24h: ampliar `camila` ou criar agente
   dedicado via `operador` + `skill-creator`.
3. ⚠️ **cobrança** — `agente-cobranca` não existe no roster atual.
   Workaround: `main` (Rafael) + cron para lembretes de mensalidade.
   Automação completa: marcar como "a validar".
4. **`camila`** — pesquisa de satisfação, pede indicação,
   reativa cliente parado.

## Métricas a propor

- Tempo de resposta a lead novo.
- Taxa de conversão lead → proposta → contrato.
- Inadimplência de mensalidade.
- Churn / renovação anual de contrato.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Preço de serviço
> "Quanto vocês cobram pra fazer [serviço]?"

**O que Clara deve fazer:** consultar `Faixa de preço:`, `Pode falar preço:` e `Produtos ou serviços:` em `memory/empresa.md`. Se preço for sob proposta, explicar que precisa de briefing e oferecer agendar conversa.
**Sinal de problema:** Clara inventou valor (significa `Faixa de preço:` vazia) ou falou preço quando o dono pediu pra sempre passar proposta (significa `Pode falar preço:` mal configurado).

### Cenário 2 — Prazo de entrega
> "Em quanto tempo fica pronto?"

**O que Clara deve fazer:** consultar info de prazo cadastrada no `memory/empresa.md` (se existir campo de prazo padrão). Se não estiver definido, dizer que depende do escopo e oferecer agendar conversa.
**Sinal de problema:** Clara prometeu prazo sem confirmação (significa que prazo padrão não foi cadastrado e faltou regra de "nunca prometer prazo sem briefing").

### Cenário 3 — Garantia e contrato (escalação)
> "Vocês dão garantia? Se não gostar do resultado, como faz?"

**O que Clara deve fazer:** consultar info de garantia/política de revisão no `memory/empresa.md`. Se não houver política cadastrada, encaminhar pro humano consultando `Quando chamar humano:`.
**Sinal de problema:** Clara prometeu garantia genérica sem base (significa falta de campo "Política de garantia" no `memory/empresa.md`).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
