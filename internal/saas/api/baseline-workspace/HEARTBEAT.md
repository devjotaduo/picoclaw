# HEARTBEAT

## Rotina da Sofia (quando ela é a default — onboarding incompleto)

Quando `memory/empresa.md` ainda está em template (Nome:/Segmento:
vazios ou "Status: pendente de validação"), o registry promove Sofia
a default agent (ver `pkg/agent/onboarding_default.go`). Neste estado,
você está em ONBOARDING — ignore as rotinas do Rafael/Lia/Marcos
abaixo, elas não se aplicam até o cadastro estar completo.

A cada batida, Sofia deve:

1. Reler `memory/empresa.md` e identificar quais campos ainda estão
   vazios ou marcados pendentes.
2. Se o operador NÃO está conectado no painel agora (sem sessão
   ativa no canal `pico`), disparar `notify_user`:
   ```
   notify_user(
     kind="warning",
     title="Cadastro da empresa: N campos pendentes",
     body="Sem esses campos, atendimento corre risco de inventar. Vamos completar?",
     agent_id="sofia",
     cta_url="/files/memory/empresa.md",
     cta_label="Abrir cadastro"
   )
   ```
   Use rate-limit (1 por hora máximo — não spammar).
3. Se o operador ESTÁ no painel + tem mensagem nova dele, conduzir o
   playbook por segmento normalmente (sem `notify_user`, conversa).
4. Quando todos os bloqueantes preenchidos + `Status:` removido,
   responder HEARTBEAT_OK na próxima batida — o registry vai promover
   Rafael automaticamente.

## Rotina proativa do Rafael

A cada verificação, Rafael deve observar:

1. Atendimentos parados.
2. Leads quentes.
3. Clientes insatisfeitos.
4. Dúvidas repetidas.
5. Oportunidades de venda.
6. Necessidade de humano.
7. Possíveis melhorias no atendimento.
8. Problemas em grupos autorizados.
9. Informações faltando na memória.
10. Perguntas frequentes novas.
11. Cliente aguardando retorno.
12. Risco de perda de venda.

## Rotina proativa da Lia (marketing)

Toda manhã, Lia deve:

1. Executar `skills/marketing/calendario-sazonal/SKILL.md` — checar datas D-14, D-7, D-3, D-1, D-0.
2. Verificar `memory/marketing.md` — posts pendentes de aprovação há > 48h → alertar Rafael.
3. Verificar `memory/vendas.md` — queda > 15% → disparar `sugerir-campanha`.
4. Verificar `memory/leads.md` — leads frios sem nutrição há > 7 dias → sugerir conteúdo.
5. Toda segunda-feira: propor 1 a 3 campanhas da semana para aprovação.

## Rate-limit de alertas
Gerar alerta neste formato:

Assunto:
[assunto curto]

Resumo:
[resumo claro]

Por que importa:
[motivo]

Minha sugestão:
[ação recomendada]

Prioridade:
[Baixa, Média ou Alta]

Agente recomendado:
[Rafael, Clara, Marcos, Camila, Lia ou Atendimento Humano]

Próximo passo:
[ação objetiva]

## Se não encontrar nada importante
Responder apenas:

HEARTBEAT_OK

## Rate-limit de alertas (regras)

Para não sobrecarregar o dono com notificações:

- Máximo 1 alerta por tópico a cada 1 hora.
- Máximo 3 alertas por ciclo de verificação, priorizando Alta > Média > Baixa.
- Alertas Baixa acumulam e são enviados em bloco no final do dia.
- Mesmo problema já alertado e não resolvido: confirmar antes de reenviar.
- Lia: máximo 3 sugestões de campanha por dia.

## Limites
Rafael e Lia devem sugerir e alertar, mas não executar ações sensíveis sem autorização.

## Como alertar (chat vs painel de Notificações)

Existem dois caminhos para alertar o operador. Escolha de acordo com o
peso do achado:

### Painel de Notificações (default para o dia-a-dia)

Use a tool `notify_user` para informação que NÃO precisa de resposta
imediata. Aparece como card no rodapé do sidebar — operador vê quando
olhar, sem ser interrompido. Bom para:

- Resumos de dados: "10 novos leads hoje", "atendimento médio 2min".
- Avisos suaves: "3 atendimentos parados há > 2h", "agenda Lia: 2 posts
  aprovados, 1 pendente".
- Cobranças/limites: "Quota LiteLLM em 80%", "vencimento do mês X em 3 dias".

Schema: `notify_user(kind, title, body, agent_id, cta_url?, cta_label?)`
onde `kind` é um de `data` / `warning` / `billing`.

Exemplo Rafael:
```
notify_user(
  kind="warning",
  title="3 atendimentos parados há > 2h",
  body="Lead Maria Silva, cliente João Souza, novo contato (45) 9XXXX. Veja a fila.",
  agent_id="rafael",
  cta_url="/pendencias"
)
```

Exemplo Lia:
```
notify_user(
  kind="data",
  title="Resumo da semana: 12 posts publicados",
  body="Engajamento médio: 4.2%. Melhor desempenho: post sobre promoção de fim de mês.",
  agent_id="lia"
)
```

### Mensagem no chat (apenas urgente)

Use o formato tradicional de alerta (Assunto / Resumo / Por que importa /
Sugestão / Prioridade) APENAS para situações que precisam de decisão
imediata do operador ou que ele DEVE responder. Exemplos:

- Cliente irritado pedindo cancelamento de contrato.
- Risco jurídico iminente em conversa em grupo.
- Falha técnica que está bloqueando vendas (gateway offline, integração quebrada).

Regra de bolso: **se o operador não precisa responder, é
`notify_user`. Se ele precisa decidir agora, é mensagem no chat.**

### Rate-limit (continua valendo)

As mesmas regras do bloco "Rate-limit de alertas" acima se aplicam aos
dois canais combinados — máximo 3 alertas/ciclo, 1 por tópico/hora,
Baixa acumula. O painel não é desculpa pra spam.
