# Cenário 03 — Triagem com Handoff para Suporte

## Objetivo
Verificar se Clara identifica um problema técnico e transfere corretamente para Camila.

## Agente(s)
- **Primário**: Clara
- **Secundário**: Camila (suporte)

## Skills esperadas
- `atendimento/triagem-inicial`
- `suporte/technical-troubleshooting`

## Diálogo (20 turnos)

---
**T01**
🧑 *Bom dia. Estou com um problema no sistema.*

🤖 Clara: Bom dia. Pode me dizer qual problema está enfrentando?

---
**T02**
🧑 *O sistema está muito lento desde ontem.*

🤖 Clara: Entendo. Você é cliente nosso? Qual é o nome da empresa?

---
**T03**
🧑 *Sim, sou Bruno Costa, da Distribuidora Costa.*

🤖 Clara: Olá, Bruno. A lentidão está afetando alguma área específica do sistema?

---
**T04**
🧑 *Todo o sistema. Fica travando na hora de emitir nota fiscal.*

🤖 Clara: Entendido. Isso está impactando sua operação agora?

---
**T05**
🧑 *Sim, é crítico. Não consigo emitir nada.*

🤖 Clara: Compreendo a urgência. Vou te conectar agora com Camila, nossa especialista de suporte, para resolver isso com prioridade.

---
**[HANDOFF: Clara → Camila]**

---
**T06**
🤖 Camila: Olá, Bruno. Sou Camila, do suporte técnico. Fui informada sobre a lentidão crítica na emissão de nota fiscal. Você consegue me dizer desde quando exatamente o problema começou?

---
**T07**
🧑 *Desde ontem às 14h, após uma atualização.*

🤖 Camila: Entendido. Houve alguma atualização de sistema ou mudança no ambiente ontem antes das 14h?

---
**T08**
🧑 *Sim, atualizaram o servidor.*

🤖 Camila: Isso ajuda muito a identificar a causa. Vou registrar um chamado de prioridade alta e acionar nossa equipe técnica. Você receberá atualizações a cada hora. Tem um número de contato para o técnico ligar?

---
**T09**
🧑 *Sim, pode ligar para +55 21 98765-4321.*

🤖 Camila: Anotado. Chamado registrado com prioridade P1. Nossa equipe entrará em contato em até 30 minutos. Precisa de mais alguma coisa enquanto isso?

---
**T10**
🧑 *Não, obrigado. Aguardo o contato.*

🤖 Camila: Perfeito. Fique tranquilo, Bruno. Vamos resolver isso.

---

**T11**
🧑 *Isso é P1 no nível de vocês?*

🤖 Camila: Sim, registrado como P1 — impacto em faturamento. Você pode acompanhar o status por este canal.

---

**T12**
🧑 *Quanto tempo leva para resolver?*

🤖 Camila: Para P1 com causa identificada, nossa meta é 2 horas. Vou te atualizar assim que tiver posição da equipe técnica.

---

**T13**
🧑 *2 horas dá. O restante do sistema está funcionando.*

🤖 Camila: Ótimo. Isso confirma que o impacto está isolado na emissão de NF. Repasso para o técnico já.

---

**T14**
🧑 *Tem algo que eu precise fazer enquanto aguardo?*

🤖 Camila: Não por enquanto. Se o técnico precisar de acesso remoto ao servidor, vai entrar em contato pelo número que você informou.

---

**T15**
🧑 *Ok. Estarei disponível.*

🤖 Camila: Perfeito. Seu número já está com o técnico responsável.

---

**T16**
🧑 *[1h depois] Alguma novidade?*

🤖 Camila: Verificando... A equipe identificou conflito na última atualização de servidor. Está aplicando rollback agora. Previsão: mais 30 minutos.

---

**T17**
🧑 *Entendido. Vou aguardar.*

🤖 Camila: Obrigada pela paciência, Bruno. Você é o primeiro a ser notificado quando resolver.

---

**T18**
🧑 *[30 min depois] Funcionou. Emissão voltou.*

🤖 Camila: Excelente! Rollback aplicado com sucesso. Vou registrar a causa para evitar recorrência.

---

**T19**
🧑 *Valeu, Camila. Problema resolvido.*

🤖 Camila: Que bom! Posso encerrar o chamado #2031?

---

**T20**
🧑 *Pode encerrar.*

🤖 Camila: Chamado #2031 encerrado. Qualquer coisa é só chamar, Bruno.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Clara identificou urgência crítica | Sim | PASS |
| Handoff imediato para Camila | Sim, sem demorar | PASS |
| Camila não repetiu dados já coletados | Confirmou, não repetiu | PASS |
| Camila coletou info técnica relevante (quando/o que mudou) | Sim | PASS |
| Chamado P1 registrado | Sim | PASS |
| SLA comunicado ao cliente | Sim (30 min) | PARCIAL |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,0
- **Observações**: Fluxo Clara→Camila executado com precisão. Handoff imediato e sem repetição de dados. Ressalva: SLA de 30 min comunicado ao cliente sem confirmação via memória. Registrar SLA padrão em memory/suporte.md.
