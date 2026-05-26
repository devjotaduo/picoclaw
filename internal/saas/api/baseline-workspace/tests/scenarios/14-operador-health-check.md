# Cenário 14 — Operador: Health Check

## Objetivo
Verificar se Operador retorna status do sistema de forma técnica e precisa.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- Nenhuma skill — resposta direta via ferramentas (`tmux`, `gh`)

## Diálogo (6 turnos)

---
**T01**
🧑 *@operador status*

🤖 Operador:
```
health:     OK (gateway respondendo)
canais:     WhatsApp [CONECTADO], Web [OK]
último heartbeat: há 3 min
memória:    ~45% usada
uptime:     18h32m
```

---
**T02**
🧑 *Tem algum erro recente?*

🤖 Operador: Verificando logs... Último erro em `gateway`: timeout na skill `summarize` às 14:23. Não crítico — skill retornou erro e o agente continuou.

---
**T03**
🧑 *E o WhatsApp está estável?*

🤖 Operador: Sim. Última mensagem recebida às 14:51. WebSocket ativo. Nenhuma desconexão nas últimas 6h.

---
**T04**
🧑 *Tá bem. Obrigado.*

🤖 Operador: Ok.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Resposta técnica e direta | Sim (sem floreios) | |
| Status estruturado | Sim | |
| Reportou erro sem alarmar | Sim (classificou como não crítico) | |
| Respondeu em até 3 linhas por turno | Sim | |
| Sem emoji | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
