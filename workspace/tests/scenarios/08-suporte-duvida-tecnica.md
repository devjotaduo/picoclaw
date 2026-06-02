# Cenário 08 — Suporte: Dúvida Técnica Pós-Venda

## Objetivo
Verificar se Camila resolve dúvida técnica de cliente ativo de forma clara e eficiente.

## Agente(s)
- **Primário**: Camila (suporte e pós-venda)

## Skills esperadas
- `suporte/technical-troubleshooting`
- `suporte/knowledge-base-resolution`

## Diálogo (20 turnos)

---
**T01**
🧑 *Olá Camila, tenho uma dúvida. Como faço para adicionar um novo número de WhatsApp no sistema?*

🤖 Camila: Olá! Para adicionar um novo número, você precisa acessar o painel de configurações em Canais > WhatsApp > Novo número. Você está conseguindo acessar o painel?

---
**T02**
🧑 *Sim, estou no painel. Mas não vejo essa opção.*

🤖 Camila: Entendo. Qual é o seu plano atual?

---
**T03**
🧑 *Plano Starter.*

🤖 Camila: No Plano Starter, é possível conectar até 1 número de WhatsApp. Para adicionar um segundo número, seria necessário upgrade para o Plano Business. Você já usa um número conectado?

---
**T04**
🧑 *Sim, já tenho um conectado.*

🤖 Camila: Então a limitação é do plano. Se quiser, posso te conectar com o Marcos para avaliar o upgrade com mais calma?

---
**T05**
🧑 *Quero entender quanto custa primeiro.*

🤖 Camila: O Plano Business é R$ 697/mês e permite até 10 números de WhatsApp e 10 mil mensagens. Se quiser, peço ao Marcos que te mande os detalhes por aqui?

---
**T06**
🧑 *Pode sim.*

🤖 Camila: Feito. Vou acionar o Marcos agora. Alguma outra dúvida técnica antes de encerrar?

---
**T07**
🧑 *Não, era só isso. Obrigado.*

🤖 Camila: Por nada. Fique à vontade para chamar sempre que precisar!

---

**T08**
🧑 *Aproveitando: como configuro a mensagem de fora do horário?*

🤖 Camila: No painel, vá em Configurações > Horário de Atendimento. Você define os horários e a mensagem automática que o cliente recebe fora deles.

---

**T09**
🧑 *Já fui lá. Não aparece essa opção.*

🤖 Camila: No seu plano (Business), essa opção fica em Configurações > Automações > Fora do Horário. Tente por esse caminho.

---

**T10**
🧑 *Achei! Obrigado.*

🤖 Camila: Ótimo! Alguma outra dúvida?

---

**T11**
🧑 *Sim. Como exporto o relatório de atendimentos do mês?*

🤖 Camila: Em Relatórios > Exportar, escolha o período e clique em "Gerar CSV". O arquivo é enviado por e-mail.

---

**T12**
🧑 *Só CSV? Não tem PDF?*

🤖 Camila: No momento o export é em CSV. Se precisar de PDF, o time de desenvolvimento pode avaliar a inclusão na próxima atualização. Posso registrar como sugestão?

---

**T13**
🧑 *Pode registrar.*

🤖 Camila: Registrado como sugestão de melhoria. Vou enviar para o time de produto.

---

**T14**
🧑 *Posso ter mais de um usuário administrador?*

🤖 Camila: No Business, sim. Você pode ter até 3 administradores. Para adicionar, acesse Configurações > Usuários.

---

**T15**
🧑 *E os outros usuários podem ver os relatórios?*

🤖 Camila: Depende do perfil de acesso. Administradores têm acesso total. Agentes têm acesso restrito.

---

**T16**
🧑 *Como altero o perfil de um usuário?*

🤖 Camila: Em Configurações > Usuários, clique no usuário e selecione o perfil desejado (Administrador ou Agente).

---

**T17**
🧑 *Perfeito. Muito útil.*

🤖 Camila: Fico feliz em ajudar. Mais alguma dúvida?

---

**T18**
🧑 *Não por agora. Obrigado, Camila.*

🤖 Camila: Por nada! Qualquer coisa, estamos aqui.

---

**T19**
🧑 *Última coisa: tem como bloquear um usuário sem excluir?*

🤖 Camila: Sim. Em Configurações > Usuários, selecione o usuário e clique em "Suspender". O histórico é mantido.

---

**T20**
🧑 *Ótimo. Agora sim encerrado. Obrigado!*

🤖 Camila: Por nada. Bom trabalho!

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Respondeu a dúvida com precisão | Sim | PASS |
| Identificou limitação de plano | Sim | PASS |
| Não inventou funcionalidade inexistente | Sim | PASS |
| Ofereceu encaminhamento para vendas (upgrade) | Sim | PASS |
| Preço citado correto (Business = R$697) | Sim | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 9,0
- **Observações**: Camila demonstrou conhecimento técnico sólido. Identificou a limitação do plano, não inventou funcionalidade e orientou naturalmente para o upgrade. Todos os critérios atendidos.
