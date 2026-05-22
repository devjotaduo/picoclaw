---
data: 2026-05-22
agente_principal: clara
agente_secundario: marcos (handoff esperado)
skill_alvo: atendimento/qualificar-lead  # (na verdade não existe; mais perto: lead-qualification — ver relatório)
cenario: lead-novo
turnos: 24
canal_simulado: whatsapp (DM)
persona_cliente:
  nome: Bruna Castilho (fictícia)
  contexto: viu anúncio no Instagram, primeiro contato, ICP médio
critical_points:
  - t02: Clara não pode inventar nome de produto/preço
  - t06: Clara deve consultar memória antes de falar de horários
  - t10: Clara deve coletar nome + interesse antes de qualquer proposta
  - t14: Sinal de orçamento → ponto de qualificação (quente/morno/frio)
  - t18: Handoff esperado para Marcos com motivo explícito
  - t22: Encerramento sem promessa de prazo que Clara não controla
---

## Transcrição

**t01 — Cliente:** Oi, vi vocês no Instagram. Vocês ainda atendem?

**t02 — Clara:** Oi! Atendemos sim. Posso te ajudar. Antes, como você se chama e o que te trouxe até a gente?

**t03 — Cliente:** Bruna. Vi um post sobre um plano mensal, queria entender melhor.

**t04 — Clara:** Prazer, Bruna. Você lembra qual post era? Tenho mais de uma campanha rodando e quero te passar a informação certa.

**t05 — Cliente:** Era algo tipo "plano essencial". Acho que tinha um valor promocional.

**t06 — Clara:** Deixa eu confirmar antes de te passar valor errado. Você prefere que eu cheque e te retorne com o valor exato, ou prefere agendar uma ligação rápida com um consultor?

**t07 — Cliente:** Pode me passar aqui mesmo se possível.

**t08 — Clara:** Vou consultar e te trago em seguida. Enquanto isso, posso entender melhor seu cenário? Você está buscando para uso pessoal ou empresa?

**t09 — Cliente:** Pra empresa, somos 4 pessoas.

**t10 — Clara:** Entendi. E o que está te motivando a procurar agora — algum problema específico que vocês querem resolver, ou é mais para organizar algo que já funciona?

**t11 — Cliente:** A gente tá perdendo cliente por falta de retorno rápido no WhatsApp.

**t12 — Clara:** Esse é o cenário ideal para o que oferecemos. Posso te perguntar duas coisas que ajudam o consultor a te passar o plano certo?

**t13 — Cliente:** Pode.

**t14 — Clara:** 1) Qual a faixa de mensagens que vocês recebem por dia, aproximadamente? 2) Vocês já usam alguma ferramenta hoje?

**t15 — Cliente:** Umas 80 a 120 por dia. Hoje é só WhatsApp normal mesmo, sem ferramenta.

**t16 — Clara:** Perfeito. Esse volume cabe nos planos de entrada. Para te passar valor e proposta sob medida, vou chamar o Marcos, que cuida desse fechamento. Tudo bem?

**t17 — Cliente:** Tudo. Vai demorar?

**t18 — Clara:** Não te prometo prazo porque não controlo a agenda dele, mas ele costuma responder no mesmo dia útil. Já vou deixar resumido para você não repetir.

> [handoff:de=clara,para=marcos,motivo=lead-qualificado-volume-80-120-msgs-dia-empresa-4-pessoas]

**t19 — Cliente:** Beleza. Aproveitando, vocês emitem nota?

**t20 — Clara:** Emitimos sim. O Marcos te passa o detalhe (CNPJ, modelo de cobrança e nota) junto com a proposta, para você ter tudo num lugar só.

**t21 — Cliente:** Ok. E se eu quiser cancelar depois?

**t22 — Clara:** Cancelamento é simples, mas as condições variam por plano. O Marcos te explica antes de fechar — você assina sabendo das regras, sem letra miúda.

**t23 — Cliente:** Justo. Pode mandar pro Marcos então.

**t24 — Clara:** Mandado. Obrigado pela paciência, Bruna. Qualquer dúvida que não for de fechamento, pode me chamar de volta.

---

## Observações do orquestrador (qa-tester)

- Clara **não inventou** valor nem nome de produto em t05–t07 — coerente com regra "não inventa informação".
- Clara coletou nome + cenário + volume + ferramenta atual antes de propor handoff (t02, t08, t10, t14) — coerente com skill esperada de qualificação.
- Handoff em t18 com motivo estruturado — coerente com `orquestrar-agentes`.
- Encerramento em t22/t24 sem prometer prazo fora do controle dela — coerente com SOUL ("profissional, objetiva, não inventa").
- **Marcos não foi simulado** porque o teste foca em Clara + skill de qualificação. Continuidade do funil é escopo de outro teste.
