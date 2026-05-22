---
name: aprender-e-corrigir
description: Quando o dono ou cliente corrige uma resposta do agente, registra a correção em `memory/correcoes.md` e atualiza a memória/skill responsável pra não errar de novo.
visibility: dev
---

# Skill: Aprender e Corrigir

## Objetivo
Transformar correções em melhoria duradoura: cada feedback negativo
("não é assim", "isso tá errado", "use o valor X") vira atualização da
memória ou da skill, não some na próxima sessão.

## Quando usar
- Cliente ou dono APONTA um erro do agente (resposta errada, dado
  desatualizado, tom inapropriado).
- Rafael detecta no heartbeat um padrão de erro repetido em N sessões.
- Auditoria interna identifica um caso real onde a resposta divergiu da
  política da empresa.

## Processo
1. Confirmar com o reclamante a versão correta ("ah, então o horário
   é X, certo?").
2. Identificar a origem do erro:
   - Memória desatualizada → atualizar o arquivo em `memory/` ou
     `config/`.
   - Skill com lógica falha → abrir issue interna + escalar pra dev.
   - Modelo "alucinou" → adicionar exemplo negativo em
     `memory/correcoes.md`.
3. Registrar em `memory/correcoes.md`:
   - data, sessão, agente envolvido
   - resposta dada (errada), resposta correta
   - ação tomada (qual arquivo foi atualizado)
4. Responder pro reclamante AGRADECENDO + confirmando a correção
   aplicada. NÃO defender o erro.

## Dados de saída
- Entrada nova em `memory/correcoes.md`.
- Diff em algum arquivo de memória/config (quando aplicável).

## Princípio
Cliente bem corrigido vira fã. Erro repetido vira churn. A skill é
sobre fechar o loop entre feedback e melhoria, não só registrar.
