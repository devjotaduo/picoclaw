# Segmento: Vendas B2B / Comercial

Use este guia para empresas com time de SDR/vendedor, ticket médio mais
alto, ciclo de venda consultivo (SaaS, consultoria, imobiliária, indústria,
serviço B2B).

## Vocabulário

Lead, MQL, SQL, pipeline, oportunidade, proposta, CAC, LTV, follow-up,
ciclo de venda, decisor.

## Perguntas específicas

1. "Como o lead chega hoje — inbound (site/marketing) ou outbound
   (prospecção ativa)?"
2. "Qual o tempo médio do ciclo de venda?"
3. "Qual a taxa de conversão de lead → reunião → proposta → fechamento?"
4. "Quantos SDRs e vendedores tem o time?"
5. "Qual CRM vocês usam? (Pipedrive, HubSpot, RD Station CRM, Salesforce,
   Ploomes, planilha)"
6. "O lead inbound demora quanto tempo para receber primeiro contato?"
7. "Vendedor está perdendo tempo com lead frio? Tem processo de
   qualificação?"
8. "Como funciona o follow-up de proposta? Quantos toques?"

## Dores típicas

- Lead demora horas/dias para ser contatado e esfria.
- SDR/vendedor gasta tempo em lead que não tem fit.
- Proposta enviada e ninguém faz follow-up.
- Pipeline vazio, falta prospecção ativa.
- CRM desatualizado, vendedor não preenche.
- Reunião marcada e cliente não aparece.

## Integrações comuns

- **CRM**: HubSpot, Pipedrive, RD Station, Salesforce, Ploomes.
- **Captura de lead**: site, Meta Ads, Google Ads, LinkedIn Ads.
- **Comunicação**: e-mail corporativo, WhatsApp, LinkedIn.
- **Agenda**: Google Calendar, Calendly.
- **Enriquecimento**: Apollo, Lusha, Cortex.

## Time típico de agentes para vendas B2B

1. **`marcos`** (entra primeiro) — recebe lead inbound em
   segundos, faz perguntas de qualificação, marca reunião no calendário
   do vendedor certo.
2. ⚠️ **prospecção outbound** — `agente-prospeccao` não existe no roster
   atual. `marcos` cobre inbound; outbound ativo em lista segmentada:
   marcar como "a validar" — criar via `operador` + `skill-creator`.
3. **`camila`** (= follow-up de proposta) — toca leads parados,
   reativa pipeline frio, lembra reunião.
4. **`main`** (Rafael) — devolve diariamente ao gestor: leads novos,
   propostas paradas, reuniões da semana.

## Restrições LGPD (outbound)

- Lista de prospecção deve ter base legal (interesse legítimo / opt-in).
- E-mail deve permitir opt-out claro.
- WhatsApp outbound só com aceite prévio ou em contato B2B legítimo.
- Documentar a fonte da lista.

## Métricas a propor

- Tempo médio de primeiro contato com lead inbound (meta: < 5 min).
- Taxa de qualificação MQL → SQL.
- Nº de reuniões agendadas/semana.
- Taxa de fechamento por origem.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (lead B2B fictício):

### Cenário 1 — Interesse inicial (qualificação)
> "Vi vocês no LinkedIn, tô interessado. Podemos conversar?"

**O que Clara deve fazer:** consultar `Produtos ou serviços:` e `Canal de agendamento:` em `memory/empresa.md`, fazer 2-3 perguntas curtas de qualificação (tamanho da empresa, contexto, dor) e oferecer agendar reunião com vendedor.
**Sinal de problema:** Clara já mandou link de pagamento sem qualificar (significa falta regra de "lead novo passa por qualificação antes de proposta") ou não conseguiu marcar reunião (significa `Canal de agendamento:` vazio).

### Cenário 2 — Preço por volume
> "Quanto custa pra [N] usuários / [N] licenças?"

**O que Clara deve fazer:** consultar `Faixa de preço:` e `Pode falar preço:` em `memory/empresa.md`. Se preço é por proposta, explicar que depende do escopo e oferecer call de diagnóstico. Se há tabela pública, passar a faixa.
**Sinal de problema:** Clara inventou preço por usuário ou ofereceu desconto (significa `Faixa de preço:` mal cadastrada ou `Pode falar preço:` ambígua).

### Cenário 3 — Demo / prova
> "Consigo fazer uma demo antes de fechar?"

**O que Clara deve fazer:** consultar política de demo/trial em `memory/empresa.md` (se existir) ou `Canal de agendamento:` e marcar reunião de demo com vendedor. Se não houver demo, explicar como funciona avaliação.
**Sinal de problema:** Clara prometeu demo sem confirmar disponibilidade (significa falta campo "Política de demo/trial" no `memory/empresa.md`).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
