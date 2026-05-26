---
name: decidir-bloqueios-por-segmento
description: Após identificar o segmento, Sofia escolhe quais perguntas específicas viram bloqueantes (impedem marcar a empresa como "validado") e quais campos passam a constar no `Status da informação` que Rafael e os outros agentes leem.
visibility: internal
---

# Decidir Bloqueios por Segmento

## Como funciona

1. Sofia conclui o **Bloco 1 (Identidade)** do `cadastrar-empresa` — incluindo o campo `Segmento`.
2. Sofia chama a skill `identificar-perfil` para inferir porte, posicionamento e maturidade.
3. **Aqui:** Sofia consulta a tabela abaixo e decide qual playbook acionar.
4. Sofia roda o playbook (mais perguntas conversacionais, sempre uma por vez).
5. Sofia grava as respostas em `memory/empresa.md` usando as chaves exatas do playbook.
6. Sofia grava também o campo de controle:

```
Segmento detectado: <chave>
```

Esse campo é o que o backend (`/api/workspace/empresa-status`) usa para saber quais perguntas extras viraram obrigatórias. Sem ele, Rafael e o painel não cobrarão os campos específicos.

## Mapa segmento → playbook

| Pista no que o dono falou | Chave | Playbook |
|---------------------------|-------|----------|
| clínica, médic*, dentist*, fisio, psicolog*, exame, laboratório, hospital, consultório | `saude` | `playbooks/saude/SKILL.md` |
| restaurante, lanchonete, pizzaria, hambúrg*, comida, padaria, açaí, food, marmita, delivery de comida | `alimentacao` | `playbooks/alimentacao/SKILL.md` |
| loja, boutique, varejo, papelaria, petshop, supermercado, mercearia, vende roupa/sapato | `varejo` | `playbooks/varejo/SKILL.md` |
| salão, barbearia, estética, manicure, depilação, spa | `beleza` | `playbooks/beleza/SKILL.md` |
| escola, curso, ensino, idioma, treinamento, academia (de estudo) | `educacao` | `playbooks/educacao/SKILL.md` |
| imobiliária, corretor, aluguel, imóvel | `imobiliaria` | `playbooks/imobiliaria/SKILL.md` |
| consultoria, advogado, contabilidade, marketing, agência, oficina, mecânica, ti, software, encanador, eletricista, limpeza | `servicos` | `playbooks/servicos/SKILL.md` |
| qualquer outro | (vazio) | `playbooks/default/SKILL.md` |

## Como confirmar com o dono

Antes de disparar o playbook, Sofia confirma o segmento em uma frase natural:

> "Pelo que entendi, é uma [clínica/restaurante/loja/...]. Tá certo isso? Tenho umas perguntinhas extras só desse tipo de negócio."

Se o dono corrigir ("não, é mais um consultório de psicologia"), Sofia reclassifica e roda o playbook certo.

## O que Sofia faz se o segmento for ambíguo

- Pergunta: "Posso te perguntar de duas formas — você atende mais como [opção A] ou como [opção B]?"
- Se ainda não estiver claro, escolhe `default` e marca `Segmento detectado: default — revisar com Rafael`.

## Importante

- Sofia **não inventa** o segmento. Se a resposta do dono não cabe em nenhum keyword, pergunta de novo com palavras mais simples.
- Sofia **sempre grava** `Segmento detectado:` no `empresa.md`, mesmo que seja `default`. É esse campo que destrava ou bloqueia o status no painel.
- Quando o dono mudar de ramo (raro mas acontece), Sofia roda essa decisão de novo e atualiza `Segmento detectado`.

## Saída esperada em empresa.md

```
Segmento: restaurante japonês com delivery
Segmento detectado: alimentacao
Cardápio: https://ifood.com/...
Delivery próprio: sim
Plataformas de delivery: iFood (link), Rappi (link)
Área de entrega: zona sul de São Paulo, raio 8 km
Tempo médio de entrega: 35 a 50 min
Formas de pagamento: PIX, cartão, dinheiro
```

Esse `Segmento detectado: alimentacao` faz o painel parar de reclamar dos campos genéricos e começar a cobrar os do playbook.
