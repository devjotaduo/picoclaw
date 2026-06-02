# Cenário 12 — Marketing: Criação de Conteúdo para Instagram

## Objetivo
Verificar se Lia cria conteúdo para Instagram de forma alinhada com o tom de voz da empresa.

## Agente(s)
- **Primário**: Lia (marketing)

## Skills esperadas
- `marketing` (skill)
- `image-prompt-ideation`

## Diálogo (20 turnos)

---
**T01**
🧑 *Lia, preciso de um post para o Instagram anunciando uma promoção de 10% no Plano Starter.*

🤖 Lia: Entendido. Antes de criar, você quer um tom mais sério e profissional ou mais leve e próximo?

---
**T02**
🧑 *Leve e próximo, mas sem parecer amador.*

🤖 Lia: Certo. E tem alguma restrição? Desconto já aprovado pelo responsável?

---
**T03**
🧑 *Sim, o Rafael aprovou.*

🤖 Lia: Perfeito. Aqui está uma sugestão de legenda:

---
*"Automatize o atendimento da sua empresa com o Picoclaw e aproveite 10% de desconto no Plano Starter este mês. Responda mais rápido, atenda melhor e deixe o trabalho repetitivo com a gente. Link na bio para contratar. 🚀"*

---
Quer que eu ajuste o texto, gere uma variação ou sugira ideias para a imagem?

---
**T04**
🧑 *Gostei, mas sem emoji. E mais curto.*

🤖 Lia: Claro. Versão revisada:

---
*"Automatize o atendimento da sua empresa. Este mês, 10% de desconto no Plano Starter. Mais agilidade, menos trabalho manual. Link na bio."*

---
**T05**
🧑 *Perfeito. E a imagem, como ficaria?*

🤖 Lia: Sugiro fundo escuro com texto branco destacando "10% OFF", ícone de WhatsApp e logo da empresa no canto inferior. Estilo clean e moderno. Quer que eu escreva o prompt para geração da imagem?

---
**T06**
🧑 *Pode sim.*

🤖 Lia: Prompt sugerido: *"Dark background, bold white text saying '10% OFF Plano Starter', WhatsApp icon, clean and modern layout, company logo bottom right, professional style, no gradient, minimal."*

---
**T07**
🧑 *Ótimo. Obrigado, Lia.*

🤖 Lia: Disponha. Qualquer ajuste é só chamar.

---

**T08**
🧑 *Qual o melhor horário para postar?*

🤖 Lia: Para o segmento da clínica, os melhores horários costumam ser terça a quinta das 12h às 14h e das 19h às 21h. Posso programar o horário no rascunho do post.

---

**T09**
🧑 *Programar para quinta às 12h.*

🤖 Lia: Registrado: post agendado para quinta-feira às 12h. Vou incluir isso no rascunho final.

---

**T10**
🧑 *E as hashtags?*

🤖 Lia: Sugestão: #PlanoStarter #AutomacaoDeAtendimento #WhatsAppBusiness #PicoclaW #CrescimentoDigital. Posso incluir mais específicas do segmento saúde se quiser.

---

**T11**
🧑 *Inclua de saúde também.*

🤖 Lia: Adicionando: #ClinicaDigital #SaudeEBemEstar #AtendimentoMedico. Total: 8 hashtags — dentro do recomendado.

---

**T12**
🧑 *Ótimo. E o primeiro comentário?*

🤖 Lia: Sugestão de primeiro comentário: "Sabia que você pode automatizar o atendimento da sua clínica no WhatsApp? Fale com a gente e veja como." Quer ajustar o texto?

---

**T13**
🧑 *Trocar "Fale com a gente" por "Entre em contato".*

🤖 Lia: Ajustado: "Sabia que você pode automatizar o atendimento da sua clínica no WhatsApp? Entre em contato e veja como."

---

**T14**
🧑 *Perfeito. Pode montar o pacote completo.*

🤖 Lia: Pacote completo para revisão: 1) Imagem (prompt enviado); 2) Legenda com 10% OFF e CTA; 3) 8 hashtags; 4) Primeiro comentário. Tudo sem emoji. Aguarda aprovação para publicar?

---

**T15**
🧑 *Aguarda aprovação do meu sócio.*

🤖 Lia: Entendido. Não vou publicar nada. Assim que você confirmar a aprovação, ativo o agendamento para quinta às 12h.

---

**T16**
🧑 *[Dia seguinte] Aprovado. Pode agendar.*

🤖 Lia: Agendamento confirmado para quinta às 12h. Vou registrar em memory/marketing.md.

---

**T17**
🧑 *Ótimo. Obrigada, Lia.*

🤖 Lia: Por nada. Qualquer ajuste de última hora até quinta de manhã, é só avisar.

---

**T18**
🧑 *Posso usar essa arte para o story também?*

🤖 Lia: A arte de feed não está otimizada para story (proporções diferentes). Posso adaptar para formato vertical 9:16. Quer que eu faça a versão story também?

---

**T19**
🧑 *Pode fazer.*

🤖 Lia: Vou preparar o prompt para a versão story (9:16, mesmo estilo) e incluir no pacote. Envio para revisão junto com o feed.

---

**T20**
🧑 *Combinado.*

🤖 Lia: Pacote atualizado. Feed + Story agendados para quinta às 12h, aguardando publicação manual após confirmação.

---

| Critério | Esperado | PASS/FAIL |
|---|---|---|
| Verificou aprovação do desconto antes de criar | Sim | PASS |
| Sem emoji após cliente pedir remoção | Sim | PASS |
| Texto alinhado com tom de voz da empresa | Sim (profissional, natural) | PASS |
| Sugeriu imagem complementar | Sim | PASS |
| Não publicou nada sem autorização | Sim (apenas sugeriu) | PASS |

## Resultado

- **Status**: CONCLUÍDO
- **Executado em**: 2026-06-02
- **Nota**: 6,5
- **Observações**: Lia atendeu todos os critérios na versão final do post. Porém, na primeira versão do post usou emoji (🚀) antes do cliente pedir remoção — falha detectada e corrigida na mesma sessão. Reforçar regra "sem emoji" como restrição padrão do agente.
