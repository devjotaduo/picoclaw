---
name: playbook-servicos
description: Perguntas extras obrigatórias para prestadores de serviço (consultoria, advocacia, contabilidade, marketing, mecânica, encanador, etc.).
visibility: internal
segment: servicos
---

# Playbook — Serviços

## Quando rodar

`Segmento detectado: servicos` — consultoria, advocacia, contabilidade, marketing, agência, oficina, mecânica, TI, software, encanador, eletricista, limpeza, etc.

## Perguntas (uma por mensagem)

### 1. Como gera orçamento (BLOQUEANTE)

> "Como você passa orçamento pro cliente? Visita, formulário, conversa por WhatsApp?"

Aprofundar:
> "A equipe pode dar valores aproximados ou tudo passa por você?"

**Grava:**
```
Como gera orçamento: <texto>
```

### 2. Prazo padrão (BLOQUEANTE)

> "Em quanto tempo você costuma entregar o serviço?"

Aceitar resposta variável:
> "Pode ser tipo 'de 3 a 7 dias dependendo do caso'."

**Grava:**
```
Prazo padrão: <texto>
```

### 3. Forma de cobrança (BLOQUEANTE)

> "Você cobra como? Por hora, por projeto, mensal, à vista, parcelado?"

**Grava:**
```
Forma de cobrança: <texto>
```

### 4. Garantia (opcional)

> "Tem garantia do serviço? Por quanto tempo, em que condições?"

**Grava:**
```
Garantia: <texto ou "não">
```

## Sinais de alerta

- Se for advocacia/contabilidade → Sofia anota: "nunca dar parecer jurídico/contábil — sempre transferir para o profissional."
- Se for serviço urgente (encanador, eletricista 24h) → "Quando chamar humano" ganha "emergência fora do horário".

## Handoff para Rafael

> "Tá tudo do seu serviço anotado. O Rafael te avisa quando chegar orçamento pra fechar, prazo apertando, ou cliente irritado."
