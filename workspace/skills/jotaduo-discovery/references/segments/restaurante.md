# Segmento: Restaurante / Delivery / Hospitalidade

Use para restaurantes, bares, cafeterias, food trucks, dark kitchens e
operações de delivery próprio.

## Vocabulário

Reserva, pedido, cardápio, comanda, mesa, delivery, retirada, garçom,
cozinha, ticket médio, giro de mesa.

## Perguntas específicas

1. "Vocês trabalham com salão, delivery próprio, ifood/rappi, ou tudo
   junto?"
2. "Quantas mesas / qual a capacidade? Trabalham com reserva?"
3. "Onde o pedido entra hoje — telefone, WhatsApp, iFood, site próprio?"
4. "Qual sistema de gestão / PDV? (Consumer, Linx, Goomer, Anota AI,
   Saipos, Colibri)"
5. "Cardápio digital próprio ou usam o do iFood/Anota?"
6. "Tem dor de cancelamento de reserva / no-show?"
7. "Como é a fidelização hoje — programa de pontos, cashback, nada?"

## Dores típicas

- Atendente parado no telefone perdendo cliente em horário de pico.
- Reserva no WhatsApp bagunçada, sem confirmação.
- No-show de reserva em sexta/sábado.
- Cliente come uma vez e nunca volta.
- Pedido errado por má comunicação no WhatsApp.
- Cardápio mudando, custo de atualizar em vários canais.

## Integrações comuns

- **PDV/Cardápio**: Anota AI, Goomer, Saipos, iFood, Consumer.
- **Atendimento**: WhatsApp Business, Instagram.
- **Reservas**: Google Calendar, GetInApp, planilha.
- **Pagamento**: Pix, link de pagamento, máquina de cartão.

## Time típico de agentes para restaurante

1. **`clara`** (entra primeiro) — atende WhatsApp,
   responde horário, cardápio, localização, faz reserva.
2. ⚠️ **reservas / confirmação** — `agente-agendador` não existe no roster
   atual. Confirmação 24h / redução de no-show: ampliar `camila` ou
   criar agente dedicado via `operador` + `skill-creator`.
3. **`marcos`** (se delivery próprio) — recebe pedido, sugere
   acompanhamento, fecha com link de pagamento Pix.
4. **`camila`** — pede review no Google, oferece cupom de
   retorno, ativa cliente que sumiu.

## Métricas a propor

- Reservas confirmadas / no-show reduzido.
- Tempo de resposta no WhatsApp em horário de pico.
- Ticket médio do delivery próprio (vs iFood, eliminando comissão).
- Reviews no Google / Instagram coletados/mês.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Delivery por bairro
> "Vocês entregam no bairro Centro?"

**O que Clara deve fazer:** consultar `Regiões atendidas:` em `memory/empresa.md` e confirmar (ou não) a área de entrega. Se for fora, dizer claramente que não atende e oferecer retirada.
**Sinal de problema:** Clara prometeu entrega sem checar região (significa `Regiões atendidas:` vazia ou ambígua).

### Cenário 2 — Cardápio
> "Manda o cardápio aí?"

**O que Clara deve fazer:** consultar `Produtos ou serviços:` e link de cardápio digital (se houver) em `memory/empresa.md` e mandar o link ou um resumo dos itens cadastrados.
**Sinal de problema:** Clara inventou prato ou preço (significa `Produtos ou serviços:` incompleto ou link de cardápio não cadastrado).

### Cenário 3 — Horário de funcionamento
> "Vocês tão abertos agora? Que horas fecha hoje?"

**O que Clara deve fazer:** consultar `Horário:` em `memory/empresa.md` e responder o horário do dia da semana correto.
**Sinal de problema:** Clara disse "estamos abertos" sem checar horário ou inventou horário diferente do cadastrado (significa `Horário:` genérico demais, sem dia da semana).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
