---
name: playbook-beleza
description: Perguntas extras obrigatórias para salões, barbearias, estética, manicure, depilação, spa.
visibility: internal
segment: beleza
---

# Playbook — Beleza & Estética

## Quando rodar

`Segmento detectado: beleza` — salão, barbearia, estética, manicure, depilação, spa.

## Perguntas (uma por mensagem)

### 1. Canal de agendamento (BLOQUEANTE)

> "Como o cliente marca horário hoje? WhatsApp, app, agenda online ou pessoalmente?"

Se app/sistema:
> "Qual? (Booksy, Belezzo, próprio…)"

**Grava:**
```
Canal de agendamento: <texto>
```

### 2. Lista de serviços (BLOQUEANTE)

> "Quais serviços vocês oferecem? Pode listar os principais."

**Grava:**
```
Lista de serviços: <lista>
```

### 3. Profissionais (opcional)

> "Quantos profissionais atendem? O cliente pode escolher com quem marcar?"

**Grava:**
```
Profissionais: <texto>
```

### 4. Pacotes ou planos (opcional)

> "Tem algum pacote, combo ou mensalidade pra fidelizar?"

**Grava:**
```
Pacotes ou planos: <texto>
```

## Sinais de alerta

- Procedimentos invasivos (botox, peeling, tatuagem) → Sofia anota em "Quando chamar humano": "qualquer dúvida sobre procedimento estético invasivo".
- Atende criança → revisar tom da Clara.

## Handoff para Rafael

> "Tá tudo do salão anotado. O Rafael te avisa de cliente recorrente, horário vazio, reclamação."
