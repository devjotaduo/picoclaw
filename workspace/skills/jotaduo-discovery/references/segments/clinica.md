# Segmento: Clínica / Consultório

Use este guia quando o cliente for clínica médica, odontológica,
veterinária, estética, fisioterapia, psicologia ou consultório autônomo.

## Vocabulário

Use: paciente, agendamento, consulta, retorno, prontuário, convênio,
particular, no-show, recepção, profissional, especialidade.

## Perguntas específicas (acrescente ao roteiro base)

1. "Vocês atendem particular, convênio ou os dois? Quais convênios?"
2. "Quantos profissionais atendem na clínica e quantas especialidades?"
3. "Como o paciente marca consulta hoje — telefone, WhatsApp, site, app
   do convênio?"
4. "Vocês usam algum sistema de gestão clínica? (iClinic, Doctoralia,
   Clínica nas Nuvens, Feegow, Tasy, planilha)"
5. "Qual o índice de no-show / faltas hoje? Vocês confirmam consulta?"
6. "Como funciona o pós-consulta — retorno, lembrete de exame, indicação?"
7. "Como é o fluxo de cobrança quando é particular?"
8. "LGPD: vocês têm política de tratamento de dados de paciente
   formalizada? Quem cuida disso?"

## Dores típicas (sondar)

- No-show alto e custo de cadeira ociosa.
- Recepcionista sobrecarregado respondendo WhatsApp.
- Falta de confirmação ativa de consulta.
- Paciente que fez uma vez e nunca mais voltou (baixa recorrência).
- Cobrança de particular escapando.
- Marcação fora do horário comercial perdida.

## Integrações comuns

- **Agenda**: Google Calendar, iClinic, Doctoralia, Feegow, Clínica nas
  Nuvens.
- **Atendimento**: WhatsApp Business API, Instagram, site.
- **Pagamento**: Asaas, PagSeguro, link de pagamento de convênio.
- **Comunicação**: SMS (lembrete), e-mail.

## Restrições importantes (LGPD / CFM)

- Não armazenar dados clínicos sensíveis no agente sem termo de
  consentimento.
- Agente não dá diagnóstico nem orientação médica. Sempre encaminha para
  profissional.
- Marcações com nome completo e telefone são OK; histórico clínico só
  com consentimento explícito e arquitetura adequada.

## Time típico de agentes para clínica

1. **`clara`** (entra primeiro) — atende WhatsApp 24/7,
   responde dúvidas sobre especialidades, preços de particular,
   localização, convênios aceitos.
2. ⚠️ **agendamento** — `agente-agendador` não existe no roster atual.
   Confirmação 24h / marcação integrada com sistema clínico: ampliar
   `camila` ou criar agente dedicado via `operador` + `skill-creator`.
3. **`camila`** (segunda onda) — lembrete de retorno, pesquisa
   de satisfação, reativação de paciente inativo.
4. ⚠️ **cobrança** — `agente-cobranca` não existe no roster atual.
   Workaround: `main` (Rafael) + cron para alertas de inadimplência.
   Automação completa de cobrança: marcar como "a validar".

## Métricas a propor

- Redução de no-show (meta típica: -30% a -50%).
- Tempo de resposta no WhatsApp (meta: < 1 min, 24/7).
- Taxa de retorno de paciente em 6 meses (meta: +20%).
- Horas/semana economizadas na recepção.

## Cenários de teste pra Clara simular (Fase 5 do discovery)

Antes de liberar o tenant, Sofia delega pra Clara simular 3 atendimentos típicos pra dono validar tom + acurácia. Use estes prompts (paciente fictício):

### Cenário 1 — Agendamento de consulta
> "Oi, queria marcar uma consulta pra essa semana, dá pra encaixar?"

**O que Clara deve fazer:** consultar `Canal de agendamento:` e `Horário:` em `memory/empresa.md`, orientar como marcar (link/telefone/transferência humana) sem inventar horário disponível.
**Sinal de problema:** Clara prometeu horário específico sem checar agenda (significa que `Canal de agendamento:` não está claro ou faltou regra de "nunca confirmar horário sem consultar agenda").

### Cenário 2 — Preço de particular
> "Quanto custa a consulta particular?"

**O que Clara deve fazer:** consultar `Faixa de preço:` e `Pode falar preço:` em `memory/empresa.md` e responder com o valor exato cadastrado.
**Sinal de problema:** Clara inventou preço ou disse "depende, vou verificar" (significa `Faixa de preço:` vazia ou `Pode falar preço:` não foi definido).

### Cenário 3 — Convênio (escalação)
> "Vocês atendem meu convênio? É Amil."

**O que Clara deve fazer:** consultar `Convênios aceitos:` em `memory/empresa.md`. Se o convênio não estiver na lista, dizer que não atende esse e oferecer particular ou encaminhar pro humano.
**Sinal de problema:** Clara confirmou convênio que não está na lista (significa `Convênios aceitos:` desatualizado ou faltando regra "só confirmar convênios listados").

## Pra Sofia avaliar com o dono

Depois que Clara responder os 3 cenários, Sofia mostra pro dono assim:
"Olha como a Clara vai atender. Tá no tom certo? Algo a ajustar?"

Coleta feedback. Se dono apontar problema, Sofia identifica QUAL info no `memory/empresa.md` precisa mudar e delega pro Rafael atualizar. Re-roda só o cenário que mudou.
