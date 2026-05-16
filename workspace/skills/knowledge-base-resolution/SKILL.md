---
name: knowledge-base-resolution
description: Buscar solução na base oficial de conhecimento antes de escalar um caso de suporte. Ativar quando houver dúvida operacional, problema técnico, erro recorrente ou pergunta que possa ter runbook, FAQ, política, status page ou procedimento documentado.
---

# Knowledge Base Resolution

## Princípios

- A base oficial tem prioridade sobre memória, opinião e resposta genérica.
- Procurar solução documentada antes de abrir incidente ou encaminhar para engenharia.
- Não inventar procedimento quando a base não cobrir o caso.
- Registrar lacunas recorrentes para melhoria da base.

## Workflow

1. Identificar o problema em uma frase curta: produto, tela, ação, erro e impacto.
2. Buscar em fontes oficiais disponíveis no workspace: `AGENT.md`, políticas, FAQ, runbooks, módulos de produto/serviço e histórico autorizado.
3. Comparar a solução encontrada com o contexto coletado:
   - Se a solução se aplica, orientar passo a passo e validar se resolveu.
   - Se a solução parece parcial, informar a limitação e coletar o dado que falta.
   - Se não houver solução, preparar escalonamento com contexto completo.
4. Nunca apresentar hipótese como regra oficial. Use linguagem como "não encontrei essa informação na base configurada" quando faltar evidência.
5. Quando uma pergunta recorrente não tiver resposta clara, sugerir atualização da base de conhecimento.

## Exemplos

**Cenário**: "Não consigo emitir a segunda via."
- Correto: verificar se há procedimento oficial de segunda via, orientar os passos e confirmar se a pessoa conseguiu.
- Incorreto: inventar caminho de menu não documentado.

**Cenário**: "A integração está retornando erro 401."
- Correto: buscar runbook de autenticação/API, conferir causas comuns e pedir logs sanitizados se necessário.
- Incorreto: escalar direto sem verificar token expirado, ambiente ou credencial.

## Encaminhamento

Escalar quando:

- A base não tiver solução aplicável.
- A solução oficial falhar após validação com a pessoa.
- O problema envolver possível bug, indisponibilidade, perda de dados ou risco de segurança.
- A ação exigida depender de permissão humana, ambiente de produção ou exceção de política.
