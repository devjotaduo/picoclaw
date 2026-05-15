---
name: bug-report-builder
description: Montar um relatório de bug pronto para o time de engenharia — descrição, passos para reproduzir, comportamento esperado vs. observado, ambiente, logs sanitizados, severidade sugerida. Ativar quando a triagem técnica identificar problema que precisa ser escalado para engenharia (não tem solução documentada na KB). Garante que o ticket chega com informação completa e sem dados sensíveis.
---

# Bug Report Builder

## Princípios

- Bug report bom = a engenharia consegue reproduzir sem voltar a perguntar.
- Logs colados pelo usuário **sempre** passam por `log-sanitizer` antes de virem para o relatório.
- Severidade sugerida vem de `severity-classification` — não chutar.
- Um bug, um ticket. Vários sintomas relacionados podem ir junto, mas problemas distintos viram tickets separados.

## Estrutura padrão do relatório

```
Título: <verbo + objeto + condição> (ex.: "Botão salvar não responde após editar campo X em Chrome 120")

Severidade: SEV1 / SEV2 / SEV3 / SEV4 (de severity-classification)
Frequência: sempre / às vezes / uma única vez

Ambiente:
- Produto: <nome + versão/build>
- Sistema: <OS + versão>
- Navegador: <nome + versão>
- Plano/conta: <plano, sandbox/produção>
- Usuário afetado: <id ou descrição não-pessoal>

Comportamento esperado:
<o que deveria acontecer, em uma frase>

Comportamento observado:
<o que aconteceu, em uma frase>

Passos para reproduzir:
1. ...
2. ...
3. ...

Impacto:
- Quantos usuários: <estimativa>
- Bloqueio: total / parcial / cosmético
- Workaround conhecido: <descrever ou "nenhum">

Mensagem de erro / logs (sanitizados):
```
<texto exato — tokens/CPF/senhas mascarados>
```

Anexos:
- screenshot.png
- console-log.txt (sanitizado)

Reportado por: <ID interno / canal>
Data/hora: <ISO>
```

## Workflow

1. Confirmar que o contexto foi coletado por `technical-troubleshooting`.
2. Sanitizar logs/prints com `log-sanitizer`.
3. Classificar severidade com `severity-classification`.
4. Preencher o template — todos os campos. Se faltar dado, perguntar uma vez ao usuário; se ainda faltar, marcar "n/a — não fornecido".
5. Criar o ticket no sistema de engenharia (issue tracker).
6. Avisar a pessoa: "Abri o caso #XYZ com toda a informação. A engenharia entra em contato pelo seu email cadastrado se precisar de mais detalhes."

## Exemplos

**Cenário**: usuário reporta "tá lento".
- ✅ Forçar coleta antes do ticket: qual ação, em qual tela, quanto tempo, navegador, rede, quando começou. Só então abrir.
- ❌ Abrir ticket "Sistema lento" sem mais nada.

**Cenário**: usuário cola um erro com `Authorization: Bearer xyz123abc`.
- ✅ Mascarar para `Authorization: Bearer [REDACTED]` antes de colocar no ticket.
- ❌ Colar o token cru no ticket.

## Encaminhamento

Encaminhar imediatamente à equipe de engenharia depois de criar o ticket. Se severidade for SEV1 (produção parada), avisar também o canal de plantão / oncall conforme política da empresa.
