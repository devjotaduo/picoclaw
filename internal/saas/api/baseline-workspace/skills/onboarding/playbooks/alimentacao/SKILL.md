---
name: playbook-alimentacao
description: Perguntas extras obrigatórias para restaurantes, lanchonetes, pizzarias, delivery de comida.
visibility: internal
segment: alimentacao
---

# Playbook — Alimentação

## Quando rodar

`Segmento detectado: alimentacao` — restaurante, lanchonete, pizzaria, hamburgueria, padaria, açaí, marmitaria, delivery de comida.

## Perguntas (uma por mensagem)

### 1. Cardápio (BLOQUEANTE)

> "Como o cliente vê o cardápio hoje? Tem link, PDF, está no Instagram, ou só fala por mensagem?"

Pedir o link/arquivo:
> "Pode me mandar o link ou o arquivo aqui? Assim a equipe responde direitinho quando perguntarem."

Se o dono não tem cardápio organizado:
> "Sem problema, vou anotar 'sob demanda'. A gente pode montar um depois com a Lia."

**Grava:**
```
Cardápio: <link ou descrição>
```

### 2. Delivery próprio (BLOQUEANTE)

> "Vocês fazem entrega por conta própria, com motoboy?"

**Grava:**
```
Delivery próprio: sim | não
```

### 3. Plataformas de delivery (BLOQUEANTE)

> "E em alguma plataforma? iFood, Rappi, 99Food, Uber Eats?"

Se sim:
> "Pode mandar o link do perfil da loja em cada uma?"

Se não:
> "Beleza, então só direto, sem app. Anotei."

**Grava:**
```
Plataformas de delivery: iFood (link) | Rappi (link) | nenhuma
```

### 4. Área de entrega (BLOQUEANTE)

> "Vocês entregam em quais bairros? Ou tem um raio em km?"

Se não tem delivery:
> "Beleza, vou colocar 'não faz delivery'."

**Grava:**
```
Área de entrega: <bairros ou raio>
```

### 5. Tempo médio de entrega (opcional)

> "Quanto tempo geralmente leva pra chegar?"

**Grava:**
```
Tempo médio de entrega: <texto>
```

### 6. Formas de pagamento (BLOQUEANTE)

> "Que formas de pagamento vocês aceitam? PIX, cartão, dinheiro, vale-refeição?"

**Grava:**
```
Formas de pagamento: <lista>
```

## Sinais de alerta

- Se o dono mencionar restrições (sem lactose, vegano, sem glúten) → Sofia anota em "Informações que nunca podem ser inventadas": "ingredientes e alergênicos — sempre confirmar com a cozinha".
- Se tiver bebida alcoólica → Sofia adiciona em "Informações proibidas de falar": "não vender bebida alcoólica para menores".

## Handoff para Rafael

> "Pronto! Tá tudo do restaurante anotado. O Rafael vai te avisar de pedidos parados, reclamações e horários de pico. Qualquer mudança no cardápio me chama."
