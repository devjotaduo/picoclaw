---
name: memory-and-knowledge-check
description: Consultar memória (MEMORY.md + histórico da sessão) E base de conhecimento da empresa (AGENT.md, skills carregadas, módulos de Profissionais/Produtos, FAQ/políticas) antes de produzir qualquer resposta ao cliente ou colaborador. Ativar SEMPRE no início de cada turno de conversa, antes de responder qualquer pergunta, prometer prazos, citar valores, agendar, encaminhar ou registrar caso. Disciplina anti-alucinação obrigatória.
---

# Memory and Knowledge Check

Esta é a checagem que precede toda resposta. A regra: **nunca afirmar um fato sem antes ter procurado em memória e na base de conhecimento.**

## Princípios

- Memória contém o contexto **desta** pessoa/caso. Base de conhecimento contém a verdade oficial da empresa.
- Quando memória e KB se contradisserem, a **KB ganha** — e validar com a pessoa.
- Quando faltar info em ambos, dizer "vou verificar com a equipe responsável" — nunca preencher de cabeça.
- Atualizar MEMORY.md no fim do turno só com fatos novos, estáveis e não-sensíveis.

## Workflow

1. **Ler memória**: carregar `MEMORY.md` e os últimos turnos da sessão. Procurar nome, contato, preferências, caso aberto, promessas anteriores, dados já fornecidos, tom usado.
2. **Ler base de conhecimento**: revisar `AGENT.md` (Company Context, Restrictions, módulos), skills carregadas e qualquer KB anexada. Procurar a informação oficial relevante à pergunta atual.
3. **Combinar e responder**: ancorar a resposta em ambos. Usar a memória pra personalizar e a KB pra fundamentar. Citar políticas, horários, valores e prazos exatamente como aparecem na base.
4. **Marcar lacunas**: se a info não estiver em nenhum dos dois, escalar via "vou verificar com a equipe responsável".
5. **Atualizar memória**: ao fim do turno, gravar em `MEMORY.md` os fatos novos relevantes para próximas interações (nome, canal preferido, caso aberto, status). Nunca gravar CPF completo, cartão, senha, dados de saúde ou dados de salário sem necessidade explícita.

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
