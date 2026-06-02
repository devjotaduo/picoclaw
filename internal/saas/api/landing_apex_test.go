package api

import (
	"reflect"
	"testing"
)

func TestApexDomainsFromEnv(t *testing.T) {
	cases := []struct {
		name string
		env  map[string]string
		want []string
	}{
		{
			name: "none set disables landing",
			env:  map[string]string{},
			want: []string{},
		},
		{
			// Regression: prod compose injects the base domain as
			// TENANT_BASE_DOMAIN, not SAAS_BASE_DOMAIN. Reading only the
			// latter silently disabled LandingMux and the apex fell through
			// to the admin SPA.
			name: "TENANT_BASE_DOMAIN alone is honored",
			env:  map[string]string{"TENANT_BASE_DOMAIN": "jotaduo.com"},
			want: []string{"jotaduo.com"},
		},
		{
			name: "SAAS_BASE_DOMAIN alone is honored",
			env:  map[string]string{"SAAS_BASE_DOMAIN": "jotaduo.com"},
			want: []string{"jotaduo.com"},
		},
		{
			name: "both base vars equal are de-duped",
			env: map[string]string{
				"SAAS_BASE_DOMAIN":   "Jotaduo.com",
				"TENANT_BASE_DOMAIN": "jotaduo.com",
			},
			want: []string{"jotaduo.com"},
		},
		{
			name: "override list merges and de-dups",
			env: map[string]string{
				"TENANT_BASE_DOMAIN":            "jotaduo.com",
				"PICOCLAW_LANDING_APEX_DOMAINS": "jotaduo.com, staging.jotaduo.com , ",
			},
			want: []string{"jotaduo.com", "staging.jotaduo.com"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, k := range []string{"SAAS_BASE_DOMAIN", "TENANT_BASE_DOMAIN", "PICOCLAW_LANDING_APEX_DOMAINS"} {
				t.Setenv(k, "")
			}
			for k, v := range tc.env {
				t.Setenv(k, v)
			}
			got := apexDomainsFromEnv()
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("apexDomainsFromEnv() = %v, want %v", got, tc.want)
			}
		})
	}
}
