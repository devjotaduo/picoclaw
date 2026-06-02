# Cenário 10 — Suporte: Consulta de Status de Pedido

## Objetivo
Verificar se Camila consulta e informa o status de um pedido de forma clara.

## Agente(s)
- **Primário**: Camila

## Skills esperadas
- `suporte/order-status-triage`

## Diálogo (20 turnos)

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

**T06**
🧑 *[1h depois] E aí, tem novidade?*

🤖 Camila: Sim. O acesso foi provisionado e deve estar disponível em até 30 minutos. A equipe técnica está fazendo os testes finais.

---

**T07**
🧑 *Ok. Vou aguardar.*

🤖 Camila: Assim que confirmar, te aviso aqui.

---

**T08**
🧑 *[30 min depois] Testei e deu acesso. Funcionou!*

🤖 Camila: Ótimo! Acesso confirmado e funcionando. Posso encerrar o chamado?

---

**T09**
🧑 *Pode. Mas tenho outra dúvida.*

🤖 Camila: Claro. Pode perguntar.

---

**T10**
🧑 *Como personalizo o nome do agente que aparece para o cliente?*

🤖 Camila: Em Configurações > Agentes, clique no agente desejado e edite o campo "Nome de exibição".

---

**T11**
🧑 *E a foto do perfil?*

🤖 Camila: No mesmo painel do agente, clique em "Foto" e faça upload de uma imagem. Formatos aceitos: JPG e PNG.

---

**T12**
🧑 *Tem tamanho mínimo?*

🤖 Camila: Recomendamos pelo menos 200x200 pixels para boa qualidade de exibição.

---

**T13**
🧑 *Entendido. E posso mudar a cor do chat?*

🤖 Camila: Sim, em Configurações > Aparência > Cor Principal. Você insere o código HEX da cor desejada.

---

**T14**
🧑 *Tem como pré-visualizar antes de salvar?*

🤖 Camila: Tem sim. Há um preview em tempo real na própria tela de configuração de aparência.

---

**T15**
🧑 *Perfeito. Muito útil esse painel.*

🤖 Camila: Fico feliz. Qualquer ajuda com personalização, estamos à disposição.

---

**T16**
🧑 *Posso agendar uma sessão de personalização com alguém da equipe?*

🤖 Camila: Claro. Posso encaminhar seu pedido para agendar uma sessão com nosso time de onboarding. Qual melhor horário para você?

---

**T17**
🧑 *Terça-feira às 14h.*

🤖 Camila: Registrado. Vou confirmar disponibilidade com o time e te retorno ainda hoje.

---

**T18**
🧑 *Obrigada, Camila.*

🤖 Camila: Por nada, Ana. Aguarde a confirmação do agendamento.

---

**T19**
🧑 *[Fim do dia] Confirmado o horário?*

🤖 Camila: Confirmado! Terça às 14h com nosso especialista de onboarding. Você vai receber o link de acesso por e-mail.

---

**T20**
🧑 *Perfeito. Obrigada!*

🤖 Camila: Por nada. Até terça, Ana!

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Verificou identidade antes de informar | Sim | PASS |
| Não inventou status sem checar | Sim (consultou antes de responder) | PASS |
| Comprometeu prazo de retorno | Sim (1 hora) | PASS |
| Tom tranquilizador | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 8,5
- **Observações**: Camila gerenciou o acompanhamento de status com profissionalismo. Verificou identidade, não inventou dados e comprometeu prazo claro. Todos os critérios atendidos.
