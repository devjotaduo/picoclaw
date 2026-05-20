package auth

// End-to-end smoke test against a real Supabase project. Skipped unless all
// three env vars are set; run with:
//
//   set -a; . ./docker/saas/.env.supabase.local; set +a
//   go test -run TestSupabaseE2E -count=1 ./internal/saas/auth/
//
// The test creates a temp user, exchanges a password for an access token,
// verifies the token via the SupabaseClient, then deletes the user. It
// validates the JWKS path against the actual signing keys the project uses.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func TestSupabaseE2E(t *testing.T) {
	projectRef := os.Getenv("SUPABASE_PROJECT_REF")
	anonKey := os.Getenv("SUPABASE_ANON_KEY")
	serviceRole := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if projectRef == "" || anonKey == "" || serviceRole == "" {
		t.Skip("SUPABASE_PROJECT_REF/ANON_KEY/SERVICE_ROLE_KEY not set; skipping E2E")
	}

	c, err := NewSupabaseClient(projectRef, anonKey, serviceRole, os.Getenv("SUPABASE_JWT_SECRET"), "https://example.com")
	if err != nil {
		t.Fatalf("NewSupabaseClient: %v", err)
	}
	// keyfunc spins up its refresh goroutine in the background; give it a
	// moment to fetch the JWKS the first time.
	time.Sleep(500 * time.Millisecond)

	email := fmt.Sprintf("picoclaw-e2e-%d@example.test", time.Now().UnixNano())
	password := "TestPass#123abc"
	tenantID := "e2e-tenant-001"
	subdomain := "e2e"

	// 1. Create the user via the admin path (sets app_metadata directly).
	userID, _, err := c.CreateTenantOwner(email, tenantID, subdomain, LoginModePassword, password)
	if err != nil {
		t.Fatalf("CreateTenantOwner: %v", err)
	}
	t.Cleanup(func() {
		if err := c.DeleteTenantUser(userID); err != nil {
			t.Logf("cleanup DeleteTenantUser: %v", err)
		}
	})

	// 2. Exchange password for an access_token (this is what the frontend
	//    Supabase SDK does on signInWithPassword). The token is signed by the
	//    project's current signing key (ES256 for modern projects).
	accessToken, err := signInWithPassword(projectRef, anonKey, email, password)
	if err != nil {
		t.Fatalf("signInWithPassword: %v", err)
	}
	if accessToken == "" {
		t.Fatal("empty access_token returned from /auth/v1/token")
	}

	// 3. Verify the token via the SupabaseClient. This exercises the full
	//    JWKS lookup-by-kid + signature verification path.
	claims, err := c.VerifyAccessToken(accessToken)
	if err != nil {
		t.Fatalf("VerifyAccessToken: %v", err)
	}
	if claims.UserID != userID {
		t.Errorf("UserID = %q, want %q", claims.UserID, userID)
	}
	if !strings.EqualFold(claims.Email, email) {
		t.Errorf("Email = %q, want %q", claims.Email, email)
	}
	if claims.TenantID != tenantID {
		t.Errorf("TenantID = %q, want %q", claims.TenantID, tenantID)
	}
	if claims.Subdomain != subdomain {
		t.Errorf("Subdomain = %q, want %q", claims.Subdomain, subdomain)
	}
	if claims.Role != "owner" {
		t.Errorf("Role = %q, want owner", claims.Role)
	}
}

func signInWithPassword(projectRef, anonKey, email, password string) (string, error) {
	url := fmt.Sprintf("https://%s.supabase.co/auth/v1/token?grant_type=password", projectRef)
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)
	req.Header.Set("Authorization", "Bearer "+anonKey)

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return "", fmt.Errorf("token endpoint: %d %s", resp.StatusCode, string(raw))
	}
	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.AccessToken, nil
}
