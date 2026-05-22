---
name: orquestrar-agentes
description: Simula handoff entre múltiplos agentes (Clara→Marcos→Camila, Sofia→Clara, Luna→Clara, etc.) durante um diálogo de teste e valida se o roteamento segue as regras de AGENTS.md.
visibility: dev
---

# orquestrar-agentes

## Objetivo

Reproduzir o fluxo real em que uma conversa começa com um agente e é repassada a outro(s), garantindo que cada handoff respeita as regras de `workspace/AGENTS.md`.

## Quando usar

- Cenários multi-agente: `lead-novo` (Clara→Marcos), `suporte-pos-venda` (Clara→Camila), `caso-sensivel` (qualquer→Humano), `cobertura-noturna` (Luna→Clara no dia seguinte), `onboarding-tenant` (Clara pública→Sofia→Marcos).
- Quando `testar-skill` detecta que o cenário cruza fronteira de agente.

## Processo

1. **Mapear fluxo esperado.** Baseado em `AGENTS.md`:
   - venda → Marcos
   - suporte/defeito → Camila
   - caso sensível (saúde, jurídico, ameaça) → Atendimento Humano
   - horário noturno/fim de semana → Luna assume; passa o histórico para Clara no início do dia útil seguinte
   - Sofia opera só no tenant público de onboarding; após qualificação, repassa contexto para o tenant final
2. **Gerar turnos no agente inicial** até aparecer o gatilho de handoff.
3. **Inserir marca de handoff** explícita na transcrição: `> [handoff:de=clara,para=marcos,motivo=intencao-de-compra]`.
4. **Continuar o diálogo** com o novo agente, mantendo o contexto e o histórico anterior visível (resumo de 2–3 linhas).
5. **Validar regras de handoff:**
   - Agente inicial NÃO continua respondendo após handoff.
   - Agente novo CITA o contexto recebido (não pergunta tudo de novo).
   - Se handoff vai para Humano, agente desliga e marca `[aguardando-humano]`.
6. **Retornar relatório de handoff** para `testar-skill` consumir.

## Dados de entrada

- `fluxo`: enum (`lead-novo`, `suporte-pos-venda`, `caso-sensivel`, `cobertura-noturna`, `onboarding-tenant`).
- `agente_inicial`: id.
- `transcricao_base` (opcional): se já existe diálogo iniciado, continua a partir dele.

## Dados de saída

- Transcrição com handoffs marcados.
- Lista de violações de roteamento detectadas (se houver).

## Falhas comuns que esta skill detecta

- Clara fechou venda sem chamar Marcos.
- Camila respondeu pergunta de preço (deveria devolver para Marcos).
- Luna continuou respondendo às 10h da manhã (deveria ter passado para Clara).
- Sofia tentou marcar reunião no tenant final (Sofia só qualifica, não opera o tenant cliente).
- Após `handoff:humano`, agente continuou respondendo turnos seguintes.
