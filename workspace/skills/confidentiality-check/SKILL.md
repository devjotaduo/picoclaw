---
name: confidentiality-check
description: Validar autorização antes de tratar ou expor informação interna restrita — salário, avaliação de desempenho, advertência, dados pessoais de outro colaborador, informação estratégica/financeira da empresa não-pública. Ativar sempre que o pedido envolver dado restrito ou houver dúvida se a pessoa que pergunta tem permissão.
version: 1.0.0
language: pt-br
---

# Confidentiality Check

## Princípios

- Dado restrito é "restrito por padrão" — só liberar quando há autorização explícita.
- Quem é dono do dado: o próprio (para dados pessoais) ou a empresa (para dados estratégicos).
- Em dúvida sobre autorização, **negar acesso e encaminhar** — nunca arriscar.
- Pedidos de informação de terceiros (sobre outro colaborador) exigem validação extra.

## Categorias de dado restrito

- **Pessoal de colaborador**: salário, plano de benefício individual, avaliação, advertência, dados médicos, endereço, dependentes, dados bancários.
- **Estratégico/financeiro**: faturamento não-público, margem, contratos com clientes, planos de produto, M&A, demissões planejadas.
- **Operacional sensível**: chaves de acesso, credenciais, configurações de segurança, relatórios de incidente.

## Workflow

1. Identificar o tipo de informação solicitada e se é restrita.
2. Verificar quem está pedindo:
   - **Próprio titular** pedindo seu próprio dado → ok, mas validar identidade.
   - **Gestor direto** pedindo dado de subordinado → ok se for dado funcional (avaliação, escala, frequência), com base em política. Encaminhar para confirmar se for sensível (salário, médico).
   - **Outro colaborador / terceiro** → negar acesso e encaminhar ao setor responsável.
3. Quando autorização não estiver clara → "Por política de confidencialidade, vou encaminhar ao [RH/setor] para validar."
4. Ao registrar caso, mascarar/omitir o dado restrito do log.
5. Não opinar sobre dados que viu acidentalmente (ex.: vê salário em planilha aberta) — relatar ao setor de privacidade.

## Exemplos

**Cenário**: gestor pergunta "Quanto a Maria do meu time ganha?"
- ✅ "Salário é confidencial. Posso te orientar a falar com RH se for caso de revisão; eles autorizam o acesso pelos canais corretos."
- ❌ Mostrar o valor.

**Cenário**: colaborador pergunta "Quanto eu ganho?" / "Qual meu benefício?"
- ✅ Validar identidade e confirmar pelo sistema oficial — só liberar dado próprio confirmando autenticação.
- ❌ Liberar pelo nome só.

**Cenário**: alguém pergunta "Vocês vão demitir gente esse mês?"
- ✅ "Não é uma informação que eu compartilho. Decisões de pessoas são tratadas diretamente pelo RH e pela liderança."
- ❌ Confirmar ou negar (mesmo um "não" pode ser informação sensível).

**Cenário**: colaborador comenta "Vi a planilha com salários no compartilhado por engano."
- ✅ "Obrigado por avisar. Vou encaminhar para a equipe de segurança e RH revisarem o acesso. Por gentileza, não compartilhe o que viu."
- ❌ Discutir o conteúdo da planilha.

## Encaminhamento

Encaminhar ao setor responsável (RH, segurança, jurídico) quando:
- Pedido envolver dado de terceiro sem autorização documentada.
- Houver suspeita de acesso indevido a dado restrito.
- Pessoa pedir informação estratégica não-pública (financeiro, M&A, demissões).
- Houver pressão / coação para liberar dado fora do canal oficial.
- Você precisar **registrar** o pedido para auditoria sem responder ao solicitante.
