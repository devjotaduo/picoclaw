# Segmento: E-commerce

Use este guia para lojas online, marketplaces, dropshipping e D2C.

## Vocabulário

Cliente, pedido, carrinho, checkout, abandono, ticket médio, conversão,
estoque, frete, devolução, marketplace, reviews.

## Perguntas específicas

1. "Em qual plataforma a loja roda? (Shopify, Nuvemshop, Tray, WooCommerce,
   loja própria, marketplaces como Mercado Livre / Shopee / Amazon)"
2. "Qual o ticket médio e quantos pedidos por mês?"
3. "Onde está o maior gargalo: gerar tráfego, converter no checkout,
   reduzir devolução, ou atender pós-venda?"
4. "Como é o atendimento hoje — WhatsApp, chat do site, e-mail?"
5. "Vocês têm taxa alta de abandono de carrinho? Já recuperam de alguma
   forma?"
6. "Como funciona o pós-venda — pedido de review, recompra, programa de
   fidelidade?"
7. "Qual o sistema de gestão / ERP? (Bling, Tiny, Conta Azul, próprio)"

## Dores típicas

- Atendimento lento, cliente desiste antes de comprar.
- Carrinho abandonado sem recuperação ativa.
- Dúvidas pré-compra que se repetem (frete, prazo, tamanho).
- Reviews escassos, prova social fraca.
- Pós-venda inexistente, baixa recompra.
- Rastreamento e segunda via de boleto consomem o suporte.

## Integrações comuns

- **Plataforma**: Shopify, Nuvemshop, WooCommerce, Tray, VTEX, Magento.
- **ERP**: Bling, Tiny, Omie, Conta Azul.
- **Atendimento**: WhatsApp Business, JivoChat, Tawk, Zendesk.
- **Pagamento**: Mercado Pago, Pagar.me, Stripe, Pix.
- **Marketing**: Meta Ads, Google Ads, RD Station, Mailchimp.

## Time típico de agentes para e-commerce

1. **`agente-recepcionista`** (entra primeiro) — responde frete, prazo,
   trocas, política de devolução; consulta status de pedido.
2. **`agente-vendedor`** — conduz dúvida pré-compra até o checkout, envia
   link, recupera carrinho abandonado.
3. **`agente-pos-venda`** — pede review após entrega, oferece cross-sell,
   reativa cliente inativo.
4. **`agente-suporte`** (se dor for rastreamento/2ª via) — integra com
   transportadora e gateway de pagamento.

## Métricas a propor

- Taxa de conversão do chat / WhatsApp.
- % de carrinhos recuperados.
- NPS / quantidade de reviews coletados.
- Taxa de recompra em 60 dias.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Frete e prazo por CEP
> "Vocês entregam no CEP 01310-100? Quanto fica e quantos dias?"

**O que Clara deve fazer:** consultar `Regiões atendidas:` e política de frete em `memory/empresa.md` ou integração de transportadora. Se não tiver integração, dar faixa estimada cadastrada ou orientar a calcular no site.
**Sinal de problema:** Clara inventou valor de frete ou prazo (significa `Regiões atendidas:` vazia ou política de frete não cadastrada).

### Cenário 2 — Estoque do produto
> "Esse produto [X] tá em estoque pra entrega imediata?"

**O que Clara deve fazer:** consultar `Produtos ou serviços:` ou integração de ERP em `memory/empresa.md`. Se não tiver integração de estoque em tempo real, dizer que confirma com a equipe e oferecer alternativa.
**Sinal de problema:** Clara afirmou ter estoque sem checar (significa que faltou regra "nunca confirmar estoque sem consultar ERP").

### Cenário 3 — Troca / devolução (escalação)
> "Comprei aí e não serviu. Como faço pra trocar?"

**O que Clara deve fazer:** consultar política de troca em `memory/empresa.md` (prazo, condições, quem paga frete reverso) e orientar o passo a passo. Se for caso complexo, escalar consultando `Quando chamar humano:`.
**Sinal de problema:** Clara prometeu troca ou reembolso fora da política (significa "Política de troca" não cadastrada ou genérica demais).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
