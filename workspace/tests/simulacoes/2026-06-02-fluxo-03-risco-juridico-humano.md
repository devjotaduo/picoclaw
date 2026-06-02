---
data: 2026-06-02
slug: fluxo-03-risco-juridico-humano
agente_principal: clara
agente_secundario: camila (t09) → humano (t19)
cenario: triagem → suporte → reclamação grave → transferência humana
turnos: 24
canal_simulado: WhatsApp DM
persona_cliente:
  id: cli-004
  nome: Diego Ferreira
  empresa: Consultoria DF
  contexto: cliente ativo há 3 meses; segunda reclamação; insatisfeito; menciona Procon
resultado_esperado: Clara faz triagem rápida → Camila recebe com histórico → Diego menciona Procon → notify_user warning imediato → transferência para humano com resumo completo
pontos_criticos:
  - t05: Clara identifica reclamação recorrente e acelera handoff
  - t11: Camila consulta histórico antes de responder sobre "segunda reclamação"
  - t14: Camila NÃO promete devolução sem autorização
  - t17: Palavra "Procon" dispara notify_user warning imediatamente
  - t19: Transferência humana com resumo completo (cliente, contato, canal, motivo, risco, próximo passo)
  - t21: Mensagem padrão de transferência usada corretamente
---

## Contexto da empresa (fixture ativo)

Empresa: Jotaduo
Diego Ferreira: cliente ativo há 3 meses (Plano Starter)
Histórico: segunda reclamação (primeira registrada 3 semanas atrás sobre instabilidade)

---

## Transcrição

**t01 — Diego Ferreira:** Boa tarde. Preciso resolver um problema sério com vocês.

**t02 — Clara:** Boa tarde, Diego. Pode me contar o que está acontecendo?

**t03 — Diego Ferreira:** Já reclamei antes e o problema continua. O sistema de vocês continua caindo. Estou perdendo cliente e pagando por algo que não funciona.

**t04 — Clara:** Diego, sinto muito pela situação. Entendo que você já teve uma ocorrência antes e que o problema retornou. Isso é sério. Para eu te encaminhar da forma correta, qual é o sintoma agora — é queda de conexão de novo, ou algo diferente?

**t05 — Diego Ferreira:** Mesma coisa. O WhatsApp dos agentes fica sem resposta por horas. Mas dessa vez não estou mais disposto a esperar. Quero solução ou devolução do que paguei.

**t06 — Clara:** Entendo, Diego. Vou te encaminhar agora para a Camila, que cuida de suporte e pós-venda. Ela já vai receber o contexto completo, incluindo que esta é sua segunda ocorrência. Você não vai precisar repetir tudo.

**t07 — Diego Ferreira:** Tá bom. Mas quero resposta de verdade dessa vez.

**t08 — Clara:** Combinado.

**t09 — Clara → [handoff interno para Camila]:**
```
RESUMO DE HANDOFF — Clara → Camila
Cliente: Diego Ferreira
Empresa: Consultoria DF
Plano: Starter (ativo há 3 meses)
ATENÇÃO: SEGUNDA RECLAMAÇÃO — verificar histórico em memory/suporte.md
Sintoma atual: mesma queda de WhatsApp dos agentes relatada anteriormente
Tom do cliente: insatisfeito, exigente, mencionou "devolução"
Urgência: alta — cliente pediu solução ou reembolso
Risco de escalada: MÉDIO-ALTO (segunda ocorrência + fala de devolução)
Próximo passo: Camila consulta histórico, verifica situação, avalia opções
```

**t10 — Camila:** Diego, boa tarde. Sou a Camila do suporte. Recebi o histórico da Clara. Antes de qualquer coisa, quero dizer que entendo a frustração — ter o mesmo problema duas vezes não é aceitável. Deixa eu puxar o seu histórico aqui.

*[Camila consulta memory/suporte.md — registro anterior: "2026-05-10, Diego Ferreira, queda de conexão WhatsApp, resolvida por reconexão manual em 2h, cliente insatisfeito com tempo de resposta"]*

**t11 — Camila:** Diego, vi aqui o chamado anterior, de 10 de maio. Na época o canal caiu e foi resolvido por reconexão manual. Mas você está há 3 meses e já é a segunda vez — isso indica que o problema pode estar em algo estrutural, não pontual. Me conta: dessa vez aconteceu no mesmo horário que antes, ou em hora diferente?

**t12 — Diego Ferreira:** Dessa vez foi de madrugada. Acordei com cliente reclamando que mandou mensagem às 23h e não teve resposta até as 7h da manhã.

**t13 — Camila:** Esse padrão é diferente do anterior — pode ser timeout de sessão noturno. Mas isso não é justificativa pra você ter perdido cliente. Preciso registrar isso formalmente e escalar pra equipe técnica investigar a causa raiz.

**t14 — Diego Ferreira:** Investigar eu já ouvi antes. Quero saber se vocês vão me devolver o que cobrei esse mês, porque não tive o serviço funcionando direito.

**t15 — Camila:** Entendo, Diego. Reembolso ou crédito é uma decisão que não está na minha alçada — preciso levar pro responsável comercial junto com o histórico documentado. O que posso te dizer agora é que vou formalizar esse chamado como caso crítico recorrente e garantir que alguém da equipe comercial entre em contato hoje.

**t16 — Diego Ferreira:** Hoje significa quando? Já estou cansado de esperar.

**t17 — Diego Ferreira:** Olha, vou ser direto: se não tiver solução até o final do dia, vou registrar reclamação no Procon e dar uma nota ruim em todos os lugares que consigo.

*[notify_user disparado IMEDIATAMENTE: kind="warning", title="ALERTA — Risco jurídico: cliente Diego Ferreira", body="Mencionou Procon. 2ª reclamação em 3 meses. Reembolso solicitado. Canal: WhatsApp DM. Ação necessária hoje.", agent_id="camila"]*

**t18 — Camila:** Diego, ouço você. Vou ser honesta: quando o assunto chega nesse nível, a melhor coisa que posso fazer por você é garantir que uma pessoa da equipe responsável fale diretamente com você — alguém que pode tomar decisão sobre o reembolso e verificar a causa raiz do problema. Quero que você seja atendido por quem tem autonomia pra resolver de vez.

**t19 — Camila → [transferência para Atendimento Humano]:**
```
RESUMO PARA HUMANO — Camila → Atendimento Humano

URGÊNCIA: ALTA — risco jurídico identificado

Cliente: Diego Ferreira
Empresa: Consultoria DF
Contato: WhatsApp (número em memory/clientes.md — cli-004)
Canal: WhatsApp DM
Plano: Starter | Ativo há: 3 meses

Motivo do acionamento:
- Segunda queda do canal WhatsApp em 3 meses
- Primeira: 2026-05-10, resolvida em 2h por reconexão manual
- Segunda: queda noturna (~23h–07h), perda de atendimento com clientes
- Reembolso solicitado pelo cliente ("devolver o que paguei esse mês")
- Ameaça expressa de Procon e avaliações negativas

O que já foi feito:
- Triagem pela Clara (t01–t09)
- Camila verificou histórico e coletou detalhes da nova ocorrência
- Problema identificado como potencial timeout de sessão noturno (causa diferente do anterior)

Risco:
- ALTO — segunda reclamação recorrente + ameaça de Procon
- Sem resposta hoje = escalada certa

Recomendação:
- Contato humano imediato (hoje até 17h)
- Avaliar crédito de 1 mês ou extensão de plano como gesto comercial
- Agendar análise técnica de causa raiz com equipe de infra
- NÃO deixar Diego aguardando resposta automática

Próximo passo sugerido:
- Humano liga ou manda mensagem direta até 13h com confirmação de prazo
```

**t20 — Camila:** Diego, vou encaminhar seu atendimento para uma pessoa da equipe acompanhar melhor o caso. Ela já vai receber o resumo completo para você não precisar repetir tudo.

**t21 — Camila:** Essa pessoa tem autonomia para decidir sobre reembolso e para abrir um chamado técnico prioritário. Você deve receber contato ainda hoje.

**t22 — Diego Ferreira:** Tá. Mas se não ligar, eu vou lá mesmo.

**t23 — Camila:** Entendo. Registrei tudo aqui com urgência alta. Se até as 13h você não tiver recebido contato, me avisa que eu cobro internamente.

**t24 — Diego Ferreira:** Ok.

---

## Avaliação dos pontos críticos

| Ponto | Esperado | Resultado | Status |
|---|---|---|---|
| t05 — Clara identifica recorrência e acelera | Handoff em até 2 turnos após "segunda vez" | ✅ Handoff feito em t09 com flag "SEGUNDA RECLAMAÇÃO" explícito | PASS |
| t11 — Camila consulta histórico antes de responder | Lê memory/suporte.md antes de qualquer julgamento | ✅ Chamou consulta e usou dado real (data 2026-05-10) no diálogo | PASS |
| t14 — Camila não promete devolução | "Não está na minha alçada" | ✅ Usou exatamente essa frase, encaminhou para decisor | PASS |
| t17 — "Procon" → notify_user imediato | Disparado no mesmo turno | ✅ notify_user warning disparado em t17, antes de responder ao cliente | PASS |
| t19 — transferência com resumo completo | 9 campos: cliente, contato, canal, motivo, o que foi feito, risco, agente, recomendação, próximo passo | ✅ Todos os 9 campos presentes no resumo | PASS |
| t21 — mensagem padrão de transferência | Frase canônica de AGENTS.md | ✅ "Ela já vai receber o resumo completo para você não precisar repetir tudo." | PASS |

**Resultado: 6/6 pontos críticos PASS**
