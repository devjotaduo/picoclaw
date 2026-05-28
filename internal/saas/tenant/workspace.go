package tenant

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// Workspace-related helpers used by the new provisioning flow.
//
// The legacy pile of CopyVolumeRaw + ApplyProfileSeed + OverlayWorkspace +
// SeedPicoConfig + EnsureTenantWhatsAppNativeConfig is being collapsed into
// three operations on a workspace directory at <hostPath>:
//
//   - CopyWorkspaceHome(src, dst)            — drop home/ into the tenant volume
//   - SubstituteConfigPlaceholders(dst, map) — fill ${LITELLM_KEY} etc.
//   - BuildWorkspaceFrontend(ctx, hostPath)  — vite build via a node sidecar
//
// All three are intentionally small and side-effect-honest: they touch the
// host filesystem the operator can inspect via SSH, and they emit a log the
// admin UI can show.

// WorkspaceHomeSubdir is the on-disk name of the home subtree inside a
// workspace. Public so the API layer's import-from-home endpoint and the
// migration backfill can construct paths consistently.
const WorkspaceHomeSubdir = "home"

// WorkspaceFrontendSrcSubdir holds the React source admin edits.
const WorkspaceFrontendSrcSubdir = "frontend-src"

// WorkspaceFrontendDistSubdir holds the vite build output that gets bind-
// mounted (read-only) into the tenant container at /var/lib/picoclaw-frontend.
const WorkspaceFrontendDistSubdir = "frontend-dist"

// WorkspaceFrontendMountTarget is the path inside the tenant container where
// the bind-mounted dist appears. Matches the env var the launcher reads.
const WorkspaceFrontendMountTarget = "/var/lib/picoclaw-frontend"

// frontendBuildTimeout caps a single vite build at 5 minutes. pnpm install +
// vite build on the existing web/frontend takes ~60-90s on the VPS; 5 min
// leaves headroom for npm registry blips without letting a wedged container
// hold the workspace's .build.lock indefinitely.
const frontendBuildTimeout = 5 * time.Minute

// workspaceBuildImage is the node image the docker sidecar uses to compile
// per-workspace frontends. Alpine keeps the image pull cheap; pnpm comes via
// corepack which ships with node 20+.
const workspaceBuildImage = "node:24-alpine3.23"

// CopyWorkspaceHome copies srcWorkspacePath/home/ into the tenant volume
// destDir. Unlike CopyVolumeRaw it does NOT skip anything — the workspace's
// home/ subtree is the authoritative content. Per-tenant secrets and runtime
// state (dashboardauth.db, litellm.key, sessions/, etc.) MUST be absent from
// the workspace; if they are present they get copied verbatim (operator
// error caught by lint/CI of the workspace, not by this function).
func CopyWorkspaceHome(srcWorkspacePath, destDir string) error {
	src := filepath.Join(srcWorkspacePath, WorkspaceHomeSubdir)
	info, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("workspace home not found at %s: %w", src, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("workspace home %s is not a directory", src)
	}
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("mkdir tenant volume: %w", err)
	}
	return filepath.Walk(src, func(path string, fi os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(destDir, rel)
		if fi.IsDir() {
			return os.MkdirAll(target, fi.Mode().Perm())
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			// Symlinks in a workspace would break across the bind-mount
			// boundary (path resolution inside the tenant container is
			// different). Skip silently rather than copying a dangling link.
			return nil
		}
		if !fi.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return copyFile(path, target, fi.Mode().Perm())
	})
}

// SanitizeTenantSecurityConfig removes legacy .security.yml shapes that are
// invalid for the launcher security loader. Older workspace baselines used:
//
//	channels:
//	  allowed: []
//
// The current loader treats "channels" as channel_list-compatible entries, so
// "allowed: []" is decoded as a channel and prevents tenant startup. Tenant
// channel allowlists are already passed through PICOCLAW_ALLOWED_CHANNELS, so
// dropping this legacy key preserves the intended runtime behavior.
func SanitizeTenantSecurityConfig(volumePath string) error {
	path := filepath.Join(volumePath, ".security.yml")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read .security.yml: %w", err)
	}

	var root map[string]any
	if err := yaml.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse .security.yml: %w", err)
	}
	channels, ok := root["channels"].(map[string]any)
	if !ok {
		return nil
	}
	if _, hasLegacyAllowed := channels["allowed"]; !hasLegacyAllowed {
		return nil
	}
	delete(channels, "allowed")
	if len(channels) == 0 {
		delete(root, "channels")
	} else {
		root["channels"] = channels
	}

	out, err := yaml.Marshal(root)
	if err != nil {
		return fmt.Errorf("marshal .security.yml: %w", err)
	}
	mode := os.FileMode(0o600)
	if info, statErr := os.Stat(path); statErr == nil {
		mode = info.Mode().Perm()
	}
	return os.WriteFile(path, out, mode)
}

// EnsurePublicWebChannelConfig makes an existing tenant volume boot with the
// public-web channel enabled. Public tenants may be recreated long after their
// original workspace copy, so this keeps old volumes compatible without
// overwriting operator-owned channel settings.
func EnsurePublicWebChannelConfig(volumePath string) error {
	path := filepath.Join(volumePath, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}

	var cfg map[string]any
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}

	channelsKey := "channel_list"
	if _, ok := cfg["channels"]; ok {
		channelsKey = "channels"
	}
	channels, err := configObject(cfg, channelsKey)
	if err != nil {
		return err
	}
	if channels == nil {
		channels = map[string]any{}
		cfg[channelsKey] = channels
	}

	publicWeb, err := configObject(channels, "public-web")
	if err != nil {
		return err
	}
	if publicWeb == nil {
		publicWeb = map[string]any{}
		channels["public-web"] = publicWeb
	}
	publicWeb["type"] = "public-web"
	publicWeb["enabled"] = true
	if _, ok := publicWeb["allow_from"]; !ok {
		publicWeb["allow_from"] = []any{"*"}
	}

	settings, err := configObject(publicWeb, "settings")
	if err != nil {
		return err
	}
	if settings == nil {
		settings = map[string]any{}
		publicWeb["settings"] = settings
	}
	if _, ok := settings["rate_limit_per_ip"]; !ok {
		settings["rate_limit_per_ip"] = 30
	}
	if _, ok := settings["session_ttl_seconds"]; !ok {
		settings["session_ttl_seconds"] = 1800
	}
	if _, ok := settings["require_captcha_header"]; !ok {
		// Default ON for public tenants (audit P0 #8, 2026-05-27). A public
		// URL leaked = bot food without CAPTCHA; the cost is paid by the
		// operator. The launcher honors this header even when the
		// controlplane TURNSTILE_SECRET_KEY is unset (defense-in-depth:
		// non-empty header still acts as a presence check). Operators that
		// want to disable CAPTCHA for a specific tenant can flip the value
		// in the tenant's config.json — this function only fills the
		// default when the key is absent.
		settings["require_captcha_header"] = true
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	if len(data) > 0 && data[len(data)-1] == '\n' {
		out = append(out, '\n')
	}
	mode := os.FileMode(0o644)
	if info, statErr := os.Stat(path); statErr == nil {
		mode = info.Mode().Perm()
	}
	if err := writeFileAtomic(path, out, mode); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}

// publicSofiaAgentMD overrides workspace/AGENT.md for public tenants so the
// `main` agent assumes Sofia's persona from message 1 instead of falling back
// to Rafael (front-line orchestrator of the team prompt). Without this, every
// public tenant boots into the cliente experience: visitor says "oi" and gets
// Rafael introducing the team, breaking the discovery funnel
// (docs/architecture/public-tenant-promotion.md).
//
// Why a separate file (not a runtime check on active_profile): the LLM has to
// make the routing decision on every turn if it's a prompt-time check, and
// drifts. Physically swapping AGENT.md guarantees consistent persona.
const publicSofiaAgentMD = `---
name: sofia-discovery-mode
description: >
  Tenant publico (is_public=true) — main agent assume persona Sofia desde a
  primeira mensagem em vez de delegar via Rafael. Provisioner sobrescreve
  AGENT.md por cima do canonical durante CopyWorkspaceHome quando
  t.IsPublic; promote reverte pro original via RestoreClienteAgentMD.
---

# AGENT — modo público (Sofia / discovery)

Você é a **Sofia**, consultora de discovery da Jotaduo. Este tenant está em
**modo público** — visitantes anônimos chegam aqui pra ser onboardados antes
de virarem clients pagos. Sua missão única: conduzir o discovery em
conversas curtas seguindo o roteiro da skill ` + "`jotaduo-discovery`" + `.

## Antes de responder a PRIMEIRA mensagem, LEIA:

1. ` + "`workspace/agents/sofia/AGENT.md`" + ` — sua persona completa (postura,
   regras, "1 pergunta por vez", "sem emoji", "consultor não checklist")
2. ` + "`workspace/skills/jotaduo-discovery/SKILL.md`" + ` — roteiro das 8 fases
   (segmento → dores → equipe → canais → memória → simulação → captura
   contato → liberação)
3. ` + "`workspace/skills/onboarding-state/SKILL.md`" + ` — state machine pra
   registrar progression em ` + "`workspace/state/onboarding.json`" + `
4. ` + "`workspace/SOUL.md`" + ` — comportamento padrão (limites, transparência, tom)

## Regras de identidade (CRÍTICAS — quebrar = bug grave do funil)

- **NUNCA** se apresente como Rafael, picoclaw, "assistente do workspace"
  ou "equipe de agentes".
- Você é **só a Sofia**. Não existe Rafael nem Clara nem Marcos nesta
  conversa — eels existem no tenant cliente que esta empresa VAI virar
  depois da promoção, mas o visitante não precisa saber agora.
- Se perguntarem "quem é você": "Sou a Sofia, consultora de onboarding da
  Jotaduo. Vou te ajudar a entender seu negócio pra deixar tudo certinho
  aqui antes da sua equipe começar a atender."
- Se perguntarem "vocês têm outros agentes": não liste a equipe.
  Resposta: "Depois que terminarmos esta etapa, sim — Clara atendendo
  clients, Marcos cuidando de vendas, Camila no suporte. Mas isso é
  depois. Agora é só você e eu."

## Comportamento da PRIMEIRA mensagem (proativo)

Se for a primeira mensagem da sessão (sem histórico OU só "oi"/"olá"):

- **Você abre a conversa proativamente** com a primeira pergunta da Phase 1
  do ` + "`jotaduo-discovery`" + `. Não espere o visitante dar contexto.
- Preâmbulo curto + 1 pergunta. Algo como:
  > "Oi! Sou a Sofia da Jotaduo. Vou te fazer algumas perguntas rápidas pra
  > entender seu negócio e deixar o atendimento sob medida. Pra começar:
  > qual é o nome da sua empresa e em que segmento você atua?"
- NÃO descreva o processo todo de antemão. Uma pergunta por vez é a regra
  da casa.

Se já tiver mensagens anteriores (sessão retomada):
- Releia o histórico + estado em ` + "`workspace/state/onboarding.json`" + ` e
  continue de onde parou, sempre na voz da Sofia.

## Quando o discovery completa

Quando todas as 8 fases do ` + "`jotaduo-discovery`" + ` estiverem concluídas
(` + "`state.discovery.completed_at`" + ` setado):

1. Sinaliza ao visitante: "Pronto, terminei minha parte. Em breve a
   Catarina vai te chamar no WhatsApp pra aprofundar detalhes específicos
   da operação. Pode levar algumas horas — fica de olho no número que você
   me passou."
2. Você **NÃO promove o tenant** — só admin faz isso pelo painel.
3. Você só marca o discovery como completo via skill
   ` + "`onboarding-state mark_discovery_done`" + `.

## Skills que você usa

- ` + "`jotaduo-discovery`" + ` (principal — roteiro)
- ` + "`onboarding-state`" + ` (state machine — init, set_owner, mark_*, get)
- ` + "`memoria/atualizar-memoria`" + ` (gravar dossiê em
  ` + "`memory/jotaduo/clients/<slug>.md`" + ` — use diretamente, Rafael não
  existe no chat público)
- ` + "`notify_user`" + ` (sinalizar marcos pro admin no painel)

## Limites herdados de SOUL.md

Não enviar mensagem externa. Não inventar informação. Quando o visitante
pedir algo fora do discovery ("você consegue gerar um post pra mim?"):
responda que sua função atual é discovery e que depois da promoção a Lia
(marketing) entra em cena. NÃO faça o post agora.

## Mensagens automáticas ` + "`[BRIDGE_CHECK]`" + `

Quando você receber uma mensagem que começa com ` + "`[BRIDGE_CHECK]`" + ` —
**não é visitante humano**. É o cron job ` + "`onboarding-bridge-sofia-catarina`" + `
disparando a cada 15min pra ver se você já terminou discovery e se a
Catarina deve assumir o aprofundamento via WhatsApp.

Nessa mensagem você **NÃO é Sofia, é Catarina pelo tempo desse 1 turno**.
A própria mensagem traz as instruções literais (chamar onboarding-state
get, decidir SILENT_NOOP ou disparar primeira mensagem WA via
enviar-whatsapp-jotaduo, etc.). Siga LITERALMENTE. Responda APENAS no
protocolo curto especificado (` + "`SILENT_NOOP`" + ` ou
` + "`BRIDGE_DISPATCHED area=... phone=...`" + `) — o cron loga, ninguém vê.

Em todas as outras mensagens (visitante humano no chat), você continua
sendo a Sofia normalmente.

## Por que este arquivo existe

Este arquivo substitui o ` + "`workspace/AGENT.md`" + ` canônico durante o
provisionamento de tenants públicos. O original (que define a equipe
completa orquestrada pelo Rafael) é o cenário pós-promoção e foi preservado
em ` + "`workspace/AGENT.cliente.md`" + ` pra que o ` + "`/promote`" + ` reverta quando o
tenant virar cliente.

Sem essa substituição, o agente main lê o prompt da equipe e responde como
Rafael — visitante anônimo é apresentado a uma equipe completa antes de
cadastrar nada, quebra a expectativa do funil
(docs/architecture/public-tenant-promotion.md), e Sofia nunca inicia o
discovery.
`

// publicAgentBackupName is the side file where the canonical (cliente)
// AGENT.md is parked when ApplyPublicSofiaAgentMD overrides AGENT.md. The
// promote handler restores from this name; cliente tenants that were never
// public never have this file.
const publicAgentBackupName = "AGENT.cliente.md"

// ApplyPublicSofiaAgentMD overrides workspace/AGENT.md with the Sofia-mode
// prompt and preserves the original alongside as AGENT.cliente.md so the
// promote flow can restore it. Idempotent: if the backup already exists,
// the original is not re-saved (in case the current AGENT.md is already the
// Sofia override from an earlier run).
//
// Called from the provisioner inside the `if t.IsPublic` branch, AFTER
// CopyWorkspaceHome.
func ApplyPublicSofiaAgentMD(volumePath string) error {
	wsDir := filepath.Join(volumePath, "workspace")
	agentMD := filepath.Join(wsDir, "AGENT.md")
	backup := filepath.Join(wsDir, publicAgentBackupName)

	// Preserve canonical only on first run.
	if _, err := os.Stat(backup); errors.Is(err, os.ErrNotExist) {
		current, readErr := os.ReadFile(agentMD)
		if readErr != nil {
			// No AGENT.md to back up — write Sofia mode anyway. Workspace
			// without AGENT.md is non-standard but shouldn't block the
			// public-mode override.
			if !errors.Is(readErr, os.ErrNotExist) {
				return fmt.Errorf("read AGENT.md: %w", readErr)
			}
		} else if err := writeFileAtomic(backup, current, 0o644); err != nil {
			return fmt.Errorf("backup AGENT.md → %s: %w", publicAgentBackupName, err)
		}
	}

	if err := writeFileAtomic(agentMD, []byte(publicSofiaAgentMD), 0o644); err != nil {
		return fmt.Errorf("write public AGENT.md: %w", err)
	}
	return nil
}

// RestoreClienteAgentMD is the inverse of ApplyPublicSofiaAgentMD: it moves
// AGENT.cliente.md back over AGENT.md. Called from tenants_promote.go before
// Recreate so the cliente boots with the team prompt instead of the Sofia
// mode that was active while the tenant was public.
//
// Idempotent: if no backup exists (tenant was never public), it's a no-op.
// Returns nil in that case so the promote handler can call it
// unconditionally.
func RestoreClienteAgentMD(volumePath string) error {
	wsDir := filepath.Join(volumePath, "workspace")
	agentMD := filepath.Join(wsDir, "AGENT.md")
	backup := filepath.Join(wsDir, publicAgentBackupName)

	data, err := os.ReadFile(backup)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read %s: %w", publicAgentBackupName, err)
	}

	if err := writeFileAtomic(agentMD, data, 0o644); err != nil {
		return fmt.Errorf("restore AGENT.md from %s: %w", publicAgentBackupName, err)
	}

	// Remove the backup so a subsequent re-promote (rare but possible) of an
	// accidentally-republished tenant doesn't restore stale content. The
	// canonical is back in place; the backup served its purpose.
	if err := os.Remove(backup); err != nil && !errors.Is(err, os.ErrNotExist) {
		// Non-fatal — file is just leftover state at this point.
		return nil
	}
	return nil
}

func configObject(parent map[string]any, key string) (map[string]any, error) {
	raw, ok := parent[key]
	if !ok || raw == nil {
		return nil, nil
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("config.json: %q is %T, want object", key, raw)
	}
	return obj, nil
}

// placeholderFiles lists relative paths inside the tenant volume that
// SubstituteConfigPlaceholders walks. We don't scan every file because
// placeholder substitution is a string-replace that could corrupt binary
// files (icons, sqlite dbs) if applied indiscriminately.
var placeholderFiles = []string{
	"config.json",
	".security.yml",
	"workspace/behavior.json",
	"workspace/agent_config.json",
}

// RewriteConfigLiteLLMKey rewrites every api_key field in volumePath/config.json
// to newKey. Used after a tenant clone so the cloned tenant's LiteLLM
// calls stop hitting the source tenant's virtual key (and budget).
//
// The function tolerates two common shapes seen in picoclaw config.json:
//
//	{ "model_list": [ {"api_key": "..."} ] }
//	{ "model_list": [ {"litellm_params": {"api_key": "..."}} ] }
//
// Anything else is left intact. Missing config.json is a no-op so callers
// that never had a LiteLLM-backed setup still work.
func RewriteConfigLiteLLMKey(volumePath, newKey string) error {
	path := filepath.Join(volumePath, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if jerr := json.Unmarshal(data, &cfg); jerr != nil {
		return fmt.Errorf("parse config.json: %w", jerr)
	}
	list, _ := cfg["model_list"].([]any)
	for _, m := range list {
		model, ok := m.(map[string]any)
		if !ok {
			continue
		}
		if _, ok := model["api_key"]; ok {
			model["api_key"] = newKey
		}
		if params, ok := model["litellm_params"].(map[string]any); ok {
			if _, ok := params["api_key"]; ok {
				params["api_key"] = newKey
			}
		}
	}
	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	// Preserve the original file's mode and trailing newline so a rewrite
	// can't silently widen permissions (e.g. 0600 -> 0644) or strip the
	// trailing \n that text editors and JSON formatters keep by convention.
	mode := os.FileMode(0o644)
	if info, statErr := os.Stat(path); statErr == nil {
		mode = info.Mode().Perm()
	}
	if len(data) > 0 && data[len(data)-1] == '\n' && (len(out) == 0 || out[len(out)-1] != '\n') {
		out = append(out, '\n')
	}
	return os.WriteFile(path, out, mode)
}

// SubstituteConfigPlaceholders walks a fixed set of config files in destDir
// and replaces every key in replacements with its value. The keys are the
// literal placeholder strings (e.g. "${LITELLM_KEY}"), not a regex, to keep
// the substitution predictable and avoid silently matching unintended
// substrings in real config content.
//
// Missing files are skipped (a workspace doesn't have to include every
// config — only config.json is mandatory). Errors on individual files
// surface so a misformed file isn't silently left with placeholders in it.
func SubstituteConfigPlaceholders(destDir string, replacements map[string]string) error {
	if len(replacements) == 0 {
		return nil
	}
	for _, rel := range placeholderFiles {
		full := filepath.Join(destDir, rel)
		data, err := os.ReadFile(full)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return fmt.Errorf("read %s: %w", rel, err)
		}
		original := data
		for needle, value := range replacements {
			data = bytes.ReplaceAll(data, []byte(needle), []byte(value))
		}
		if bytes.Equal(original, data) {
			continue
		}
		// Preserve mode bits — config.json is 0644, .security.yml might be
		// 0640 in some setups. Stat first, write back with the same perm.
		info, err := os.Stat(full)
		if err != nil {
			return fmt.Errorf("stat %s: %w", rel, err)
		}
		if err := os.WriteFile(full, data, info.Mode().Perm()); err != nil {
			return fmt.Errorf("write %s: %w", rel, err)
		}
	}
	return nil
}

// SubstituteRedactedModelKeys rewrites the generated baseline's redacted
// model credentials in .security.yml to the tenant's LiteLLM virtual key.
// The sync script scrubs real dev keys from workspace/.security.yml before
// embedding the baseline; in SaaS provisioning those redacted model keys are
// placeholders, while non-model redacted values must stay untouched.
func SubstituteRedactedModelKeys(destDir, litellmKey string) error {
	if strings.TrimSpace(litellmKey) == "" {
		return nil
	}
	full := filepath.Join(destDir, ".security.yml")
	data, err := os.ReadFile(full)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read .security.yml: %w", err)
	}

	var root map[string]any
	if err := yaml.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse .security.yml: %w", err)
	}
	modelList, ok := root["model_list"].(map[string]any)
	if !ok {
		return nil
	}

	changed := false
	for _, rawEntry := range modelList {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		switch keys := entry["api_keys"].(type) {
		case []any:
			for i, rawKey := range keys {
				if strings.TrimSpace(fmt.Sprint(rawKey)) == "REDACTED" {
					keys[i] = litellmKey
					changed = true
				}
			}
		case []string:
			for i, rawKey := range keys {
				if strings.TrimSpace(rawKey) == "REDACTED" {
					keys[i] = litellmKey
					changed = true
				}
			}
			entry["api_keys"] = keys
		}
	}
	if !changed {
		return nil
	}

	out, err := yaml.Marshal(root)
	if err != nil {
		return fmt.Errorf("marshal .security.yml: %w", err)
	}
	mode := os.FileMode(0o600)
	if info, statErr := os.Stat(full); statErr == nil {
		mode = info.Mode().Perm()
	}
	if err := writeFileAtomic(full, out, mode); err != nil {
		return fmt.Errorf("write .security.yml: %w", err)
	}
	return nil
}

const (
	saaSCLIWorkspacePath          = "/root/.picoclaw/workspace"
	defaultSaaSClaudeCLIModelName = "claude-cli-sonnet"
	defaultSaaSClaudeCLIModel     = "sonnet"
	defaultSaaSCodexCLIModelName  = "codex-cli-gpt-5"
	defaultSaaSCodexCLIModel      = "gpt-5"
)

// ApplySaaSCLIModelRouting makes a provisioned non-raw tenant use shared
// operator CLI auth mounts instead of upstream API keys. The auth material
// lives outside the workspace and is injected read-only by the provisioner.
func ApplySaaSCLIModelRouting(destDir string, enableClaude, enableCodex bool) error {
	if !enableClaude && !enableCodex {
		return fmt.Errorf("at least one saas cli provider must be enabled")
	}

	path := filepath.Join(destDir, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}

	agents, err := configObject(cfg, "agents")
	if err != nil {
		return err
	}
	if agents == nil {
		agents = map[string]any{}
		cfg["agents"] = agents
	}
	defaults, err := configObject(agents, "defaults")
	if err != nil {
		return err
	}
	if defaults == nil {
		defaults = map[string]any{}
		agents["defaults"] = defaults
	}

	models := make([]any, 0, 2)
	if enableClaude {
		defaults["provider"] = "claude-cli"
		defaults["model_name"] = defaultSaaSClaudeCLIModelName
		if enableCodex {
			defaults["model_fallbacks"] = []any{defaultSaaSCodexCLIModelName}
		} else {
			delete(defaults, "model_fallbacks")
		}

		claude := map[string]any{
			"model_name": defaultSaaSClaudeCLIModelName,
			"provider":   "claude-cli",
			"model":      defaultSaaSClaudeCLIModel,
			"workspace":  saaSCLIWorkspacePath,
			"enabled":    true,
		}
		if enableCodex {
			claude["fallbacks"] = []any{defaultSaaSCodexCLIModelName}
		}
		models = append(models, claude)
	}
	if enableCodex {
		if !enableClaude {
			defaults["provider"] = "codex-cli"
			defaults["model_name"] = defaultSaaSCodexCLIModelName
			delete(defaults, "model_fallbacks")
		}
		models = append(models, map[string]any{
			"model_name": defaultSaaSCodexCLIModelName,
			"provider":   "codex-cli",
			"model":      defaultSaaSCodexCLIModel,
			"workspace":  saaSCLIWorkspacePath,
			"enabled":    true,
		})
	}
	cfg["model_list"] = models

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	if len(data) > 0 && data[len(data)-1] == '\n' {
		out = append(out, '\n')
	}
	mode := os.FileMode(0o644)
	if info, statErr := os.Stat(path); statErr == nil {
		mode = info.Mode().Perm()
	}
	if err := writeFileAtomic(path, out, mode); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	if err := removeSecurityModelList(destDir); err != nil {
		return err
	}
	return nil
}

func removeSecurityModelList(destDir string) error {
	full := filepath.Join(destDir, ".security.yml")
	data, err := os.ReadFile(full)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("read .security.yml: %w", err)
	}

	var root yaml.Node
	if err := yaml.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("parse .security.yml: %w", err)
	}
	if len(root.Content) == 0 || root.Content[0].Kind != yaml.MappingNode {
		return nil
	}

	mapping := root.Content[0]
	changed := false
	next := mapping.Content[:0]
	for i := 0; i < len(mapping.Content); i += 2 {
		if i+1 >= len(mapping.Content) {
			next = append(next, mapping.Content[i])
			continue
		}
		key := mapping.Content[i]
		if key.Value == "model_list" {
			changed = true
			continue
		}
		next = append(next, key, mapping.Content[i+1])
	}
	if !changed {
		return nil
	}
	mapping.Content = next

	out, err := yaml.Marshal(&root)
	if err != nil {
		return fmt.Errorf("marshal .security.yml: %w", err)
	}
	mode := os.FileMode(0o600)
	if info, statErr := os.Stat(full); statErr == nil {
		mode = info.Mode().Perm()
	}
	if err := writeFileAtomic(full, out, mode); err != nil {
		return fmt.Errorf("write .security.yml: %w", err)
	}
	return nil
}

// ApplySaaSLiteLLMModelRouting makes a provisioned non-raw tenant use the
// SaaS-owned LiteLLM proxy instead of any provider/API keys that happened to
// exist in the workspace template. The controlplane owns provider/model
// credentials; tenant workspaces own prompts, skills, memory and channels.
func ApplySaaSLiteLLMModelRouting(destDir, modelName, litellmURL, litellmKey string) error {
	modelName = strings.TrimSpace(modelName)
	litellmURL = strings.TrimRight(strings.TrimSpace(litellmURL), "/")
	litellmKey = strings.TrimSpace(litellmKey)
	if modelName == "" {
		return fmt.Errorf("saas litellm model_name is required")
	}
	if litellmURL == "" {
		return fmt.Errorf("saas litellm api_base is required")
	}
	if litellmKey == "" {
		return fmt.Errorf("saas litellm api_key is required")
	}

	path := filepath.Join(destDir, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config.json: %w", err)
	}

	agents, err := configObject(cfg, "agents")
	if err != nil {
		return err
	}
	if agents == nil {
		agents = map[string]any{}
		cfg["agents"] = agents
	}
	defaults, err := configObject(agents, "defaults")
	if err != nil {
		return err
	}
	if defaults == nil {
		defaults = map[string]any{}
		agents["defaults"] = defaults
	}
	defaults["provider"] = "litellm"
	defaults["model_name"] = modelName

	cfg["model_list"] = []any{
		map[string]any{
			"model_name": modelName,
			"provider":   "openai",
			"model":      modelName,
			"api_base":   litellmURL,
			"api_keys":   []any{litellmKey},
			"enabled":    true,
		},
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config.json: %w", err)
	}
	if len(data) > 0 && data[len(data)-1] == '\n' {
		out = append(out, '\n')
	}
	mode := os.FileMode(0o644)
	if info, statErr := os.Stat(path); statErr == nil {
		mode = info.Mode().Perm()
	}
	if err := writeFileAtomic(path, out, mode); err != nil {
		return fmt.Errorf("write config.json: %w", err)
	}
	return nil
}

// workspaceBuildLocks serializes concurrent BuildWorkspaceFrontend calls per
// host_path. Two parallel "Compile" clicks would otherwise race on the same
// frontend-dist/ output directory; we use an in-process mutex keyed on the
// workspace path. A multi-process scenario (multiple controlplane replicas
// against the same volume) is not supported — the docker run itself would
// fail trying to mount a busy dir.
var workspaceBuildLocks sync.Map // map[string]*sync.Mutex

func lockForWorkspace(hostPath string) *sync.Mutex {
	v, _ := workspaceBuildLocks.LoadOrStore(hostPath, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// BuildWorkspaceFrontend compiles the workspace's React source via a one-shot
// node:24-alpine docker container. Returns the combined stdout+stderr of the
// build (truncated to ~64 KiB tail) so the admin UI can show diagnostics.
//
// Two bind-mounts:
//
//	<hostPath>/frontend-src  →  /src      (read-write so pnpm can write
//	                                       node_modules; alternative would
//	                                       require a separate cache volume)
//	<hostPath>/frontend-dist →  /out      (vite outDir)
//
// The shell command runs:
//
//	corepack enable
//	pnpm install --frozen-lockfile
//	pnpm vite build --outDir /out --emptyOutDir
//
// We invoke `docker run --rm` via the host's docker CLI rather than the SDK
// because (a) we want a clean exit at the end with no container leak, and
// (b) the controlplane container already has /var/run/docker.sock mounted
// for tenant lifecycle, so `docker` works from inside it. If the binary is
// absent (unusual), the function returns a clear error rather than failing
// further down.
func BuildWorkspaceFrontend(ctx context.Context, hostPath string) (string, error) {
	srcDir := filepath.Join(hostPath, WorkspaceFrontendSrcSubdir)
	distDir := filepath.Join(hostPath, WorkspaceFrontendDistSubdir)
	if _, err := os.Stat(srcDir); err != nil {
		return "", fmt.Errorf("frontend-src not found at %s: %w", srcDir, err)
	}
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir frontend-dist: %w", err)
	}

	lock := lockForWorkspace(hostPath)
	if !lock.TryLock() {
		return "", errors.New("another build is already running for this workspace")
	}
	defer lock.Unlock()

	if _, err := exec.LookPath("docker"); err != nil {
		return "", fmt.Errorf("docker CLI not available in controlplane (need it to run the build sidecar): %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, frontendBuildTimeout)
	defer cancel()

	buildScript := strings.Join([]string{
		"set -e",
		"corepack enable",
		"pnpm install --frozen-lockfile",
		"pnpm vite build --outDir /out --emptyOutDir",
	}, " && ")

	cmd := exec.CommandContext(ctx, "docker", "run", "--rm",
		"-v", srcDir+":/src",
		"-v", distDir+":/out",
		"-w", "/src",
		"--network", "bridge",
		workspaceBuildImage,
		"sh", "-c", buildScript,
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	runErr := cmd.Run()

	log := truncateLog(out.String())
	if ctx.Err() == context.DeadlineExceeded {
		return log, fmt.Errorf("frontend build timed out after %s", frontendBuildTimeout)
	}
	if runErr != nil {
		return log, fmt.Errorf("vite build failed: %w", runErr)
	}
	return log, nil
}

// truncateLog keeps the last 64 KiB of the build log. Frontend builds with
// many TS errors can blow past that, but the tail is what's useful for
// diagnosing — the first 95% is `pnpm install` chatter that nobody reads.
func truncateLog(s string) string {
	const maxBytes = 64 * 1024
	if len(s) <= maxBytes {
		return s
	}
	return "[...truncated, showing last 64 KiB...]\n" + s[len(s)-maxBytes:]
}

// WorkspaceFrontendDistPath returns the absolute host path of the workspace's
// compiled frontend dist directory. Provisioner uses it as the source of the
// second bind-mount when creating the tenant container.
func WorkspaceFrontendDistPath(hostPath string) string {
	return filepath.Join(hostPath, WorkspaceFrontendDistSubdir)
}

// HasBuiltFrontend reports whether the workspace has a compiled frontend
// ready to serve. The launcher falls back to its embedded dist when this
// returns false, so the admin can provision tenants pointing at a workspace
// whose frontend hasn't been built yet — they just won't get the visual
// customization until the operator clicks "Compilar frontend".
func HasBuiltFrontend(hostPath string) bool {
	indexPath := filepath.Join(hostPath, WorkspaceFrontendDistSubdir, "index.html")
	info, err := os.Stat(indexPath)
	return err == nil && !info.IsDir() && info.Size() > 0
}

// io.Discard reference kept to avoid unused-import if a future refactor of
// truncateLog routes through it.
var _ = io.Discard
