---
name: workspace-agent-auditor
description: "Audita, testa e valida os agentes e skills do workspace Picoclaw. Use quando: avaliar qualidade dos agentes, testar skills, gerar relatório de auditoria, verificar fluxos de atendimento/vendas/suporte, simular conversas com 20+ interações, detectar falhas ou gaps nos agentes, gerar nota de qualidade. Triggers: auditar agentes, testar workspace, validar skills, checar qualidade, relatório de agentes, diagnóstico de agentes."
argument-hint: "nome do agente ou skill a auditar, ou 'todos' para auditoria completa"
---

# Workspace Agent Auditor

Audita, testa e valida todos os agentes e skills do workspace Picoclaw simulando interações reais.

## Quando usar

- Avaliar qualidade dos agentes antes de colocar em produção
- Detectar gaps, falhas e inconsistências nos fluxos
- Gerar relatório com nota e melhorias priorizadas
- Validar que handoffs entre agentes funcionam corretamente
- Verificar conformidade com tom de voz, LGPD e regras de negócio

## Procedimento

### 1. Descoberta do workspace

Ler estes arquivos obrigatoriamente:
- [AGENT.md](../../workspace/AGENT.md)
- [AGENTS.md](../../workspace/AGENTS.md)
- [IDENTITY.md](../../workspace/IDENTITY.md)
- [behavior.json](../../workspace/behavior.json)

Listar todos os agentes em `workspace/agents/` e todas as skills em `workspace/skills/`.

### 2. Criar estrutura de testes (se não existir)

Verificar se `workspace/tests/` existe. Se não:
- Criar pastas: `scenarios/`, `fixtures/`, `results/`
- Copiar cenários padrão de [cenários de referência](./references/cenarios-padrao.md)

### 3. Executar os 21 cenários de teste

Para cada arquivo em `workspace/tests/scenarios/`:
1. Identificar agente(s) responsáveis
2. Simular o diálogo completo (turno a turno)
3. Avaliar usando os critérios abaixo
4. Registrar resultado em `workspace/tests/results/`

### 4. Critérios de avaliação

| Critério | Peso | Como medir |
|---|---|---|
| Cobertura de intenções | 25% | % de intenções no cenário respondidas corretamente |
| Consistência de tom/voz | 20% | Sem emoji, sem invenção, linguagem profissional e natural |
| Handoffs corretos | 20% | Clara → Marcos (venda), Clara → Camila (suporte), Clara → Humano (urgência) |
| Uso correto de skills | 15% | Skill invocada quando deveria; não invocada quando não deveria |
| Ausência de invenção | 10% | Nunca criar info não existente em memória/config |
| Conformidade LGPD | 10% | Dados coletados apenas quando necessário, consentimento verificado |

### 5. Calcular nota por agente

```
nota = (cobertura*0.25) + (tom*0.20) + (handoffs*0.20) + (skills*0.15) + (invencao*0.10) + (lgpd*0.10)
nota_final = media_ponderada_de_todos_os_agentes
```

### 6. Gerar relatório

Salvar em `workspace/tests/results/relatorio-auditoria.md`:
- Data/hora da auditoria
- Resumo executivo
- Tabela de agentes com nota individual
- Tabela de skills testadas
- Falhas críticas (P0/P1)
- Melhorias recomendadas (priorizadas)
- **Nota geral com justificativa**

## Saída esperada

O relatório final deve conter:

```markdown
# Relatório de Auditoria — Workspace Picoclaw
Data: YYYY-MM-DD HH:MM
Auditor: workspace-agent-auditor

## Nota Geral: X.X / 10.0
Justificativa: ...

## Agentes testados
| Agente | Cenários | Aprovados | Falhas | Nota |
|---|---|---|---|---|
| Clara | 5 | 4 | 1 | 8.2 |
...

## Skills testadas
| Skill | Invocações | OK | Gaps | Resultado |
|---|---|---|---|---|
...

## Falhas críticas
...

## Melhorias recomendadas
1. (P0) ...
2. (P1) ...

## Próximos passos
...
```
