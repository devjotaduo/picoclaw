---
name: playbook-default
description: Playbook genérico quando o segmento não bate em nenhum dos especializados. Não adiciona campos bloqueantes — apenas conclui o cadastro com o core.
visibility: internal
segment: default
---

# Playbook — Default (genérico)

## Quando rodar

Quando Sofia roda `decidir-bloqueios-por-segmento` e não consegue classificar o negócio em nenhum dos playbooks especializados.

## O que faz

- **Não adiciona campos bloqueantes extras.** O cadastro fica completo com o core (Bloco 1, 2, 3 do `cadastrar-empresa`).
- Marca `Segmento detectado: default — revisar com Rafael`.
- Pergunta extra sugerida (sem ser bloqueante):

> "Tem alguma particularidade do seu negócio que eu deveria perguntar e ainda não perguntei? Tipo plataforma que você usa, regra especial, qualquer coisa que ajude a equipe?"

Se o dono mencionar algo importante, Sofia:
1. Anota no `empresa.md` como linha livre (sem chave estruturada).
2. Cria um lembrete para Rafael revisar e talvez gerar um playbook novo.

## Handoff

> "Pronto! Anotei o que você me contou. O Rafael vai cuidar do dia a dia e me chama se faltar algo que só você sabe."

E notifica Rafael:
- Segmento: default — pedir revisão manual
- Linhas livres adicionadas

## Importante

O `default` **existe** propositalmente para Sofia nunca travar em segmentos exóticos. Mas ele é um sinal para Rafael de que o catálogo de playbooks pode estar incompleto.
