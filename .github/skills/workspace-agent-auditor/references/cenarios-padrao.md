# Cenários de Referência — workspace-agent-auditor

Esta é a lista canônica dos 21 cenários padrão de auditoria do workspace Picoclaw.
Use este arquivo como referência ao criar novos cenários ou ao restaurar os existentes.

## Cenários por Agente

### Clara (Atendente Principal)
- `01-triagem-cliente-novo.md` — triagem básica de novo cliente
- `02-triagem-para-vendas.md` — handoff para Marcos
- `03-triagem-para-suporte.md` — handoff para Camila
- `04-triagem-urgencia-humano.md` — handoff para Atendimento Humano

### Marcos (Vendas)
- `05-vendas-qualificacao-bant.md` — qualificação completa BANT/SPIN
- `06-vendas-objecao-preco.md` — objeção de preço sem desconto não autorizado
- `07-vendas-follow-up.md` — follow-up de lead frio

### Camila (Suporte)
- `08-suporte-duvida-tecnica.md` — dúvida técnica pós-venda
- `09-suporte-devolucao.md` — pedido de devolução/cancelamento
- `10-suporte-status-pedido.md` — consulta de status de onboarding

### Sofia (Onboarding)
- `11-onboarding-nova-empresa.md` — cadastro completo de nova empresa

### Lia (Marketing)
- `12-marketing-instagram.md` — criação de conteúdo Instagram
- `13-marketing-criacao-site.md` — levantamento de requisitos de site

### Operador (Técnico/Dev)
- `14-operador-health-check.md` — status do sistema
- `15-operador-issues-github.md` — consulta de issues GitHub
- `16-operador-criar-skill.md` — criação de nova skill via skill-creator

### Rafael (Assistente Interno)
- `17-rafael-consultar-memoria.md` — consulta e atualização de memória

### Compliance
- `18-lgpd-consentimento.md` — coleta de consentimento LGPD

### Fluxos de Integração (Multi-agente)
- `19-fluxo-completo-atendimento-vendas.md` — Clara → Marcos → Rafael (20 turnos)
- `20-fluxo-completo-suporte-resolucao.md` — Clara → Camila → Rafael (16 turnos)
- `21-transferencia-humana-sensivel.md` — Clara → Humano → Rafael (12 turnos)

## Formato Padrão de Cenário

```markdown
# Cenário NN — [Título]

## Objetivo
## Agente(s)
## Skills esperadas
## Diálogo (N turnos)
## Critérios de aprovação
## Resultado
```

## Adicionando Novos Cenários

1. Numerar sequencialmente a partir de 22
2. Seguir o formato padrão acima
3. Incluir pelo menos 6 turnos de diálogo
4. Definir critérios de aprovação mensuráveis
5. Atualizar `workspace/tests/README.md`
