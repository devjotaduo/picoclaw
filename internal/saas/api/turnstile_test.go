package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVerifyTurnstileTokenPostsExpectedForm(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("Content-Type"); got != "application/x-www-form-urlencoded" {
			t.Fatalf("Content-Type = %q", got)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm: %v", err)
		}
		if got := r.Form.Get("secret"); got != "secret-1" {
			t.Fatalf("secret = %q", got)
		}
		if got := r.Form.Get("response"); got != "token-1" {
			t.Fatalf("response = %q", got)
		}
		if got := r.Form.Get("remoteip"); got != "203.0.113.10" {
			t.Fatalf("remoteip = %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true}`))
	}))
	defer srv.Close()

	ok, err := verifyTurnstileToken(context.Background(), srv.Client(), srv.URL, "secret-1", "token-1", "203.0.113.10")
	if err != nil {
		t.Fatalf("verifyTurnstileToken err = %v", err)
	}
	if !ok {
		t.Fatal("verifyTurnstileToken ok = false, want true")
	}
}

func TestVerifyTurnstileTokenRejectsFailedChallenge(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":false,"error-codes":["invalid-input-response"]}`))
	}))
	defer srv.Close()

	ok, err := verifyTurnstileToken(context.Background(), srv.Client(), srv.URL, "secret-1", "bad-token", "")
	if err != nil {
		t.Fatalf("verifyTurnstileToken err = %v", err)
	}
	if ok {
		t.Fatal("verifyTurnstileToken ok = true, want false")
	}
}

func TestVerifyTurnstileTokenReturnsErrorOnServiceFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"success":false}`, http.StatusBadGateway)
	}))
	defer srv.Close()

	ok, err := verifyTurnstileToken(context.Background(), srv.Client(), srv.URL, "secret-1", "token-1", "")
	if err == nil || !strings.Contains(err.Error(), "turnstile status 502") {
		t.Fatalf("err = %v, want status error", err)
	}
	if ok {
		t.Fatal("verifyTurnstileToken ok = true, want false")
	}
}
