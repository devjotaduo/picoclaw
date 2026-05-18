package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/policy"
)

func TestHandleGetLauncherPolicyCatalog(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/launcher-policy/catalog", nil)
	rec := httptest.NewRecorder()

	h.handleGetLauncherPolicyCatalog(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var resp policy.Catalog
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Roles) == 0 || len(resp.AccessLevels) == 0 || len(resp.Groups) == 0 || len(resp.Features) == 0 {
		t.Fatalf("catalog is incomplete: roles=%d access=%d groups=%d features=%d", len(resp.Roles), len(resp.AccessLevels), len(resp.Groups), len(resp.Features))
	}
	if got := resp.DefaultRolePolicy[policy.RoleTenantOwner][policy.FeatureAgentHub]; got != policy.AccessWrite {
		t.Fatalf("tenant_owner agent_hub default = %q, want write", got)
	}
}
