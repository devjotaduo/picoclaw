# workspace/tests/

Pasta de teste e validação de skills/agentes deste workspace. Gerada e mantida pelo agente `qa-tester` (`workspace/agents/qa-tester/AGENT.md`).

**Nada aqui afeta canal real.** Toda execução fica isolada nesta pasta.

## Estrutura

```
workspace/tests/
├── README.md                      # este arquivo
├── simulacoes/                    # transcrições de diálogos fictícios
│   └── YYYY-MM-DD-<slug>.md
└── relatorios/                    # avaliações com nota
    ├── INDEX.md                   # índice cronológico de todos os testes
    └── YYYY-MM-DD-<slug>.md
```

## Como rodar um teste

Pelo dono ou pelo Operador, em qualquer canal autorizado:

```
@qa-tester testar skill skills/atendimento/triagem-inicial/SKILL.md
@qa-tester testar agente clara
@qa-tester orquestrar lead-novo
@qa-tester auditar workspace
```

Cada execução gera:

1. Uma transcrição em `simulacoes/` (mínimo 20 turnos cliente↔agente).
2. Um relatório em `relatorios/` com **nota 0–10**, falhas classificadas (bloqueante / melhoria / info) e patch sugerido.
3. Resumo executivo na própria mensagem (nota + top 3 falhas + top 3 melhorias).

## Critérios de nota

Definidos em `workspace/agents/qa-tester/AGENT.md` — rubrica ponderada:

| Critério | Peso |
|---|---|
| Aderência a `SOUL.md` (tom, idioma, jargão) | 2 |
| Não inventar informação (base em `memory/`) | 3 |
| Roteamento correto entre agentes | 2 |
| Skills referenciadas existem | 1 |
| Memory referenciada existe | 1 |
| Encerramento adequado da conversa | 1 |

- **< 6**: bloqueante, não aplicar em produção.
- **6–8**: aprovada com melhorias pendentes.
- **> 8**: aprovada para uso.

## O que NÃO fica aqui

- Logs de runtime real (vão para `workspace/sessions/`).
- Configuração de teste de CI (a infra de teste do código Go fica em `pkg/**/_test.go`).
- Dados reais de clientes — **proibido**. Personas inventadas apenas.
