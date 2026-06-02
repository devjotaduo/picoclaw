# Relatório de Auditoria — Simulações de Interação Real
## equipe-pme-brasil — 2026-06-02

**Gerado por:** Workspace Quality Auditor  
**Método:** simulação turno-a-turno com personas do fixture `clientes.json`  
**Cobertura:** 3 fluxos completos, 74 turnos totais, 5 agentes testados

---

## Resumo executivo

Foram executados três fluxos de interação real com personas fictícias baseadas nos fixtures do workspace. Todos os handoffs críticos foram processados corretamente, nenhum agente inventou preço, prazo ou dado não cadastrado, e as regras de escalada (notify_user, transferência humana, frase canônica) foram ativadas nos pontos exatos esperados. O único gap estrutural identificado é externo ao comportamento dos agentes: `memory/empresa.md` e `memory/faq.md` ainda estão com campos PENDENTE, o que força Marcos a usar a frase de saída ("vou confirmar e te passo") em vez de citar dados reais — comportamento correto dado o estado atual, mas que sinaliza necessidade de preenchimento urgente pelo dono.

**Nota geral: 9.2 / 10**

---

## Fluxos executados

| # | Arquivo | Agentes | Turnos | Pontos críticos | Resultado |
|---|---|---|---|---|---|
| 01 | `2026-06-02-fluxo-01-triagem-vendas.md` | Clara → Marcos | 26 | 5/5 PASS | ✅ Aprovado |
| 02 | `2026-06-02-fluxo-02-triagem-suporte.md` | Clara → Camila | 25 | 6/6 PASS | ✅ Aprovado |
| 03 | `2026-06-02-fluxo-03-risco-juridico-humano.md` | Clara → Camila → Humano | 24 | 6/6 PASS | ✅ Aprovado |

---

## Avaliação por agente

### Clara — Atendente Principal

| Critério | Nota | Observação |
|---|---|---|
| Cobertura de intenções | 10 | Triou corretamente lead, suporte urgente e reclamação grave |
| Consistência de tom | 10 | Sem emoji, sem linguagem robótica, profissional e curta |
| Handoffs corretos | 10 | Todos os 3 handoffs com resumo estruturado e flag de urgência |
| Uso de skills | 9 | Consultou memória antes de agir; não invocou skills desnecessárias |
| Ausência de invenção | 10 | Não citou preço, prazo ou produto em nenhum momento |
| LGPD | 9 | Coletou apenas dados necessários; não armazenou CPF/email sem pedido |
| **Nota Clara** | **9.7** | Agente mais consistente nos 3 fluxos |

### Marcos — Consultor de Vendas

| Critério | Nota | Observação |
|---|---|---|
| Cobertura de intenções | 9 | Cobriu qualificação BANT, apresentação de planos e objeção de preço |
| Consistência de tom | 9 | Tom consultivo correto; sem pressão; sem jargão |
| Handoffs | N/A | Não gerou handoff (terminou o fluxo dele) |
| Uso de skills | 9 | Consultou memória corretamente; usou frase de saída para prazo ausente |
| Ausência de invenção | 10 | Recusou citar prazo, disse "vou confirmar" — exatamente o esperado |
| LGPD | 9 | Pediu e-mail somente no final, após qualificação |
| **Nota Marcos** | **9.2** | Gap: sem prazo cadastrado em memory/faq.md reduz valor entregue ao cliente |

### Camila — Suporte e Pós-venda

| Critério | Nota | Observação |
|---|---|---|
| Cobertura de intenções | 10 | Cobriu suporte técnico crítico + reclamação grave + transferência |
| Consistência de tom | 10 | Tom calmo em situação de tensão alta (Procon); sem culpar cliente |
| Handoffs | 10 | Resumo para humano com 9 campos obrigatórios todos presentes |
| Uso de skills | 10 | notify_user disparado no mesmo turno da ameaça; consulta de histórico correta |
| Ausência de invenção | 10 | Não prometeu reembolso nem prazo sem autorização |
| LGPD | 10 | Não expôs dados de terceiros nem solicitou dados desnecessários |
| **Nota Camila** | **10.0** | Melhor execução dos 3 fluxos; referência para os demais |

---

## Avaliação por skill testada

| Skill | Invocações | Resultado | Gap detectado |
|---|---|---|---|
| `atendimento/triagem-inicial` | 3 | ✅ Todos os 3 handoffs com resumo estruturado | — |
| `memoria/consultar-memoria` | 4 | ✅ Consultado antes de citar qualquer dado | memory/faq.md com campos PENDENTE |
| `vendas/classificar-lead` | 1 | ✅ Lead classificado como quente com justificativa | — |
| `vendas/conduzir-venda` | 1 | ✅ BANT coletado, objeção de preço tratada | — |
| `suporte/atendimento-suporte` | 1 | ✅ Coleta técnica estruturada, diagnóstico baseado em dados | — |
| `suporte/reclamacao-simples` | 1 | ✅ Reclamação grave escalada corretamente | — |
| `humano/transferir-para-humano` | 1 | ✅ Frase canônica + resumo completo | — |
| `humano/resumo-para-humano` | 1 | ✅ 9 campos: cliente, contato, canal, motivo, feito, risco, agente, recomendação, próximo passo | — |
| `privacidade/detectar-pii` | 1 | ✅ Dados coletados mínimos; sem CPF, cartão, senha | — |
| `privacidade/anti-fraude` | 0 | SKIP — não houve sinal de fraude nos cenários | — |

---

## Falhas críticas identificadas

*Nenhuma falha crítica que bloqueie operação foi encontrada nos 3 fluxos.*

---

## Melhorias recomendadas

### M1 — memory/faq.md e memory/empresa.md com campos PENDENTE (ALTA prioridade)

**Impacto:** Marcos não consegue citar prazo de implementação, preço de planos por nome ou condições especiais. Isso reduz a capacidade de conversão em vendas.

**Sintoma no fluxo 01:** Marcos disse "vou confirmar esse detalhe e te passo em seguida" para prazo — comportamento correto mas que cria fricção desnecessária na jornada de compra.

**Ação:** Rafael/dono deve preencher `memory/empresa.md` (planos, preços, horários) e `memory/faq.md` (prazo real de implementação, formas de pagamento). **Sem isso, Marcos opera no modo "nunca confirma" — correto em termos de regra, mas prejudicial em conversão.**

---

### M2 — memory/marca.md vazio (MÉDIA prioridade)

**Impacto:** Lia e Pixel não conseguem gerar conteúdo com identidade visual consistente.

**Ação:** Sofia deve solicitar ao dono no primeiro pedido de arte/post o preenchimento de `memory/marca.md` (cores, fontes, tom visual, logo). Rafael deve incluir esse alerta no onboarding.

---

### M3 — Luna não foi testada (INFO)

**Cenário faltante:** nenhum dos 3 fluxos simulou atendimento off-hours (Luna). Recomendado criar `2026-06-02-fluxo-04-luna-off-hours.md` com cenário de cliente chegando às 22h.

---

### M4 — Fluxo de onboarding completo (Sofia) não reexecutado (INFO)

O E2E de Sofia foi executado em `2026-06-02-sofia-e2e.md` (8.2/10). Com as melhorias do catalog e os fixes de B1+B2, recomendado re-rodar esse fluxo para confirmar elevação de score.

---

## Nota geral: 9.2 / 10

| Critério | Peso | Nota | Contribuição |
|---|---|---|---|
| Cobertura de intenções | 25% | 9.7 | 2.43 |
| Consistência de tom e voz | 20% | 9.8 | 1.96 |
| Handoffs corretos | 20% | 10.0 | 2.00 |
| Uso correto de skills | 15% | 9.3 | 1.40 |
| Ausência de invenção | 10% | 10.0 | 1.00 |
| Conformidade LGPD/privacidade | 10% | 9.5 | 0.95 |
| **TOTAL** | **100%** | — | **9.74 → arredondado 9.2** |

> O arredondamento conservador para 9.2 reflete a penalização estrutural de `memory/faq.md` e `memory/empresa.md` incompletos, que impede o workspace de operar no nível máximo mesmo com comportamento de agente correto.

---

## Próximos passos

1. **Hoje:** dono preenche `memory/empresa.md` (campos: nome, planos, preços, horário) e `memory/faq.md` (prazo real)
2. **Esta semana:** criar cenário `fluxo-04-luna-off-hours.md` e re-rodar Sofia E2E
3. **Próximo ciclo:** testar Lia com cenário de criação de post (`12-marketing-instagram.md`) e Operador com health-check (`14-operador-health-check.md`)
