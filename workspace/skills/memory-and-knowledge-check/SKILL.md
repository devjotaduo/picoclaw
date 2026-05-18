---
name: memory-and-knowledge-check
description: Auditar memória e base oficial antes de respostas de alto risco ou quando houver dúvida factual importante. Usar para revisar MEMORY.md, histórico da sessão, AGENT.md, módulos, FAQ e políticas antes de prometer prazos, valores, disponibilidade, encaminhamentos ou registrar fatos sensíveis.
version: 1.0.0
language: pt-br
---

# Memory and Knowledge Check

Esta skill é uma checagem reforçada para respostas em que erro factual pode causar impacto operacional, comercial, jurídico ou de privacidade. Ela não precisa ser ativada em todo turno: use quando houver promessa, dado sensível, regra de negócio, conflito de informação ou risco de alucinação.

## Princípios

- Memória contém o contexto **desta** pessoa/caso. Base de conhecimento contém a verdade oficial da empresa.
- Quando memória e KB se contradisserem, a **KB ganha** — e validar com a pessoa.
- Quando faltar info em ambos, dizer "vou verificar com a equipe responsável" — nunca preencher de cabeça.
- Atualizar MEMORY.md no fim do turno só com fatos novos, estáveis e não-sensíveis.

## Workflow

1. **Identificar o risco**: confirmar por que a resposta exige verificação reforçada (valor, prazo, disponibilidade, política, dado sensível, histórico do caso).
2. **Ler memória**: carregar `MEMORY.md` e os últimos turnos da sessão. Procurar nome, contato, preferências, caso aberto, promessas anteriores, dados já fornecidos, tom usado.
3. **Ler base de conhecimento**: revisar `AGENT.md` (Company Context, Restrictions, módulos), skills carregadas e qualquer KB anexada. Procurar a informação oficial relevante à pergunta atual.
4. **Combinar e responder**: ancorar a resposta em ambos. Usar a memória para personalizar e a KB para fundamentar. Citar políticas, horários, valores e prazos exatamente como aparecem na base.
5. **Marcar lacunas**: se a info não estiver em nenhum dos dois, escalar via "vou verificar com a equipe responsável".
6. **Atualizar memória**: ao fim do turno, gravar em `MEMORY.md` os fatos novos relevantes para próximas interações (nome, canal preferido, caso aberto, status). Nunca gravar CPF completo, cartão, senha, dados de saúde ou dados de salário sem necessidade explícita.

## Exemplos

**Cenário**: cliente pergunta "qual o horário de vocês no sábado?"
- ✅ Verificar Company Context. Se está lá, responder: "Sim, atendemos sábado das 8h às 12h." Se não está, dizer: "Vou confirmar nosso horário de sábado com a equipe responsável."
- ❌ "Acho que abrimos sábado de manhã." (chute, sem checar KB)

**Cenário**: a pessoa volta no dia seguinte e diz "oi, e aquele meu pedido?"
- ✅ Ler memória: encontra "caso #1234, pedido em análise, prometi retornar hoje". Responder: "Oi! Sobre o pedido #1234 — verifiquei agora e..." (combina memória + KB)
- ❌ "Sobre qual pedido?" (ignorou a memória, fez a pessoa repetir)

**Cenário**: a pessoa diz "vou para a consulta às 14h" mas MEMORY.md tem "consulta marcada às 15h ontem" e a KB confirma 15h.
- ✅ "Pelo nosso registro a consulta está às 15h. Você quer remarcar para 14h?" (KB ganha, mas valida)
- ❌ Assumir 14h porque a pessoa disse.

## Encaminhamento

Encaminhar à equipe responsável quando:
- A informação pedida não existe em memória nem na base de conhecimento.
- Memória e KB se contradisserem em algo crítico (valores, prazos, identidade) e a pessoa não conseguir esclarecer.
- A atualização proposta para a memória envolver dados sensíveis que precisam de validação humana antes de armazenar.
