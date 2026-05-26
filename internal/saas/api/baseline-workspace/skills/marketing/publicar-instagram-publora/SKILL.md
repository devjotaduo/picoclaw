---
name: publicar-instagram-publora
description: Publica ou agenda posts aprovados no Instagram usando o MCP Publora. Requer o servidor MCP publora-instagram ativo no workspace e chave Publora configurada como credencial segura.
visibility: internal
depends_on:
  - marketing/criar-post-instagram
  - marketing/gerar-imagem-post
  - consultar-memoria
  - atualizar-memoria
used_by:
  - lia
requires_approval: true
requires_human_confirmation: true
mcp_servers:
  - publora-instagram
---

# Skill: publicar-instagram-publora

Use esta skill para publicar ou agendar no Instagram via Publora, sempre depois de aprovacao humana registrada.

## Requisitos

- MCP `publora-instagram` ativo no workspace.
- Chave Publora configurada no painel MCP como `PUBLORA_API_KEY`.
- Conta/canal Instagram conectado na Publora.
- Post aprovado por humano em `memory/marketing.md`.
- Imagem ou video com URL publica HTTPS.
- Legenda revisada, com no maximo 2.200 caracteres e sem dados pessoais.

## Fluxo

1. Confirmar em `memory/marketing.md` que o status do post e `aprovado`.
2. Confirmar que a midia esta em URL HTTPS publica, preferencialmente em `/public/marketing/`.
3. Usar as ferramentas MCP do servidor `publora-instagram` para criar/agendar o post.
4. Salvar em `memory/marketing.md`:
   - status: publicado ou agendado
   - plataforma: instagram
   - provedor: publora
   - id externo retornado pela Publora
   - permalink ou URL de acompanhamento, quando disponivel
   - aprovado_por e publicado_em/agendado_para
5. Notificar Rafael com resumo curto.

## Bloqueios

- Sem aprovacao humana: nao publicar.
- Sem MCP conectado: entregar como pendente de publicacao.
- Sem URL HTTPS publica: corrigir publicacao do asset antes.
- Erro de credencial: avisar que o MCP Publora precisa ser reconfigurado; nunca pedir a chave no chat.
- Rate limit ou erro da Publora: registrar o erro resumido sem expor segredo.

## Saida

```text
PUBLICACAO:
[publicado | agendado | pendente]

CAMPANHA:
<id ou slug>

INSTAGRAM:
<permalink ou "aguardando retorno da Publora">

PENDENCIAS:
<nenhuma ou motivo do bloqueio>
```
