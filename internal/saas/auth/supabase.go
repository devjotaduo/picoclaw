package auth

// Supabase Auth integration for tenant dashboard logins.
//
// Two responsibilities:
//   1. Admin operations (CreateTenantOwner, DeleteTenantUser) used by the
//      controlplane during tenant provisioning/lifecycle.
//   2. Access-token verification (VerifyAccessToken) used by the tenant
//      gateway middleware to decide if a request to <sub>.<base> may proceed.
//
// The launcher container itself never talks to Supabase — the controlplane
// verifies the JWT, then signs trusted_gateway HMAC headers as before.

import (
	"context"
	"errors"
	"fmt"

	"github.com/MicahParks/keyfunc/v3"
	supaauth "github.com/supabase-community/auth-go"
	"github.com/supabase-community/auth-go/types"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrSupabaseNotConfigured = errors.New("supabase auth is not configured")
	ErrInvalidAccessToken    = errors.New("invalid supabase access token")
	ErrMissingTenantClaim    = errors.New("supabase token has no tenant_id claim")
)

// Claims is the tenant-relevant subset extracted from a verified Supabase JWT.
// Mirrors gatewayauth.Claims so the gateway middleware can pass-through.
type Claims struct {
	UserID    string
	Email     string
	TenantID  string
	Subdomain string
	Role      string // "owner", "admin", "operator", "viewer"
}

// LoginMode controls how a freshly-created tenant owner gets into their panel.
type LoginMode string

const (
	LoginModeMagicLink LoginMode = "magic_link"
	LoginModePassword  LoginMode = "password"
)

// SupabaseClient wraps the supabase-community/auth-go client with the few
// admin ops we use, plus a local JWT verifier so request handlers don't have
// to round-trip to Supabase per request.
//
// Verification supports two modes that coexist:
//   - JWKS (ES256/RS256/EdDSA): the current Supabase signing model.
//     User access tokens carry a `kid` header that maps to a public key
//     served from <project>.supabase.co/auth/v1/.well-known/jwks.json.
//     keyfunc/v3 keeps the key set fresh in a background goroutine.
//   - HS256 shared secret: legacy projects that haven't migrated to
//     asymmetric keys. Only used if jwtSecret was provided.
//
// The verifier dispatches on the token's `alg` header so old and new tokens
// can be accepted during a rotation window without reconfiguring.
type SupabaseClient struct {
	admin     supaauth.Client // bound to service_role token
	jwtSecret []byte          // HS256 shared secret, optional (legacy)
	jwks      keyfunc.Keyfunc // ES256/RS256 verifier, optional but preferred
	siteURL   string
}

// NewSupabaseClient builds the client. Required: projectRef + anonKey +
// serviceRoleKey. Optional: jwtSecret (legacy HS256 path). When projectRef
// is set, a JWKS verifier is initialized against the standard
// <ref>.supabase.co/auth/v1/.well-known/jwks.json endpoint and used to
// verify any user access tokens signed with the project's asymmetric keys.
//
// Returns ErrSupabaseNotConfigured if any of the required fields is empty.
// Callers should treat that as "Supabase disabled" and keep the legacy
// local auth path.
func NewSupabaseClient(projectRef, anonKey, serviceRoleKey, jwtSecret, siteURL string) (*SupabaseClient, error) {
	if projectRef == "" || anonKey == "" || serviceRoleKey == "" {
		return nil, ErrSupabaseNotConfigured
	}
	base := supaauth.New(projectRef, anonKey)

	c := &SupabaseClient{
		admin:   base.WithToken(serviceRoleKey),
		siteURL: siteURL,
	}
	if jwtSecret != "" {
		c.jwtSecret = []byte(jwtSecret)
	}
	// JWKS init can fail at boot if the network is unreachable; that
	// shouldn't take down the controlplane. We log+continue with whatever
	// HS256 secret was provided. If neither is usable, VerifyAccessToken
	// will reject every token until JWKS recovers on its own goroutine.
	jwksURL := fmt.Sprintf("https://%s.supabase.co/auth/v1/.well-known/jwks.json", projectRef)
	if kf, err := keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL}); err == nil {
		c.jwks = kf
	}
	return c, nil
}

// SiteURL returns the configured site URL (e.g. "https://jotaduo.com"). The
// tenant gateway uses it to build the login redirect target.
func (s *SupabaseClient) SiteURL() string { return s.siteURL }

// CreateTenantOwner provisions the dashboard login for a freshly-created
// tenant. When mode==LoginModePassword, the returned magicLink is empty and
// the caller is expected to display the initialPassword to the user. When
// mode==LoginModeMagicLink, the password (if any) is ignored and the returned
// magicLink is a single-use action URL that signs the user in.
func (s *SupabaseClient) CreateTenantOwner(
	email, tenantID, subdomain string,
	mode LoginMode,
	initialPassword string,
) (userID string, magicLink string, err error) {
	if s == nil {
		return "", "", ErrSupabaseNotConfigured
	}

	req := types.AdminCreateUserRequest{
		Email: email,
		Role:  "authenticated",
		AppMetadata: map[string]interface{}{
			"tenant_id": tenantID,
			"subdomain": subdomain,
			"role":      "owner",
		},
	}
	if mode == LoginModePassword {
		req.Password = &initialPassword
		req.EmailConfirm = true
	}

	resp, err := s.admin.AdminCreateUser(req)
	if err != nil {
		return "", "", fmt.Errorf("supabase create user: %w", err)
	}
	userID = resp.User.ID.String()

	if mode == LoginModeMagicLink {
		redirect := fmt.Sprintf("https://%s.%s/", subdomain, baseHostFromSiteURL(s.siteURL))
		link, lerr := s.admin.AdminGenerateLink(types.AdminGenerateLinkRequest{
			Type:       types.LinkTypeMagicLink,
			Email:      email,
			RedirectTo: redirect,
		})
		if lerr != nil {
			// User exists in Supabase but magic link failed. Caller can retry
			// via the resend-link endpoint; not worth rolling the user back.
			return userID, "", fmt.Errorf("supabase magic link: %w", lerr)
		}
		magicLink = link.ActionLink
	}
	return userID, magicLink, nil
}

// GenerateMagicLink re-issues a magic link for an existing tenant owner.
// Used by the resend-link endpoint.
func (s *SupabaseClient) GenerateMagicLink(email, subdomain string) (string, error) {
	if s == nil {
		return "", ErrSupabaseNotConfigured
	}
	redirect := fmt.Sprintf("https://%s.%s/", subdomain, baseHostFromSiteURL(s.siteURL))
	link, err := s.admin.AdminGenerateLink(types.AdminGenerateLinkRequest{
		Type:       types.LinkTypeMagicLink,
		Email:      email,
		RedirectTo: redirect,
	})
	if err != nil {
		return "", fmt.Errorf("supabase magic link: %w", err)
	}
	return link.ActionLink, nil
}

// UpdateUserPassword resets the Supabase user's password to newPassword.
// Used by the admin "resend credentials" flow to rotate a forgotten /
// leaked password before mailing a fresh one. EmailConfirm stays true
// because the user was already confirmed at create time.
func (s *SupabaseClient) UpdateUserPassword(userIDStr, newPassword string) error {
	if s == nil {
		return ErrSupabaseNotConfigured
	}
	if newPassword == "" {
		return fmt.Errorf("update password: empty password")
	}
	id, err := uuid.Parse(userIDStr)
	if err != nil {
		return fmt.Errorf("parse user id: %w", err)
	}
	if _, err := s.admin.AdminUpdateUser(types.AdminUpdateUserRequest{
		UserID:   id,
		Password: newPassword,
	}); err != nil {
		return fmt.Errorf("supabase update user: %w", err)
	}
	return nil
}

// DeleteTenantUser removes the user from Supabase. Idempotent at the caller
// site: the lifecycle delete logs and continues if the user is already gone.
func (s *SupabaseClient) DeleteTenantUser(userIDStr string) error {
	if s == nil {
		return ErrSupabaseNotConfigured
	}
	id, err := uuid.Parse(userIDStr)
	if err != nil {
		return fmt.Errorf("parse user id: %w", err)
	}
	return s.admin.AdminDeleteUser(types.AdminDeleteUserRequest{UserID: id})
}

// supabaseTokenClaims is the JWT body that Supabase issues. We only care
// about the fields that gate dashboard access.
type supabaseTokenClaims struct {
	jwt.RegisteredClaims
	Email       string         `json:"email"`
	AppMetadata appMetadataRaw `json:"app_metadata"`
}

type appMetadataRaw struct {
	TenantID  string `json:"tenant_id"`
	Subdomain string `json:"subdomain"`
	Role      string `json:"role"`
}

// VerifyAccessToken parses a Supabase-issued JWT and validates its signature
// against either the project's JWKS (asymmetric, preferred) or the HS256
// shared secret (legacy). Dispatches on the token's `alg` header so a single
// project can accept both during a key rotation window.
func (s *SupabaseClient) VerifyAccessToken(accessToken string) (*Claims, error) {
	if s == nil {
		return nil, ErrSupabaseNotConfigured
	}
	tok, err := jwt.ParseWithClaims(accessToken, &supabaseTokenClaims{}, s.keyfunc)
	if err != nil || !tok.Valid {
		return nil, ErrInvalidAccessToken
	}
	c, ok := tok.Claims.(*supabaseTokenClaims)
	if !ok {
		return nil, ErrInvalidAccessToken
	}
	if c.AppMetadata.TenantID == "" {
		return nil, ErrMissingTenantClaim
	}
	return &Claims{
		UserID:    c.Subject,
		Email:     c.Email,
		TenantID:  c.AppMetadata.TenantID,
		Subdomain: c.AppMetadata.Subdomain,
		Role:      c.AppMetadata.Role,
	}, nil
}

// keyfunc is the jwt.Keyfunc that VerifyAccessToken hands to jwt.ParseWithClaims.
// HS256 tokens are verified with the static shared secret (legacy projects).
// Anything else is delegated to the JWKS-backed verifier, which looks the key
// up by `kid` and handles ES256/RS256/EdDSA transparently.
func (s *SupabaseClient) keyfunc(t *jwt.Token) (interface{}, error) {
	if _, isHMAC := t.Method.(*jwt.SigningMethodHMAC); isHMAC {
		if len(s.jwtSecret) == 0 {
			return nil, fmt.Errorf("HS256 token received but no SUPABASE_JWT_SECRET configured")
		}
		return s.jwtSecret, nil
	}
	if s.jwks == nil {
		return nil, fmt.Errorf("asymmetric token (alg=%v) received but JWKS not initialized", t.Header["alg"])
	}
	return s.jwks.Keyfunc(t)
}

// baseHostFromSiteURL strips the scheme from siteURL ("https://jotaduo.com")
// to derive the apex domain we append a subdomain to. Defensive: trim a
// trailing slash and the "https://" prefix only.
func baseHostFromSiteURL(siteURL string) string {
	out := siteURL
	for _, p := range []string{"https://", "http://"} {
		if len(out) >= len(p) && out[:len(p)] == p {
			out = out[len(p):]
			break
		}
	}
	for len(out) > 0 && out[len(out)-1] == '/' {
		out = out[:len(out)-1]
	}
	return out
}
