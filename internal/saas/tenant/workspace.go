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

type WorkspaceRuntimeSyncResult struct {
	FilesCopied        int
	DirsCreated        int
	PublicAgentApplied bool
}

var workspaceRuntimeSyncSkipNames = map[string]struct{}{
	"memory":       {},
	"state":        {},
	"sessions":     {},
	"whatsapp":     {},
	"matrix":       {},
	"output":       {},
	"logs":         {},
	"cache":        {},
	".cache":       {},
	"node_modules": {},
	"__pycache__":  {},
}

var workspaceRuntimeSyncSkipSuffixes = []string{
	".log",
	".tmp.json",
	".pid",
	".sock",
	".pyc",
}

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

func shouldSkipWorkspaceRuntimeSyncRel(rel string) bool {
	rel = filepath.ToSlash(filepath.Clean(rel))
	if rel == "." || rel == "" {
		return false
	}
	if rel == publicAgentBackupName {
		return true
	}
	for _, part := range strings.Split(rel, "/") {
		if _, ok := workspaceRuntimeSyncSkipNames[part]; ok {
			return true
		}
	}
	for _, suffix := range workspaceRuntimeSyncSkipSuffixes {
		if strings.HasSuffix(rel, suffix) {
			return true
		}
	}
	return false
}

// SyncWorkspaceRuntime overlays the operational workspace tree from a
// Workspace's home/workspace/ into a live tenant volume. It intentionally
// avoids mutable runtime data (memory/, state/, sessions/, WhatsApp stores,
// pycache/logs) so an admin can update agents/skills without erasing the
// customer's source-of-truth memory.
//
// Public tenants get one special case: source AGENT.md is copied to
// AGENT.cliente.md and then the Sofia public AGENT.md override is applied.
// That keeps future promotion able to restore the fresh cliente prompt while
// the live public chat continues to start as Sofia.
func SyncWorkspaceRuntime(srcWorkspacePath, destVolumePath string, isPublic bool) (WorkspaceRuntimeSyncResult, error) {
	var result WorkspaceRuntimeSyncResult

	src := filepath.Join(srcWorkspacePath, WorkspaceHomeSubdir, "workspace")
	info, err := os.Stat(src)
	if err != nil {
		return result, fmt.Errorf("workspace runtime source not found at %s: %w", src, err)
	}
	if !info.IsDir() {
		return result, fmt.Errorf("workspace runtime source %s is not a directory", src)
	}

	dst := filepath.Join(destVolumePath, "workspace")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return result, fmt.Errorf("mkdir tenant workspace: %w", err)
	}

	if err := filepath.Walk(src, func(path string, fi os.FileInfo, walkErr error) error {
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
		if shouldSkipWorkspaceRuntimeSyncRel(rel) {
			if fi.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		if !fi.IsDir() && !fi.Mode().IsRegular() {
			return nil
		}

		target := filepath.Join(dst, rel)
		if fi.IsDir() {
			if err := os.MkdirAll(target, fi.Mode().Perm()); err != nil {
				return err
			}
			result.DirsCreated++
			return nil
		}

		if isPublic && filepath.ToSlash(rel) == "AGENT.md" {
			target = filepath.Join(dst, publicAgentBackupName)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := copyFile(path, target, fi.Mode().Perm()); err != nil {
			return err
		}
		result.FilesCopied++
		return nil
	}); err != nil {
		return result, err
	}

	if isPublic {
		if err := ApplyPublicSofiaAgentMD(destVolumePath); err != nil {
			return result, fmt.Errorf("apply public Sofia AGENT.md: %w", err)
		}
		result.PublicAgentApplied = true
	}

	return result, nil
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
	if decodeErr := yaml.Unmarshal(data, &root); decodeErr != nil {
		return fmt.Errorf("parse .security.yml: %w", decodeErr)
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

// publicSofiaAgentSrcRel is the workspace-relative path to the Sofia public
// discovery prompt. This file IS the source of truth for Sofia's public voice
// (a real, versioned workspace file, synced into baseline-workspace via
// `make sync-baseline`). The provisioner COPIES it over workspace/AGENT.md for
// public tenants instead of embedding the prompt as a Go const — so changing
// Sofia's wording is a workspace edit + sync, with no Go rebuild / image
// release. (Previously the prompt lived in an inline const here, which drifted
// from the workspace .md files and contradicted the frontend.)
//
// Why physically swap AGENT.md (not a runtime active_profile check): the LLM
// would have to re-decide routing every turn and drifts. A concrete AGENT.md
// guarantees a consistent Sofia persona from message 1 — otherwise the visitor
// gets Rafael introducing the cliente team, breaking the discovery funnel
// (docs/architecture/public-tenant-promotion.md).
const publicSofiaAgentSrcRel = "agents/sofia/AGENT.public.md"

// publicAgentBackupName is the side file where the canonical (cliente)
// AGENT.md is parked when ApplyPublicSofiaAgentMD overrides AGENT.md. The
// promote handler restores from this name; cliente tenants that were never
// public never have this file.
const publicAgentBackupName = "AGENT.cliente.md"

// ApplyPublicSofiaAgentMD overrides workspace/AGENT.md with the Sofia-mode
// prompt (read from the workspace file publicSofiaAgentSrcRel, the source of
// truth) and preserves the original alongside as AGENT.cliente.md so the
// promote flow can restore it. Idempotent: if the backup already exists,
// the original is not re-saved (in case the current AGENT.md is already the
// Sofia override from an earlier run).
//
// Called from the provisioner inside the `if t.IsPublic` branch, AFTER
// CopyWorkspaceHome — so the Sofia prompt file has already been copied into
// the volume. A missing prompt file means the workspace seed is stale (run
// `make sync-baseline` / re-seed): fail loud rather than boot the cliente
// team persona into a public tenant.
func ApplyPublicSofiaAgentMD(volumePath string) error {
	wsDir := filepath.Join(volumePath, "workspace")
	agentMD := filepath.Join(wsDir, "AGENT.md")
	backup := filepath.Join(wsDir, publicAgentBackupName)
	src := filepath.Join(wsDir, filepath.FromSlash(publicSofiaAgentSrcRel))

	sofiaMD, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("read public Sofia prompt %s: %w", publicSofiaAgentSrcRel, err)
	}

	// Preserve canonical only on first run.
	if _, statErr := os.Stat(backup); errors.Is(statErr, os.ErrNotExist) {
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

	if err := writeFileAtomic(agentMD, sofiaMD, 0o644); err != nil {
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
	if decodeErr := yaml.Unmarshal(data, &root); decodeErr != nil {
		return fmt.Errorf("parse .security.yml: %w", decodeErr)
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
	// "codex-cli" tells the provider not to pass -m, letting the operator's
	// Codex config.toml choose a model compatible with that ChatGPT account.
	defaultSaaSCodexCLIModel = "codex-cli"
)

type saasCLIModelSpec struct {
	Provider  string
	ModelName string
	Model     string
}

func saasCLIModelSpecFor(provider string) (saasCLIModelSpec, bool) {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "claude", "claude-cli":
		return saasCLIModelSpec{
			Provider:  "claude-cli",
			ModelName: defaultSaaSClaudeCLIModelName,
			Model:     defaultSaaSClaudeCLIModel,
		}, true
	case "codex", "codex-cli":
		return saasCLIModelSpec{
			Provider:  "codex-cli",
			ModelName: defaultSaaSCodexCLIModelName,
			Model:     defaultSaaSCodexCLIModel,
		}, true
	default:
		return saasCLIModelSpec{}, false
	}
}

func applyCLIModelOverrides(spec saasCLIModelSpec, cfg CLIModelRoutingConfig) saasCLIModelSpec {
	switch spec.Provider {
	case "claude-cli":
		if model := strings.TrimSpace(cfg.ClaudeModel); model != "" {
			spec.Model = model
		}
		if modelName := strings.TrimSpace(cfg.ClaudeModelName); modelName != "" {
			spec.ModelName = modelName
		} else if strings.TrimSpace(cfg.ClaudeModel) != "" {
			spec.ModelName = saasCLIModelNameFor(spec.Provider, spec.Model)
		}
	case "codex-cli":
		if model := strings.TrimSpace(cfg.CodexModel); model != "" {
			spec.Model = model
		}
		if modelName := strings.TrimSpace(cfg.CodexModelName); modelName != "" {
			spec.ModelName = modelName
		} else if strings.TrimSpace(cfg.CodexModel) != "" {
			spec.ModelName = saasCLIModelNameFor(spec.Provider, spec.Model)
		}
	}
	return spec
}

func saasCLIModelNameFor(provider, model string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	model = strings.TrimSpace(model)
	switch provider {
	case "claude-cli":
		if model == "" || model == defaultSaaSClaudeCLIModel {
			return defaultSaaSClaudeCLIModelName
		}
	case "codex-cli":
		if model == "" || model == defaultSaaSCodexCLIModel {
			return defaultSaaSCodexCLIModelName
		}
	}
	slug := saasModelSlug(model)
	if slug == "" {
		switch provider {
		case "claude-cli":
			return defaultSaaSClaudeCLIModelName
		case "codex-cli":
			return defaultSaaSCodexCLIModelName
		default:
			return "cli-model"
		}
	}
	return provider + "-" + slug
}

func saasModelSlug(model string) string {
	model = strings.ToLower(strings.TrimSpace(model))
	var b strings.Builder
	prevDash := false
	for _, r := range model {
		isAlnum := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if isAlnum {
			b.WriteRune(r)
			prevDash = false
			continue
		}
		if !prevDash && b.Len() > 0 {
			b.WriteByte('-')
			prevDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func normalizeSaaSCLIOrder(order []string) ([]saasCLIModelSpec, error) {
	return normalizeSaaSCLIRouting(CLIModelRoutingConfig{Order: order})
}

func normalizeSaaSCLIRouting(cfg CLIModelRoutingConfig) ([]saasCLIModelSpec, error) {
	specs := make([]saasCLIModelSpec, 0, len(cfg.Order))
	seen := map[string]bool{}
	for _, raw := range cfg.Order {
		spec, ok := saasCLIModelSpecFor(raw)
		if !ok {
			return nil, fmt.Errorf("unsupported saas cli provider %q (expected claude-cli or codex-cli)", raw)
		}
		if seen[spec.Provider] {
			continue
		}
		seen[spec.Provider] = true
		spec = applyCLIModelOverrides(spec, cfg)
		specs = append(specs, spec)
	}
	if len(specs) == 0 {
		return nil, fmt.Errorf("at least one saas cli provider must be enabled")
	}
	return specs, nil
}

// ApplySaaSCLIModelRouting makes a provisioned non-raw tenant use shared
// operator CLI auth mounts instead of upstream API keys. The auth material
// lives outside the workspace; Claude is injected read-only and Codex is
// copied into a writable CODEX_HOME snapshot because codex exec writes state.
func ApplySaaSCLIModelRouting(destDir string, enableClaude, enableCodex bool) error {
	if !enableClaude && !enableCodex {
		return fmt.Errorf("at least one saas cli provider must be enabled")
	}
	order := make([]string, 0, 2)
	if enableClaude {
		order = append(order, "claude-cli")
	}
	if enableCodex {
		order = append(order, "codex-cli")
	}
	return ApplySaaSCLIModelRoutingFromOrder(destDir, order)
}

func ApplySaaSCLIModelRoutingFromOrder(destDir string, order []string) error {
	return ApplySaaSCLIModelRoutingFromConfig(destDir, CLIModelRoutingConfig{Order: order})
}

func ApplySaaSCLIModelRoutingFromConfig(destDir string, routing CLIModelRoutingConfig) error {
	specs, err := normalizeSaaSCLIRouting(routing)
	if err != nil {
		return err
	}

	path := filepath.Join(destDir, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var cfg map[string]any
	if decodeErr := json.Unmarshal(data, &cfg); decodeErr != nil {
		return fmt.Errorf("parse config.json: %w", decodeErr)
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

	defaults["provider"] = specs[0].Provider
	defaults["model_name"] = specs[0].ModelName
	fallbackNames := make([]any, 0, len(specs)-1)
	for _, spec := range specs[1:] {
		fallbackNames = append(fallbackNames, spec.ModelName)
	}
	if len(fallbackNames) > 0 {
		defaults["model_fallbacks"] = fallbackNames
	} else {
		delete(defaults, "model_fallbacks")
	}

	models := make([]any, 0, len(specs))
	for i, spec := range specs {
		model := map[string]any{
			"model_name": spec.ModelName,
			"provider":   spec.Provider,
			"model":      spec.Model,
			"workspace":  saaSCLIWorkspacePath,
			"enabled":    true,
		}
		if i == 0 && len(fallbackNames) > 0 {
			model["fallbacks"] = fallbackNames
		}
		models = append(models, model)
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
	if decodeErr := yaml.Unmarshal(data, &root); decodeErr != nil {
		return fmt.Errorf("parse .security.yml: %w", decodeErr)
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
	return ApplySaaSLiteLLMModelRoutingWithFallbacks(destDir, modelName, nil, litellmURL, litellmKey)
}

func ApplySaaSLiteLLMModelRoutingWithFallbacks(
	destDir, modelName string,
	fallbackModels []string,
	litellmURL, litellmKey string,
) error {
	modelName = strings.TrimSpace(modelName)
	litellmURL = strings.TrimRight(strings.TrimSpace(litellmURL), "/")
	litellmKey = strings.TrimSpace(litellmKey)
	fallbackModels = compactUniqueStrings(fallbackModels)
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
	if decodeErr := json.Unmarshal(data, &cfg); decodeErr != nil {
		return fmt.Errorf("parse config.json: %w", decodeErr)
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
	if len(fallbackModels) > 0 {
		defaults["model_fallbacks"] = stringsToAnySlice(fallbackModels)
	} else {
		delete(defaults, "model_fallbacks")
	}

	modelNames := append([]string{modelName}, fallbackModels...)
	models := make([]any, 0, len(modelNames))
	for i, name := range modelNames {
		model := map[string]any{
			"model_name": name,
			"provider":   "openai",
			"model":      name,
			"api_base":   litellmURL,
			"api_keys":   []any{litellmKey},
			"enabled":    true,
		}
		if i == 0 && len(fallbackModels) > 0 {
			model["fallbacks"] = stringsToAnySlice(fallbackModels)
		}
		models = append(models, model)
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
	return nil
}

func compactUniqueStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func stringsToAnySlice(values []string) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}

type TenantCLIAuthRequirements struct {
	Known  bool
	Claude bool
	Codex  bool
}

func TenantCLIAuthProvidersFromConfig(volumePath string) (TenantCLIAuthRequirements, error) {
	if strings.TrimSpace(volumePath) == "" {
		return TenantCLIAuthRequirements{}, nil
	}
	path := filepath.Join(volumePath, "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return TenantCLIAuthRequirements{}, nil
		}
		return TenantCLIAuthRequirements{}, fmt.Errorf("read config.json: %w", err)
	}

	var cfg map[string]any
	if err := json.Unmarshal(data, &cfg); err != nil {
		return TenantCLIAuthRequirements{}, fmt.Errorf("parse config.json: %w", err)
	}

	req := TenantCLIAuthRequirements{Known: true}
	list, _ := cfg["model_list"].([]any)
	for _, raw := range list {
		model, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(fmt.Sprint(model["provider"]))) {
		case "claude-cli":
			req.Claude = true
		case "codex-cli":
			req.Codex = true
		}
	}
	return req, nil
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
