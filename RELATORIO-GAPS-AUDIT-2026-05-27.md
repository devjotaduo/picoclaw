# Relatório — Auditoria de gaps 2026-05-27 (10 agentes em paralelo)

**Escopo:** ideia, regra de negócio e fluxo completo do funil
público → cliente. 10 agentes Explore especializados em cobrir
ângulos distintos sem sobreposição.

**Método:** cada agente recebeu um ângulo focado + lista de arquivos
pra ler + ordem de reportar com `[SEVERIDADE] [LOCAL] [GAP] [FIX HINT]`
em < 400 palavras, sem especulação sem evidência de código.

**Agentes:**
1. Lifecycle do tenant público (abandono, concorrência, identidade)
2. Integridade da discovery (Sofia)
3. Lifecycle do aprofundamento (Catarina)
4. Atomicidade do `/promote` handler
5. Isolamento cross-tenant
6. Billing e atribuição de custos
7. Drift da state machine
8. Edge cases de routing WhatsApp
9. Lifecycle de secrets/auth
10. Inventário de passos manuais do operador

**Total:** 60+ gaps reais (com evidência de código). Organizados por
severidade abaixo.

---

## 🔴 P0 — Bloqueia operação / recovery / vaza dados

### Operacionais
1. **Restic backup passphrase sem backup externo** ([scripts/backups/r2-backup.env.example])
   Único storage local em `/etc/picoclaw/r2-backup.env`. Perda = TODAS as
   snapshots cryptograficamente ilegíveis. **Fix:** rotate pro password
   manager (1Password/Bitwarden). Doc menciona mas não tem runbook.

2. **Procedure de restore nunca testada**
   Backup é teatro até alguém validar. **Fix:** CI job
   `test-backup-restore.sh` weekly: spin staging, baixa snapshot,
   restaura, valida sanity.

3. **Postgres não tem backup automatizado**
   R2 cobre `/srv/saas/tenants` + `/etc/picoclaw` mas **NÃO** o
   Postgres em `/srv/saas/postgres/data/`. Perda = lista de tenants,
   workspace configs, users, audit logs perdidos. **Fix:** `pg_dump
   --all` diário pro R2 paralelo ao restic.

### Fluxo do funil
4. **Catarina NUNCA inicia sozinha após `discovery_done`**
   ([public-tenant-promotion.md#fatia-5])
   Sem cron, sem webhook, sem hook. Catarina só roda se Rafael
   delegar manualmente ou admin pingar. **Fix:** implementar Fatia 5
   (cron job em `workspace/cron/jobs.json` polling state.json a cada
   15min disparando Catarina quando `phase=discovery_done` há >30min).

5. **Inbox JSONL (`jotaduo-wa-inbox`) nunca é lida sem trigger**
   `verificar-respostas-jotaduo` skill existe, mas quem dispara?
   Catarina não tem hook de pre-turn nem cron. Respostas dos leads
   empilham até alguém pedir. **Fix:** pre-turn auto-call de Catarina
   ou cron diário em tenants com `phase=deepening`.

### Integridade
6. **Sofia conversation history vs state.json drift NÃO detectado**
   ([workspace/skills/onboarding-state/scripts/state.py])
   state.json pode dizer `phase=discovery_done` enquanto memory/
   empresa.md está vazio (Sofia hallucinou chamar a skill). Promote
   procede com tenant skeletal. **Fix:** `recompute_phase_and_blockers()`
   precisa chamar `verify_memory_files_exist()` antes de auto-flipar
   `promotion.ready=true`.

### Segurança
7. **`JOTADUO_WA_ADMIN_TOKEN` vaza via query string**
   ([internal/jotaduowa/server.go:260])
   Suportado como `?token=...` pra UI de pareamento. URLs aparecem em
   Traefik access log, browser history, SSH bastion logs. Vazou =
   atacante re-pareia, derruba WA institucional. **Fix:** remover
   fallback query-string, exigir header `X-Jotaduo-WA-Admin-Token`.

### Negócio
8. **`force-promote` + Catarina incompleta = cliente skeletal silencioso**
   ([tenants_promote.go:149-162])
   Admin force=true skipa promotion.ready. DB Promote sucesso, container
   recreate como cliente, mas `memory/empresa.md` vazio. Clara boota
   sem dados pra atender. Logado mas nenhum sinal pro admin do que
   ficou incompleto. **Fix:** mesmo em force=true, logar `blocked_by`
   verbose pro admin saber o que faltou.

9. **Custo do tenant publico 100% no operador, sem cap por visitante**
   ([internal/saas/config/config.go:36-38])
   Sofia chat = LLM calls = JOTADUO paga. Rate-limit existe (30msg/10min
   por IP) mas botnet contorna. URL vazada = espiral de custo
   ilimitada. **Fix:** forçar `MonthlyBudgetUSD` não-nil em tenant
   publico + Turnstile CAPTCHA obrigatório.

---

## 🟡 P1 — Quebra fluxo / vaza dados / requer ops manual

### State machine (onboarding.json)
10. **Race condition em `mark_area_complete`** — `state.py` faz read-modify-write sem `fcntl.flock`. Sofia + Catarina + admin concorrentes podem perder updates.
11. **Format drift Go vs Python** — `tenants_promote.go::markPromotedInState` escreve direto, bypassando `recompute_phase_and_blockers()` do Python.
12. **Concurrent visitors → state collision** — múltiplos visitantes no mesmo tenant publico podem clobrar `onboarding.json`.
13. **Sem schema versioning** — adicionar campo novo silenciosamente quebra parsers em tenants antigos.

### Sofia discovery
14. **Email/empresa não verificados** — Sofia aceita verbatim, email pode ser de outra pessoa, empresa pode ter `<script>` ou 5000 chars.
15. **Phase skipping sem detecção** — Sofia (LLM) pode pular Phase 4, ir direto pra 7.5; `state.json.phase` aceita.
16. **Dossiê pode ser silently perdido** — se `save_client.py` nunca rodar, Catarina lê arquivo inexistente sem erro.

### Catarina deepening
17. **Lead non-response sem timeout** — Catarina manda WA, lead nunca responde, state.json fica em `deepening` infinito sem alerta.
18. **`mark_area_complete` aceita prematuro** — Catarina (LLM) pode marcar área completa após 1 pergunta superficial. Sem quality bar.
19. **Phone change do lead = routing órfã** — lead troca chip, sidecar dropa novas msgs, Catarina não percebe.
20. **Sem precondition check ao bootar Catarina** — se for chamada antes de `discovery_done`, falha 503 mas sem alerta.

### Promote handler
21. **Partial failure DB ≠ FS** — step 5 commita, step 6 falha → tenant em DB cliente mas container ainda publico.
22. **Recreate falha = container stale** — DB diz cliente, env diz trusted_gateway. 202 com warning mas admin pode não ver.
23. **Email falha = senha perdida** — best-effort sem retry; se admin fechou dialog antes de copiar, senha some.
24. **Race em concurrent Promote** — 2 cliques rápidos → 2nd request retorna 0 rows affected mas handler ignora.
25. **JotaduoWA revoke ANTES do Recreate** — se Recreate falha, routing já foi dropada, leads pendentes silenciosamente perdidos.

### Cross-tenant isolation
26. **Phone reassignment leak** — telco transfere número, novo dono WA → routing antigo → vaza pro tenant antigo. **Privacidade + LGPD.**
27. **claude-cli compartilhado expõe operator info** — tenant comprometido roda `claude auth status`, vê email + org da JOTADUO.
28. **`${LITELLM_KEY}` placeholder unsubstituted = fallback pro master key** — se substituição falha silenciosa, tenant X queima budget do tenant Y.

### Billing
29. **Budget enforcement = display only** — `MonthlyBudgetUSD` setado em DB e mandado pro LiteLLM. Sem soft-warn 75%, sem pre-flight check.
30. **claude-cli/codex-cli usage invisível** — não passa pelo LiteLLM, nunca aparece no `usage_logs`. Subscription queima mas painel mostra $0.00.

### Security
31. **Admin login sem 2FA, IP allowlist, login audit** — credenciais vazadas = full tenant lifecycle access.
32. **claude/codex OAuth token expira silenciosamente** — sem proactive monitoring; tenant percebe quando chat quebra.
33. **`.env.bak.*` acumula indefinidamente** — segredos antigos chmod 600 mas continuam discoverable.

### WhatsApp routing
34. **Cold lead silenciosamente droped** — lead WA primeiro sem outreach prévio = sidecar log info + drop. Catarina/admin não sabem.
35. **Routes revogadas pós-promote sem audit trail** — sem log de quantas rotas foram apagadas, sem grace period.
36. **Group chats não isolados** — lead adiciona Jotaduo em grupo, dispatcher roteia por `SenderJID` (varia por membro) → leak ou drop.

### Deploy / ops
37. **Compose file changes requerem SSH manual** — deploy script só pula imagens. Esquecer = service novo nunca sobe.
38. **Scripts em `/usr/local/bin` não auto-update** — bug fix no repo = zero efeito até operador re-rodar install.sh.
39. **Image rollback é manual** — sem botão "revert to last-known-good".

---

## 🟢 P2 — Qualidade / annoyance

40. **Sem FK constraint bloqueando delete de public tenant ativo**
41. **Sem filtro `is_public=true` no /tenants list** — promovidos misturam com públicos
42. **Language detection visitor** — visitor em inglês recebe pt-BR sem warning
43. **Tour modal antigo aparecia pra visitante** — JÁ FIXADO em PR #129
44. **state.json sem `schema_version`** — drift silencioso em upgrades
45. **Audit log sem `force_reason`** — admin force-promote sem registrar motivo
46. **Media messages dropped** — image/voice/document do lead = `content == ""` → return early
47. **Sem unread notification** — leads mandam 5 msgs, Catarina não sabe
48. **HMAC clock skew (NTP drift)** — 6min de drift = todo inbound rejeitado 401
49. **Auto-provisioner rate limit in-memory** — restart limpa, sem cap global
50. **Cost da promoção não rebillada** — usage_logs antigos ficam atrelados à key publica
51. **Turnstile CAPTCHA é opt-in não default** — público sem CAPTCHA = bot food
52. **HMAC rotation = downtime de ~30s** — sem dual-secret support
53. **Supabase JWKS init failure não logada** — fail-silent
54. **Sem workflow proativo de token revocation**
55. **Tenant image bumps não auto-recreate live tenants**
56. **Workspace edits hand-synced** — `make sync-baseline` só pra novos tenants
57. **Claude OAuth refresh manual** — `claude /login` no host
58. **Sem operator onboarding runbook** — Eduardo SPOF crítico
59. **VPS migration untested** — assume R2+pg backups bons mas nunca validados
60. **Jotaduo WA `store.db` não backed up** — perda = re-pareamento QR

---

## Priorização sugerida (próximas 3 sprints)

### Sprint 1 — desbloqueia funil + tampa security
- [ ] **P0 #4** Fatia 5: cron de bridge Sofia→Catarina (sem isso o funil quebra em produção real)
- [ ] **P0 #5** Pre-turn hook Catarina lendo inbox JSONL
- [ ] **P0 #7** Remover `?token=` query-string do admin pairing
- [ ] **P0 #3** Postgres backup automation (perdeu pg = perdeu tudo)
- [ ] **P0 #9** Forçar `MonthlyBudgetUSD` + Turnstile em tenant publico

### Sprint 2 — atomicidade + state consistency
- [ ] **P1 #21-25** Promote handler — transação real, idempotência, ordering revoke
- [ ] **P1 #10-11** fcntl.flock em state.py + eliminar Go direct-write
- [ ] **P1 #17** Timeout + escalação em Catarina lead non-response
- [ ] **P0 #6** Verifier ground-truth vs state.json antes de `promotion.ready`

### Sprint 3 — isolamento + ops
- [ ] **P1 #26** Phone reassignment detection (TTL nas routes + grace alert)
- [ ] **P1 #27** Per-tenant claude-cli auth derivation (away from shared mount)
- [ ] **P1 #28** Strict LiteLLM placeholder validation pre-boot
- [ ] **P0 #1-2** Restic passphrase manager + tested restore CI job
- [ ] **P1 #37-38** Auto-sync compose + /usr/local/bin scripts

---

## Não foi auditado nesta passada

- Skill execution sandbox / isolation
- Frontend SPA security (CSP, XSS surface, OAuth flow)
- LGPD compliance específico (DPO, data retention, export, right to be forgotten)
- Disaster recovery completo (geográfico — VPS único em Vultr)
- Performance / scaling (load testing nunca rodado)
- Monitoring / observability (Prometheus, Grafana, alertas?)
- Penetration test externo

Recomendado próxima auditoria com 10 agentes cobrindo esses 7 ângulos restantes.

---

**Conclusão executiva:** o sistema **funciona** end-to-end em happy path
(comprovado live 2026-05-27 com Sofia respondendo via claude-cli). Mas
3 buracos P0 quebram o funil em produção real (sem auto-bridge Sofia→
Catarina, sem ingestão de respostas WA, sem verificação de drift) +
3 buracos operacionais P0 (backups não testados, postgres sem backup,
admin token vazável). Antes de escalar pra clientes reais pagantes,
**resolver Sprint 1 é não-negociável**. Sprints 2-3 mitigam o longo
caule de fragilidades latentes que vão aparecer só sob carga real.
