---
name: sugerir-campanha
description: Analisa memória (vendas, leads, suporte, sazonalidade) e propõe campanhas com objetivo, público, oferta, canal, criativo, KPI e orçamento sugerido. Proativa — dispara sugestões sem ser pedida ao detectar oportunidade.
visibility: global
---

# Sugerir campanha

## Quando usar (gatilhos automáticos)
- Toda segunda-feira: propor 1 a 3 campanhas para a semana.
- `calendario-sazonal` apontar data D-14.
- `memory/vendas.md` mostrar queda > 15% ou pico > 20% vs. média.
- `memory/leads.md` mostrar leads frios sem nutrição há > 7 dias.
- `memory/suporte.md` mostrar problema recorrente que pede comunicação preventiva.
- Dono informar produto/serviço ocioso ou estoque parado.

## Memórias lidas automaticamente
| Memória | O que Lia busca |
|---|---|
| `memory/empresa.md` | posicionamento, ticket médio, público |
| `memory/vendas.md` | histórico, top produtos, sazonalidade |
| `memory/leads.md` | funil atual, leads parados |
| `memory/clientes.md` | recorrentes, aniversários |
| `memory/marketing.md` | histórico de campanhas, aprendizados |
| `memory/marketing.md > historico_aprendizado` | **desempenho real medido** (via `marketing/medir-desempenho`) — o que funcionou e o que não |
| `memory/faq.md` | dúvidas frequentes → vira tema de conteúdo |

## Propor com base em evidência (não no escuro)

**Antes de propor**, ler `historico_aprendizado` (alimentado por
`marketing/medir-desempenho`). A sugestão deve:

- priorizar formato / horário / tipo de post que **historicamente performaram**;
- evitar repetir o que ficou `abaixo do esperado` — a menos que mude o ângulo, e
  nesse caso dizer explicitamente o que mudou e por quê;
- registrar no campo `[KPI]` o número-alvo concreto, pra que `medir-desempenho`
  consiga depois classificar `acima | dentro | abaixo do esperado`;
- se o histórico está vazio ou marca `sem_dados` repetido, incluir no
  `[PRÓXIMO PASSO]` "instrumentar medição" (conectar Graph API ou Rafael
  registrar números) — senão a Lia segue cega pra sempre.

## Estrutura da sugestão
```
[CAMPANHA] nome curto
[GATILHO] o que motivou esta sugestão
[OBJETIVO] vender | gerar lead | engajar | reativar | educar
[PÚBLICO] segmento, dor, momento de compra
[OFERTA] produto, desconto, conteúdo, brinde
[CANAL] Instagram feed | story | reel | WhatsApp | site
[CRIATIVO] tema da arte + sugestão de copy (1 linha de gancho)
[PERÍODO] YYYY-MM-DD → YYYY-MM-DD
[KPI] alcance, salvamentos, cliques, leads gerados, vendas
[ORÇAMENTO SUGERIDO] R$ X em impulsionamento (opcional)
[PRÓXIMO PASSO] aprovação → Lia gera arte + legenda + site (se necessário)
[STATUS] rascunho — aguardando aprovação
```

## Regras de proatividade
- Máximo 3 sugestões novas por dia (rate-limit HEARTBEAT.md).
- Sugestão recusada: registrar motivo em `memory/marketing.md > historico_aprendizado`.
- Sugestão aprovada: chamar `gerar-imagem-post` + `criar-post-instagram` automaticamente.

## Não pode
- Lançar campanha sem aprovação humana.
- Prometer ROI ou resultado específico.
- Usar dado individual de cliente em campanha sem consentimento (`config/privacy-policy.md`).
- Copiar ideia de campanha de concorrente.
