# HEARTBEAT

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

