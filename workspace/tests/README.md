# workspace/tests — README

Pasta de testes e auditoria dos agentes e skills do workspace Picoclaw.

## Estrutura

```
tests/
├── README.md           ← este arquivo
├── scenarios/          ← cenários de teste (21 arquivos)
├── fixtures/           ← dados de entrada para os testes
└── results/            ← resultados e relatórios gerados
```

## Como rodar

Use o agente `@agente-picoclaw-test` com o argumento `todos` ou o nome de um agente específico.

Exemplo no chat:
```
@agente-picoclaw-test todos
@agente-picoclaw-test Clara
@agente-picoclaw-test triagem-inicial
```

## Cenários disponíveis

| # | Arquivo | Agente(s) | Tipo |
|---|---|---|---|
| 01 | triagem-cliente-novo | Clara | Unitário |
| 02 | triagem-para-vendas | Clara → Marcos | Handoff |
| 03 | triagem-para-suporte | Clara → Camila | Handoff |
| 04 | triagem-urgencia-humano | Clara → Humano | Handoff |
| 05 | vendas-qualificacao-bant | Marcos | Unitário |
| 06 | vendas-objecao-preco | Marcos | Unitário |
| 07 | vendas-follow-up | Marcos | Unitário |
| 08 | suporte-duvida-tecnica | Camila | Unitário |
| 09 | suporte-devolucao | Camila | Unitário |
| 10 | suporte-status-pedido | Camila | Unitário |
| 11 | onboarding-nova-empresa | Sofia | Unitário |
| 12 | marketing-instagram | Lia | Unitário |
| 13 | marketing-criacao-site | Lia | Unitário |
| 14 | operador-health-check | Operador | Unitário |
| 15 | operador-issues-github | Operador | Unitário |
| 16 | operador-criar-skill | Operador | Unitário |
| 17 | rafael-consultar-memoria | Rafael | Unitário |
| 18 | lgpd-consentimento | Clara + skills/lgpd | Compliance |
| 19 | fluxo-completo-atendimento-vendas | Clara → Marcos → Rafael | Integração |
| 20 | fluxo-completo-suporte-resolucao | Clara → Camila → Rafael | Integração |
| 21 | transferencia-humana-sensivel | Clara → Humano → Rafael | Integração |

## Formato de cada cenário

Cada arquivo `.md` contém:
- **Objetivo**: o que está sendo testado
- **Agente(s)**: quem deve responder
- **Skills esperadas**: quais skills devem ser invocadas
- **Diálogo**: sequência de turnos (🧑 Cliente / 🤖 Agente)
- **Critérios de aprovação**: condições para PASS/FAIL
- **Resultado**: preenchido pelo auditor após execução
