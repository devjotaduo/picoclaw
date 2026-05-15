---
name: severity-classification
description: Classificar severidade de um incidente ou bug (SEV1 produção parada, SEV2 funcionalidade crítica degradada, SEV3 funcionalidade não-crítica com workaround, SEV4 cosmético) e direcionar o fluxo de escalação correspondente. Ativar ao montar bug report, abrir incidente ou priorizar fila de suporte.
---

# Severity Classification

## Princípios

- Severidade reflete **impacto no usuário e no negócio**, não complexidade técnica.
- Em dúvida entre dois níveis, escolher o mais alto — engenharia rebaixa se for o caso.
- Severidade aumenta com escala: 1 cliente afetado ≠ 1000 clientes afetados.
- Comunicação ao usuário muda conforme a severidade.

## Níveis padrão

| Nível | Definição                                                              | Resposta esperada                |
| ----- | ---------------------------------------------------------------------- | -------------------------------- |
| SEV1  | Produção parada / serviço inacessível / perda de dados / risco de segurança em produção / muitos clientes bloqueados | Acionar oncall imediatamente. Comunicação pública pode ser necessária. |
| SEV2  | Funcionalidade crítica degradada para muitos usuários, sem workaround viável; ou poucos clientes em bloqueio total que não conseguem operar | Escalar para engenharia no mesmo dia útil. Manter cliente atualizado. |
| SEV3  | Funcionalidade não-crítica com workaround, ou problema funcional para poucos usuários | Entrar no backlog priorizado. Resposta dentro de prazo padrão de SLA. |
| SEV4  | Bug cosmético, UX menor, melhoria sugerida, comportamento confuso mas não-bloqueante | Entrar no backlog. Sem prazo apertado. |

## Sinais por nível

- **SEV1**: "ninguém consegue entrar", "perdi todos os meus dados", "está cobrando errado em escala", "vazamento de dados", "serviço fora do ar há X minutos"
- **SEV2**: "não consigo finalizar minha venda há uma hora", "um módulo inteiro está fora", "vários clientes me reportaram isso hoje"
- **SEV3**: "esse botão não funciona em um caso específico, mas tenho como contornar", "uma funcionalidade auxiliar está com erro intermitente"
- **SEV4**: "esse texto está cortado", "ícone errado", "sugestão de melhoria"

## Workflow

1. Coletar contexto do `technical-troubleshooting`: o que está quebrado, quantos afetados, qual o impacto, há workaround?
2. Avaliar contra os critérios da tabela acima.
3. Quando em dúvida entre dois níveis adjacentes, escolher o mais alto.
4. Para SEV1/SEV2, considerar também se há risco de segurança → pode exigir `security-incident-routing` em paralelo.
5. Anexar a severidade no bug report e no ticket.
6. Acionar canal de escalação correspondente: oncall (SEV1), eng. no mesmo dia (SEV2), fila padrão (SEV3/SEV4).

## Exemplos

**Cenário**: "Não consigo logar."
- Se isolado em 1 usuário com mensagem específica → **SEV3** (provavelmente caso isolado, há workaround tipo trocar senha).
- Se vários usuários reportando o mesmo no mesmo período → **SEV1 ou SEV2** dependendo da escala.

**Cenário**: "O ícone do botão de salvar está pixelado."
- **SEV4**.

**Cenário**: "Comprei plano premium mas estou vendo a tela do free."
- **SEV2** no mínimo (cliente pagante bloqueado de funcionalidade central).

**Cenário**: "Notei que o sistema está expondo o email de outros usuários em uma URL."
- **SEV1** — incidente de segurança. Acionar `security-incident-routing` em paralelo.

## Encaminhamento

- **SEV1**: acionar oncall/plantão imediatamente conforme runbook da empresa. Notificar liderança técnica.
- **SEV2**: encaminhar à engenharia no mesmo dia útil. Manter o cliente atualizado.
- **SEV3**: encaminhar à fila de engenharia com prazo padrão de SLA.
- **SEV4**: entrar no backlog priorizado por produto.
- **Qualquer caso com risco de segurança**: além da escalação por severidade, acionar `security-incident-routing` em paralelo.
