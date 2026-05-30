package tenant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
	picoclawconfig "github.com/sipeed/picoclaw/pkg/config"
)

const (
	// sharedAuthHostPath is where the operator places auth.json with OAuth
	// credentials shared across all auto-provisioned tenants (Codex, Claude
	// CLI, GitHub, etc.). Override via PICOCLAW_SHARED_AUTH_PATH env if the
	// operator prefers a different location.
	sharedAuthHostPath = "/etc/picoclaw/shared-auth.json"

	// defaultSaaSLiteLLMModel must exist in docker/saas/litellm/config.yaml.
	// Tenants receive a per-tenant virtual LiteLLM key, so their config should
	// point at the controlplane-managed model name, not at raw upstream providers.
	defaultSaaSLiteLLMModel = "gpt-4o-mini"

	tenantCodexCLIHomeRel       = ".codex"
	tenantCodexCLIHomeContainer = "/root/.picoclaw/.codex"
)

func (p *Provisioner) sharedCLIModelRouting() (useClaude, useCodex bool) {
	if p == nil || p.Cfg == nil {
		return false, false
	}
	claudeDir, _ := resolveClaudeCLIAuthDir(p.Cfg.TenantClaudeCliAuthDir)
	codexDir, _ := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir)
	return claudeDir != "", codexDir != ""
}

func resolveClaudeCLIAuthDir(path string) (string, error) {
	return resolveCLIAuthDir(path, ".credentials.json", ".claude")
}

func resolveCodexCLIAuthDir(path string) (string, error) {
	return resolveCLIAuthDir(path, "auth.json", ".codex")
}

func resolveCLIAuthDir(path, markerFile, nestedDir string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", nil
	}
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	if !info.IsDir() {
		return "", nil
	}
	if hasRegularFile(filepath.Join(path, markerFile)) {
		return path, nil
	}

	nested := filepath.Join(path, nestedDir)
	nestedInfo, err := os.Stat(nested)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	if nestedInfo.IsDir() && hasRegularFile(filepath.Join(nested, markerFile)) {
		return nested, nil
	}
	return "", nil
}

func hasRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// prepareCodexCLIHome snapshots the minimum operator-managed Codex CLI auth
// files into the tenant volume. Codex writes helper/config state during
// `codex exec`, so a read-only bind at /root/.codex breaks the first real
// turn. Copying just auth.json and config.toml keeps the operator source
// immutable without leaking local sessions, memories, logs, or plugin caches.
func prepareCodexCLIHome(volumePath, authDir string) error {
	authDir = strings.TrimSpace(authDir)
	if volumePath == "" || authDir == "" {
		return nil
	}
	dest := filepath.Join(volumePath, tenantCodexCLIHomeRel)
	srcAbs, srcErr := filepath.Abs(authDir)
	dstAbs, dstErr := filepath.Abs(dest)
	if srcErr == nil && dstErr == nil && srcAbs == dstAbs {
		return nil
	}
	if err := os.RemoveAll(dest); err != nil {
		return fmt.Errorf("reset codex home: %w", err)
	}
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return fmt.Errorf("mkdir codex home: %w", err)
	}
	for _, name := range []string{"auth.json", "config.toml"} {
		src := filepath.Join(authDir, name)
		info, err := os.Stat(src)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) && name == "config.toml" {
				continue
			}
			return fmt.Errorf("stat codex %s: %w", name, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			return fmt.Errorf("codex %s is not a regular file", name)
		}
		if err := copyFile(src, filepath.Join(dest, name), 0o600); err != nil {
			return fmt.Errorf("copy codex %s: %w", name, err)
		}
	}
	return nil
}

// copySharedAuthIfPresent reads sharedAuthHostPath (or the
// PICOCLAW_SHARED_AUTH_PATH override) and copies it into the tenant
// volume at /root/.picoclaw/auth.json (overwriting whatever the
// workspace baseline put there). No-op when the source file is missing
// — that's the documented "per-tenant auth" path.
func copySharedAuthIfPresent(volumePath string) error {
	src := strings.TrimSpace(os.Getenv("PICOCLAW_SHARED_AUTH_PATH"))
	if src == "" {
		src = sharedAuthHostPath
	}
	in, err := os.Open(src)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // no shared auth configured → fine
		}
		return fmt.Errorf("open %s: %w", src, err)
	}
	defer in.Close()

	dst := filepath.Join(volumePath, "auth.json")
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("create %s: %w", dst, err)
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return fmt.Errorf("copy: %w", err)
	}
	if err := out.Close(); err != nil {
		return fmt.Errorf("close %s: %w", dst, err)
	}
	log.Printf("provisioner: seeded tenant auth.json from %s -> %s", src, dst)
	return nil
}

type Provisioner struct {
	Cfg        *config.Config
	Tenants    *store.TenantStore
	Workspaces *store.WorkspaceStore
	Sessions   *store.SessionStore // optional; used by RotatePassword to revoke active sessions
	Docker     *DockerClient
	LiteLLM    *litellm.Client // optional; when nil the tenant is provisioned without an LLM key
	// Supabase is the (optional) handle used during Delete() and RotatePassword()
	// to remove or update the Supabase Auth user for tenants with
	// auth_backend='supabase'. Nil when Supabase isn't configured — those calls
	// degrade to no-op + best-effort logging.
	Supabase SupabaseManager
}

func NewProvisioner(cfg *config.Config, db *store.DB, dk *DockerClient, ll *litellm.Client) *Provisioner {
	return &Provisioner{
		Cfg:        cfg,
		Tenants:    &store.TenantStore{DB: db},
		Workspaces: &store.WorkspaceStore{DB: db},
		Sessions:   &store.SessionStore{DB: db},
		Docker:     dk,
		LiteLLM:    ll,
	}
}

type CreateInput struct {
	DisplayName      string
	OwnerEmail       string
	Subdomain        string
	MonthlyBudgetUSD *float64
	MemLimitMB       int
	CPUQuota         float64
	// WorkspaceID is required: it picks the Workspace whose home/ subtree
	// seeds the tenant volume and whose frontend-dist/ gets bind-mounted
	// into the container. The auto-provisioner resolves this from
	// Workspaces.GetDefaultAuto(); the manual admin form passes whatever
	// the operator picked from the dropdown.
	WorkspaceID string
	// SkipDashboardPassword tells the provisioner to NOT seed launcher-auth.db
	// with the generated password. Auto-provision uses this when Supabase Auth
	// is the source of truth for the tenant's dashboard login — seeding a
	// local bcrypt hash would just be dead weight inside the tenant volume.
	// The InitialPassword in CreateOutput is still populated for cases where
	// the caller wants to surface a password (LoginMode=password).
	SkipDashboardPassword bool
	// AuthBackend records how the controlplane will authenticate this
	// tenant's dashboard requests: "local" (default) or "supabase".
	AuthBackend string
	// IsPublic marks the tenant as a public-facing service. When true,
	// SkipDashboardPassword is forced on (no human owner password) and the
	// resulting Tenant row has is_public=true so the gateway can later
	// dispense with Supabase JWT verification on the public tenant route
	// contract.
	IsPublic bool
	// UIProfile selects which named visibility preset (in the workspace's
	// ui-visibility.json) the new tenant boots with. Empty = leave the
	// workspace's baseline active_profile untouched. Set by the admin form
	// when the operator picks a "tenant type" card (publico/admin/cliente).
	UIProfile UIVisibilityProfile
	// ModelRouting lets the SaaS admin decide, at create time, whether this
	// tenant uses LiteLLM virtual-key routing or shared CLI auth routing and in
	// what fallback order. Nil keeps the legacy auto mode.
	ModelRouting *ModelRoutingConfig
}

type ModelRoutingConfig struct {
	Mode    string
	LiteLLM LiteLLMModelRoutingConfig
	CLI     CLIModelRoutingConfig
}

type LiteLLMModelRoutingConfig struct {
	ModelName     string
	APIBase       string
	Fallbacks     []string
	AllowedModels []string
}

type CLIModelRoutingConfig struct {
	Order []string
}

// normalize applies CreateInput defaults and consistency rules. Currently
// it only enforces that public tenants skip the dashboard-password seed
// (public tenants have no human owner), but it's the place to add future
// coupled-field rules without growing Create with one-off if blocks.
func (in *CreateInput) normalize() {
	if in.IsPublic {
		in.SkipDashboardPassword = true
	}
}

type CreateOutput struct {
	TenantID        string
	URL             string
	InitialPassword string
}

// Create provisions a tenant end-to-end:
//  1. validate + reserve id/subdomain
//  2. generate initial password
//  3. mkdir volume, seed launcher-auth.db
//  4. create LiteLLM virtual key when configured
//  5. docker create+start with Traefik labels
//  6. wait Running, mark active
func (p *Provisioner) Create(ctx context.Context, in CreateInput) (*CreateOutput, error) {
	if in.MemLimitMB <= 0 {
		in.MemLimitMB = 512
	}
	if in.CPUQuota <= 0 {
		in.CPUQuota = 0.5
	}
	// Public tenants have no human owner; normalize() forces the bcrypt seed off.
	in.normalize()

	id, err := GenerateID(in.Subdomain)
	if err != nil {
		return nil, fmt.Errorf("id: %w", err)
	}

	password, err := auth.GeneratePassword()
	if err != nil {
		return nil, fmt.Errorf("password: %w", err)
	}

	if in.WorkspaceID == "" {
		return nil, errors.New("workspace_id is required (no auto-default and no manual selection provided)")
	}
	if p.Workspaces == nil {
		return nil, errors.New("workspaces store is not configured")
	}
	ws, err := p.Workspaces.Get(ctx, in.WorkspaceID)
	if err != nil {
		return nil, fmt.Errorf("workspace: %w", err)
	}

	volumePath := filepath.Join(p.Cfg.TenantHostDataDir, id)

	backend := in.AuthBackend
	if backend == "" {
		backend = "local"
	}
	t := &store.Tenant{
		ID:                      id,
		DisplayName:             in.DisplayName,
		OwnerEmail:              in.OwnerEmail,
		Subdomain:               in.Subdomain,
		Status:                  store.StatusProvisioning,
		ContainerImage:          p.Cfg.TenantImage,
		VolumePath:              volumePath,
		MonthlyBudgetUSD:        in.MonthlyBudgetUSD,
		MemLimitMB:              in.MemLimitMB,
		CPUQuota:                in.CPUQuota,
		AuthBackend:             backend,
		IsPublic:                in.IsPublic,
		WorkspaceID:             &ws.ID,
		WorkspaceVersionApplied: &ws.Version,
	}
	if err := p.Tenants.Insert(ctx, t); err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	if err := p.runProvision(
		ctx,
		t,
		password,
		ws,
		in.SkipDashboardPassword,
		in.UIProfile,
		in.ModelRouting,
	); err != nil {
		msg := err.Error()
		_ = p.Tenants.SetStatus(ctx, id, store.StatusError, &msg)
		return nil, err
	}

	return &CreateOutput{
		TenantID:        id,
		URL:             fmt.Sprintf("https://%s.%s", in.Subdomain, p.Cfg.TenantBaseDomain),
		InitialPassword: password,
	}, nil
}

// runProvision is the only provisioning flow. Replaces the seven-step
// pile of CopyVolumeRaw + ApplyProfileSeed + … with five steps:
// mkdir → copy workspace home → optional dashboard password →
// LiteLLM key + placeholder substitution → write launcher policy →
// docker create+start. The container gets a second bind-mount when the
// workspace has a compiled frontend (buildSpec attaches it).
func (p *Provisioner) runProvision(
	ctx context.Context,
	t *store.Tenant,
	password string,
	ws *store.Workspace,
	skipDashboardPassword bool,
	uiProfile UIVisibilityProfile,
	modelRouting *ModelRoutingConfig,
) (err error) {
	success := false
	volumeCreated := false
	litellmKeyCreated := false
	defer func() {
		if success {
			return
		}
		if p.Docker != nil {
			_ = p.Docker.RemoveTenantContainers(context.Background(), t.ID)
		}
		if litellmKeyCreated && p.LiteLLM != nil {
			_ = p.LiteLLM.DeleteKey(context.Background(), t.ID)
		}
		if volumeCreated && t.VolumePath != "" {
			_ = os.RemoveAll(t.VolumePath)
		}
	}()

	// 0o700: per-tenant volume should not be world-listable on the host.
	// Files inside are 0o600 but a 0o755 parent leaks tenant inventory to
	// any process running on the box.
	if err := os.MkdirAll(t.VolumePath, 0o700); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	volumeCreated = true

	// 1. Workspace home → tenant volume. Single authoritative copy step.
	if err := CopyWorkspaceHome(ws.HostPath, t.VolumePath); err != nil {
		return fmt.Errorf("copy workspace home: %w", err)
	}
	if err := SanitizeTenantSecurityConfig(t.VolumePath); err != nil {
		return fmt.Errorf("sanitize security config: %w", err)
	}
	// 1b. Tenant TYPE → active_profile in ui-visibility.json. Drives every
	// sidebar/header/chat element the frontend hides for this tenant. Done
	// AFTER CopyWorkspaceHome so we rewrite the workspace's baseline file
	// in place. No-op when the workspace ships without ui-visibility.json
	// (the frontend falls back to DEFAULT_UI_VISIBILITY_POLICY).
	if uiProfile != "" {
		if err := SetUIVisibilityActiveProfile(t.VolumePath, uiProfile); err != nil {
			return fmt.Errorf("set ui-visibility active_profile: %w", err)
		}
	}
	if t.IsPublic {
		// Override workspace/AGENT.md so the main agent IS Sofia from the
		// first message, instead of falling back to Rafael (front-line of
		// the cliente team prompt). Canonical AGENT.md is preserved as
		// AGENT.cliente.md so the promote flow can restore it. Without
		// this, visitor says "oi" and gets Rafael introducing the full
		// team — funnel broken before the first discovery question.
		if err := ApplyPublicSofiaAgentMD(t.VolumePath); err != nil {
			return fmt.Errorf("apply public sofia AGENT.md: %w", err)
		}
	}

	// 1c. Patch memory/empresa.md com o nome da empresa que o admin
	// digitou. No fluxo público atual, este é o único dado de negócio que
	// vem pré-preenchido — Sofia usa pra cumprimentar com contexto em vez
	// de perguntar "qual o nome do seu negócio?" do zero. Marker "Status:
	// pendente de validação" é garantido pra o detector de onboarding
	// (pkg/agent/onboarding_default.go) promover Sofia como default.
	// Non-fatal: se falhar, segue (Sofia ainda funciona, só pergunta o
	// nome no primeiro turno).
	if serr := SeedTenantFromAdminCreate(t.VolumePath, t.DisplayName, t.OwnerEmail); serr != nil {
		log.Printf("WARN: provisioner: seed empresa from admin create: %v", serr)
	}

	// 1b. Shared OAuth credentials. If the operator has authenticated against
	// Codex / Claude CLI / GitHub / etc. at the controlplane level by
	// dropping the resulting auth.json at /etc/picoclaw/shared-auth.json,
	// copy it into the new tenant so the agent and any provider-CLI skills
	// have working credentials from the first message. Operators that want
	// per-tenant auth simply skip this step (file absent → no copy, the
	// embedded baseline auth.json from the workspace bootstrap stays).
	//
	// IMPORTANT: this is a SNAPSHOT — subsequent edits to shared-auth.json
	// don't propagate to already-provisioned tenants. Recreate the tenant
	// (picoclaw-tenantctl recreate) to pick up fresh tokens.
	if err := copySharedAuthIfPresent(t.VolumePath); err != nil {
		// Non-fatal: tenants without shared auth still boot, just without
		// pre-configured OAuth tokens.
		log.Printf("WARN: provisioner: copy shared auth.json: %v", err)
	}

	// Raw workspaces opt out of EVERY post-copy transformation. The
	// launcher-auth.db, LiteLLM key, config.json placeholders, and
	// launcher_policy.json are all whatever the operator put in the zip.
	// Useful when the uploader wants the container to boot against the
	// exact bytes they shipped — typically an existing tenant volume
	// re-bundled, or a self-hosted LiteLLM-free setup.
	if !ws.IsRaw {
		// 2. Dashboard password (skipped for Supabase / public tenants).
		if !skipDashboardPassword {
			if err := SeedDashboardCredentials(ctx, t.VolumePath, t.OwnerEmail, password); err != nil {
				return fmt.Errorf("seed password: %w", err)
			}
		}

		// 3. Model routing + placeholder substitution. The SaaS admin may
		// explicitly choose LiteLLM or CLI order in the create flow. Nil keeps
		// legacy auto mode: shared CLI when auth is configured, otherwise LiteLLM.
		createdKey, err := p.applySaaSModelRouting(ctx, t, modelRouting)
		if err != nil {
			return err
		}
		litellmKeyCreated = createdKey

		// 4. RBAC from the workspace's role_policy_json DB column.
		if err := WriteLauncherPolicy(t.VolumePath, ws.RolePolicy()); err != nil {
			return fmt.Errorf("write launcher policy: %w", err)
		}

		// 4b. Static validation of the materialised config.json + .security.yml
		// against the picoclaw schema. Catches template bugs (e.g. `api_key`
		// singular instead of `api_keys` plural, malformed channels block in
		// security.yml) BEFORE the tenant container boots and silently 500s on
		// every workspace endpoint. The deferred cleanup wipes the partial
		// volume + revokes the LiteLLM key so retrying after a template fix
		// starts from a clean slate.
		if err := picoclawconfig.ValidateBundle(filepath.Join(t.VolumePath, "config.json")); err != nil {
			return fmt.Errorf("workspace template would break launcher boot: %w", err)
		}
	}

	// 5. Container with two binds (home + optional frontend-dist). The
	// frontend-dist bind is attached by buildSpec when t.WorkspaceID is set
	// and the workspace has a compiled build — so Recreate/lifecycle.Restart
	// inherit the same mount automatically without re-running this path.
	spec, err := p.buildSpec(ctx, t)
	if err != nil {
		return fmt.Errorf("build spec: %w", err)
	}

	containerID, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
		return fmt.Errorf("docker create: %w", err)
	}
	if err := p.Tenants.SetContainer(ctx, t.ID, containerID); err != nil {
		return fmt.Errorf("set container: %w", err)
	}
	if err := p.Docker.WaitRunning(ctx, containerID, 60*time.Second); err != nil {
		_ = p.Docker.Remove(context.Background(), spec.Name)
		return fmt.Errorf("wait running: %w", err)
	}
	if err := p.Tenants.SetStatus(ctx, t.ID, store.StatusActive, nil); err != nil {
		return fmt.Errorf("set active: %w", err)
	}
	success = true
	return nil
}

func (p *Provisioner) applySaaSModelRouting(
	ctx context.Context,
	t *store.Tenant,
	routing *ModelRoutingConfig,
) (litellmKeyCreated bool, err error) {
	mode := "auto"
	if routing != nil && strings.TrimSpace(routing.Mode) != "" {
		mode = strings.ToLower(strings.TrimSpace(routing.Mode))
	}

	switch mode {
	case "auto":
		if order := p.availableSaaSCLIOrder(); len(order) > 0 {
			if err := p.applySaaSCLIModelRouting(t, order); err != nil {
				return false, err
			}
			return false, nil
		}
		if p.LiteLLM == nil {
			return false, nil
		}
		return p.applySaaSLiteLLMModelRouting(ctx, t, LiteLLMModelRoutingConfig{
			ModelName: defaultSaaSLiteLLMModel,
		}, false)
	case "cli":
		order := []string(nil)
		if routing != nil {
			order = routing.CLI.Order
		}
		if len(compactUniqueStrings(order)) == 0 {
			order = p.availableSaaSCLIOrder()
		}
		if len(order) == 0 {
			return false, fmt.Errorf("saas cli routing requested, but no shared CLI auth is configured")
		}
		availableOrder, err := p.validateSaaSCLIOrderAvailable(order)
		if err != nil {
			return false, err
		}
		if err := p.applySaaSCLIModelRouting(t, availableOrder); err != nil {
			return false, err
		}
		return false, nil
	case "litellm":
		if routing == nil {
			routing = &ModelRoutingConfig{}
		}
		return p.applySaaSLiteLLMModelRouting(ctx, t, routing.LiteLLM, true)
	default:
		return false, fmt.Errorf("unknown model_routing.mode %q (expected auto, litellm, or cli)", mode)
	}
}

func (p *Provisioner) ApplyModelRouting(ctx context.Context, t *store.Tenant, routing *ModelRoutingConfig) error {
	if p == nil {
		return fmt.Errorf("provisioner is nil")
	}
	if t == nil {
		return fmt.Errorf("tenant is nil")
	}
	hadLiteLLMKey := t.LiteLLMKeyID != nil && strings.TrimSpace(*t.LiteLLMKeyID) != ""
	if hadLiteLLMKey && p.LiteLLM != nil {
		if err := p.LiteLLM.DeleteKey(ctx, t.ID); err != nil {
			return fmt.Errorf("delete existing litellm key: %w", err)
		}
	}
	if hadLiteLLMKey && p.Tenants != nil {
		if err := p.Tenants.ClearLiteLLMKey(ctx, t.ID); err != nil {
			return fmt.Errorf("clear existing litellm key: %w", err)
		}
		t.LiteLLMKeyID = nil
		t.LiteLLMKeyHash = nil
	}
	createdKey, err := p.applySaaSModelRouting(ctx, t, routing)
	if err != nil {
		return err
	}
	if !createdKey && p.Tenants != nil {
		if err := p.Tenants.ClearLiteLLMKey(ctx, t.ID); err != nil {
			return fmt.Errorf("clear litellm key: %w", err)
		}
	}
	return nil
}

func (p *Provisioner) applySaaSCLIModelRouting(t *store.Tenant, order []string) error {
	if needsProvider(order, "codex-cli") {
		codexDir, err := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir)
		if err != nil {
			return fmt.Errorf("resolve codex cli auth dir: %w", err)
		}
		if err := prepareCodexCLIHome(t.VolumePath, codexDir); err != nil {
			return fmt.Errorf("prepare codex cli home: %w", err)
		}
	}
	if err := SubstituteConfigPlaceholders(t.VolumePath, map[string]string{
		"${TENANT_ID}": t.ID,
	}); err != nil {
		return fmt.Errorf("substitute placeholders: %w", err)
	}
	if err := ApplySaaSCLIModelRoutingFromOrder(t.VolumePath, order); err != nil {
		return fmt.Errorf("apply saas cli model routing: %w", err)
	}
	return nil
}

func (p *Provisioner) applySaaSLiteLLMModelRouting(
	ctx context.Context,
	t *store.Tenant,
	cfg LiteLLMModelRoutingConfig,
	restrictKeyToRouting bool,
) (bool, error) {
	if p.LiteLLM == nil {
		return false, fmt.Errorf("saas litellm routing requested, but LiteLLM is not configured")
	}
	modelName := strings.TrimSpace(cfg.ModelName)
	if modelName == "" {
		modelName = defaultSaaSLiteLLMModel
	}
	apiBase := strings.TrimSpace(cfg.APIBase)
	if apiBase == "" && p.Cfg != nil {
		apiBase = p.Cfg.LiteLLMURL
	}
	fallbacks := compactUniqueStrings(cfg.Fallbacks)
	allowedModels := compactUniqueStrings(cfg.AllowedModels)
	if restrictKeyToRouting && len(allowedModels) == 0 {
		allowedModels = append([]string{modelName}, fallbacks...)
	}

	out, err := p.LiteLLM.GenerateKey(ctx, litellm.GenerateKeyInput{
		TenantID:         t.ID,
		MonthlyBudgetUSD: t.MonthlyBudgetUSD,
		Models:           allowedModels,
	})
	if err != nil {
		return false, fmt.Errorf("litellm key: %w", err)
	}
	h := sha256.Sum256([]byte(out.Key))
	if err := p.Tenants.SetLiteLLMKey(ctx, t.ID, out.KeyName, hex.EncodeToString(h[:])); err != nil {
		return true, fmt.Errorf("save litellm key: %w", err)
	}
	if err := SubstituteConfigPlaceholders(t.VolumePath, map[string]string{
		"${LITELLM_KEY}": out.Key,
		"${LITELLM_URL}": apiBase,
		"${TENANT_ID}":   t.ID,
	}); err != nil {
		return true, fmt.Errorf("substitute placeholders: %w", err)
	}
	if err := SubstituteRedactedModelKeys(t.VolumePath, out.Key); err != nil {
		return true, fmt.Errorf("substitute redacted model keys: %w", err)
	}
	if err := ApplySaaSLiteLLMModelRoutingWithFallbacks(
		t.VolumePath,
		modelName,
		fallbacks,
		apiBase,
		out.Key,
	); err != nil {
		return true, fmt.Errorf("apply saas litellm model routing: %w", err)
	}
	return true, nil
}

func (p *Provisioner) availableSaaSCLIOrder() []string {
	order := []string{}
	if ok, _, _ := p.saasCLIAuthAvailable("claude-cli"); ok {
		order = append(order, "claude-cli")
	}
	if ok, _, _ := p.saasCLIAuthAvailable("codex-cli"); ok {
		order = append(order, "codex-cli")
	}
	return order
}

func (p *Provisioner) validateSaaSCLIOrderAvailable(order []string) ([]string, error) {
	specs, err := normalizeSaaSCLIOrder(order)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(specs))
	for _, spec := range specs {
		ok, _, err := p.saasCLIAuthAvailable(spec.Provider)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("saas cli provider %s requested, but its auth dir is not configured", spec.Provider)
		}
		out = append(out, spec.Provider)
	}
	return out, nil
}

func (p *Provisioner) saasCLIAuthAvailable(provider string) (bool, string, error) {
	if p == nil || p.Cfg == nil {
		return false, "", nil
	}
	switch provider {
	case "claude-cli":
		dir, err := resolveClaudeCLIAuthDir(p.Cfg.TenantClaudeCliAuthDir)
		return dir != "", dir, err
	case "codex-cli":
		dir, err := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir)
		return dir != "", dir, err
	default:
		return false, "", fmt.Errorf("unsupported saas cli provider %q", provider)
	}
}

func needsProvider(order []string, provider string) bool {
	for _, raw := range order {
		spec, ok := saasCLIModelSpecFor(raw)
		if ok && spec.Provider == provider {
			return true
		}
	}
	return false
}

// CloneInput parameters for CloneFromTenant. SourceTenantID is the existing
// tenant whose volume gets copied verbatim into the new tenant. All other
// fields mirror CreateInput.
type CloneInput struct {
	SourceTenantID   string
	DisplayName      string
	OwnerEmail       string
	Subdomain        string
	MonthlyBudgetUSD *float64
	MemLimitMB       int
	CPUQuota         float64
}

// CloneFromTenant provisions a new tenant whose $PICOCLAW_HOME is a raw
// byte-for-byte copy of an existing tenant's volume (segredos, OAuth tokens,
// dashboardauth.db, sessions, memory — everything except runtime locks).
//
// Differences vs Create():
//   - skips CopyTemplate (profile-based seeding); uses CopyVolumeRaw on
//     src.VolumePath instead.
//   - skips SeedDashboardPassword: the copied dashboardauth.db is reused, so
//     the cloned tenant accepts the source's existing password. Operators can
//     run RotatePassword from the admin UI afterwards.
//   - skips template SyncTemplateSkills (the cloned volume already carries
//     the source's full workspace/skills).
//   - LiteLLM key is generated fresh because the source's litellm.key is for
//     a different key_alias and the cost ledger needs a separate scope.
func (p *Provisioner) CloneFromTenant(ctx context.Context, in CloneInput) (*CreateOutput, error) {
	if in.MemLimitMB <= 0 {
		in.MemLimitMB = 512
	}
	if in.CPUQuota <= 0 {
		in.CPUQuota = 0.5
	}
	if strings.TrimSpace(in.SourceTenantID) == "" {
		return nil, fmt.Errorf("source_tenant_id is required")
	}

	src, err := p.Tenants.Get(ctx, in.SourceTenantID)
	if err != nil {
		return nil, fmt.Errorf("load source tenant: %w", err)
	}
	if src.VolumePath == "" {
		return nil, fmt.Errorf("source tenant has empty volume path")
	}
	if _, err := os.Stat(src.VolumePath); err != nil {
		return nil, fmt.Errorf("source tenant volume not accessible: %w", err)
	}

	id, err := GenerateID(in.Subdomain)
	if err != nil {
		return nil, fmt.Errorf("id: %w", err)
	}

	volumePath := filepath.Join(p.Cfg.TenantHostDataDir, id)

	t := &store.Tenant{
		ID:               id,
		DisplayName:      in.DisplayName,
		OwnerEmail:       in.OwnerEmail,
		Subdomain:        in.Subdomain,
		Status:           store.StatusProvisioning,
		ContainerImage:   p.Cfg.TenantImage,
		VolumePath:       volumePath,
		MonthlyBudgetUSD: in.MonthlyBudgetUSD,
		MemLimitMB:       in.MemLimitMB,
		CPUQuota:         in.CPUQuota,
	}
	// Inherit the source's workspace so the clone shows up in admin grouped
	// with its sibling and the bind-mount of frontend-dist follows.
	if src.WorkspaceID != nil {
		wid := *src.WorkspaceID
		t.WorkspaceID = &wid
	}
	if src.WorkspaceVersionApplied != nil {
		v := *src.WorkspaceVersionApplied
		t.WorkspaceVersionApplied = &v
	}

	if err := p.Tenants.Insert(ctx, t); err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	if err := p.runProvisionClone(ctx, t, src); err != nil {
		msg := err.Error()
		_ = p.Tenants.SetStatus(ctx, id, store.StatusError, &msg)
		return nil, err
	}

	return &CreateOutput{
		TenantID: id,
		URL:      fmt.Sprintf("https://%s.%s", in.Subdomain, p.Cfg.TenantBaseDomain),
		// Empty: the cloned tenant keeps the source's existing dashboard
		// password. The admin UI surfaces a "Rotate password" action.
		InitialPassword: "",
	}, nil
}

func (p *Provisioner) runProvisionClone(ctx context.Context, t *store.Tenant, src *store.Tenant) (err error) {
	success := false
	volumeCreated := false
	litellmKeyCreated := false
	defer func() {
		if success {
			return
		}
		if p.Docker != nil {
			_ = p.Docker.RemoveTenantContainers(context.Background(), t.ID)
		}
		if litellmKeyCreated && p.LiteLLM != nil {
			_ = p.LiteLLM.DeleteKey(context.Background(), t.ID)
		}
		if volumeCreated && t.VolumePath != "" {
			_ = os.RemoveAll(t.VolumePath)
		}
	}()

	// 0o700: per-tenant volume should not be world-listable on the host.
	// Files inside are 0o600 but a 0o755 parent leaks tenant inventory to
	// any process running on the box.
	if err := os.MkdirAll(t.VolumePath, 0o700); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	volumeCreated = true
	if err := CopyVolumeRaw(src.VolumePath, t.VolumePath); err != nil {
		return fmt.Errorf("copy volume raw: %w", err)
	}

	// Refresh launcher_policy.json from the source's workspace (when one is
	// linked). The raw copy already pulled the file across; this rewrites it
	// so any local edits to the source's policy file don't leak.
	if src.WorkspaceID != nil && p.Workspaces != nil {
		if ws, err := p.Workspaces.Get(ctx, *src.WorkspaceID); err == nil && ws != nil {
			if err := WriteLauncherPolicy(t.VolumePath, ws.RolePolicy()); err != nil {
				return fmt.Errorf("write launcher policy: %w", err)
			}
		}
	}

	// Generate a fresh LiteLLM key for the cloned tenant and rewrite the
	// copied config.json so it stops billing the source tenant's budget.
	if p.LiteLLM != nil {
		out, err := p.LiteLLM.GenerateKey(ctx, litellm.GenerateKeyInput{
			TenantID:         t.ID,
			MonthlyBudgetUSD: t.MonthlyBudgetUSD,
		})
		if err != nil {
			return fmt.Errorf("litellm key: %w", err)
		}
		litellmKeyCreated = true
		h := sha256.Sum256([]byte(out.Key))
		if err := p.Tenants.SetLiteLLMKey(ctx, t.ID, out.KeyName, hex.EncodeToString(h[:])); err != nil {
			return fmt.Errorf("save litellm key: %w", err)
		}
		if err := RewriteConfigLiteLLMKey(t.VolumePath, out.Key); err != nil {
			return fmt.Errorf("rewrite config litellm key: %w", err)
		}
	}

	spec, err := p.buildSpec(ctx, t)
	if err != nil {
		return fmt.Errorf("build spec: %w", err)
	}
	containerID, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
		return fmt.Errorf("docker create: %w", err)
	}
	if err := p.Tenants.SetContainer(ctx, t.ID, containerID); err != nil {
		return fmt.Errorf("set container: %w", err)
	}
	if err := p.Docker.WaitRunning(ctx, containerID, 60*time.Second); err != nil {
		_ = p.Docker.Remove(context.Background(), spec.Name)
		return fmt.Errorf("wait running: %w", err)
	}
	if err := p.Tenants.SetStatus(ctx, t.ID, store.StatusActive, nil); err != nil {
		return fmt.Errorf("set active: %w", err)
	}
	success = true
	return nil
}

func (p *Provisioner) buildSpec(ctx context.Context, t *store.Tenant) (ContainerSpec, error) {
	labels := map[string]string{
		"traefik.enable":          "false",
		"picoclaw.saas.tenant_id": t.ID,
		"picoclaw.saas.subdomain": t.Subdomain,
		"picoclaw.saas.managed":   "true",
	}

	// Auth mode selection:
	//   - "supabase" backend (legacy): trusted_gateway — controlplane signs
	//     auth headers because the launcher doesn't speak Supabase JWT.
	//   - IsPublic tenants: trusted_gateway — controlplane signs anonymous
	//     "public" claims for the tenant-root Sofia chat over /pico/ws.
	//   - everything else (default "launcher"/"local"): launcher runs in its
	//     native "local" mode with the dashboardauth.db bcrypt + HttpOnly
	//     cookie, and the controlplane is a transparent reverse proxy. This
	//     fixes the Supabase-JWT-expires-and-WS-disconnects issue.
	authMode := "local"
	if t.AuthBackend == "supabase" || t.IsPublic {
		authMode = "trusted_gateway"
	}

	env := map[string]string{
		"PICOCLAW_HOME": "/root/.picoclaw",
		// Launcher listens on 0.0.0.0 so the controlplane can reach it via
		// the docker bridge — that's the legitimate ingress path.
		"PICOCLAW_LAUNCHER_HOST": "0.0.0.0",
		// Gateway is the launcher's INTERNAL subprocess; it's only ever
		// called by the launcher itself from inside the container. Binding
		// it to 0.0.0.0 exposed inbox/send/disconnect endpoints
		// unauthenticated on saas_edge — any peer tenant could send
		// WhatsApp messages or read history as the victim. Keep loopback.
		"PICOCLAW_GATEWAY_HOST":           "127.0.0.1",
		"PICOCLAW_AUTH_MODE":              authMode,
		"PICOCLAW_TRUSTED_GATEWAY_SECRET": p.Cfg.GatewaySharedSecret,
		"PICOCLAW_CONFIG_STRICT":          "true",
		// Identity of THIS tenant — the launcher MUST compare incoming HMAC
		// claims.TenantID against this value and reject mismatches.
		// Without it, any tenant on the shared docker network can forge
		// requests addressed to any other tenant (the HMAC secret is
		// fleet-wide). Defense-in-depth pending per-tenant secret derivation.
		"PICOCLAW_TENANT_ID":        t.ID,
		"PICOCLAW_TENANT_SUBDOMAIN": t.Subdomain,
		// pico powers the in-browser WebSocket chat — required for the
		// launcher's local-mode dashboard. Without it EnsurePicoChannel
		// auto-disables the channel on every startup (via
		// enforceAllowedChannelsConfig), which 404s /pico/ws because the
		// gateway never registers the pico routes. whatsapp_native stays
		// in the list as the legacy default for outbound messaging.
		"PICOCLAW_ALLOWED_CHANNELS": "whatsapp_native,pico",
	}

	// Browser automation: every tenant gets the CDP endpoint of the shared
	// browser-sidecar. The agent-browser CLI inside the tenant connects
	// remotely instead of bundling Chromium per container. Skip when not
	// configured so older deployments without the sidecar keep working.
	if u := p.Cfg.BrowserCDPURL; u != "" {
		env["BROWSER_CDP_URL"] = u
	}

	if t.IsPublic {
		env["PICOCLAW_PUBLIC_TENANT"] = "true"
		// Catarina's `enviar-whatsapp-jotaduo` skill POSTs to the sidecar
		// using these two envs. Both MUST be present for the skill to work —
		// the script fails fast with a clear message if either is missing.
		// We deliberately scope this to IsPublic only so that at promotion
		// time (when is_public flips to false and the container is recreated)
		// the cliente tenant loses access to the institutional WA. The
		// promote endpoint also calls DELETE /internal/wa/routing/by-tenant
		// on the sidecar (fatia 5) so any pending inbound stops being
		// routed back — defense in depth.
		if s := p.Cfg.JotaduoWAHMACSecret; s != "" {
			env["JOTADUO_WA_URL"] = p.Cfg.JotaduoWAURL
			env["JOTADUO_WA_HMAC_SECRET"] = s
		}
		// Public tenants use the same browser chat channel as the launcher:
		// /pico/ws. The old anonymous SSE path is legacy and is intentionally
		// not enabled for new or recreated public tenants.
		env["PICOCLAW_ALLOWED_CHANNELS"] = "whatsapp_native,pico"
	}

	spec := ContainerSpec{
		Name:        "tenant-" + t.ID,
		Image:       t.ContainerImage,
		Env:         env,
		HostVolume:  t.VolumePath,
		MountTarget: "/root/.picoclaw",
		MemLimitMB:  t.MemLimitMB,
		CPUQuota:    t.CPUQuota,
		NetworkEdge: p.Cfg.TenantNetworkEdge,
		NetworkLLM:  p.Cfg.TenantNetworkLLM,
		Labels:      labels,
	}

	// Workspace-backed tenants get a second bind-mount for the compiled
	// frontend so Recreate / lifecycle.Restart inherit the visual variant
	// automatically (instead of falling back to the embedded dist whenever
	// the container is recreated outside the initial provision flow).
	if t.WorkspaceID != nil && *t.WorkspaceID != "" && p.Workspaces != nil {
		ws, err := p.Workspaces.Get(ctx, *t.WorkspaceID)
		switch {
		case err == nil:
			if HasBuiltFrontend(ws.HostPath) {
				spec.ExtraMounts = append(spec.ExtraMounts, ContainerMount{
					Source:   WorkspaceFrontendDistPath(ws.HostPath),
					Target:   WorkspaceFrontendMountTarget,
					ReadOnly: true,
				})
				spec.Env["PICOCLAW_FRONTEND_DIST_DIR"] = WorkspaceFrontendMountTarget
			}
		case errors.Is(err, store.ErrWorkspaceNotFound):
			log.Printf(
				"WARN: provisioner: tenant %s references missing workspace %s; omitting frontend bind",
				t.ID,
				*t.WorkspaceID,
			)
		default:
			return ContainerSpec{}, fmt.Errorf("lookup workspace %s: %w", *t.WorkspaceID, err)
		}
	}

	// Shared CLI provider auth dirs — bind-mount only the CLI auth a tenant's
	// materialized config.json actually references. Codex gets a writable
	// snapshot prepared under the tenant volume because `codex exec` writes
	// helper/config state into CODEX_HOME.
	//
	// Claude remains mounted read-only so a compromised tenant cannot rotate
	// the operator's source tokens — refresh happens on the host.
	//
	// If config.json cannot be inspected (legacy unit tests or unusual
	// bootstrap paths), fall back to the previous deploy-wide detection.
	cliReq, err := TenantCLIAuthProvidersFromConfig(t.VolumePath)
	if err != nil {
		return ContainerSpec{}, fmt.Errorf("inspect tenant cli auth requirements: %w", err)
	}
	needClaude, needCodex := cliReq.Claude, cliReq.Codex
	if !cliReq.Known {
		needClaude, needCodex = p.sharedCLIModelRouting()
	}
	if needCodex {
		codexAuthDir, codexAuthErr := resolveCodexCLIAuthDir(p.Cfg.TenantCodexCliAuthDir)
		if codexAuthErr != nil {
			log.Printf("WARN: provisioner: tenant %s codex-cli auth dir: %v (skipping CODEX_HOME)",
				t.ID, codexAuthErr)
		} else if codexAuthDir != "" {
			spec.Env["CODEX_HOME"] = tenantCodexCLIHomeContainer
		}
	}
	if needClaude {
		claudeAuthDir, claudeAuthErr := resolveClaudeCLIAuthDir(p.Cfg.TenantClaudeCliAuthDir)
		if claudeAuthErr != nil {
			log.Printf("WARN: provisioner: tenant %s claude-cli auth dir: %v (skipping mount)",
				t.ID, claudeAuthErr)
		} else if claudeAuthDir != "" {
			spec.ExtraMounts = append(spec.ExtraMounts, ContainerMount{
				Source:   claudeAuthDir,
				Target:   "/root/.claude",
				ReadOnly: true,
			})
		}
	}

	return spec, nil
}
