package tenant

import (
	"testing"
)

// TestCreateInput_Normalize exercises the small input-mutation contract
// invoked at the top of Provisioner.Create via in.normalize():
//
//	if in.IsPublic { in.SkipDashboardPassword = true }
//
// We don't drive the full Create() path here because it needs a real Postgres
// DB, Docker daemon, and LiteLLM endpoint. The intent of this test is to lock
// the public-tenant invariant: a public tenant MUST NOT receive a bcrypt
// dashboard password — there's no human owner to log in with one.
func TestCreateInput_Normalize(t *testing.T) {
	cases := []struct {
		name     string
		input    CreateInput
		wantSkip bool
	}{
		{"public tenant forces skip", CreateInput{IsPublic: true}, true},
		{"private + caller skip=false stays false", CreateInput{IsPublic: false, SkipDashboardPassword: false}, false},
		{
			"private + caller skip=true stays true (idempotent)",
			CreateInput{IsPublic: false, SkipDashboardPassword: true},
			true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.input
			in.normalize()
			if in.SkipDashboardPassword != tc.wantSkip {
				t.Errorf("SkipDashboardPassword: got %v, want %v", in.SkipDashboardPassword, tc.wantSkip)
			}
		})
	}
}
