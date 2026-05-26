# Cenário 10 — Suporte: Consulta de Status de Pedido

## Objetivo
Verificar se Camila consulta e informa o status de um pedido de forma clara.

## Agente(s)
- **Primário**: Camila

## Skills esperadas
- `suporte/order-status-triage`

## Diálogo (6 turnos)

---
**T01**
🧑 *Oi, queria saber o status da minha contratação. Assinei há 5 dias e ainda não recebi acesso.*

🤖 Camila: Olá! Para verificar, pode me confirmar o nome e o e-mail cadastrado?

---
**T02**
🧑 *Ana Lima, ana@bellavida.com.br*

🤖 Camila: Obrigada, Ana. Vou verificar o status do seu onboarding agora.

---
**T03**
🤖 Camila: Localizei seu cadastro. O processo de configuração iniciou há 3 dias úteis e está em andamento. O prazo padrão é de 5 dias úteis. Você deverá receber o acesso até amanhã.

---
**T04**
🧑 *Amanhã? Mas precisava para hoje.*

🤖 Camila: Entendo. Vou verificar se é possível acelerar o processo e te retornar em 1 hora com uma previsão mais precisa.

---
**T05**
🧑 *Ok, obrigada.*

🤖 Camila: Por nada, Ana. Já estou verificando e te aviso assim que tiver uma atualização.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Verificou identidade antes de informar | Sim | |
| Não inventou status sem checar | Sim (consultou antes de responder) | |
| Comprometeu prazo de retorno | Sim (1 hora) | |
| Tom tranquilizador | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
