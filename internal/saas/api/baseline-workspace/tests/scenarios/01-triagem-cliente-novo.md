# Cenário 01 — Triagem: Cliente Novo

## Objetivo
Verificar se Clara recebe um cliente novo, cumprimenta naturalmente, coleta as informações básicas e classifica o atendimento corretamente.

## Agente(s)
- **Primário**: Clara (atendente principal)

## Skills esperadas
- `atendimento/triagem-inicial`
- `atendimento/coletar-informacoes`

## Diálogo (10 turnos)

---

**T01**
🧑 *Oi, tudo bem?*

🤖 Clara: Tudo bem, obrigada. Fico feliz em ajudar. Qual é o motivo do seu contato hoje?

---

**T02**
🧑 *Quero saber mais sobre os serviços de vocês.*

🤖 Clara: Claro. Para te ajudar melhor, pode me dizer seu nome e o nome da sua empresa?

---

**T03**
🧑 *Me chamo Ana Lima, da Clínica Bella Vida.*

🤖 Clara: Olá, Ana. A Clínica Bella Vida é da área de saúde?

---

**T04**
🧑 *Sim, somos uma clínica de estética.*

🤖 Clara: Entendido. O que você está buscando: uma solução para atendimento, agendamento, vendas ou outra necessidade?

---

**T05**
🧑 *Preciso de um sistema para automatizar o atendimento no WhatsApp.*

🤖 Clara: Perfeito. Você já usa alguma ferramenta de automação hoje, ou seria do zero?

---

**T06**
🧑 *Do zero. Hoje faço tudo manual.*

🤖 Clara: Entendo. Tem urgência para implementar ou está avaliando ainda?

---

**T07**
🧑 *Preciso para o próximo mês.*

🤖 Clara: Certo. Tem algum orçamento em mente para esse projeto?

---

**T08**
🧑 *Tenho disponível uns R$ 500 por mês.*

🤖 Clara: Anotado. Qual o melhor horário para nossa equipe entrar em contato com você para apresentar as opções?

---

**T09**
🧑 *Amanhã de manhã está ótimo.*

🤖 Clara: Perfeito, Ana. Vou registrar seu interesse e nosso consultor de vendas vai entrar em contato amanhã de manhã para apresentar as melhores opções para a Clínica Bella Vida.

---

**T10**
🧑 *Obrigada!*

🤖 Clara: Fico à disposição. Até mais!

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Cumprimentou naturalmente | Sim, sem emoji | |
| Perguntou nome e empresa | Sim, separadamente | |
| Coletou necessidade principal | Sim (WhatsApp automation) | |
| Perguntou urgência | Sim | |
| Perguntou orçamento | Sim | |
| Perguntou horário de contato | Sim | |
| Não inventou informação | Clara não citou preços sem confirmação | |
| Tom profissional e natural | Sim, sem robótica | |
| Encaminhou para vendas | Sim (implícito: "consultor vai entrar em contato") | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
- **Observações**: —
