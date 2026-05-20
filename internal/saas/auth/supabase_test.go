package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "this-is-a-fake-jwt-secret-only-for-tests"

// makeSupabaseTestClient constructs a SupabaseClient with only the JWT verifier
// usable; the admin client is non-functional (project ref "fake") but its
// methods aren't exercised in tests that only call VerifyAccessToken.
func makeSupabaseTestClient(t *testing.T) *SupabaseClient {
	t.Helper()
	c, err := NewSupabaseClient("fake-ref", "anon", "service-role", testJWTSecret, "https://example.com")
	if err != nil {
		t.Fatalf("NewSupabaseClient: %v", err)
	}
	return c
}

// signToken builds a valid HS256 Supabase-style JWT for the verifier tests.
func signToken(t *testing.T, secret string, claims supabaseTokenClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed
}

func TestNewSupabaseClientRequiresCoreFields(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name                          string
		ref, anon, service, jwt, site string
		expectErr                     bool
	}{
		// jwt_secret is now optional — JWKS handles asymmetric keys, and HS256
		// is only used when the legacy shared secret is provided.
		{"all set", "ref", "anon", "svc", "sec", "https://x", false},
		{"no jwt secret (JWKS-only project)", "ref", "anon", "svc", "", "https://x", false},
		{"missing ref", "", "anon", "svc", "sec", "https://x", true},
		{"missing anon", "ref", "", "svc", "sec", "https://x", true},
		{"missing svc", "ref", "anon", "", "sec", "https://x", true},
		{"site is optional", "ref", "anon", "svc", "sec", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := NewSupabaseClient(tc.ref, tc.anon, tc.service, tc.jwt, tc.site)
			if tc.expectErr && err == nil {
				t.Fatal("expected ErrSupabaseNotConfigured, got nil")
			}
			if !tc.expectErr && err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
		})
	}
}

func TestVerifyAccessTokenAcceptsValidJWT(t *testing.T) {
	t.Parallel()
	c := makeSupabaseTestClient(t)
	now := time.Now()
	token := signToken(t, testJWTSecret, supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user-uuid-123",
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		Email: "owner@example.com",
		AppMetadata: appMetadataRaw{
			TenantID:  "acme-001",
			Subdomain: "acme",
			Role:      "owner",
		},
	})

	claims, err := c.VerifyAccessToken(token)
	if err != nil {
		t.Fatalf("VerifyAccessToken: %v", err)
	}
	if claims.UserID != "user-uuid-123" {
		t.Errorf("UserID = %q, want user-uuid-123", claims.UserID)
	}
	if claims.Email != "owner@example.com" {
		t.Errorf("Email = %q, want owner@example.com", claims.Email)
	}
	if claims.TenantID != "acme-001" {
		t.Errorf("TenantID = %q, want acme-001", claims.TenantID)
	}
	if claims.Role != "owner" {
		t.Errorf("Role = %q, want owner", claims.Role)
	}
}

func TestVerifyAccessTokenRejectsWrongSecret(t *testing.T) {
	t.Parallel()
	c := makeSupabaseTestClient(t)
	token := signToken(t, "different-secret", supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		AppMetadata: appMetadataRaw{TenantID: "t"},
	})
	if _, err := c.VerifyAccessToken(token); err != ErrInvalidAccessToken {
		t.Fatalf("err = %v, want ErrInvalidAccessToken", err)
	}
}

func TestVerifyAccessTokenRejectsExpired(t *testing.T) {
	t.Parallel()
	c := makeSupabaseTestClient(t)
	token := signToken(t, testJWTSecret, supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
		AppMetadata: appMetadataRaw{TenantID: "t"},
	})
	if _, err := c.VerifyAccessToken(token); err != ErrInvalidAccessToken {
		t.Fatalf("err = %v, want ErrInvalidAccessToken", err)
	}
}

func TestVerifyAccessTokenRequiresTenantClaim(t *testing.T) {
	t.Parallel()
	c := makeSupabaseTestClient(t)
	token := signToken(t, testJWTSecret, supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		// AppMetadata.TenantID intentionally empty
	})
	if _, err := c.VerifyAccessToken(token); err != ErrMissingTenantClaim {
		t.Fatalf("err = %v, want ErrMissingTenantClaim", err)
	}
}

func TestVerifyAccessTokenRejectsAsymmetricWithoutJWKS(t *testing.T) {
	t.Parallel()
	// Project not reachable (fake ref), JWKS init may have failed silently.
	// Even if keyfunc has the URL queued, it won't have a key matching this
	// kid, so the verification must fail rather than silently succeed.
	c := makeSupabaseTestClient(t)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		AppMetadata: appMetadataRaw{TenantID: "t"},
	})
	// Tamper alg to claim ES256; signature still HS256-style and can't be
	// matched against any EC public key — must reject.
	tok.Header["alg"] = "ES256"
	tok.Header["kid"] = "nope"
	signed, err := tok.SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := c.VerifyAccessToken(signed); err == nil {
		t.Fatal("expected reject, got nil")
	}
}

func TestVerifyAccessTokenWithoutSecretRejectsHS256(t *testing.T) {
	t.Parallel()
	// JWKS-only project (no HS256 secret configured) must reject incoming
	// HS256 tokens — they could only come from an attacker since the project
	// never signs with HS256 anymore.
	c, err := NewSupabaseClient("fake-ref", "anon", "service-role", "" /* no jwt secret */, "https://x")
	if err != nil {
		t.Fatalf("NewSupabaseClient: %v", err)
	}
	token := signToken(t, "any-secret", supabaseTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		AppMetadata: appMetadataRaw{TenantID: "t"},
	})
	if _, err := c.VerifyAccessToken(token); err == nil {
		t.Fatal("expected reject (HS256 with no configured secret), got nil")
	}
}

func TestBaseHostFromSiteURL(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"https://jotaduo.com":   "jotaduo.com",
		"http://example.com/":   "example.com",
		"https://app.test.io//": "app.test.io",
		"":                      "",
		"localhost:8080":        "localhost:8080",
	}
	for in, want := range cases {
		if got := baseHostFromSiteURL(in); got != want {
			t.Errorf("baseHostFromSiteURL(%q) = %q, want %q", in, got, want)
		}
	}
}

// Smoke test for nil-receiver safety: a nil SupabaseClient should return a
// sentinel error from all admin methods rather than panic.
func TestNilClientReturnsErrSupabaseNotConfigured(t *testing.T) {
	t.Parallel()
	var c *SupabaseClient

	if _, _, err := c.CreateTenantOwner("e@x.com", "t", "s", LoginModeMagicLink, ""); err != ErrSupabaseNotConfigured {
		t.Errorf("CreateTenantOwner: got %v", err)
	}
	if _, err := c.GenerateMagicLink("e@x.com", "s"); err != ErrSupabaseNotConfigured {
		t.Errorf("GenerateMagicLink: got %v", err)
	}
	if err := c.DeleteTenantUser("11111111-1111-1111-1111-111111111111"); err != ErrSupabaseNotConfigured {
		t.Errorf("DeleteTenantUser: got %v", err)
	}
	if _, err := c.VerifyAccessToken("anything"); err != ErrSupabaseNotConfigured {
		t.Errorf("VerifyAccessToken: got %v", err)
	}
}

func TestMagicLinkActionURLContainsSiteHost(t *testing.T) {
	// Indirect coverage: SiteURL() exposes the configured site so the
	// gateway middleware can build the login redirect.
	t.Parallel()
	c := makeSupabaseTestClient(t)
	if !strings.HasPrefix(c.SiteURL(), "https://") {
		t.Errorf("SiteURL = %q, want https:// prefix", c.SiteURL())
	}
}
