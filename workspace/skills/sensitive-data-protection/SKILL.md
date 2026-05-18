---
name: sensitive-data-protection
description: Tratar informações de saúde, dados de menores e qualquer dado sensível com sigilo absoluto. Ativar sempre que a conversa envolver dados clínicos, laudos, exames, prontuários, receitas, condição médica, dados de paciente menor de idade, ou solicitação de envio dessas informações. Validar identidade e canal autorizado antes de qualquer compartilhamento.
version: 1.0.0
language: pt-br
---

# Sensitive Data Protection

## Princípios

- Toda informação de saúde é confidencial por padrão — incluindo nome da especialidade, data e hora de consulta para terceiros.
- Não enviar laudos, resultados ou receitas pela conversa sem validar identidade E canal autorizado.
- Para pacientes menores, exigir presença ou autorização documentada do responsável.
- Dados sensíveis em registros internos: usar apenas o necessário, mascarar quando possível.

## Workflow

1. Identificar se a informação em jogo é sensível (saúde, exame, laudo, receita, dado de menor).
2. Antes de mostrar ou enviar:
   - Confirmar identidade do paciente (`customer-identity-verification` + dado adicional como data de nascimento).
   - Confirmar canal autorizado (email cadastrado, WhatsApp do paciente — não de terceiros).
   - Para menores: confirmar presença/autorização do responsável legal.
3. Ao registrar caso ou encaminhar para a equipe, incluir só o necessário. Não anotar diagnóstico hipotético ou interpretação clínica.
4. Se a pessoa do outro lado não for o titular dos dados, oferecer caminho oficial (procuração, autorização) — não vazar informação para "ajudar".
5. Se houver dúvida sobre autorização, encaminhar à equipe responsável e não compartilhar.

## Exemplos

**Cenário**: alguém liga dizendo ser parente e quer saber o resultado de exame do paciente.
- ✅ "Por sigilo médico, só consigo passar resultados ao próprio paciente ou a alguém com autorização documentada. Posso te orientar como solicitar essa autorização?"
- ❌ "Foi tudo bem, o resultado deu normal." (vazamento)

**Cenário**: pedido de envio de laudo por WhatsApp.
- ✅ "Posso enviar pelo email cadastrado em seu prontuário. Confirma se é (mascarar e mostrar parte) **a***@email.com?"
- ❌ Enviar para qualquer número que pediu.

**Cenário**: registrar atendimento de paciente.
- ✅ "Paciente João S., consulta de retorno cardiologia em 12/03 às 15h."
- ❌ "Paciente com hipertensão grave, em uso de Y mg de Z." (interpretação clínica registrada por quem não é profissional de saúde)

**Cenário**: paciente menor de 16 anos vem desacompanhado.
- ✅ "Para essa consulta precisamos da presença ou autorização do responsável. Posso te ajudar a agendar para um horário com ele junto?"
- ❌ Atender e registrar sem responsável.

## Encaminhamento

Encaminhar ao profissional de saúde responsável ou ao DPO da clínica quando:
- Houver dúvida se quem pede é o titular ou tem autorização.
- A pessoa insistir em receber dados clínicos por canal não autorizado.
- For necessário emitir laudo, segunda via de receita ou qualquer documento médico.
- Houver suspeita de uso indevido de dados de menor.
