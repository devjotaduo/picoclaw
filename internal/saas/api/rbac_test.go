package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

func TestTenantRoleAllowsHierarchy(t *testing.T) {
	cases := []struct {
		role store.TenantRole
		min  store.TenantRole
		want bool
	}{
		{store.RoleViewer, store.RoleViewer, true},
		{store.RoleViewer, store.RoleOperator, false},
		{store.RoleOperator, store.RoleViewer, true},
		{store.RoleOperator, store.RoleTenantAdmin, false},
		{store.RoleTenantAdmin, store.RoleOperator, true},
		{store.RoleTenantAdmin, store.RoleTenantOwner, false},
		{store.RoleTenantOwner, store.RoleTenantAdmin, true},
	}
	for _, tc := range cases {
		if got := tenantRoleAllows(tc.role, tc.min); got != tc.want {
			t.Fatalf("tenantRoleAllows(%q, %q) = %v, want %v", tc.role, tc.min, got, tc.want)
		}
	}
}

func TestTenantDashboardAllowed(t *testing.T) {
	rolePolicy := policy.DefaultRolePolicy()
	if !tenantDashboardAllowed(string(store.RoleViewer), rolePolicy, "GET", "/api/models") {
		t.Fatal("viewer should be able to read")
	}
	if tenantDashboardAllowed(string(store.RoleViewer), rolePolicy, "PUT", "/api/config") {
		t.Fatal("viewer should not be able to mutate config")
	}
	if !tenantDashboardAllowed(string(store.RoleTenantAdmin), rolePolicy, "PUT", "/api/config") {
		t.Fatal("tenant_admin should be able to mutate config")
	}
	if !tenantDashboardAllowed(string(store.RoleOperator), rolePolicy, "POST", "/api/whatsapp/inbox/messages/send") {
		t.Fatal("operator should be able to use inbox/manual-action routes")
	}
	if tenantDashboardAllowed(string(store.RoleOperator), rolePolicy, "PUT", "/api/config") {
		t.Fatal("operator should not be able to mutate config")
	}
}

func TestTenantSubdomainSkipsAdminHosts(t *testing.T) {
	h := &Handler{Cfg: &config.Config{TenantBaseDomain: "jotaduo.com"}}
	for _, host := range []string{"jotaduo.com", "admin.jotaduo.com", "adm.jotaduo.com"} {
		if sub, ok := h.tenantSubdomain(host); ok {
			t.Fatalf("tenantSubdomain(%q) = %q,true; want admin host skipped", host, sub)
		}
	}
	if sub, ok := h.tenantSubdomain("carlao.jotaduo.com"); !ok || sub != "carlao" {
		t.Fatalf("tenantSubdomain(carlao.jotaduo.com) = %q,%v; want carlao,true", sub, ok)
	}
}

func TestRejectTenantGatewayAuthRedirectsToAdmHost(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "https://carlao.jotaduo.com/", nil)
	rec := httptest.NewRecorder()

	rejectTenantGatewayAuth(rec, req, "jotaduo.com")

	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusFound)
	}
	if got := rec.Header().Get("Location"); got != "https://adm.jotaduo.com/login" {
		t.Fatalf("Location = %q", got)
	}
}
