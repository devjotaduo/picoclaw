---
name: lgpd-check
description: Validar coleta, uso e armazenamento de dados pessoais segundo a LGPD. Ativar sempre que a conversa envolver dados pessoais do cliente (nome, CPF, endereço, telefone, email, dados de saúde, dados financeiros) — antes de pedir, registrar, mostrar ou repassar. Inclui mascaramento, princípio da mínima coleta, consentimento e atendimento a direitos do titular (acesso, correção, exclusão, portabilidade).
version: 1.0.0
language: pt-br
---

# LGPD Check

## Princípios

- **Mínima coleta**: pedir só o que é necessário para o atendimento atual. Se dá pra atender com nome + email, não pedir CPF.
- **Mascarar quando registrar**: CPF e cartão sempre parciais em logs/resumos (ex.: `***.***.***-12`, `cartão final 1234`).
- **Consentimento explícito** para dados sensíveis (saúde, biometria, dados de menores, financeiros completos).
- **Não compartilhar** dados pessoais com terceiros ou canais não autorizados.
- **Direitos do titular** sempre encaminhados ao DPO/setor responsável — nunca processados aqui.

## Workflow

1. Antes de pedir um dado, perguntar internamente: "Esse dado é necessário pra esta resposta? Posso resolver com menos?"
2. Ao receber um dado sensível, confirmar com a pessoa o uso ("Vou usar seu CPF só para identificar seu pedido, ok?").
3. Ao registrar um caso, mascarar dados sensíveis no resumo.
4. Ao mostrar dados de pedido/conta, confirmar identidade antes (`customer-identity-verification`).
5. Se a pessoa pedir acesso, correção, portabilidade ou exclusão de dados → encaminhar imediatamente ao DPO/setor responsável.

## Exemplos

**Cenário**: "Quero ver meu pedido."
- ✅ "Pode me passar o número do pedido OU seu CPF que eu localizo." (escolha — mínima coleta)
- ❌ Pedir CPF, endereço, telefone e email todos de uma vez.

**Cenário**: pessoa envia foto do RG por mensagem.
- ✅ "Recebi, obrigado. Vou anexar ao seu caso e a equipe responsável continua com você. Por segurança, evite enviar documentos completos por aqui sem necessidade."
- ❌ Encaminhar a imagem para qualquer pessoa sem registro de finalidade.

**Cenário**: "Quero apagar meus dados."
- ✅ "Vou encaminhar seu pedido para a equipe responsável pela privacidade (DPO). Eles te retornam em até 15 dias com a confirmação."
- ❌ "Pronto, apaguei." (não há autoridade para fazer isso aqui)

**Cenário**: registrar reclamação no sistema.
- ✅ "Cliente: João Silva, CPF ***.***.***-12, pedido #1234, reclamação sobre atraso na entrega."
- ❌ Anotar CPF completo no resumo.

## Encaminhamento

Encaminhar ao DPO ou setor responsável pela privacidade quando:
- A pessoa exercer qualquer direito do titular (acesso, correção, exclusão, portabilidade, anonimização).
- Houver suspeita de vazamento, uso indevido ou pedido de dados de terceiros.
- A coleta exigir consentimento formal documentado.
- A pessoa for menor de idade e o atendimento exigir dados além do mínimo.
