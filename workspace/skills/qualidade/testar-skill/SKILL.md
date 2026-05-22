---
name: testar-skill
description: Pipeline completo de teste de uma skill ou agente do workspace — gera diálogo simulado, orquestra os agentes envolvidos, valida resposta contra memória/SOUL/regras e produz relatório com nota.
visibility: dev
---

# testar-skill

## Objetivo

Validar uma skill ou agente do workspace de ponta a ponta, sem tocar em canais reais, e produzir um relatório acionável com nota numérica (0–10) e lista de melhorias.

## Quando usar

- Após criar ou editar uma skill (`workspace/skills/<area>/<nome>/SKILL.md`).
- Após editar `AGENT.md`, `SOUL.md` ou `behavior.json` de qualquer agente.
- Como smoke test antes de aplicar template ao live runtime.
- Quando o dono reportar "fulano está respondendo errado" — usa para reproduzir.

## Processo

1. **Carregar alvo.** Ler o `SKILL.md` ou `AGENT.md` informado. Extrair:
   - frontmatter (name, visibility, skills declaradas)
   - skills referenciadas no corpo (`skills/X/Y/SKILL.md`)
   - memórias referenciadas (`memory/Z.md`)
   - regras citadas (do `AGENTS.md`, `SOUL.md`)
2. **Verificar dependências.** Para cada skill e memory referenciadas, checar se o arquivo existe. Se não existir, marcar falha de tipo `DEPENDENCIA_QUEBRADA`.
3. **Gerar diálogo.** Chamar `simular-dialogo` com o cenário inferido (compra, suporte, agendamento, fora de horário, conteúdo sensível, etc.). Pelo menos **20 turnos**.
4. **Orquestrar.** Se o fluxo cruza vários agentes (ex.: Clara → Marcos), chamar `orquestrar-agentes` para simular o handoff.
5. **Validar cada turno do agente.** Para cada resposta gerada:
   - Conferir se o conteúdo tem base em `memory/empresa.md`, `memory/faq.md`, etc.
   - Conferir tom contra `SOUL.md`.
   - Conferir se o roteamento (chamar Marcos/Camila/Humano) está correto.
   - Conferir se a skill citada existe.
6. **Calcular nota.** Aplicar a rubrica do `AGENT.md` do `qa-tester`. Nota = soma ponderada arredondada a 1 casa.
7. **Gerar relatório.** Chamar `gerar-relatorio-teste` com nota, lista de falhas (severidade: bloqueante/melhoria/info) e lista de melhorias sugeridas.

## Dados de entrada

- `target_path`: caminho do `SKILL.md` ou `AGENT.md` a testar.
- `cenarios` (opcional): lista de cenários customizados. Se vazio, infiro a partir da skill.
- `agentes_envolvidos` (opcional): override do roteamento.

## Dados de saída

- Arquivo de transcrição em `workspace/tests/simulacoes/<YYYY-MM-DD>-<slug>.md`.
- Arquivo de relatório em `workspace/tests/relatorios/<YYYY-MM-DD>-<slug>.md`.
- Resposta direta na mensagem: nota + top 3 falhas + top 3 melhorias + link para os 2 arquivos.

## Falhas comuns que esta skill detecta

- Skill referencia `memory/X.md` que não existe.
- Skill referencia outra skill inexistente.
- Agente cita "horário das 9 às 18" mas `memory/empresa.md` está em branco.
- Clara responde dúvida de venda em vez de chamar Marcos.
- Camila usa emoji apesar de SOUL.md proibir.
- Sofia tenta usar canal externo (WhatsApp) sem `canais-autorizados.md`.
- Luna assume turno em horário comercial (deveria ser noturna/fim de semana).
