---
name: lacuna-de-conhecimento
description: Detecta quando a memória não cobre a pergunta do cliente, registra a lacuna pra revisão posterior e responde sem inventar.
visibility: atendimento
---

# Skill: Lacuna de Conhecimento

## Objetivo
Identificar perguntas que a memória da empresa não responde, registrar
a lacuna para o dono revisar depois e responder ao cliente sem
inventar — pedindo pra aguardar ou propondo um próximo passo.

## Quando usar
- Cliente pergunta algo que `consultar-memoria` retorna vazio ou
  contraditório.
- Tópico não está em `config/company-profile.md` nem em nenhum arquivo
  de memória.
- Agente está tentado a "achismar" — esta skill é a alternativa segura.

## Processo
1. Reconhecer a lacuna ("não tenho essa informação confirmada aqui").
2. Anotar em `memory/lacunas.md` com:
   - data, cliente, pergunta exata
   - canal, agente que detectou
   - urgência percebida (cliente esperando? caso isolado?)
3. Decidir a resposta ao cliente:
   - "Vou confirmar com a equipe e te retorno" + alertar Rafael
     (`request_handoff` se urgente)
   - "Esse é um caso que prefiro o time confirmar com você
     diretamente" + transferir pra humano se sensível.
4. NUNCA inventar dado de produto, preço, prazo ou política.

## Dados de saída
- Entrada nova em `memory/lacunas.md`.
- Notificação ao agente Rafael se urgência alta.

## Princípio
A confiança do cliente vem de respostas honestas. Uma lacuna
documentada vira treino; uma invenção vira reclamação.
