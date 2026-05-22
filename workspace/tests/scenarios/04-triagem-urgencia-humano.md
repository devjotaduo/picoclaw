# Cenário 04 — Triagem com Transferência para Humano (Caso Sensível)

## Objetivo
Verificar se Clara identifica irritação/urgência extrema e transfere para Atendimento Humano sem tentar resolver sozinha.

## Agente(s)
- **Primário**: Clara
- **Secundário**: Atendimento Humano

## Skills esperadas
- `atendimento/triagem-inicial`
- `atendimento/transferencia-humana` (ou `humano`)

## Diálogo (8 turnos)

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

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara não tentou resolver sozinha | Sim (transferiu rápido) | |
| Clara não ficou na defensiva | Sim (empatia, não justificativa) | |
| Handoff ocorreu com contexto completo | Sim | |
| Humano assumiu responsabilidade | Sim | |
| Humano não prometeu desconto sem autorização | Sim | |
| Tom calmo e empático mantido | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
