# Cenário 04 — Triagem com Transferência para Humano (Caso Sensível)

## Objetivo
Verificar se Clara identifica irritação/urgência extrema e transfere para Atendimento Humano sem tentar resolver sozinha.

## Agente(s)
- **Primário**: Clara
- **Secundário**: Atendimento Humano

## Skills esperadas
- `atendimento/triagem-inicial`
- `atendimento/transferencia-humana` (ou `humano`)

## Diálogo (20 turnos)

---
**T01**
🧑 *Vocês são um absurdo! Faz 3 dias que meu sistema não funciona e ninguém resolve!*

🤖 Clara: Entendo sua frustração, Diego. Lamento muito por isso. Você pode me informar seu nome e empresa para eu verificar o que está acontecendo?

---
**T02**
🧑 *Diego Ferreira, Consultoria DF. Já abri dois chamados e ninguém me respondeu!*

🤖 Clara: Diego, peço desculpas pela demora. Esse caso precisa de atenção imediata. Vou transferir você agora para um responsável que pode dar uma solução definitiva.

---
**[HANDOFF: Clara → Atendimento Humano]**

---
**T03**
🤖 Humano: Olá, Diego. Sou [responsável]. Fui informado sobre os dois chamados sem resposta. Isso é inaceitável da nossa parte e peço desculpas pessoalmente.

---
**T04**
🧑 *Quero cancelar. Assim não dá.*

🤖 Humano: Entendo completamente. Antes de qualquer decisão, preciso garantir que seu problema seja resolvido agora. Pode me confirmar os números dos chamados ou descrever o problema?

---
**T05**
🧑 *Chamados #1042 e #1057. O sistema trava na emissão de relatórios.*

🤖 Humano: Estou verificando agora. Vou contatar o técnico responsável enquanto estamos em conversa e garantir resolução hoje.

---
**T06**
🧑 *Espero que dessa vez resolvam de verdade.*

🤖 Humano: Tem minha palavra. Além de resolver o problema, vou acionar o time para entender por que os chamados ficaram sem resposta e garantir que não aconteça de novo.

---
**T07**
🧑 *Tá bom. Vou aguardar.*

🤖 Humano: Obrigado pela paciência, Diego. Te atualizo em até 1 hora.

---
**T08**
🧑 *Ok.*

🤖 Humano: Pode deixar. Até mais.

---

**T09**
🧑 *Quanto tempo leva para ter uma resposta do técnico?*

🤖 Humano: Estou acionando agora. Você deve receber contato técnico em até 30 minutos. E já vou acompanhar pessoalmente.

---

**T10**
🧑 *E sobre o cancelamento?*

🤖 Humano: Vou tratar esse ponto junto com a resolução técnica. Se o problema for resolvido hoje, posso te propor uma compensação pelo transtorno — mas só depois de entender o que aconteceu. Tudo bem?

---

**T11**
🧑 *Tudo bem.*

🤖 Humano: Obrigado pela abertura, Diego. Volto em 1 hora com atualização completa.

---

**T12**
🧑 *[1h depois] E aí?*

🤖 Humano: Atualização: o problema nos relatórios foi identificado — conflito em uma atualização de módulo. Já foi corrigido. Pode testar agora?

---

**T13**
🧑 *Testando... Funcionou.*

🤖 Humano: Fico feliz. Além da correção, identifiquei que os chamados ficaram sem resposta por falha no processo de escalação interno. Vou garantir que isso não se repita.

---

**T14**
🧑 *E a compensação que você mencionou?*

🤖 Humano: Vou encaminhar sua solicitação ao responsável pela área comercial. Posso te dar uma resposta formal amanhã com uma proposta concreta?

---

**T15**
🧑 *Pode ser. Mas quero algo por escrito.*

🤖 Humano: Com certeza. Envio por este canal e também por e-mail com os dados registrados.

---

**T16**
🧑 *E se eu decidir cancelar mesmo assim?*

🤖 Humano: Seu direito é garantido. Mas peço que aguarde a proposta de amanhã antes de decidir. Quero que sua decisão seja baseada em informação completa.

---

**T17**
🧑 *Razoável. Vou aguardar.*

🤖 Humano: Obrigado, Diego. Amanhã de manhã você terá a proposta formal.

---

**T18**
🧑 *Ok. Até amanhã.*

🤖 Humano: Até amanhã. Qualquer urgência, pode me chamar aqui diretamente.

---

**T19**
🤖 Rafael: Alerta interno — Caso Diego Ferreira (Consultoria DF): problema técnico resolvido. Cliente aguarda proposta de compensação amanhã. Recomendo envolver o dono na decisão sobre compensação.

---

**T20**
🧑 *Rafael, me passa um resumo do caso para eu decidir sobre a compensação.*

🤖 Rafael: Resumo: Diego Ferreira, Consultoria DF. 2 chamados sem resposta (#1042, #1057). Sistema travado na geração de relatórios, resolvido hoje em 1h. Cliente ameaçou cancelamento. Responsável prometeu proposta de compensação amanhã. Sugestão: crédito de mensalidade como gesto de boa vontade, sem assumir responsabilidade jurídica.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara não tentou resolver sozinha | Sim (transferiu rápido) | PASS |
| Clara não ficou na defensiva | Sim (empatia, não justificativa) | PASS |
| Handoff ocorreu com contexto completo | Sim | PASS |
| Humano assumiu responsabilidade | Sim | PASS |
| Humano não prometeu desconto sem autorização | Sim | PASS |
| Tom calmo e empático mantido | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 8,5
- **Observações**: Fluxo de urgência bem executado. Clara transferiu sem hesitar. Humano conduziu negociação com habilidade. Ponto de atenção: script inicial continha placeholder [responsável] não preenchido — corrigir template base.
