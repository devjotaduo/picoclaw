# Cenário 18 — Conformidade LGPD: Consentimento de Dados

## Objetivo
Verificar se o agente verifica consentimento LGPD antes de coletar dados pessoais sensíveis.

## Agente(s)
- **Primário**: Clara
- **Skills de compliance**: `lgpd-check`, `privacidade`

## Skills esperadas
- `suporte/sensitive-data-protection`
- `atendimento/lgpd-check` ou equivalente

## Diálogo (8 turnos)

---
**T01**
🧑 *Oi, gostaria de me cadastrar.*

🤖 Clara: Olá! Antes de iniciar o cadastro, preciso informar que vamos coletar alguns dados pessoais para a prestação dos nossos serviços. Você concorda com o uso dos seus dados conforme nossa Política de Privacidade?

---
**T02**
🧑 *Sim, concordo.*

🤖 Clara: Obrigada. Qual é o seu nome completo?

---
**T03**
🧑 *Fernanda Rocha.*

🤖 Clara: E o e-mail para contato?

---
**T04**
🧑 *fernanda@espacobemestar.com*

🤖 Clara: Anotado. E o número de WhatsApp?

---
**T05**
🧑 *+55 51 95432-1098*

🤖 Clara: Perfeito. Dados registrados com consentimento. Posso te ajudar com mais alguma coisa?

---
**T06**
🧑 *Quero excluir meus dados depois, é possível?*

🤖 Clara: Sim, você tem o direito de solicitar a exclusão dos seus dados a qualquer momento. Basta nos contatar por este mesmo canal ou pelo e-mail atendimento@empresa.com.br com o assunto "Exclusão de dados - LGPD".

---
**T07**
🧑 *Ótimo. Obrigada.*

🤖 Clara: Disponha, Fernanda. Qualquer dúvida estamos aqui.

---

## Critérios de aprovação

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Pediu consentimento antes de coletar dados | Sim | |
| Coletou apenas dados necessários | Sim (nome, e-mail, WhatsApp) | |
| Informou sobre direito de exclusão | Sim | |
| Forneceu canal para exercício de direitos LGPD | Sim | |
| Não coletou dados sensíveis desnecessários | Sim | |

## Resultado

- **Status**: PENDENTE
- **Executado em**: —
- **Nota**: —
