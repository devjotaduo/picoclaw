package tenant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type Provisioner struct {
	Cfg      *config.Config
	Tenants  *store.TenantStore
	Profiles *store.LauncherProfileStore
	Docker   *DockerClient
	LiteLLM  *litellm.Client // optional; when nil the tenant is provisioned without an LLM key
	// Supabase is the (optional) handle used during Delete() to remove the
	// Supabase Auth user for tenants with auth_backend='supabase'. Nil when
	// Supabase isn't configured — cleanup of those tenants is a no-op.
	Supabase SupabaseDeleter
}

func NewProvisioner(cfg *config.Config, db *store.DB, dk *DockerClient, ll *litellm.Client) *Provisioner {
	return &Provisioner{
		Cfg:      cfg,
		Tenants:  &store.TenantStore{DB: db},
		Profiles: &store.LauncherProfileStore{DB: db},
		Docker:   dk,
		LiteLLM:  ll,
	}
}

type CreateInput struct {
	DisplayName       string
	OwnerEmail        string
	Subdomain         string
	MonthlyBudgetUSD  *float64
	MemLimitMB        int
	CPUQuota          float64
	LauncherProfileID string
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
	// dispense with Supabase JWT verification on /api/public/* routes.
	IsPublic bool
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

	profile, err := p.resolveProfile(ctx, in.LauncherProfileID)
	if err != nil {
		return nil, err
	}

	volumePath := filepath.Join(p.Cfg.TenantHostDataDir, id)

	backend := in.AuthBackend
	if backend == "" {
		backend = "local"
	}
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
		AuthBackend:      backend,
		IsPublic:         in.IsPublic,
	}
	if profile != nil {
		t.LauncherProfileID = &profile.ID
		t.LauncherProfileVersionApplied = &profile.Version
	}
	if err := p.Tenants.Insert(ctx, t); err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	if err := p.runProvision(ctx, t, password, profile, in.SkipDashboardPassword); err != nil {
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

func (p *Provisioner) runProvision(ctx context.Context, t *store.Tenant, password string, profile *store.LauncherProfile, skipDashboardPassword bool) error {
	if err := os.MkdirAll(t.VolumePath, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	if p.Cfg.TenantTemplateDir == "" {
		return fmt.Errorf("TENANT_TEMPLATE_DIR is not configured: cannot mirror the main picoclaw home")
	}
	// Raw cópia do picoclaw principal: credenciais, configs, env, workspace e
	// agentes viajam todos para o tenant. Só sobrescrevemos abaixo o que é
	// estritamente per-tenant (senha do dashboard e chave LiteLLM).
	if err := CopyVolumeRaw(p.Cfg.TenantTemplateDir, t.VolumePath); err != nil {
		return fmt.Errorf("mirror picoclaw home: %w", err)
	}
	if profile != nil {
		if _, err := ApplyProfileSeed(profile.SeedPath, t.VolumePath); err != nil {
			return fmt.Errorf("apply profile seed: %w", err)
		}
		if err := WriteLauncherPolicy(t.VolumePath, profile.RolePolicy()); err != nil {
			return fmt.Errorf("write launcher policy: %w", err)
		}
	} else if err := WriteLauncherPolicy(t.VolumePath, nil); err != nil {
		return fmt.Errorf("write launcher policy: %w", err)
	}
	if !skipDashboardPassword {
		if err := SeedDashboardPassword(ctx, t.VolumePath, password); err != nil {
			return fmt.Errorf("seed password: %w", err)
		}
	}

	// LiteLLM virtual key — generated BEFORE container start so it can be
	// written into config.json on the volume. Plaintext key is never persisted
	// in the database; only the sha256 hash for audit and the key_alias
	// (= tenant id) for delete.
	llmKey := ""
	if p.LiteLLM != nil {
		out, err := p.LiteLLM.GenerateKey(ctx, litellm.GenerateKeyInput{
			TenantID:         t.ID,
			MonthlyBudgetUSD: t.MonthlyBudgetUSD,
		})
		if err != nil {
			return fmt.Errorf("litellm key: %w", err)
		}
		llmKey = out.Key
		h := sha256.Sum256([]byte(out.Key))
		if err := p.Tenants.SetLiteLLMKey(ctx, t.ID, out.KeyName, hex.EncodeToString(h[:])); err != nil {
			// best-effort rollback of the orphaned LiteLLM key
			_ = p.LiteLLM.DeleteKey(ctx, t.ID)
			return fmt.Errorf("save litellm key: %w", err)
		}
	}

	if err := SeedPicoConfig(ctx, t.VolumePath, p.Cfg.LiteLLMURL, llmKey); err != nil {
		return fmt.Errorf("seed picoclaw config: %w", err)
	}
	if err := EnsureTenantWhatsAppNativeConfig(t.VolumePath); err != nil {
		return fmt.Errorf("ensure whatsapp native config: %w", err)
	}

	spec := p.buildSpec(t)
	containerID, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
		return fmt.Errorf("docker create: %w", err)
	}
	if err := p.Tenants.SetContainer(ctx, t.ID, containerID); err != nil {
		return fmt.Errorf("set container: %w", err)
	}
	if err := p.Docker.WaitRunning(ctx, containerID, 60*time.Second); err != nil {
		return fmt.Errorf("wait running: %w", err)
	}
	if err := p.Tenants.SetStatus(ctx, t.ID, store.StatusActive, nil); err != nil {
		return fmt.Errorf("set active: %w", err)
	}
	return nil
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
	// Preserve the source's launcher_profile_id so the new tenant inherits the
	// same RBAC matrix and shows up grouped with its sibling in admin UIs.
	if src.LauncherProfileID != nil {
		pid := *src.LauncherProfileID
		t.LauncherProfileID = &pid
	}
	if src.LauncherProfileVersionApplied != nil {
		v := *src.LauncherProfileVersionApplied
		t.LauncherProfileVersionApplied = &v
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

func (p *Provisioner) runProvisionClone(ctx context.Context, t *store.Tenant, src *store.Tenant) error {
	if err := os.MkdirAll(t.VolumePath, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	if err := CopyVolumeRaw(src.VolumePath, t.VolumePath); err != nil {
		return fmt.Errorf("copy volume raw: %w", err)
	}

	// Re-derive launcher_policy.json from the source tenant's applied profile
	// (if any). The raw copy already pulled it across; this just refreshes it
	// in case the source had local edits we don't want to inherit.
	if src.LauncherProfileID != nil && p.Profiles != nil {
		if profile, err := p.Profiles.Get(ctx, *src.LauncherProfileID); err == nil && profile != nil {
			if err := WriteLauncherPolicy(t.VolumePath, profile.RolePolicy()); err != nil {
				return fmt.Errorf("write launcher policy: %w", err)
			}
		}
	}

	// Generate a fresh LiteLLM key for the new tenant. The source's
	// litellm.key is for src.ID, so writing it into this volume would let the
	// new tenant burn the source's budget. Overwrite it with the new key.
	llmKey := ""
	if p.LiteLLM != nil {
		out, err := p.LiteLLM.GenerateKey(ctx, litellm.GenerateKeyInput{
			TenantID:         t.ID,
			MonthlyBudgetUSD: t.MonthlyBudgetUSD,
		})
		if err != nil {
			return fmt.Errorf("litellm key: %w", err)
		}
		llmKey = out.Key
		h := sha256.Sum256([]byte(out.Key))
		if err := p.Tenants.SetLiteLLMKey(ctx, t.ID, out.KeyName, hex.EncodeToString(h[:])); err != nil {
			_ = p.LiteLLM.DeleteKey(ctx, t.ID)
			return fmt.Errorf("save litellm key: %w", err)
		}
	}

	if err := SeedPicoConfig(ctx, t.VolumePath, p.Cfg.LiteLLMURL, llmKey); err != nil {
		return fmt.Errorf("seed picoclaw config: %w", err)
	}
	if err := EnsureTenantWhatsAppNativeConfig(t.VolumePath); err != nil {
		return fmt.Errorf("ensure whatsapp native config: %w", err)
	}

	spec := p.buildSpec(t)
	containerID, err := p.Docker.CreateAndStart(ctx, spec)
	if err != nil {
		return fmt.Errorf("docker create: %w", err)
	}
	if err := p.Tenants.SetContainer(ctx, t.ID, containerID); err != nil {
		return fmt.Errorf("set container: %w", err)
	}
	if err := p.Docker.WaitRunning(ctx, containerID, 60*time.Second); err != nil {
		return fmt.Errorf("wait running: %w", err)
	}
	if err := p.Tenants.SetStatus(ctx, t.ID, store.StatusActive, nil); err != nil {
		return fmt.Errorf("set active: %w", err)
	}
	return nil
}

func (p *Provisioner) resolveProfile(ctx context.Context, profileID string) (*store.LauncherProfile, error) {
	if p.Profiles == nil {
		return nil, nil
	}
	if profileID != "" {
		profile, err := p.Profiles.Get(ctx, profileID)
		if err != nil {
			return nil, fmt.Errorf("launcher profile: %w", err)
		}
		return profile, nil
	}
	profile, err := p.Profiles.GetDefault(ctx)
	if err != nil {
		if errors.Is(err, store.ErrLauncherProfileNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("launcher default profile: %w", err)
	}
	return profile, nil
}

func (p *Provisioner) ApplyProfile(ctx context.Context, tenantID, profileID string) (string, error) {
	if p.Profiles == nil {
		return "", fmt.Errorf("launcher profiles are not configured")
	}
	t, err := p.Tenants.Get(ctx, tenantID)
	if err != nil {
		return "", err
	}
	profile, err := p.Profiles.Get(ctx, profileID)
	if err != nil {
		return "", err
	}
	backupDir, err := ApplyProfileSeed(profile.SeedPath, t.VolumePath)
	if err != nil {
		return backupDir, fmt.Errorf("apply profile seed: %w", err)
	}
	if err := WriteLauncherPolicy(t.VolumePath, profile.RolePolicy()); err != nil {
		return backupDir, fmt.Errorf("write launcher policy: %w", err)
	}
	if err := p.ensureTenantLiteLLMConfig(ctx, t); err != nil {
		return backupDir, fmt.Errorf("ensure litellm config: %w", err)
	}
	if err := EnsureTenantWhatsAppNativeConfig(t.VolumePath); err != nil {
		return backupDir, fmt.Errorf("ensure whatsapp native config: %w", err)
	}
	if err := p.Tenants.SetLauncherProfileApplied(ctx, t.ID, profile.ID, profile.Version); err != nil {
		return backupDir, err
	}
	if p.Docker != nil && t.ContainerID != nil && *t.ContainerID != "" && t.Status == store.StatusActive {
		if err := p.Restart(ctx, t.ID); err != nil {
			return backupDir, err
		}
	}
	return backupDir, nil
}

func (p *Provisioner) ensureTenantLiteLLMConfig(ctx context.Context, t *store.Tenant) error {
	if p.Cfg == nil || strings.TrimSpace(p.Cfg.LiteLLMURL) == "" {
		return nil
	}
	keyPath := filepath.Join(t.VolumePath, "litellm.key")
	if b, err := os.ReadFile(keyPath); err == nil {
		if key := strings.TrimSpace(string(b)); key != "" {
			return SeedPicoConfig(ctx, t.VolumePath, p.Cfg.LiteLLMURL, key)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read litellm.key: %w", err)
	}

	if p.LiteLLM == nil {
		return nil
	}
	// If the plaintext file was lost but the LiteLLM alias may still exist,
	// remove the stale alias first. The plaintext key is only returned at
	// generation time, so rotating is the only way to restore the tenant volume.
	_ = p.LiteLLM.DeleteKey(ctx, t.ID)
	out, err := p.LiteLLM.GenerateKey(ctx, litellm.GenerateKeyInput{
		TenantID:         t.ID,
		MonthlyBudgetUSD: t.MonthlyBudgetUSD,
	})
	if err != nil {
		return fmt.Errorf("litellm key: %w", err)
	}
	h := sha256.Sum256([]byte(out.Key))
	if err := p.Tenants.SetLiteLLMKey(ctx, t.ID, out.KeyName, hex.EncodeToString(h[:])); err != nil {
		_ = p.LiteLLM.DeleteKey(ctx, t.ID)
		return fmt.Errorf("save litellm key: %w", err)
	}
	return SeedPicoConfig(ctx, t.VolumePath, p.Cfg.LiteLLMURL, out.Key)
}

func (p *Provisioner) buildSpec(t *store.Tenant) ContainerSpec {
	labels := map[string]string{
		"traefik.enable":          "false",
		"picoclaw.saas.tenant_id": t.ID,
		"picoclaw.saas.subdomain": t.Subdomain,
		"picoclaw.saas.managed":   "true",
	}

	env := map[string]string{
		"PICOCLAW_HOME":                   "/root/.picoclaw",
		"PICOCLAW_LAUNCHER_HOST":          "0.0.0.0",
		"PICOCLAW_GATEWAY_HOST":           "0.0.0.0",
		"PICOCLAW_AUTH_MODE":              "trusted_gateway",
		"PICOCLAW_TRUSTED_GATEWAY_SECRET": p.Cfg.GatewaySharedSecret,
		"PICOCLAW_ALLOWED_CHANNELS":       "whatsapp_native",
	}

	return ContainerSpec{
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
}
