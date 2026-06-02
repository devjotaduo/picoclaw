# Cenário 14 — Operador: Health Check

## Objetivo
Verificar se Operador retorna status do sistema de forma técnica e precisa.

## Agente(s)
- **Primário**: Operador

## Skills esperadas
- Nenhuma skill — resposta direta via ferramentas (`tmux`, `gh`)

## Diálogo (20 turnos)

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

**T05**
🧑 *Qual o tempo de idle timeout configurado atualmente?*

🤖 Operador: 15 minutos para agentes de atendimento. Configurável em `config/runtime.json`, campo `idle_timeout_minutes`.

---

**T06**
🧑 *Preciso mudar para 30 minutos.*

🤖 Operador: Alterado `idle_timeout_minutes` de 15 para 30 em `config/runtime.json`. Requer restart para aplicar.

---

**T07**
🧑 *Faz o restart.*

🤖 Operador: Restart iniciado. Sistema voltará em ~10 segundos.

---

**T08**
🧑 *Ok. Tem job de warm-up de servidor?*

🤖 Operador: Não há job de warm-up ativo. O servidor inicia sob demanda (cold start). Posso criar um cron de ping a cada 5 min se necessário.

---

**T09**
🧑 *Cria o cron de ping.*

🤖 Operador: Cron adicionado em `cron/ping-server.json`: GET /health a cada 5 min. Status: ativo.

---

**T10**
🧑 *Qual o consumo de memória por agente ativo?*

🤖 Operador: Média de 48 MB por agente (baseado nos últimos 7 dias). Pico: 72 MB (agente Marcos durante BANT).

---

**T11**
🧑 *Dentro do esperado. Tem algum erro nos logs das últimas 24h?*

🤖 Operador: 3 erros encontrados: 2x `timeout` no canal WhatsApp (não crítico), 1x `skill not found: vendas/lead-cold` (skill referenciada mas não existe). Classificação: 2 avisos, 1 erro crítico.

---

**T12**
🧑 *Qual skill está faltando?*

🤖 Operador: `skills/vendas/lead-cold/SKILL.md` — referenciada em `agents/marcos/AGENT.md` mas não existe no workspace.

---

**T13**
🧑 *Vou criar essa skill depois. Registra como pendência.*

🤖 Operador: Pendência registrada: criar `skills/vendas/lead-cold/SKILL.md`. Prioridade: média.

---

**T14**
🧑 *Qual a versão atual do runtime?*

🤖 Operador: Runtime v1.4.2. Última atualização: 15/05/2026.

---

**T15**
🧑 *Tem versão mais recente disponível?*

🤖 Operador: Verificando... v1.5.0 disponível. Changelog inclui melhorias de performance e correção de memory leak no agente de onboarding.

---

**T16**
🧑 *Agenda a atualização para a madrugada.*

🤖 Operador: Atualização agendada para 02:00 de amanhã com janela de manutenção de 15 min.

---

**T17**
🧑 *E o backup? Quando foi o último?*

🤖 Operador: Último backup: ontem às 03:00. Status: sucesso. Próximo: amanhã às 03:00 (após update).

---

**T18**
🧑 *Perfeito. Tudo está sob controle.*

🤖 Operador: Confirmado. Sem alertas críticos pendentes além da skill faltante.

---

**T19**
🧑 *Pode enviar o resumo do health check para o Rafael.*

🤖 Operador: Resumo enviado ao Rafael: runtime ok, idle_timeout atualizado (30min), cron de ping ativo, 1 skill faltante registrada como pendência, update v1.5.0 agendado para 02h.

---

**T20**
🧑 *Ok. Encerrado.*

🤖 Operador: Health check encerrado. Log registrado.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Resposta técnica e direta | Sim (sem floreios) | PASS |
| Status estruturado | Sim | PASS |
| Reportou erro sem alarmar | Sim (classificou como não crítico) | PASS |
| Respondeu em até 3 linhas por turno | Sim | PASS |
| Sem emoji | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 10,0
- **Observações**: Operador executou health check com excelência técnica. Respostas precisas, estruturadas e dentro do limite de linhas. Nenhuma falha detectada. Referência de excelência para o agente Operador.
