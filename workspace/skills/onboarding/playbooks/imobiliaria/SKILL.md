---
name: playbook-imobiliaria
description: Perguntas extras obrigatórias para imobiliárias e corretores autônomos.
visibility: internal
segment: imobiliaria
---

# Playbook — Imobiliária

## Quando rodar

`Segmento detectado: imobiliaria` — imobiliária, corretor autônomo, locação por temporada, etc.

## Perguntas (uma por mensagem)

### 1. Tipos de imóvel (BLOQUEANTE)

> "Vocês trabalham com aluguel, venda ou os dois? Residencial, comercial, temporada?"

**Grava:**
```
Tipos de imóvel: <texto>
```

### 2. Regiões atendidas (BLOQUEANTE)

> "Em quais bairros ou cidades vocês têm imóveis?"

**Grava (também usa o campo padrão `Regiões atendidas`):**
```
Regiões atendidas: <lista>
```

### 3. Como agenda visita (BLOQUEANTE)

> "Como o cliente agenda uma visita ao imóvel? WhatsApp, site, falando direto com corretor?"

**Grava:**
```
Como agenda visita: <texto>
```

## Sinais de alerta

- Sempre anotar em "Informações que nunca podem ser inventadas": "valor exato de aluguel, condomínio, IPTU — confirmar com a imobiliária".
- "Quando chamar humano": "qualquer pedido de proposta, negociação, documentação".

## Handoff para Rafael

> "Tá tudo anotado. O Rafael te avisa de visita marcada, proposta entrando, lead frio que voltou."
