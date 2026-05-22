package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/gatewayauth"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const testMagicLinkSecret = "test-shared-secret-for-magic-link-tests" //nolint:unused // also referenced via the testMagicLinkSecret name below

func TestNormalizeMagicLinkRole(t *testing.T) {
	cases := []struct {
		in       string
		wantRole string
		wantOK   bool
	}{
		{"", "", true},                                // empty == public alias, returned as-is
		{"public", "public", true},
		{"tenant_owner", "tenant_owner", true},
		{"tenant_admin", "tenant_admin", true},
		{"TENANT_OWNER", "tenant_owner", true},        // case-normalized accepts canonical name in any case
		{"  Tenant_Owner  ", "tenant_owner", true},    // trims whitespace
		{"platform_admin", "", false},                 // controlplane-only, never via magic link
		{"operator", "", false},                       // not in whitelist
		{"viewer", "", false},
		{"owner", "", false},                          // synonym rejected — must use canonical "tenant_owner"
		{"admin", "", false},                          // same — must use canonical "tenant_admin"
		{"anything-else", "", false},
	}
	for _, c := range cases {
		got, ok := normalizeMagicLinkRole(c.in)
		if ok != c.wantOK || got != c.wantRole {
			t.Errorf("normalizeMagicLinkRole(%q) = (%q, %v); want (%q, %v)",
				c.in, got, ok, c.wantRole, c.wantOK)
		}
	}
}

func TestMagicLinkRoleTTLCap(t *testing.T) {
	cases := []struct {
		role string
		want time.Duration
	}{
		{"", maxMagicLinkTTL},
		{"public", maxMagicLinkTTL},
		{"tenant_owner", 24 * time.Hour},
		{"tenant_admin", 7 * 24 * time.Hour},
		{"unknown", maxMagicLinkTTL}, // unknown falls into default == public cap (defensive)
	}
	for _, c := range cases {
		got := magicLinkRoleTTLCap(c.role)
		if got != c.want {
			t.Errorf("magicLinkRoleTTLCap(%q) = %v; want %v", c.role, got, c.want)
		}
	}
}

// Sign/verify round-trip preserves the Role claim, and the HMAC binds it
// so swapping the role in the encoded payload invalidates the signature.
func TestMagicLinkClaimsRoleRoundTripAndTamper(t *testing.T) {
	orig := magicLinkClaims{
		TenantID: "tenant-abc",
		Exp:      time.Now().Add(1 * time.Hour).Unix(),
		Nonce:    "nonce-xyz",
		Role:     "tenant_owner",
	}
	token, err := signMagicLinkToken(testMagicLinkSecret, orig)
	if err != nil {
		t.Fatalf("signMagicLinkToken: %v", err)
	}
	got, ok := verifyMagicLinkToken(testMagicLinkSecret, token)
	if !ok {
		t.Fatal("verifyMagicLinkToken rejected a freshly-signed token")
	}
	if got.Role != "tenant_owner" {
		t.Errorf("round-trip Role = %q; want tenant_owner", got.Role)
	}
	if got.TenantID != orig.TenantID || got.Nonce != orig.Nonce {
		t.Errorf("round-trip mangled non-role fields: %+v", got)
	}

	// Tamper: rebuild the token with role swapped to platform_admin but
	// reuse the original signature. Must fail verification.
	tampered := magicLinkClaims{
		TenantID: orig.TenantID,
		Exp:      orig.Exp,
		Nonce:    orig.Nonce,
		Role:     "platform_admin",
	}
	payload, _ := json.Marshal(tampered)
	encodedTampered := base64.RawURLEncoding.EncodeToString(payload)
	origSig := strings.Split(token, ".")[1]
	if _, ok := verifyMagicLinkToken(testMagicLinkSecret, encodedTampered+"."+origSig); ok {
		t.Error("verifyMagicLinkToken accepted a payload with role swapped under the original signature")
	}
}

// Tokens minted before this feature existed (no `r` field in JSON) must
// continue to verify and surface Role="" so the signMagicVisitorRequest
// fallback turns them into public visitors.
//
// We exercise this in two ways: (1) confirm omitempty actually drops Role
// when it's empty, so a newly-built token from THIS binary matches the
// shape an old binary would have produced; (2) verify that a token with
// no `r` in the JSON parses cleanly into a zero-value Role.
func TestMagicLinkLegacyTokenWithoutRoleFieldDefaultsToEmpty(t *testing.T) {
	// (1) omitempty check: signing claims with Role="" must produce JSON
	// without an `r` key. If this regresses, old binaries' tokens and new
	// binaries' tokens would have different signatures even when the
	// caller intends identical semantics.
	claims := magicLinkClaims{
		TenantID: "tenant-legacy",
		Exp:      time.Now().Add(1 * time.Hour).Unix(),
		Nonce:    "legacy-nonce",
		// Role intentionally left zero
	}
	token, err := signMagicLinkToken(testMagicLinkSecret, claims)
	if err != nil {
		t.Fatalf("signMagicLinkToken: %v", err)
	}
	encodedPayload := strings.Split(token, ".")[0]
	decoded, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if strings.Contains(string(decoded), `"r"`) {
		t.Errorf("Role:\"\" produced a payload containing `r`: %s — omitempty regressed", string(decoded))
	}

	// (2) Round-trip: token parsed back yields Role="".
	got, ok := verifyMagicLinkToken(testMagicLinkSecret, token)
	if !ok {
		t.Fatal("verifyMagicLinkToken rejected a token with Role=\"\"")
	}
	if got.Role != "" {
		t.Errorf("legacy-shaped token Role = %q; want \"\" (so the fallback produces public)", got.Role)
	}

	// (3) A hand-rolled JSON with no `r` field decodes the same way (uses
	// a different field order so we know the parser doesn't care).
	hand := []byte(`{"exp":` + strconv.FormatInt(claims.Exp, 10) + `,"n":"legacy-nonce","tid":"tenant-legacy"}`)
	var parsed magicLinkClaims
	if err := json.Unmarshal(hand, &parsed); err != nil {
		t.Fatalf("unmarshal hand-rolled JSON: %v", err)
	}
	if parsed.Role != "" {
		t.Errorf("hand-rolled JSON without `r` parsed Role = %q; want \"\"", parsed.Role)
	}
}

// signMagicVisitorRequest produces the correct gateway-auth headers for
// each role, including the audit-identity behavior (public stays anonymous,
// elevated roles surface the tenant's owner email + a recognizable UserID).
func TestSignMagicVisitorRequestRoleBehavior(t *testing.T) {
	tenant := &store.Tenant{
		ID:         "tenant-abc",
		OwnerEmail: "owner@example.com",
	}
	h := &Handler{Cfg: &config.Config{GatewaySharedSecret: testMagicLinkSecret}}

	cases := []struct {
		name          string
		claimsRole    string
		wantRole      string
		wantUserID    string
		wantUserEmail string
	}{
		{
			name:          "empty role -> public visitor",
			claimsRole:    "",
			wantRole:      "public",
			wantUserID:    "visitor:nonce-1",
			wantUserEmail: "",
		},
		{
			name:          "explicit public -> public visitor",
			claimsRole:    "public",
			wantRole:      "public",
			wantUserID:    "visitor:nonce-1",
			wantUserEmail: "",
		},
		{
			name:          "tenant_owner -> elevated identity with owner email",
			claimsRole:    "tenant_owner",
			wantRole:      "tenant_owner",
			wantUserID:    "magic:tenant_owner:nonce-1",
			wantUserEmail: "owner@example.com",
		},
		{
			name:          "tenant_admin -> elevated identity with owner email",
			claimsRole:    "tenant_admin",
			wantRole:      "tenant_admin",
			wantUserID:    "magic:tenant_admin:nonce-1",
			wantUserEmail: "owner@example.com",
		},
		{
			name:          "out-of-whitelist role downgrades to public",
			claimsRole:    "platform_admin",
			wantRole:      "public",
			wantUserID:    "visitor:nonce-1",
			wantUserEmail: "",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/dashboard", nil)
			h.signMagicVisitorRequest(req, tenant, magicLinkClaims{
				TenantID: tenant.ID,
				Exp:      time.Now().Add(1 * time.Hour).Unix(),
				Nonce:    "nonce-1",
				Role:     c.claimsRole,
			})
			if got := req.Header.Get(gatewayauth.HeaderRole); got != c.wantRole {
				t.Errorf("Role header = %q; want %q", got, c.wantRole)
			}
			if got := req.Header.Get(gatewayauth.HeaderUserID); got != c.wantUserID {
				t.Errorf("UserID header = %q; want %q", got, c.wantUserID)
			}
			if got := req.Header.Get(gatewayauth.HeaderUserEmail); got != c.wantUserEmail {
				t.Errorf("UserEmail header = %q; want %q", got, c.wantUserEmail)
			}
			// Sanity: the launcher-side verifier accepts the signed headers.
			if _, err := gatewayauth.VerifyRequest(req, testMagicLinkSecret, 5*time.Minute, time.Now()); err != nil {
				t.Errorf("VerifyRequest failed on freshly signed headers: %v", err)
			}
		})
	}
}
