# Segmento: Beleza / Estética / Bem-estar

Use para salão de beleza, barbearia, estética, manicure, depilação,
spa, massagem terapêutica.

## Vocabulário

Agendamento, profissional, serviço, pacote, comissão, cabine, cliente
recorrente, retorno, sinal/caução.

## Perguntas específicas

1. "Vocês trabalham com agendamento prévio ou ordem de chegada?"
2. "Quais serviços oferecem? Manda uma lista mesmo informal."
3. "Quantos profissionais atendem? Cliente escolhe ou vai com quem
   tiver livre?"
4. "Tem sistema de agenda? (Trinks, Booksy, Genyplus, Belezzz, Doctoralia,
   Google Agenda, papel)"
5. "Cobram sinal pra reservar horário? Política de cancelamento?"
6. "Têm pacote/combo (ex: 5 sessões de depilação)? Como controlam?"
7. "Cliente que sumiu — fazem reativação?"

## Dores típicas

- No-show alto (15-30%) — horário furado = receita perdida.
- Recepcionista atendendo WhatsApp + cliente presencial.
- Cliente liga pra marcar e ninguém atende em horário de pico.
- Agenda bagunçada entre WhatsApp e sistema.
- Cliente da promoção que nunca volta no preço cheio.
- Profissional faltou, ninguém avisou cliente.

## Integrações comuns

- **Agenda**: Trinks, Booksy, Genyplus, Belezzz, Google Agenda.
- **Atendimento**: WhatsApp Business, Instagram DM.
- **Pagamento**: Pix, link de pagamento, máquina, sinal por Pix.
- **Fidelidade**: planilha, app próprio (raro).

## Time típico de agentes para beleza

1. **`clara`** (entra primeiro) — atende WhatsApp,
   responde preço de serviços, faz pré-agendamento.
2. ⚠️ **agendamento** — `agente-agendador` não existe no roster atual.
   Confirmação 24h / gestão de pacotes / reagendamento: ampliar `camila`
   ou criar agente dedicado via `operador` + `skill-creator`.
3. **`camila`** — pergunta como ficou, oferece retorno,
   reativa cliente que sumiu há >60d.

## Métricas a propor

- No-show reduzido (alvo: -50%).
- Cadeira ociosa por dia (custo direto).
- Recompra em 60 dias.
- Conversão WhatsApp → agendamento.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (cliente fictício):

### Cenário 1 — Disponibilidade de horário
> "Tem horário hoje pra fazer escova?"

**O que Clara deve fazer:** consultar `Horário:`, `Canal de agendamento:`
e `Produtos ou serviços:` em `memory/empresa.md`. Se houver integração
com sistema de agenda, conferir disponibilidade real; se não, dizer "vou
checar a agenda e te respondo em <X min>" OU oferecer agendamento
direto pelo Trinks/Booksy.
**Sinal de problema:** Clara inventou horário (significa falta
integração de agenda OU falta protocolo "redirecionar pro link
externo").

### Cenário 2 — Preço de serviço
> "Quanto custa fazer luzes?"

**O que Clara deve fazer:** consultar `Faixa de preço:` e
`Produtos ou serviços:` (com tabela de preços) em `memory/empresa.md`.
Se preço varia por profissional/tamanho do cabelo/etc, responder a faixa
e perguntar dados pra estimar.
**Sinal de problema:** Clara cravou um preço sem mencionar faixa quando
o serviço VARIA (significa tabela de preços não cadastrada com nuance,
ou `Pode falar preço:` está como "pode informar" mas não tem dado).

### Cenário 3 — Escolha de profissional
> "Faz com a Vanessa? Só com ela mesmo."

**O que Clara deve fazer:** consultar lista de profissionais em
`memory/empresa.md` (campo dedicado ou seção do cadastro). Se Vanessa
existe, confirmar agenda dela; se não existir, dizer claramente
("não temos profissional com esse nome") e oferecer alternativa.
**Sinal de problema:** Clara confirmou Vanessa sem checar OU não soube
responder (significa lista de profissionais não está em
`memory/empresa.md` — precisa cadastrar).

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
