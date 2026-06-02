# Segmento: Genérico / Outro

Use quando o cliente não se encaixa nos segmentos pré-definidos
(clínica, e-commerce, vendas B2B, restaurante, educação, serviços).

## Estratégia

1. **Investigue o modelo de negócio** antes de propor agentes:
   - "Vocês vendem produto, serviço ou os dois?"
   - "Receita é por venda única, recorrência, ou projeto?"
   - "Quem é o cliente — outra empresa (B2B) ou consumidor final (B2C)?"
   - "Onde acontece a venda — loja física, online, vendedor externo?"

2. **Mapeie a jornada** do cliente em 4 etapas:
   - Como ele descobre vocês?
   - Como ele decide comprar?
   - Como ele compra de fato?
   - O que acontece depois da compra?

3. **Identifique a etapa mais quebrada** dessa jornada — é ali que o
   primeiro agente entra.

## Perguntas curinga

1. "Se você tivesse que escolher um momento em que vocês perdem mais
   cliente / dinheiro / tempo, qual seria?"
2. "Qual conversa repetitiva consome mais tempo do seu time?"
3. "Tem alguma decisão que sempre fica esperando alguém manual?"
4. "Qual sistema é o 'coração' da operação? Sem ele, o negócio para."

## Time típico (default)

Quase sempre faz sentido começar com:
1. **`clara`** — captura primeiro contato e qualifica.
2. **`camila`** (pós-venda) OU ⚠️ cobrança: `agente-cobranca` não existe
   no roster atual; workaround: `main` (Rafael) + cron — depende da dor
   priorizada.

Adicione outros conforme as dores específicas emergirem.

## Sinalize ao cliente

Diga: "Como o seu negócio é específico, faz sentido começar com um
diagnóstico mais profundo. Vou propor um time inicial conservador (1–2
agentes) e expandir depois que a gente medir o que funciona."

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Como o segmento é genérico, use prompts amplos e ajuste ao que o dono descreveu na Fase 1 (cliente fictício):

### Cenário 1 — Pergunta sobre escopo
> "Vocês fazem [X]?"

**O que Clara deve fazer:** consultar `Produtos ou serviços:` em `memory/empresa.md` e confirmar se está dentro do escopo. Se não estiver, dizer claramente que não faz e (se aplicável) sugerir alternativa.
**Sinal de problema:** Clara afirmou fazer algo que não está em `Produtos ou serviços:` ou foi vaga demais (significa info crítica falta no `memory/empresa.md`).

### Cenário 2 — Preço
> "Quanto custa?"

**O que Clara deve fazer:** consultar `Faixa de preço:` e `Pode falar preço:` em `memory/empresa.md` e responder com o valor ou explicar o critério (proposta, sob consulta).
**Sinal de problema:** Clara inventou preço (significa `Faixa de preço:` vazia) ou deu valor quando dono pediu sempre proposta (significa `Pode falar preço:` não configurada).

### Cenário 3 — Quero falar com alguém (escalação)
> "Prefiro falar com uma pessoa. Como faço?"

**O que Clara deve fazer:** consultar `Quando chamar humano:`, `WhatsApp:` e `Horário:` em `memory/empresa.md` e orientar o canal/horário certo, transferindo se for o caso.
**Sinal de problema:** Clara enrolou o cliente em vez de transferir (significa `Quando chamar humano:` ambíguo ou faltou regra "sempre respeitar pedido explícito de humano").

> Observação pro segmento genérico: se algum cenário não tiver campo correspondente claro no `memory/empresa.md`, verifique se a info necessária está cadastrada e crie campo novo via Rafael antes de re-rodar.

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
