package api

import (
	"testing"

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
	if !tenantDashboardAllowed(store.RoleViewer, "GET", "/api/config") {
		t.Fatal("viewer should be able to read")
	}
	if tenantDashboardAllowed(store.RoleViewer, "PUT", "/api/config") {
		t.Fatal("viewer should not be able to mutate config")
	}
	if !tenantDashboardAllowed(store.RoleTenantAdmin, "PUT", "/api/config") {
		t.Fatal("tenant_admin should be able to mutate config")
	}
	if !tenantDashboardAllowed(store.RoleOperator, "POST", "/api/whatsapp/inbox/messages/send") {
		t.Fatal("operator should be able to use inbox/manual-action routes")
	}
	if tenantDashboardAllowed(store.RoleOperator, "PUT", "/api/config") {
		t.Fatal("operator should not be able to mutate config")
	}
}
