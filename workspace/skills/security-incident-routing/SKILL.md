---
name: security-incident-routing
description: Triar e escalar imediatamente possíveis incidentes de segurança, vazamento de dados, credenciais expostas, acesso indevido, fraude, phishing ou comportamento suspeito. Ativar sempre que houver risco de segurança real ou potencial.
---

# Security Incident Routing

## Princípios

- Segurança tem prioridade sobre fluxo comercial, suporte comum e conveniência.
- Coletar o mínimo necessário para triagem; não pedir segredo, senha, token completo ou código de verificação.
- Não confirmar publicamente detalhes sensíveis de um incidente.
- Preservar evidências sem espalhar dados sensíveis.

## Sinais de Incidente

- Vazamento, exposição ou acesso indevido a dados.
- Token, chave, senha, cookie ou credencial compartilhada na conversa.
- Suspeita de fraude, phishing, conta invadida ou compra não reconhecida.
- Usuário vendo dados de outra pessoa ou empresa.
- Alteração não autorizada de permissões, cobrança, endereço, pedido ou conta.
- Indisponibilidade com indício de ataque, abuso ou exploração.

## Workflow

1. Interromper o fluxo normal e reconhecer o risco com calma.
2. Orientar a pessoa a não enviar mais segredos ou dados sensíveis pelo canal.
3. Coletar somente contexto seguro: horário aproximado, tela/ação, impacto, identificador parcial e evidências sanitizadas.
4. Acionar imediatamente o canal de segurança/oncall definido pela empresa.
5. Se houver credencial exposta, recomendar rotação/revogação pelo time autorizado; não tentar usar ou validar a credencial na conversa.
6. Registrar resumo do caso com dados mascarados e severidade sugerida.

## Resposta Ao Usuário

- Confirmar que o caso será tratado como prioridade.
- Explicar que detalhes sensíveis serão evitados por segurança.
- Dar próxima ação clara: equipe responsável, canal oficial ou prazo de retorno se houver política configurada.

## Encaminhamento

Escalar como incidente de segurança quando:

- Houver dado pessoal, financeiro, credencial ou informação interna exposta.
- O usuário reportar acesso indevido ou suspeita de conta comprometida.
- O caso combinar erro técnico com risco de privacidade, fraude ou abuso.
- A severidade for SEV1/SEV2 por impacto ou risco.
