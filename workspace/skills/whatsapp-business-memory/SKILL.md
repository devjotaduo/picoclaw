---
name: whatsapp-business-memory
description: Ler conversas persistidas do WhatsApp Empresa/Picoclaw, extrair aprendizados operacionais, comportamento de atendimento, informacoes comerciais confirmadas, lacunas de conhecimento e proximas acoes, e salvar somente fatos duraveis e seguros em workspace/memory/MEMORY.md. Use quando o usuario pedir para aprender com mensagens do WhatsApp, revisar historico da empresa, melhorar comportamento de agentes, atualizar memoria a partir do inbox ou criar memoria/briefing com base em conversas reais.
---

# WhatsApp Business Memory

Use esta skill para transformar o historico do WhatsApp da empresa em memoria util. O objetivo nao e arquivar conversas: e aprender padroes, fatos confirmados e lacunas que ajudam os agentes a responder melhor.

## Fontes

- Inbox nativo: `workspace/whatsapp/conversations.db`
- Memoria longa: `workspace/memory/MEMORY.md`
- Nota diaria: `workspace/memory/YYYYMM/YYYYMMDD.md`
- Skills relacionadas: `whatsapp-contact-profile`, `whatsapp-lead-capture`, `whatsapp-conversation-summary`, `whatsapp-lgpd-consent`, `memory-and-knowledge-check`

## Leitura das mensagens

1. Defina o periodo pedido pelo usuario. Se nao houver periodo, use os ultimos 30 dias.
2. Prefira o digest sanitizado:

```bash
python3 workspace/skills/whatsapp-business-memory/scripts/whatsapp_memory_digest.py --since-days 30 --limit-chats 50 --messages-per-chat 80 --format markdown
```

3. Se precisar de dados estruturados, use `--format json`.
4. Se o banco nao existir, informe que o inbox nativo ainda nao tem historico persistido em `workspace/whatsapp/conversations.db`.
5. Nao copie transcricoes cruas para a resposta nem para a memoria.

## O que aprender

Classifique cada aprendizado antes de salvar:

- `comportamento`: tom da equipe, saudacoes, tamanho medio das respostas, forma de explicar, como pede dados, como encerra atendimento.
- `fato-confirmado`: horario, endereco, canais, politicas, servicos, produtos, prazos, condicoes e dados da empresa ditos pela equipe ou por fonte oficial.
- `roteamento`: quando encaminhar para humano, financeiro, vendas, suporte, agenda, entrega, privacidade ou dono.
- `lacuna`: perguntas recorrentes sem resposta clara, contradicoes, pedidos que exigem base oficial melhor.
- `oportunidade`: lead recorrente, demanda frequente, produto/servico muito citado, melhoria de fluxo.
- `caso-aberto`: compromisso, pendencia ou follow-up que precisa continuar em atendimento.

## Regras de privacidade

- Salve fatos, nao mensagens.
- Nunca grave CPF completo, documento completo, cartao, senha, token, chave de acesso, dados de saude, dados financeiros sensiveis ou conteudo intimo.
- Mascare telefones, JIDs, emails e identificadores quando a identidade completa nao for necessaria.
- Para dado pessoal necessario a um caso, salve o minimo operacional e acione `whatsapp-lgpd-consent` quando houver duvida.
- Nao use informacao dita apenas por cliente como verdade da empresa. Marque como pedido, preferencia, suspeita ou lacuna ate confirmar.
- Se houver conflito entre memoria antiga e base oficial, use `memory-and-knowledge-check` e marque a memoria antiga como desatualizada.

## Como salvar em memoria

1. Leia `workspace/memory/MEMORY.md` antes de editar.
2. Procure a secao `## WhatsApp Empresa - Aprendizados`.
3. Se a secao nao existir, crie no fim do arquivo.
4. Atualize apenas os itens necessarios, sem duplicar fatos ja salvos.
5. Cada item deve ter data, origem resumida e confianca:

```markdown
## WhatsApp Empresa - Aprendizados

### Comportamento de atendimento
- 2026-05-18 | fonte: outbound humano | confianca: alta | Responder de forma curta, com uma pergunta por vez, quando o cliente pede orcamento.

### Informacoes confirmadas
- 2026-05-18 | fonte: resposta da equipe | confianca: media | Prazo de entrega foi tratado como dependente de confirmacao antes de prometer data.

### Roteamento e handoff
- 2026-05-18 | fonte: padrao recorrente | confianca: alta | Reclamos com atraso de entrega devem ir para suporte/operacao antes de prometer solucao.

### Lacunas de conhecimento
- 2026-05-18 | fonte: pergunta recorrente | confianca: media | Clientes perguntam sobre formas de pagamento; a base oficial precisa listar as condicoes confirmadas.
```

6. Adicione uma nota curta no arquivo diario informando o periodo analisado e quantos aprendizados foram gravados.

## Criterios de qualidade

- Prefira poucos aprendizados bons a muitos itens fracos.
- Salve apenas informacao reutilizavel em proximos atendimentos.
- Separe comportamento da equipe de fatos comerciais.
- Marque fatos com baixa confianca como lacuna, nao como verdade.
- Quando um aprendizado afetar preco, prazo, disponibilidade, privacidade ou promessa ao cliente, confirme contra base oficial antes de salvar como `fato-confirmado`.

## Saida esperada

Ao final, informe:

```json
{
  "periodo_analisado": "",
  "chats_analisados": 0,
  "mensagens_analisadas": 0,
  "aprendizados_salvos": 0,
  "secao_memoria": "WhatsApp Empresa - Aprendizados",
  "lacunas_relevantes": [],
  "avisos_privacidade": []
}
```
