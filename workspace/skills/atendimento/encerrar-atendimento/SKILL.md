---
name: encerrar-atendimento
description: Encerra o atendimento de forma profissional, com resumo, próximo passo claro e registro na memória.
visibility: atendimento
---

# Skill: Encerrar Atendimento

## Objetivo
Finalizar o atendimento garantindo que o cliente saiba o que vai acontecer a seguir e que o histórico fique registrado.

## Quando usar
- Atendimento chegou a uma conclusão (resposta dada, venda encaminhada, suporte resolvido).
- Transferência para humano foi feita.
- Cliente encerrou a conversa.
- Agente não tem mais informações para avançar e precisa passar o bastão.

## Processo
1. Confirmar que o motivo do contato foi tratado.
2. Informar o próximo passo de forma clara e objetiva.
3. Perguntar se há mais alguma dúvida (uma vez, sem insistir).
4. Registrar resumo do atendimento na memória.
5. Encerrar com despedida curta e natural.

## Regras
- Nunca encerrar sem informar o próximo passo.
- Nunca encerrar se houver pergunta sem resposta.
- Nunca usar despedidas longas ou formais demais ("foi um prazer imenso servi-lo").
- Não repetir tudo o que foi dito — só o essencial.
- Se o problema não foi resolvido, encaminhar para humano antes de encerrar.

## Mensagens padrão de encerramento

Atendimento concluído:
> "Certo, [próximo passo]. Se precisar de mais alguma coisa, é só falar."

Transferência feita:
> "Já passei o resumo para a equipe. Eles vão entrar em contato em breve."

Sem resposta validada:
> "Não tenho essa informação ainda. Vou verificar e retorno."

Encerramento simples:
> "Fico à disposição. Até mais."

## Saída esperada
```yaml
atendimento_id: ""
cliente: ""
motivo: ""
resolucao: ""
proximo_passo: ""
responsavel: ""
registrado_na_memoria: sim | não
```
