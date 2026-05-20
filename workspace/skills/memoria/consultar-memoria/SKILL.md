---
name: consultar-memoria
description: Consulta a memória da empresa antes de responder, vender, atender ou encaminhar.
visibility: global
---

# Skill: Consultar Memória

## Objetivo
Consultar os arquivos corretos da memória antes de responder ao cliente, orientar o dono ou acionar outro agente.

## Quando usar
Use quando:
- o cliente fizer pergunta sobre a empresa;
- o agente precisar confirmar horário, preço, serviço ou regra;
- houver dúvida sobre canal autorizado;
- houver necessidade de classificar lead;
- houver necessidade de consultar histórico;
- houver pedido de suporte;
- houver risco de inventar informação.

## Processo
1. Identificar o tipo de pergunta.
2. Escolher o arquivo de memória correto.
3. Consultar a informação.
4. Verificar se a informação está validada.
5. Se a informação estiver clara, responder.
6. Se estiver ausente ou incerta, não inventar.
7. Se necessário, encaminhar para Rafael ou Atendimento Humano.
8. Se descobrir algo novo, sugerir atualização da memória.

## Arquivos
- Empresa e FAQ: memory/empresa.md, memory/faq.md
- Canais: memory/canais-autorizados.md
- Leads e vendas: memory/leads.md, memory/vendas.md
- Suporte: memory/suporte.md, memory/atendimentos.md
- Melhorias: memory/melhorias.md

## Regras
- Nunca inventar informação ausente.
- Preferir informação validada.
- Se houver conflito, pedir confirmação ao dono.
- Se estiver pendente, avisar internamente.
- Não responder preço, desconto ou prazo se não estiver aprovado.
- Não consultar arquivos fora da permissão do agente.

## Saída esperada

Se encontrou:
Resposta:
[resposta clara]

Fonte consultada:
[arquivo usado]

Se não encontrou:
Resposta:
Não encontrei essa informação validada na base da empresa.

Ação recomendada:
Encaminhar para Rafael ou Atendimento Humano.

Informação faltante:
[descrever]

