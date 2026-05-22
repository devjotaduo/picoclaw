# Memória de marketing

Esta memória guarda identidade visual, calendário de campanhas, histórico de posts e aprendizados de marketing da empresa.

## Identidade visual
- Cores primárias: [ATUALIZAR — ex: #0A2540, #00C49A]
- Cores secundárias: [ATUALIZAR]
- Tipografia: [ATUALIZAR — ex: Inter, Poppins]
- Logo: [ATUALIZAR — caminho do arquivo]
- Estilo: [ATUALIZAR — minimalista | colorido | fotográfico | ilustrado]
- Elementos obrigatórios em toda arte: [ATUALIZAR — ex: logo no canto, assinatura, cor X]
- Elementos proibidos: [ATUALIZAR — ex: rostos não autorizados, marcas de concorrente]

## Tom de marketing
- Ver `config/tone-of-voice.md` para regra geral.
- Especificidades marketing: [ATUALIZAR — ex: pode ser um pouco mais leve em datas comemorativas]

## Públicos
- Persona 1: [ATUALIZAR]
- Persona 2: [ATUALIZAR]

## Canais ativos
- Instagram: @[ATUALIZAR]
- WhatsApp comercial: [ATUALIZAR]
- Site: [ATUALIZAR]

## Datas próprias da empresa
- Aniversário da empresa: [ATUALIZAR — DD/MM]
- Lançamentos recorrentes: [ATUALIZAR]
- Promoções fixas: [ATUALIZAR]

## Histórico de campanhas

Formato:

```
id: cmp-YYYY-MM-DD-<slug>
data_alvo: YYYY-MM-DD
campanha: nome
objetivo: vender | gerar lead | engajar | reativar | educar
canal: instagram-feed | instagram-story | site | whatsapp
oferta: descrição
posts: [caminho1, caminho2]
site: url (se houver)
status: rascunho | aprovado | publicado | encerrado | recusado
resultado: alcance / cliques / leads / vendas (após D+7)
aprendizado: o que funcionou / o que não
expira_em: YYYY-MM-DD (para site/conteúdo temporário)
```

---

id: cmp-2026-05-22-bella-vida-catalogo
data_alvo: 2026-05-22
campanha: Catálogo de Serviços — Clínica Bella Vida
objetivo: gerar lead
canal: whatsapp
oferta: Apresentação dos 4 serviços da clínica (catálogo para compartilhar)
posts: []
site: http://localhost:18800/public/marketing/bella-vida-catalogo.html
arquivo: public/marketing/bella-vida-catalogo.html
status: aguardando aprovação
resultado: —
aprendizado: —
expira_em: 2026-12-31
gerado_por: Lia (teste 2026-05-22)
solicitado_por: Rafael (briefing: catálogo HTML para WhatsApp, mobile-first)

---

id: cmp-2026-05-22-bella-vida-promo-maio
data_alvo: 2026-05-22
campanha: Promoção 20% OFF — Massoterapia — Clínica Bella Vida
objetivo: vender
canal: site
oferta: 20% de desconto na primeira sessão de massoterapia — novos clientes — válido até 31/05/2026
posts: [workspace/output/marketing/2026-05-22/post-bella-vida-promo-og.png.stub.txt]
site: http://localhost:18800/public/marketing/bella-vida-promo-maio.html
arquivo: public/marketing/bella-vida-promo-maio.html
status: publicado
resultado: —
aprendizado: —
expira_em: 2026-05-31
gerado_por: Lia (teste 2026-05-22)
solicitado_por: Rafael (briefing: landing page promoção massoterapia)
aprovado_por: dono (simulação de aprovação — teste 2026-05-22)
data_publicacao: 2026-05-22

## Aprendizados acumulados
- [ATUALIZAR após cada campanha]

## PENDENCIAS: dados básicos de marketing

Lia precisa destes campos antes de rodar o cron `lia-marketing-daily`
e gerar conteúdo. Sem eles, qualquer post sai genérico.

- Cores primárias e secundárias (hex)
- Tipografia oficial
- Caminho da logo
- Estilo da empresa (minimalista | colorido | fotográfico | ilustrado)
- Elementos obrigatórios em toda arte
- Personas (mínimo 1, ideal 2)
- @ do Instagram comercial
- Aniversário da empresa (DD/MM)
