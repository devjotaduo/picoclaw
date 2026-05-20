package api

import (
	"context"
	"testing"
	"time"
)

func TestSlugify(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"Acme Co":           "acme-co",
		"  Café Möller  ":   "caf-m-ller",
		"123":               "123",
		"Multiple   Spaces": "multiple-spaces",
		"!!Sym@bols##":      "sym-bols",
		"":                  "",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRandomShortSuffixFormat(t *testing.T) {
	t.Parallel()
	s, err := randomShortSuffix()
	if err != nil {
		t.Fatalf("randomShortSuffix: %v", err)
	}
	if len(s) != 4 {
		t.Errorf("len = %d, want 4 (hex of 2 bytes)", len(s))
	}
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			t.Errorf("non-hex char %q in suffix %q", c, s)
		}
	}
}

func TestIPDailyLimiter(t *testing.T) {
	t.Parallel()
	l := newIPDailyLimiter(2)
	ip := "1.2.3.4"
	if !l.Allow(ip) {
		t.Fatal("first call should be allowed")
	}
	if !l.Allow(ip) {
		t.Fatal("second call should be allowed")
	}
	if l.Allow(ip) {
		t.Fatal("third call should be denied")
	}
	// Different IPs share no quota.
	if !l.Allow("9.9.9.9") {
		t.Fatal("different IP should have its own quota")
	}
}

func TestIPDailyLimiterResetsAfterWindow(t *testing.T) {
	t.Parallel()
	l := newIPDailyLimiter(1)
	if !l.Allow("ip") {
		t.Fatal("first allow")
	}
	if l.Allow("ip") {
		t.Fatal("second should be denied")
	}
	// Manually rewind the reset time to simulate >24h elapsed.
	l.mu.Lock()
	if st, ok := l.hits["ip"]; ok {
		st.resetsAt = time.Now().Add(-time.Hour)
	}
	l.mu.Unlock()
	if !l.Allow("ip") {
		t.Fatal("after window reset, should be allowed again")
	}
}

func TestIPDailyLimiterNilSafe(t *testing.T) {
	t.Parallel()
	var l *ipDailyLimiter
	if !l.Allow("ip") {
		t.Fatal("nil limiter should allow")
	}
}

// AutoProvisioner.Run is gated by Cfg.AutoProvisionEnabled at construction —
// the constructor returns nil when disabled, so all callers must nil-check.
// Run() on a nil receiver must return ErrAutoProvisionDisabled, not panic.
func TestAutoProvisionerNilRun(t *testing.T) {
	t.Parallel()
	var a *AutoProvisioner
	if _, err := a.Run(context.Background(), nil, "1.2.3.4"); err != ErrAutoProvisionDisabled {
		t.Errorf("Run on nil: got %v, want ErrAutoProvisionDisabled", err)
	}
	if _, err := a.ResendMagicLink(context.Background(), nil); err != ErrAutoProvisionDisabled {
		t.Errorf("ResendMagicLink on nil: got %v, want ErrAutoProvisionDisabled", err)
	}
}
