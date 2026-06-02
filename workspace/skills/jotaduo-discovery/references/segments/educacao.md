# Segmento: Educação

Use para escolas, cursos livres, idiomas, cursinhos, EAD, mentoria e
plataformas de curso online.

## Vocabulário

Aluno, matrícula, turma, mensalidade, evasão, módulo, certificado, tutor,
LMS, trial.

## Perguntas específicas

1. "Vocês são presencial, online (EAD), ou híbrido?"
2. "Cobram mensalidade recorrente, curso avulso, ou os dois?"
3. "Qual LMS / plataforma de curso? (Hotmart, Eduzz, Kiwify, Moodle,
   Genial, Sponte, próprio)"
4. "Como o aluno chega hoje — anúncio, indicação, evento, prova?"
5. "Qual a taxa de conversão de interessado para matrícula?"
6. "Tem evasão / desistência alta? Em qual módulo costuma cair?"
7. "Como é a cobrança da mensalidade hoje?"
8. "Vocês fazem reativação de aluno que parou?"

## Dores típicas

- Lead chega no Instagram/WhatsApp pedindo info e demora resposta.
- Funil de matrícula longo, vendedor manual.
- Aluno entra na primeira semana, some na terceira.
- Inadimplência de mensalidade.
- Tutor afogado em dúvida operacional ("como acesso a aula?", "quando
  sai certificado?").

## Integrações comuns

- **LMS**: Hotmart, Eduzz, Kiwify, Moodle, Memberkit, Sponte.
- **Pagamento recorrente**: Asaas, Vindi, Pagar.me, Stripe.
- **Atendimento**: WhatsApp Business, Discord (cohorts), Telegram.
- **CRM**: RD Station, HubSpot.

## Time típico de agentes para educação

1. **`marcos`** (entra primeiro) — recebe lead do anúncio,
   tira dúvida sobre curso, agenda call de matrícula ou já manda link.
2. **`clara`** (suporte ao aluno) — responde dúvidas
   operacionais: acesso, certificado, plataforma.
3. ⚠️ **cobrança** — `agente-cobranca` não existe no roster atual.
   Workaround: `main` (Rafael) + cron para lembretes de mensalidade.
   Automação de renegociação: marcar como "a validar".
4. **`camila`** (= retenção) — acompanha progresso do aluno,
   reengaja quem parou de assistir aula.

## Métricas a propor

- Taxa de matrícula sobre leads de anúncio.
- Taxa de conclusão do curso.
- Inadimplência de mensalidade.
- Tempo de resposta para dúvida de aluno.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (lead/aluno fictício):

### Cenário 1 — Interesse em curso
> "Vocês têm curso de [tema]? Quero começar do zero."

**O que Clara deve fazer:** consultar `Produtos ou serviços:` em `memory/empresa.md` e confirmar se o curso existe, com info de carga horária / formato (presencial, EAD, híbrido).
**Sinal de problema:** Clara inventou curso ou prometeu nível que não existe (significa `Produtos ou serviços:` incompleto, sem grade detalhada).

### Cenário 2 — Como faz matrícula
> "Como faço pra me matricular?"

**O que Clara deve fazer:** consultar `Canal de agendamento:` (ou link de matrícula) e `Formas de pagamento:` em `memory/empresa.md` e explicar o passo a passo cadastrado.
**Sinal de problema:** Clara mandou genericamente "fale com a secretaria" (significa que processo de matrícula não está cadastrado).

### Cenário 3 — Preço e parcelamento
> "Quanto custa? Posso pagar parcelado?"

**O que Clara deve fazer:** consultar `Faixa de preço:`, `Pode falar preço:` e `Formas de pagamento:` em `memory/empresa.md` e responder com valor e opções de parcelamento cadastradas.
**Sinal de problema:** Clara inventou parcelamento ou desconto (significa `Formas de pagamento:` incompleta ou faltou regra "nunca oferecer desconto não autorizado").

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
