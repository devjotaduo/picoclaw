# Cenário 21 — Transferência Humana: Caso Sensível

## Objetivo
Verificar o fluxo completo de transferência para humano em um caso de alto risco (ameaça de processo judicial).

## Agente(s)
- Clara → Atendimento Humano → Rafael

## Skills esperadas
- `atendimento/human-handoff-brief`
- `atendimento/transferencia-humana`
- `suporte/conduct-case-routing`

## Total de interações: 12 turnos

---
### FASE 1: Triagem Clara — Turnos 1–3

**T01**
🧑 *Vou processar a empresa de vocês se não resolverem meu problema hoje.*

🤖 Clara: Entendo que você está muito insatisfeito. Pode me dizer seu nome para eu verificar o que está acontecendo?

---
**T02**
🧑 *Diego Ferreira. Três chamados, sem resolução, perdi dinheiro.*

🤖 Clara: Diego, esse caso precisa de atenção imediata. Estou transferindo você para o responsável agora.

---
**[HANDOFF: Clara → Atendimento Humano]**

---
### FASE 2: Atendimento Humano — Turnos 3–8

**T03**
🤖 Humano: Diego, fui informado sobre os 3 chamados sem retorno. Isso é inaceitável e peço desculpas pessoalmente. Sou o responsável pelo seu caso agora.

---
**T04**
🧑 *Quero saber quem vai me indenizar pela perda.*

🤖 Humano: Entendo sua frustração. Antes de qualquer conversa sobre compensação, preciso entender exatamente o que aconteceu e o impacto. Pode me detalhar o problema e os chamados?

---
**T05**
🧑 *O sistema ficou fora por 3 dias. Chamados #1042, #1057 e #1073. Perdi uns R$ 15 mil em vendas.*

🤖 Humano: Compreendo a gravidade. Vou verificar os três chamados agora e te retornar com uma posição oficial da empresa. Não posso fazer promessas sem antes analisar o histórico completo — mas garantindo que você terá uma resposta formal em 4 horas.

---
**T06**
🧑 *4 horas? Quero agora.*

🤖 Humano: Preciso checar os registros internos para dar uma resposta correta — 4 horas é o mínimo para fazer isso com rigor. Se eu te der uma resposta imprecisa agora e tiver que corrigir depois, piora a situação para os dois lados. Aceita esse prazo?

---
**T07**
🧑 *Tá bem. Mas se não resolverem, chamo o advogado.*

🤖 Humano: Entendo. É um direito seu. Nosso compromisso é te dar uma resposta formal e justa dentro de 4 horas. Te mando por este canal e também por e-mail.

---
**T08**
🧑 *Ok.*

---
**[HANDOFF: Humano → Rafael (alerta interno)]**

---
### FASE 3: Rafael (alerta ao dono) — Turnos 9–12

**T09**
🤖 Rafael: Alerta de risco jurídico: Diego Ferreira, Consultoria DF. 3 chamados sem atendimento (#1042, #1057, #1073). Alega perda de R$15k em 3 dias de sistema fora. Ameaça de processo. Prazo de resposta: 4 horas. Recomendo acionamento imediato do dono.

---
**T10**
🧑 *Rafael, quem é o responsável pelos chamados?*

🤖 Rafael: Verificando... Chamados atribuídos ao suporte técnico. Nenhum com resposta registrada. Possível falha no processo de escalação.

---
**T11**
🧑 *Grave. Vou ligar para o Diego. Você prepara um resumo cronológico.*

🤖 Rafael: Resumo cronológico em preparação. Vou incluir: data de abertura dos chamados, status em cada momento, tempo sem resposta, impacto declarado pelo cliente e posição atual. Envio em 10 minutos.

---
**T12**
🧑 *Ok. Obrigado, Rafael.*

🤖 Rafael: Disponha. Monitorando o caso.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara não ficou na defensiva | Sim | |
| Handoff imediato para humano | Sim (caso sensível/jurídico) | |
| Humano não prometeu indenização sem análise | Sim | |
| Humano comprometeu prazo razoável | Sim (4h) | |
| Rafael alertou dono imediatamente | Sim | |
| Nenhum dado sensível exposto indevidamente | Sim | |
| Tom empático e profissional mantido | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
