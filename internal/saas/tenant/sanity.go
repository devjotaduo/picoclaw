package tenant

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// CheckStatus is the verdict for a single sanity check.
type CheckStatus string

const (
	CheckOK   CheckStatus = "ok"
	CheckWarn CheckStatus = "warn"
	CheckFail CheckStatus = "fail"
)

// CheckResult is one row in the post-clone sanity report.
type CheckResult struct {
	Name    string      `json:"name"`
	Status  CheckStatus `json:"status"`
	Message string      `json:"message,omitempty"`
}

// requiredFiles are the files a tenant must have on disk to boot successfully.
// Missing any of these is a hard failure of the clone.
var requiredFiles = []string{
	"config.json",
	"workspace/AGENT.md",
	"workspace/SOUL.md",
}

// recommendedFiles are expected but not boot-critical. Missing yields a warn.
var recommendedFiles = []string{
	"workspace/behavior.json",
	"launcher_policy.json",
	"dashboardauth.db",
	"litellm.key",
}

// RunPostCloneChecks inspects the freshly-provisioned tenant volume and
// container, returning a list of human-readable verdicts. It is best-effort:
// network/Docker failures yield warn rows instead of bubbling errors so the
// admin UI always renders a complete report.
func (p *Provisioner) RunPostCloneChecks(ctx context.Context, tenantID string) []CheckResult {
	out := []CheckResult{}
	t, err := p.Tenants.Get(ctx, tenantID)
	if err != nil {
		return append(out, CheckResult{
			Name:    "tenant_record",
			Status:  CheckFail,
			Message: fmt.Sprintf("could not load tenant: %v", err),
		})
	}
	out = append(out, CheckResult{
		Name:    "tenant_record",
		Status:  CheckOK,
		Message: fmt.Sprintf("status=%s subdomain=%s", t.Status, t.Subdomain),
	})

	for _, rel := range requiredFiles {
		path := filepath.Join(t.VolumePath, rel)
		if _, err := os.Stat(path); err != nil {
			out = append(out, CheckResult{
				Name:    "file:" + rel,
				Status:  CheckFail,
				Message: err.Error(),
			})
		} else {
			out = append(out, CheckResult{Name: "file:" + rel, Status: CheckOK})
		}
	}
	for _, rel := range recommendedFiles {
		path := filepath.Join(t.VolumePath, rel)
		if _, err := os.Stat(path); err != nil {
			out = append(out, CheckResult{
				Name:    "file:" + rel,
				Status:  CheckWarn,
				Message: "missing (recommended)",
			})
		} else {
			out = append(out, CheckResult{Name: "file:" + rel, Status: CheckOK})
		}
	}

	if p.Docker == nil {
		out = append(out, CheckResult{
			Name:    "container:running",
			Status:  CheckWarn,
			Message: "docker client not configured",
		})
	} else if t.ContainerID == nil || *t.ContainerID == "" {
		out = append(out, CheckResult{
			Name:    "container:running",
			Status:  CheckFail,
			Message: "no container id stored",
		})
	} else {
		running, err := p.Docker.Inspect(ctx, *t.ContainerID)
		switch {
		case err != nil:
			out = append(out, CheckResult{
				Name:    "container:running",
				Status:  CheckFail,
				Message: err.Error(),
			})
		case !running:
			out = append(out, CheckResult{
				Name:    "container:running",
				Status:  CheckFail,
				Message: "container is not running",
			})
		default:
			out = append(out, CheckResult{Name: "container:running", Status: CheckOK})
		}
	}

	containerHost := "tenant-" + t.ID
	out = append(out, probeHTTPEndpoint(ctx, "tenant_health", containerHost, 18800, "/health"))
	out = append(out, probeHTTPEndpoint(ctx, "tenant_ready", containerHost, 18800, "/ready"))
	return out
}

// probeHTTPEndpoint dials a container by its Docker DNS name and issues a
// short GET. Network errors yield warn so the report doesn't fail when the
// controlplane isn't on the same docker network as the tenant.
func probeHTTPEndpoint(ctx context.Context, name, host string, port int, path string) CheckResult {
	dialer := &net.Dialer{Timeout: 3 * time.Second}
	transport := &http.Transport{
		DialContext:     dialer.DialContext,
		IdleConnTimeout: 5 * time.Second,
	}
	client := &http.Client{Timeout: 5 * time.Second, Transport: transport}

	url := fmt.Sprintf("http://%s:%d%s", host, port, path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return CheckResult{Name: name, Status: CheckWarn, Message: err.Error()}
	}
	res, err := client.Do(req)
	if err != nil {
		return CheckResult{Name: name, Status: CheckWarn, Message: err.Error()}
	}
	defer res.Body.Close()
	if res.StatusCode >= 200 && res.StatusCode < 400 {
		return CheckResult{Name: name, Status: CheckOK, Message: fmt.Sprintf("HTTP %d", res.StatusCode)}
	}
	return CheckResult{
		Name:    name,
		Status:  CheckFail,
		Message: fmt.Sprintf("HTTP %d", res.StatusCode),
	}
}

// Compile-time assertion that we depend on store.Tenant — keeps imports tidy
// if the struct ever moves.
var _ = (*store.Tenant)(nil)
