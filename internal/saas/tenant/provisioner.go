package tenant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

type Provisioner struct {
	Cfg     *config.Config
	Tenants *store.TenantStore
	Docker  *DockerClient
	LiteLLM *litellm.Client // optional; when nil the tenant is provisioned without an LLM key
}

func NewProvisioner(cfg *config.Config, db *store.DB, dk *DockerClient, ll *litellm.Client) *Provisioner {
	return &Provisioner{
		Cfg:     cfg,
		Tenants: &store.TenantStore{DB: db},
		Docker:  dk,
		LiteLLM: ll,
	}
}

type CreateInput struct {
	DisplayName      string
	OwnerEmail       string
	Subdomain        string
	MonthlyBudgetUSD *float64
	MemLimitMB       int
	CPUQuota         float64
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

	id, err := GenerateID(in.Subdomain)
	if err != nil {
		return nil, fmt.Errorf("id: %w", err)
	}

	password, err := auth.GeneratePassword()
	if err != nil {
		return nil, fmt.Errorf("password: %w", err)
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
	if err := p.Tenants.Insert(ctx, t); err != nil {
		return nil, fmt.Errorf("insert tenant: %w", err)
	}

	if err := p.runProvision(ctx, t, password); err != nil {
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

func (p *Provisioner) runProvision(ctx context.Context, t *store.Tenant, password string) error {
	if err := os.MkdirAll(t.VolumePath, 0o755); err != nil {
		return fmt.Errorf("mkdir volume: %w", err)
	}
	if err := CopyTemplate(p.Cfg.TenantTemplateDir, t.VolumePath); err != nil {
		return fmt.Errorf("copy template: %w", err)
	}
	if err := SeedDashboardPassword(ctx, t.VolumePath, password); err != nil {
		return fmt.Errorf("seed password: %w", err)
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
