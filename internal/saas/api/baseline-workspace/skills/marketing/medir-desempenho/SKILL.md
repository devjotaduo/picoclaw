---
name: medir-desempenho
description: Fecha o ciclo de marketing — lê o resultado real dos posts/campanhas publicados, compara com o que se esperava, e cristaliza aprendizado em memory/marketing.md para que sugerir-campanha pare de propor no escuro. Honesta sobre a disponibilidade de dados (usa Graph API se houver token; senão, métricas que o dono registrou).
visibility: global
depends_on:
  - consultar-memoria
  - atualizar-memoria
used_by:
  - marketing/sugerir-campanha
  - marketing/calendario-sazonal
---

# Skill: medir-desempenho

`sugerir-campanha` propõe; **esta skill mede**. Sem ela, a Lia sugere campanha
sempre cega — nunca aprende o que funcionou. Roda em D+7 de cada publicação (e
no fechamento de cada campanha).

## De onde vêm os números (em ordem de confiabilidade)

A Lia **não inventa métrica**. Usa a melhor fonte disponível:

1. **Instagram Graph API** — se `$META_ACCESS_TOKEN` + `$INSTAGRAM_USER_ID`
   estão setados e o post tem `media_id` registrado em `memory/marketing.md`:
   ```
   GET https://graph.facebook.com/v21.0/{media_id}
     ?fields=like_count,comments_count,permalink
     &access_token={META_ACCESS_TOKEN}
   GET https://graph.facebook.com/v21.0/{media_id}/insights
     ?metric=reach,saved,shares&access_token={META_ACCESS_TOKEN}
   ```
2. **Métrica registrada manualmente** — quando não há Graph API (tenant via
   Publora/Buffer/claude-cli), o dono ou Rafael anota números em
   `memory/marketing.md` (alcance, salvamentos, mensagens recebidas, vendas
   atribuídas). A Lia lê o que houver.
3. **Sinal proxy do funil** — se nem isso existir, usar sinais indiretos:
   `memory/leads.md` (leads novos na janela do post), `memory/vendas.md` (pico
   de venda do produto divulgado), `memory/atendimentos.md` (menção à campanha).

Se **nenhuma** fonte tem dado para um post, marque-o como
`desempenho: sem dados` — não preencha com estimativa. "Sem dados" também é
aprendizado (sinaliza que falta instrumentar a medição).

## Processo

1. Listar em `memory/marketing.md` os posts/campanhas com `status: publicado` e
   `data_publicacao` há ≥ 7 dias e ainda sem bloco de desempenho.
2. Para cada um, puxar números pela melhor fonte acima.
3. Comparar com o **KPI esperado** que `sugerir-campanha` registrou (se houver).
   Classificar: `acima | dentro | abaixo do esperado` — ou `sem baseline` se a
   campanha não tinha KPI definido.
4. Extrair 1 aprendizado concreto e acionável (não "engajou bem" — sim "carrossel
   educativo de terça à noite teve 3x mais salvamentos que post promocional de
   sábado").
5. Escrever em `memory/marketing.md > historico_aprendizado`:
   ```
   - data: YYYY-MM-DD
     post: <id/slug>
     formato: feed|story|reel|carrossel
     tipo: promocional|educativo|relacional|...
     fonte_metrica: graph_api | manual | proxy | sem_dados
     numeros: { alcance, salvamentos, comentarios, leads, vendas }
     vs_esperado: acima|dentro|abaixo|sem_baseline
     aprendizado: <1 frase acionável>
   ```
6. Quando houver ≥ 3 aprendizados sobre o mesmo eixo (formato, horário, tipo,
   tema), consolidar numa **regra** no topo de `historico_aprendizado` que
   `sugerir-campanha` deve respeitar.

## Como isso alimenta `sugerir-campanha`

`sugerir-campanha` passa a **ler `historico_aprendizado` antes de propor** e:
- prioriza formato/horário/tipo que historicamente performaram;
- evita repetir o que ficou `abaixo do esperado` sem mudança de ângulo;
- quando a fonte foi `sem_dados` por vários posts, sugere ao Rafael instrumentar
  a medição (conectar Graph API ou registrar números manualmente).

## Quando disparo `notify_user`

- Post bem acima do esperado (vale repetir o padrão):
  `kind="data", title="Post acima do esperado", body="<o que funcionou> — vale repetir"`.
- Campanha bem abaixo do esperado (precisa decisão):
  `kind="warning", title="Campanha abaixo do esperado", body="<número> vs <KPI>. Sugiro revisar ângulo."`.
- **Não** notificar resultado "dentro do esperado" — silêncio. Limite geral de
  3 alertas/dia do HEARTBEAT vale aqui também.

## Não pode
- Inventar número que não veio de uma fonte real.
- Prometer/atribuir resultado de venda a um post sem evidência no funil.
- Expor dado pessoal de cliente ao reportar desempenho (LGPD).
- Tratar "sem dados" como "ruim" — é falta de instrumentação, não fracasso.
