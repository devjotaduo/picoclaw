package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// SaaSAdminConfig pulls the controlplane connection params from env vars.
// All four are required for /api/admin/saas/* endpoints to work; if any is
// empty those handlers return 503 with a clear message.
//
//   - PICOCLAW_SAAS_BASE_URL  : e.g. https://adm.jotaduo.com (or the
//                              container DNS http://controlplane:8080)
//   - PICOCLAW_SAAS_EMAIL     : platform_admin email
//   - PICOCLAW_SAAS_PASSWORD  : password for that account
//   - PICOCLAW_SAAS_ADMIN_MODE: must be "true" to expose the proxy and the
//                              sidebar group on the frontend
type SaaSAdminConfig struct {
	BaseURL   string
	Email     string
	Password  string
	AdminMode bool
}

func loadSaaSAdminConfig() SaaSAdminConfig {
	return SaaSAdminConfig{
		BaseURL:   strings.TrimRight(strings.TrimSpace(os.Getenv("PICOCLAW_SAAS_BASE_URL")), "/"),
		Email:     strings.TrimSpace(os.Getenv("PICOCLAW_SAAS_EMAIL")),
		Password:  strings.TrimSpace(os.Getenv("PICOCLAW_SAAS_PASSWORD")),
		AdminMode: strings.EqualFold(strings.TrimSpace(os.Getenv("PICOCLAW_SAAS_ADMIN_MODE")), "true"),
	}
}

// Ready is true when the launcher has enough config to call the controlplane
// on behalf of the dashboard user.
func (c SaaSAdminConfig) Ready() bool {
	return c.AdminMode && c.BaseURL != "" && c.Email != "" && c.Password != ""
}

// saasAdminClient keeps a single authenticated session with the controlplane
// shared by every dashboard request. The first call lazily POSTs /auth/login
// and parses the Set-Cookie header by hand; subsequent calls re-send the
// session cookie literally. We don't use http.CookieJar because the
// controlplane emits cookies with Domain=<base>; Secure and the launcher
// often talks to it via http://127.0.0.1:18801 — the jar would silently
// reject the cookie. Bypassing the jar lets us authenticate over plaintext
// loopback safely (the credential never leaves the host).
type saasAdminClient struct {
	cfg SaaSAdminConfig

	mu          sync.Mutex
	http        *http.Client
	session     string // raw value of picoclaw_saas_session cookie
	lastLoginAt time.Time
}

const saasSessionCookieName = "picoclaw_saas_session"

func newSaaSAdminClient(cfg SaaSAdminConfig) (*saasAdminClient, error) {
	if !cfg.Ready() {
		return nil, errors.New("saas admin not configured")
	}
	return &saasAdminClient{
		cfg:  cfg,
		http: &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// ensureSession logs in if no session token cached. Caller must hold mu.
func (c *saasAdminClient) ensureSession(ctx context.Context) error {
	if c.session != "" {
		return nil
	}
	body, _ := json.Marshal(map[string]string{
		"email":    c.cfg.Email,
		"password": c.cfg.Password,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+"/api/v1/auth/login", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("login: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		return fmt.Errorf("login %d: %s", res.StatusCode, strings.TrimSpace(string(buf)))
	}
	// Extract the controlplane session cookie regardless of its Domain/Secure
	// attributes — we're acting as a trusted server-side client, not a
	// browser, so those attributes don't protect us here.
	for _, cookie := range res.Cookies() {
		if cookie.Name == saasSessionCookieName && cookie.Value != "" {
			c.session = cookie.Value
			c.lastLoginAt = time.Now()
			return nil
		}
	}
	return fmt.Errorf("login: response missing %s cookie", saasSessionCookieName)
}

// Do executes an authenticated request against the controlplane. The path is
// the controlplane-relative path including /api/v1/... prefix. On 401 it
// drops the session and retries once.
func (c *saasAdminClient) Do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if err := c.ensureSession(ctx); err != nil {
		return nil, err
	}

	res, err := c.doOnce(ctx, method, path, body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode == http.StatusUnauthorized {
		// session expired — force re-login once.
		_ = res.Body.Close()
		c.session = ""
		if err := c.ensureSession(ctx); err != nil {
			return nil, err
		}
		return c.doOnce(ctx, method, path, body)
	}
	return res, nil
}

func (c *saasAdminClient) doOnce(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	target, err := url.Parse(c.cfg.BaseURL + path)
	if err != nil {
		return nil, err
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target.String(), reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.session != "" {
		req.AddCookie(&http.Cookie{Name: saasSessionCookieName, Value: c.session})
	}
	return c.http.Do(req)
}
