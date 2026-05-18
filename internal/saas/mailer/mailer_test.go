package mailer

import (
	"strings"
	"testing"
	"time"
)

func TestRenderInvite(t *testing.T) {
	data := InviteData{
		ToEmail:      "maria@example.com",
		TenantName:   "Acme Clínica",
		Role:         "operator",
		RoleLabel:    "Operador(a)",
		InviteURL:    "https://adm.jotaduo.com/accept-invite?token=abc123",
		ExpiresAt:    time.Date(2026, 6, 1, 14, 32, 0, 0, time.UTC),
		SupportEmail: "contato@jotaduo.com",
	}
	html, text, err := RenderInvite(data)
	if err != nil {
		t.Fatalf("RenderInvite: %v", err)
	}
	for _, s := range []string{"Acme Clínica", "Operador(a)", "abc123", "maria@example.com", "contato@jotaduo.com"} {
		if !strings.Contains(html, s) {
			t.Errorf("html missing %q", s)
		}
		if !strings.Contains(text, s) {
			t.Errorf("text missing %q", s)
		}
	}
	if !strings.Contains(html, "#15803d") {
		t.Error("html missing brand color #15803d")
	}
}

func TestBuildMultipart(t *testing.T) {
	msg, err := buildMultipart("from@jotaduo.com", "to@example.com", "Convite — teste", "<p>html</p>", "plain text")
	if err != nil {
		t.Fatalf("buildMultipart: %v", err)
	}
	s := string(msg)
	for _, want := range []string{"From: from@jotaduo.com", "To: to@example.com", "multipart/alternative", "text/plain", "text/html", "<p>html</p>", "plain text"} {
		if !strings.Contains(s, want) {
			t.Errorf("missing %q", want)
		}
	}
	if !strings.Contains(s, "Subject: =?utf-8?B?") {
		t.Error("non-ASCII subject not RFC2047 encoded")
	}
}

func TestEnabled(t *testing.T) {
	if New(Config{Host: "", From: "x@y.com"}).Enabled() {
		t.Error("should be disabled with empty Host")
	}
	if !New(Config{Host: "smtp", From: "x@y.com"}).Enabled() {
		t.Error("should be enabled with Host and From")
	}
}

func TestFromEnvDefaults(t *testing.T) {
	cfg := FromEnv("localhost", 587, "", "", "", "", "https://adm.jotaduo.com/")
	if cfg.From != "contato@jotaduo.com" {
		t.Errorf("default From should be contato@jotaduo.com, got %q", cfg.From)
	}
	if cfg.AdminBaseURL != "https://adm.jotaduo.com" {
		t.Errorf("trailing slash should be trimmed, got %q", cfg.AdminBaseURL)
	}
}
