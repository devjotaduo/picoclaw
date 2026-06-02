# Cenário 11 — Onboarding de Nova Empresa (Sofia)

## Objetivo
Verificar se Sofia coleta corretamente os dados de uma nova empresa e configura o perfil inicial.

## Agente(s)
- **Primário**: Sofia (onboarding)

## Skills esperadas
- `onboarding` (skill principal)
- `atendimento/coletar-informacoes`

## Diálogo (20 turnos)

---
**T01**
🤖 Sofia: Olá! Sou Sofia e vou ajudar com o cadastro da sua empresa no sistema. Para começar, qual é o nome da sua empresa?

---
**T02**
🧑 *Espaço Bem-Estar.*

🤖 Sofia: Perfeito. E qual é o seu nome, Fernanda?

---
**T03**
🧑 *Isso, Fernanda Rocha.*

🤖 Sofia: Fernanda, qual é o segmento de atuação do Espaço Bem-Estar?

---
**T04**
🧑 *Somos um espaço de massagem, yoga e terapias holísticas.*

🤖 Sofia: Entendido. Vocês atendem presencialmente, online ou os dois?

---
**T05**
🧑 *Principalmente presencial, mas temos alguns atendimentos online.*

🤖 Sofia: Quantas pessoas trabalham na equipe hoje?

---
**T06**
🧑 *Somos 6: 4 terapeutas e 2 recepcionistas.*

🤖 Sofia: E qual é o principal canal de atendimento hoje? WhatsApp, telefone, e-mail?

---
**T07**
🧑 *WhatsApp e Instagram.*

🤖 Sofia: Quais são as principais demandas que chegam por esses canais?

---
**T08**
🧑 *Agendamentos, perguntas sobre preços e às vezes reclamações.*

🤖 Sofia: Faz sentido. Vocês têm um horário de funcionamento definido?

---
**T09**
🧑 *Sim, de segunda a sábado, das 8h às 20h.*

🤖 Sofia: Anotado. E você tem preferência de modelo de comunicação — mais formal ou mais próximo e descontraído?

---
**T10**
🧑 *Próximo e acolhedor, mas sem ser informal demais.*

🤖 Sofia: Perfeito. Registrei o perfil do Espaço Bem-Estar. Com base nisso, vou configurar o workspace com tom acolhedor e profissional, foco em agendamentos e atendimento ao cliente. Quer revisar algum dado antes de confirmar?

---
**T11**
🧑 *Tá ótimo assim.*

🤖 Sofia: Certo. Perfil cadastrado com sucesso. Nossa equipe vai finalizar a configuração e você receberá acesso em até 2 dias úteis.

---
**T12**
🧑 *Obrigada, Sofia!*

🤖 Sofia: Por nada, Fernanda. Bem-vinda ao sistema!

---

**T13**
🧑 *Sofia, posso incluir o endereço da clínica também?*

🤖 Sofia: Claro! Qual é o endereço?

---

**T14**
🧑 *Rua das Flores, 120, São Paulo, SP.*

🤖 Sofia: Anotado. Mais alguma informação que queira incluir agora?

---

**T15**
🧑 *Sim. Temos pacotes mensais. Preciso que o sistema informe os clientes sobre isso.*

🤖 Sofia: Entendido. O que você gostaria que o sistema informasse sobre os pacotes? Pode me dar um exemplo de como descrevê-los?

---

**T16**
🧑 *Temos o Pacote Básico (4 sessões/mês) e o Premium (8 sessões/mês).*

🤖 Sofia: Anotei os dois pacotes: Básico (4 sessões) e Premium (8 sessões). Os preços serão cadastrados depois ou já pode me passar agora?

---

**T17**
🧑 *Básico R$360 e Premium R$680.*

🤖 Sofia: Perfeito. Cadastrado: Pacote Básico R$360 (4 sessões), Pacote Premium R$680 (8 sessões). Está correto?

---

**T18**
🧑 *Está correto.*

🤖 Sofia: Ótimo. Posso também cadastrar a política de cancelamento, se quiser. Vocês cobram alguma taxa por cancelamento de última hora?

---

**T19**
🧑 *Sim, 50% do valor da sessão se cancelar com menos de 24h.*

🤖 Sofia: Anotado. Política: cancelamento com menos de 24h de antecedência — taxa de 50% do valor da sessão. Mais alguma informação?

---

**T20**
🧑 *Não, por enquanto é isso.*

🤖 Sofia: Perfeito. Resumindo o que cadastrei: Espaço Bem-Estar, Fernanda, Rua das Flores 120, SP. Tom acolhedor e profissional. Pacotes Básico e Premium com preços e política de cancelamento. Você receberá acesso em até 2 dias úteis. Bem-vinda!

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Coletou nome da empresa e responsável | Sim | PASS |
| Identificou segmento | Sim (bem-estar/holístico) | PASS |
| Coletou canais de atendimento | Sim | PASS |
| Coletou horário de funcionamento | Sim | PASS |
| Coletou tom de comunicação preferido | Sim | PASS |
| Confirmou dados antes de finalizar | Sim | PASS |
| Comunicou prazo de entrega | Sim (2 dias úteis) | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,5
- **Observações**: Sofia conduziu o onboarding de forma exemplar. Uma pergunta por vez, tom acolhedor, sem jargão técnico. Confirmou dados antes de finalizar e comunicou próximos passos com clareza.
