package policy

import "testing"

func TestDefaultRolePolicyRequestPermissions(t *testing.T) {
	rp := DefaultRolePolicy()

	tests := []struct {
		role   string
		method string
		path   string
		want   bool
	}{
		{RoleOperator, "POST", "/api/whatsapp/inbox/messages/send", true},
		{RoleOperator, "PUT", "/api/config", false},
		{RoleViewer, "GET", "/api/models", true},
		{RoleViewer, "GET", "/api/config", false},
		{RoleTenantAdmin, "PUT", "/api/models/0", true},
		{RoleTenantAdmin, "POST", "/api/agents", true},
		{RoleViewer, "POST", "/api/agents", false},
		{RolePlatformAdmin, "DELETE", "/api/models/0", true},
	}

	for _, tc := range tests {
		feature, required, known := FeatureForRequest(tc.method, tc.path)
		if !known {
			t.Fatalf("FeatureForRequest(%s %s) did not map a feature", tc.method, tc.path)
		}
		got := Allowed(tc.role, rp, feature, required)
		if got != tc.want {
			t.Fatalf("Allowed(%s, %s %s) = %v, want %v", tc.role, tc.method, tc.path, got, tc.want)
		}
	}
}
