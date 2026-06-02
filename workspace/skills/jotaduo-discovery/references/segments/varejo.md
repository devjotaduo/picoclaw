# Segmento: Varejo / Loja física / Boutique

Use para lojas físicas, boutiques, papelarias, petshops, mercearias —
varejo que vende produtos com estoque (não inclui e-commerce puro; pra
isso, ver `ecommerce.md`).

## Vocabulário

Produto, estoque, prateleira, vitrine, troca, devolução, garantia,
ticket médio, fidelidade, conferência.

## Perguntas específicas

1. "Vocês têm catálogo organizado em algum lugar? Site, planilha,
   Instagram, ou só na loja?"
2. "Estoque é controlado em algum sistema? (Bling, Tiny, planilha,
   PDV próprio)"
3. "Política de troca: quantos dias? Precisa de nota fiscal? Troca
   ou só vale-compra?"
4. "Fazem entrega local? Cobram frete?"
5. "Como o cliente normalmente descobre vocês — passa na rua,
   Instagram, indicação?"
6. "Têm dor de cliente perguntar se tem produto X e a equipe não
   saber sem ir conferir?"
7. "Programa de fidelidade ou cliente VIP existe? Como funciona?"

## Dores típicas

- Cliente pergunta no WhatsApp se tem X, equipe demora pra responder
  porque precisa conferir.
- Política de troca confusa — cada atendente fala uma coisa.
- Cliente vem, não acha, vai pro concorrente.
- Estoque desencontrado entre o que o sistema diz e o real.
- Fidelização zero — comprou uma vez e nunca mais.
- Vitrine de Instagram desatualizada.

## Integrações comuns

- **Estoque/PDV**: Bling, Tiny, Omie, Conta Azul, PDV próprio.
- **Catálogo**: site próprio, Instagram, planilha compartilhada.
- **Atendimento**: WhatsApp Business, Instagram DM.
- **Pagamento**: maquininha, Pix, link de pagamento (Mercado Pago).

## Time típico de agentes para varejo

1. **`clara`** (entra primeiro) — atende WhatsApp/IG
   sobre disponibilidade, preço, localização, horário. Reduz fila do
   atendente físico.
2. **`marcos`** — quando lead quente, conduz pra compra
   (Pix, link de pagamento, reserva pra retirada).
3. **`camila`** — segunda venda, reativação, programa
   fidelidade simples.

## Métricas a propor

- Conversão de pergunta no WhatsApp → visita à loja.
- Tempo de resposta médio.
- % de cliente que volta em 90 dias.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Disponibilidade de produto
> "Vocês têm vestido floral tamanho M?"

**O que Clara deve fazer:** consultar `Produtos ou serviços:` e
catálogo em `memory/empresa.md`. Se a info estiver lá, confirmar e
sugerir reservar/passar na loja. Se NÃO tiver acesso a estoque real,
dizer "vou checar e te respondo em <X min>" — NÃO inventar.
**Sinal de problema:** Clara afirmou ter o produto sem checar (significa
falta integração de estoque OU `Produtos ou serviços:` cadastrado de
forma específica demais e ficou desatualizado).

### Cenário 2 — Política de troca
> "Comprei semana passada e não serviu. Posso trocar?"

**O que Clara deve fazer:** consultar a política em `memory/empresa.md`
(campo `Quando chamar humano:` ou seção de troca) e responder o prazo,
condições (nota, etiqueta) e se é troca direta ou vale-compra.
**Sinal de problema:** Clara disse "deixa eu confirmar" pra algo que
deveria ser regra fixa da loja (significa política de troca não
formalizada em `memory/empresa.md`).

### Cenário 3 — Entrega/Frete
> "Vocês entregam? Quanto custa o frete pra <bairro>?"

**O que Clara deve fazer:** consultar `Regiões atendidas:` e regra de
frete em `memory/empresa.md`. Responder cobertura e valor, ou redirecionar
pra retirada se for fora da área.
**Sinal de problema:** Clara inventou valor de frete (significa regra
de frete não cadastrada — precisa documentar valor por bairro/distância
ou política "frete grátis acima de R$X").

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
