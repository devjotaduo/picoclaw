---
name: playbook-varejo
description: Perguntas extras obrigatórias para lojas, boutiques, papelarias, petshops, supermercados.
visibility: internal
segment: varejo
---

# Playbook — Varejo

## Quando rodar

`Segmento detectado: varejo` — loja física ou online, boutique, papelaria, petshop, supermercado, mercearia.

## Perguntas (uma por mensagem)

### 1. Catálogo (BLOQUEANTE)

> "Onde a equipe pode ver os produtos? Tem catálogo online, site, ou está mais no Instagram?"

Se Instagram:
> "Pode me mandar o @ pra eu anotar?"

Se site:
> "Manda o link, por favor."

Se nada:
> "Sem problema, então vou colocar 'consultar o dono'. Depois a Lia pode te ajudar a montar."

**Grava:**
```
Catálogo: <link, @ ou descrição>
```

### 2. Estoque atualizado (BLOQUEANTE)

> "A equipe pode confirmar quando um produto está disponível na hora? Ou o estoque muda muito e é melhor confirmar com você?"

**Grava:**
```
Tem estoque atualizado: sim | não — sempre confirmar com o dono
```

### 3. Política de troca (BLOQUEANTE)

> "E sobre troca e devolução, qual a regra? Prazo? Quem paga o frete da devolução?"

**Grava:**
```
Política de troca: <texto>
```

### 4. Faz entrega (BLOQUEANTE)

> "Vocês entregam? Pelos Correios, motoboy, retirada na loja?"

Se sim:
> "Pra onde entrega? Qualquer lugar do Brasil ou só na região?"

**Grava:**
```
Faz entrega: <sim/não + como + onde>
```

## Sinais de alerta

- Se vende produto controlado (medicamento, arma, álcool) → Sofia adiciona automaticamente em "Informações proibidas de falar".
- Se atende criança → "Quando chamar humano" ganha "qualquer dúvida sobre faixa etária ou segurança".

## Handoff para Rafael

> "Tá tudo da loja anotado. O Rafael vai te alertar quando aparecer venda boa, cliente reclamando ou produto sumindo do estoque."
