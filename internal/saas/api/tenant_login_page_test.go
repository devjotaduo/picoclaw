package api

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// The Supabase GoTrue REST API accepts the post-verify redirect URL only as
// the `redirect_to` QUERY parameter on /otp. The `options.email_redirect_to`
// nesting is a JS SDK convenience that the SDK translates to ?redirect_to=
// before sending. Putting it in the body is silently ignored and the magic
// link falls back to the project's Site URL (apex), breaking the per-tenant
// subdomain flow. This test guards against that regression.
func TestTenantLoginRenderedJSUsesRedirectToQueryParam(t *testing.T) {
	h := &Handler{Cfg: &config.Config{
		SupabaseProjectRef: "test-ref",
		SupabaseAnonKey:    "test-anon-key",
		TenantBaseDomain:   "jotaduo.com",
	}}
	tenant := &store.Tenant{
		ID:          "tenant-abc",
		Subdomain:   "acme",
		DisplayName: "Acme",
	}
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "https://acme.jotaduo.com/login", nil)

	h.serveTenantLogin(w, r, tenant)

	body := w.Body.String()

	// The rendered JS must build the OTP URL with redirect_to as a query
	// param. We look for the exact concat shape because that's what carries
	// the URL into the fetch() call.
	wantQueryConstruct := `AUTH_URL + "/otp?redirect_to=" + encodeURIComponent(callbackURL)`
	if !strings.Contains(body, wantQueryConstruct) {
		t.Errorf("rendered login page does not build /otp with ?redirect_to= query param.\n"+
			"want substring: %s\nfull body:\n%s", wantQueryConstruct, body)
	}

	// Defensive: the broken SDK-shape body field must NOT come back. If a
	// future refactor reintroduces it, this fires before the bug ships.
	for _, banned := range []string{
		"email_redirect_to",
		`options: {`,
		`"options"`,
	} {
		if strings.Contains(body, banned) {
			t.Errorf("rendered login page contains forbidden token %q — the JS SDK shape "+
				"is silently ignored by GoTrue's REST API; use ?redirect_to= instead", banned)
		}
	}
}
