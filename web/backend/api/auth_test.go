package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/gatewayauth"
	"github.com/sipeed/picoclaw/web/backend/middleware"
)

type fakePasswordStore struct {
	initialized bool
	email       string
	password    string
	err         error
}

func (s *fakePasswordStore) IsInitialized(context.Context) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.initialized, nil
}

func (s *fakePasswordStore) SetPassword(_ context.Context, plain string) error {
	if s.err != nil {
		return s.err
	}
	s.password = plain
	s.initialized = true
	return nil
}

func (s *fakePasswordStore) VerifyPassword(_ context.Context, plain string) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.initialized && plain == s.password, nil
}

func (s *fakePasswordStore) VerifyLogin(_ context.Context, email, plain string) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	if !s.initialized || plain != s.password {
		return false, nil
	}
	if s.email == "" {
		return true, nil
	}
	return strings.EqualFold(strings.TrimSpace(email), strings.TrimSpace(s.email)), nil
}

func TestLauncherAuthLoginAndStatus(t *testing.T) {
	const password = "dashboard-test-password"
	const email = "owner@example.com"
	const sess = "session-cookie-value"
	store := &fakePasswordStore{initialized: true, email: email, password: password}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: sess,
		PasswordStore: store,
	})

	t.Run("status_unauthenticated", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/status", nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("status code = %d", rec.Code)
		}
		var body struct {
			Authenticated bool `json:"authenticated"`
			Initialized   bool `json:"initialized"`
		}
		if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Authenticated {
			t.Fatalf("unexpected authenticated=true: %+v", body)
		}
	})

	t.Run("login_ok", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"`+email+`","password":"`+password+`"}`))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "127.0.0.1:12345"
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("login code = %d body=%s", rec.Code, rec.Body.String())
		}
		cookies := rec.Result().Cookies()
		if len(cookies) != 1 || cookies[0].Name != middleware.LauncherDashboardCookieName {
			t.Fatalf("cookies = %#v", cookies)
		}
	})

	t.Run("login_rejects_wrong_email", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"other@example.com","password":"`+password+`"}`))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "127.0.0.2:12345"
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("login code = %d body=%s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "invalid credentials") {
			t.Fatalf("body = %s", rec.Body.String())
		}
	})

	t.Run("status_authenticated", func(t *testing.T) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/auth/status", nil)
		req.AddCookie(&http.Cookie{Name: middleware.LauncherDashboardCookieName, Value: sess})
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status code = %d", rec.Code)
		}
		if !bytes.Contains(rec.Body.Bytes(), []byte(`"authenticated":true`)) {
			t.Fatalf("body = %s", rec.Body.String())
		}
		if strings.Contains(rec.Body.String(), "token_help") {
			t.Fatalf("authenticated response should omit token_help: %s", rec.Body.String())
		}
	})
}

func TestLauncherAuthUninitializedStoreRequiresSetup(t *testing.T) {
	const sess = "session-cookie-value"
	store := &fakePasswordStore{}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: sess,
		PasswordStore: store,
	})

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d body=%s", rec.Code, rec.Body.String())
	}

	var body struct {
		Authenticated bool `json:"authenticated"`
		Initialized   bool `json:"initialized"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Initialized {
		t.Fatalf("initialized = true, want false before setup")
	}
	if body.Authenticated {
		t.Fatalf("unexpected authenticated=true: %+v", body)
	}

	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"owner@example.com","password":"not-set-yet"}`))
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("login before setup code = %d body=%s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(
		http.MethodPost,
		"/api/auth/setup",
		strings.NewReader(`{"password":"12345678","confirm":"12345678"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("setup code = %d body=%s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"owner@example.com","password":"12345678"}`))
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login after setup code = %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestLauncherAuthSetupRequiresSessionWhenInitialized(t *testing.T) {
	const sess = "session-cookie-value"
	store := &fakePasswordStore{initialized: true, password: "old-password"}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: sess,
		PasswordStore: store,
	})

	body := strings.NewReader(`{"password":"new-password","confirm":"new-password"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("setup without session code = %d body=%s", rec.Code, rec.Body.String())
	}

	body = strings.NewReader(`{"password":"new-password","confirm":"new-password"}`)
	req = httptest.NewRequest(http.MethodPost, "/api/auth/setup", body)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: middleware.LauncherDashboardCookieName, Value: sess})
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("setup with session code = %d body=%s", rec.Code, rec.Body.String())
	}
	if store.password != "new-password" {
		t.Fatalf("password = %q, want new-password", store.password)
	}
}

func TestLauncherAuthInitialSetupAllowsDirectSetup(t *testing.T) {
	store := &fakePasswordStore{}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
		PasswordStore: store,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/setup",
		strings.NewReader(`{"password":"12345678","confirm":"12345678"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("setup without grant code = %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestLauncherAuthStoreUnavailableFailsClosed(t *testing.T) {
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
		StoreError:    errors.New("open auth store"),
	})

	for _, tc := range []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "status", method: http.MethodGet, path: "/api/auth/status"},
		{name: "login", method: http.MethodPost, path: "/api/auth/login", body: `{"email":"owner@example.com","password":"password"}`},
		{name: "setup", method: http.MethodPost, path: "/api/auth/setup", body: `{"password":"12345678","confirm":"12345678"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			mux.ServeHTTP(rec, req)
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("code = %d body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestLauncherAuthForgotPasswordIsGeneric(t *testing.T) {
	store := &fakePasswordStore{initialized: true, email: "owner@example.com", password: "correct-password"}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
		PasswordStore: store,
	})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(`{"email":"owner@example.com"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:12345"
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("code = %d body=%s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.2:12345"
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("bad json code = %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestLauncherAuthLogoutRequiresPostAndJSON(t *testing.T) {
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
	})

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/auth/logout", nil))
	if rec.Code != http.StatusMethodNotAllowed && rec.Code != http.StatusNotFound {
		t.Fatalf("GET logout: code = %d (expected 404 or 405)", rec.Code)
	}

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	mux.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("wrong content-type: code = %d body=%s", rec2.Code, rec2.Body.String())
	}

	rec3 := httptest.NewRecorder()
	req3 := httptest.NewRequest(http.MethodPost, "/api/auth/logout", strings.NewReader(`{}`))
	req3.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec3, req3)
	if rec3.Code != http.StatusOK {
		t.Fatalf("POST json logout: code = %d", rec3.Code)
	}
}

func TestLauncherAuthLoginRateLimit(t *testing.T) {
	store := &fakePasswordStore{initialized: true, password: "correct-password"}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
		PasswordStore: store,
	})

	// 11 failing logins by wrong password; each consumes allow() slot after valid JSON.
	wrongBody := `{"email":"owner@example.com","password":"wrong"}`
	for i := 0; i < loginAttemptsPerIP; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(wrongBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "192.168.5.5:9999"
		mux.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("iter %d: want 401 got %d %s", i, rec.Code, rec.Body.String())
		}
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(wrongBody))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.168.5.5:9999"
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("11th attempt: want 429 got %d %s", rec.Code, rec.Body.String())
	}
}

func TestLoginRateLimiterWindow(t *testing.T) {
	l := newLoginRateLimiter()
	t0 := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return t0 }
	for i := 0; i < loginAttemptsPerIP; i++ {
		if !l.allow("ip") {
			t.Fatalf("want allow at %d", i)
		}
	}
	if l.allow("ip") {
		t.Fatal("want deny on 11th")
	}
	l.now = func() time.Time { return t0.Add(loginAttemptWindow + time.Second) }
	if !l.allow("ip") {
		t.Fatal("want allow after window")
	}
}

func TestReferrerPolicyMiddleware(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	h := middleware.ReferrerPolicyNoReferrer(next)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Fatalf("Referrer-Policy = %q", got)
	}
}

// TestLauncherAuthSetupAcceptsTrustedGateway verifies that POST /api/auth/setup
// succeeds when the request carries valid trusted-gateway HMAC headers, even if
// no local session cookie is present. This covers the SaaS tenant flow where the
// controlplane authenticates the user and forwards requests with signed headers.
func TestLauncherAuthSetupAcceptsTrustedGateway(t *testing.T) {
	const (
		sess   = "local-session-value"
		secret = "test-shared-secret"
	)
	store := &fakePasswordStore{initialized: true, password: "old-password"}
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: sess,
		PasswordStore: store,
	})
	// Wrap with trusted-gateway auth middleware (mirrors main.go stack).
	handler := middleware.LauncherDashboardAuth(middleware.LauncherDashboardAuthConfig{
		ExpectedCookie:       sess,
		AuthMode:             "trusted_gateway",
		TrustedGatewaySecret: secret,
	}, mux)

	body := strings.NewReader(`{"password":"new-password12","confirm":"new-password12"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", body)
	req.Header.Set("Content-Type", "application/json")
	// Sign the request as the gateway would.
	gatewayauth.AnnotateRequest(req, secret, gatewayauth.Claims{
		TenantID:  "tenant-1",
		UserID:    "user-1",
		UserEmail: "owner@example.com",
		Role:      "owner",
	}, time.Now())

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("setup via trusted gateway: code = %d body=%s", rec.Code, rec.Body.String())
	}
	if store.password != "new-password12" {
		t.Fatalf("password not updated: %q", store.password)
	}
}

func TestLauncherAuthLogoutEmptyBody(t *testing.T) {
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Body = http.NoBody
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
}

func TestLauncherAuthLogoutRejectsTrailingJSON(t *testing.T) {
	mux := http.NewServeMux()
	RegisterLauncherAuthRoutes(mux, LauncherAuthRouteOpts{
		SessionCookie: "session-cookie-value",
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", strings.NewReader(`{}{}`))
	req.Header.Set("Content-Type", "application/json")
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400 got %d %s", rec.Code, rec.Body.String())
	}
}
