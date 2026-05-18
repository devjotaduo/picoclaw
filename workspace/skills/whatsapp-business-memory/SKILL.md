---
name: whatsapp-business-memory
description: Ler conversas persistidas do WhatsApp Empresa/Picoclaw, extrair aprendizados operacionais, comportamento de atendimento, informações comerciais confirmadas, lacunas de conhecimento e próximas acoes, e salvar somente fatos duráveis e seguros em workspace/memory/MEMORY.md. Use quando o usuario pedir para aprender com mensagens do WhatsApp, revisar histórico da empresa, melhorar comportamento de agentes, atualizar memória a partir do inbox ou criar memória/briefing com base em conversas reais.
version: 1.0.0
language: pt-br
---

# WhatsApp Business Memory

Use esta skill para transformar o histórico do WhatsApp da empresa em memória útil. O objetivo não é arquivar conversas: é aprender padrões, fatos confirmados e lacunas que ajudam os agentes a responder melhor.

## Fontes

- Inbox nativo: `workspace/whatsapp/conversations.db`
- Memória longa: `workspace/memory/MEMORY.md`
- Nota diária: `workspace/memory/YYYYMM/YYYYMMDD.md`
- Skills relacionadas: `whatsapp-contact-profile`, `whatsapp-lead-capture`, `whatsapp-conversation-summary`, `whatsapp-lgpd-consent`, `memory-and-knowledge-check`

## Leitura das mensagens

1. Defina o período pedido pelo usuario. Se não houver período, use os últimos 30 dias.
2. Prefira o digest sanitizado:

```bash
python3 workspace/skills/whatsapp-business-memory/scripts/whatsapp_memory_digest.py --since-days 30 --limit-chats 50 --messages-per-chat 80 --format markdown
```

3. Se precisar de dados estruturados, use `--format json`.
4. Se o banco não éxistir, informe que o inbox nativo ainda não tem histórico persistido em `workspace/whatsapp/conversations.db`.
5. Não copie transcrições cruas para a resposta nem para a memória.

## O que aprender

Classifique cada aprendizado antes de salvar:

- `comportamento`: tom da equipe, saudações, tamanho médio das respostas, forma de explicar, como pede dados, como encerra atendimento.
- `fato-confirmado`: horário, endereço, canais, políticas, serviços, produtos, prazos, condições e dados da empresa ditos pela equipe ou por fonte oficial.
- `roteamento`: quando encaminhar para humano, financeiro, vendas, suporte, agenda, entrega, privacidade ou dono.
- `lacuna`: perguntas recorrentes sem resposta clara, contradições, pedidos que exigem base oficial melhor.
- `oportunidade`: lead recorrente, demanda frequente, produto/serviço muito citado, melhoria de fluxo.
- `caso-aberto`: compromisso, pendência ou follow-up que precisa continuar em atendimento.

## Regras de privacidade

- Salve fatos, não mensagens.
- Nunca grave CPF completo, documento completo, cartão, senha, token, chave de acesso, dados de saúde, dados financeiros sensíveis ou conteúdo íntimo.
- Mascare telefones, JIDs, emails e identificadores quando a identidade completa não for necessária.
- Para dado pessoal necessário a um caso, salve o mínimo operacional e acione `whatsapp-lgpd-consent` quando houver dúvida.
- Não use informação dita apenas por cliente como verdade da empresa. Marque como pedido, preferência, suspeita ou lacuna até confirmar.
- Se houver conflito entre memória antiga e base oficial, use `memory-and-knowledge-check` e marque a memória antiga como desatualizada.

## Como salvar em memória

1. Leia `workspace/memory/MEMORY.md` antes de editar.
2. Procure a seção `## WhatsApp Empresa - Aprendizados`.
3. Se a seção não éxistir, crie no fim do arquivo.
4. Atualize apenas os itens necessários, sem duplicar fatos já salvos.
5. Cada item deve ter data, origem resumida e confiança:

```markdown
## WhatsApp Empresa - Aprendizados

### Comportamento de atendimento
- 2026-05-18 | fonte: outbound humano | confiança: alta | Responder de forma curta, com uma pergunta por vez, quando o cliente pede orçamento.

### Informacoes confirmadas
- 2026-05-18 | fonte: resposta da equipe | confiança: media | Prazo de entrega foi tratado como dependente de confirmação antes de prometer data.

### Roteamento e handoff
- 2026-05-18 | fonte: padrao recorrente | confiança: alta | Reclamos com atraso de entrega devem ir para suporte/operação antes de prometer solução.

### Lacunas de conhecimento
- 2026-05-18 | fonte: pergunta recorrente | confiança: media | Clientes perguntam sobre formas de pagamento; a base oficial precisa listar as condições confirmadas.
```

6. Adicione uma nota curta no arquivo diario informando o período analisado e quantos aprendizados foram gravados.

## Critérios de qualidade

- Prefira poucos aprendizados bons a muitos itens fracos.
- Salve apenas informação reútilizável em próximos atendimentos.
- Separe comportamento da equipe de fatos comerciais.
- Marque fatos com baixa confiança como lacuna, não como verdade.
- Quando um aprendizado afetar preço, prazo, disponibilidade, privacidade ou promessa ao cliente, confirme contra base oficial antes de salvar como `fato-confirmado`.

## Saída esperada

Ao final, informe:

```json
{
  "periodo_analisado": "",
  "chats_analisados": 0,
  "mensagens_analisadas": 0,
  "aprendizados_salvos": 0,
  "secao_memória": "WhatsApp Empresa - Aprendizados",
  "lacunas_relevantes": [],
  "avisos_privacidade": []
}
```
