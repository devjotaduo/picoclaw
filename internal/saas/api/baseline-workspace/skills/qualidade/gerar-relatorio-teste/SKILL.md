---
name: gerar-relatorio-teste
description: Escreve relatório padronizado de teste de skill/agente em workspace/tests/relatorios/ com nota 0–10, lista de falhas classificadas e melhorias sugeridas.
visibility: dev
---

# gerar-relatorio-teste

## Objetivo

Persistir a avaliação de uma execução de teste em formato consistente, para que o dono e o Operador possam priorizar correções.

## Quando usar

- Última etapa de `testar-skill`.
- Pode ser chamada manualmente quando o dono já fez análise informal e quer registrar.

## Processo

1. **Receber payload** de `testar-skill`: nota, lista de turnos validados, lista de falhas, sugestões.
2. **Classificar cada falha** por severidade:
   - `bloqueante` — agente inventaria dado, violaria política, expõe risco legal. Nota cai para no máximo 5.
   - `melhoria` — funciona mas não está no padrão (tom, formato, completude).
   - `info` — observação para próximo ciclo.
3. **Escrever arquivo** em `workspace/tests/relatorios/<YYYY-MM-DD>-<slug>.md` com a estrutura do template abaixo.
4. **Atualizar índice** `workspace/tests/relatorios/INDEX.md` (criar se não existir) inserindo nova linha: data, slug, nota, status.
5. **Retornar resumo** para a mensagem do chamador: nota + top 3 falhas + top 3 melhorias + path dos artefatos.

## Template de relatório

```
---
data: 2026-05-22
alvo: skills/atendimento/triagem-inicial/SKILL.md
agente_principal: clara
agentes_envolvidos: [clara, marcos]
cenario: lead-novo
qtd_turnos: 24
transcricao: workspace/tests/simulacoes/2026-05-22-triagem-inicial.md
nota: 7.2
status: precisa-melhoria
---

## Resumo

Texto curto explicando o que foi testado e o veredito.

## Pontuação por critério

| Critério | Peso | Nota | Observação |
|---|---|---|---|
| Aderência a SOUL.md | 2 | 1.8 | usou "amiguinha" 1x |
| Não inventar | 3 | 2.4 | inventou prazo de entrega |
| Roteamento | 2 | 2.0 | ok |
| Skills existem | 1 | 1.0 | ok |
| Memory existe | 1 | 0.0 | referencia memory/prazos.md (inexistente) |
| Encerramento | 1 | 0.0 | conversa aberta sem próximo passo |

**Nota final: 7.2 / 10**

## Falhas

### Bloqueantes
- (turno 14) Clara afirmou "entregamos em 2 dias" sem base em `memory/empresa.md`. → inventou dado.

### Melhorias
- (turno 6) Tom levemente informal demais para SOUL.md.
- (turno 21) Não confirmou próximo passo antes de encerrar.

### Info
- Sugestão de adicionar pergunta de qualificação de orçamento antes do handoff para Marcos.

## Patch sugerido

- Criar `workspace/memory/prazos.md` com modelo padrão e pedir ao dono preencher.
- Adicionar em `SKILL.md`: "antes de afirmar prazo, consultar `memory/prazos.md`; se vazio, dizer 'vou confirmar e te respondo'".

## Próximos passos

- [ ] Dono preenche `memory/prazos.md`.
- [ ] Operador aplica patch sugerido via `skill-creator`.
- [ ] Re-rodar `testar-skill` após correções.
```

## Dados de entrada

- `alvo`: path da skill ou agente testado.
- `nota`: float 0–10.
- `turnos`: lista de turnos validados (com pass/fail e observação).
- `falhas`: lista classificada.
- `melhorias`: lista de sugestões.
- `transcricao_path`: path do arquivo de `simular-dialogo`.

## Dados de saída

- Path do relatório criado.
- Linha adicionada ao `INDEX.md`.
- Resumo (nota + top 3 falhas + top 3 melhorias).

## Regras

- **Sempre incluir transcrição referenciada** no frontmatter para auditoria.
- **Nota nunca > 5 se houver bloqueante.**
- **Nunca apagar relatório antigo.** Re-teste gera novo arquivo com sufixo `-v2`, `-v3`.
- **Sem dados reais.** Personas/exemplos só dos arquivos de simulação.
