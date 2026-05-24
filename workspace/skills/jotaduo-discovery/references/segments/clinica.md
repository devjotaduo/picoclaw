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

1. **`agente-recepcionista`** (entra primeiro) — atende WhatsApp 24/7,
   responde dúvidas sobre especialidades, preços de particular,
   localização, convênios aceitos.
2. **`agente-agendador`** — marca/remarca/cancela, confirma consulta
   24h antes, integra com a agenda do sistema clínico.
3. **`agente-pos-venda`** (segunda onda) — lembrete de retorno, pesquisa
   de satisfação, reativação de paciente inativo.
4. **`agente-cobranca`** (se houver dor de inadimplência em particular)
   — envia 2ª via, lembra vencimento.

## Métricas a propor

- Redução de no-show (meta típica: -30% a -50%).
- Tempo de resposta no WhatsApp (meta: < 1 min, 24/7).
- Taxa de retorno de paciente em 6 meses (meta: +20%).
- Horas/semana economizadas na recepção.
