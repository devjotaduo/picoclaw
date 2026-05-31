# Regressão do tenant público Sofia no Pico WS

Data: 2026-05-31

## Sintomas observados

- `https://onbording.jotaduo.com/` respondia como Sofia, mas vazava bastidor
  operacional para o visitante público.
- A conversa mostrava narração de comandos, busca de arquivos, referências a
  workspace/skills, estado interno e sincronização.
- Algumas respostas vinham duplicadas ou como mensagens intermediárias antes da
  resposta final ao dono.
- A fase de contato podia repetir pergunta ou afirmar salvamento depois de
  fluxo interno confuso.
- A primeira mensagem longa ficou presa em "Preparando resposta..." por mais de
  20 segundos em teste manual.

## Causa provável

O release público via Pico WS moveu o tenant público para o canal `pico`. O
publisher genérico desse canal aceitava conteúdo intermediário de turnos com
tool calls (`AllowInterimPicoPublish=true`) e publicava parte da narração como
mensagem comum. A UI pública já escondia `reasoning` e `tool_calls`, mas não
conseguia distinguir texto comum contendo bastidor.

Além disso, tenants públicos não dependem só de
`workspace/agents/sofia/AGENT.md`: o provisionamento sobrescreve
`workspace/AGENT.md` com o prompt embutido `publicSofiaAgentMD` em
`internal/saas/tenant/workspace.go`. Alterar apenas o workspace base não corrige
volumes públicos já materializados.

## Correção aplicada

- Runtime público detecta `PICOCLAW_PUBLIC_TENANT=true` ou
  `ui-visibility.json::active_profile=public`.
- Para canal `pico` público:
  - desliga publicação intermediária de tool calls;
  - suprime feedback técnico de ferramenta;
  - bloqueia publicação de reasoning;
  - sanitiza mensagens outbound antes de publicar.
- Sofia e `jotaduo-discovery` receberam uma barreira explícita contra narração
  de comandos, arquivos, skills, memória, sandbox e validação técnica.
- A captura de contato agora reforça: extrair nome/email/WhatsApp quando vierem
  juntos, confirmar uma vez, e só então chamar `set_owner`/`mark_discovery_done`.
- Testes cobrem detecção de runtime público e sanitização de texto com marcas de
  bastidor.
- Pós-deploy, o smoke de produção também encontrou `Error processing message:
  LLM call failed after retries: codex cli error: exit status 1`. O modo
  `auto` agora prefere LiteLLM em tenants públicos quando LiteLLM está
  configurado, para não prender o fluxo público a credencial CLI compartilhada
  vencida ou inválida. Falhas técnicas de provider também viram uma mensagem
  pública genérica no canal Pico.

## Recuperação em produção

1. Deployar pelo fluxo oficial de GitHub Actions (`release-controlplane.yml`).
2. Confirmar que tenants públicos rodam com `PICOCLAW_PUBLIC_TENANT=true` ou
   `ui-visibility.json` com `active_profile=public`.
3. No tenant público afetado, aplicar `model_routing.mode=litellm` ou
   reaplicar `auto` após esta correção, e recriar o container. O deploy central
   não recria tenants já existentes automaticamente.
4. Recriar ou reprovisionar volumes públicos afetados para receber o
   `publicSofiaAgentMD` e as skills atualizadas.
5. Testar `https://<tenant-publico>/` com:
   - mensagem curta de abertura;
   - segmento com arquivo de referência;
   - recomendação de time;
   - envio de nome, email e WhatsApp juntos;
   - confirmação final antes de concluir.
6. Validar que nenhuma resposta pública contém termos como `rg`, `exec`,
   `delegate`, `workspace/`, `memory/`, `AGENT.md`, `SKILL.md`,
   `ui-visibility`, `onboarding-state`, `codex cli` ou `LLM call failed`.
