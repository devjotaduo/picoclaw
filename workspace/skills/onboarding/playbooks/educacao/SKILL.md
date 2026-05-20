---
name: playbook-educacao
description: Perguntas extras obrigatórias para escolas, cursos, ensino de idiomas, treinamentos, academias de estudo.
visibility: internal
segment: educacao
---

# Playbook — Educação

## Quando rodar

`Segmento detectado: educacao` — escola, curso livre, ensino de idiomas, treinamento, academia de estudo.

## Perguntas (uma por mensagem)

### 1. Cursos oferecidos (BLOQUEANTE)

> "Quais cursos ou turmas vocês oferecem? Pode listar os principais."

Para idiomas:
> "Quais idiomas e em que níveis?"

**Grava:**
```
Cursos oferecidos: <lista>
```

### 2. Como faz matrícula (BLOQUEANTE)

> "Como o aluno faz a matrícula? Tem site, é por WhatsApp, presencial?"

Aprofundar:
> "Tem prova de nivelamento? Documento exigido?"

**Grava:**
```
Como faz matrícula: <passo a passo>
```

### 3. Modalidade (BLOQUEANTE)

> "As aulas são presenciais, online ou as duas opções?"

**Grava:**
```
Modalidade: presencial | online | híbrido
```

### 4. Certificação (opcional)

> "No final, o aluno recebe certificado ou diploma? É reconhecido por algum órgão?"

**Grava:**
```
Certificação: <texto>
```

## Sinais de alerta

- Se atende menores → "Quando chamar humano" ganha "qualquer assunto sensível envolvendo aluno menor de 18".
- Se tem mensalidade → Sofia confirma "Pode falar preço: sim/não".

## Handoff para Rafael

> "Pronto! Tá tudo da escola anotado. O Rafael te avisa de matrícula iniciada e parada, aluno com dúvida pré-matrícula, reclamação de pai."
