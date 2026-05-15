package alert

import (
	"strings"
	"testing"
	"time"
)

func TestBuildMessage(t *testing.T) {
	got := string(buildMessage("alerts@example.com", []string{"ops@example.com", "oncall@example.com"}, "subj", "body line"))
	for _, want := range []string{
		"From: alerts@example.com\r\n",
		"To: ops@example.com, oncall@example.com\r\n",
		"Subject: subj\r\n",
		"MIME-Version: 1.0\r\n",
		"\r\n\r\nbody line",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("message missing %q\ngot:\n%s", want, got)
		}
	}
}

func TestConfigFromEnv(t *testing.T) {
	c := ConfigFromEnv("smtp.example.com", 587, "u", "p", "from@x", "a@x, b@x,, c@x")
	if c.Host != "smtp.example.com" || c.Port != 587 {
		t.Errorf("host/port wrong: %+v", c)
	}
	if len(c.To) != 3 {
		t.Errorf("want 3 recipients, got %d: %v", len(c.To), c.To)
	}
	if !c.Enabled() {
		t.Error("should be enabled")
	}
}

func TestConfigDisabledWhenIncomplete(t *testing.T) {
	for _, c := range []Config{
		{},
		{Host: "x", To: []string{"y"}}, // missing From
		{Host: "x", From: "f"},         // missing To
		{From: "f", To: []string{"y"}}, // missing Host
	} {
		if c.Enabled() {
			t.Errorf("config should be disabled: %+v", c)
		}
	}
}

func TestNotifierCooldownSuppressesRepeats(t *testing.T) {
	// Use a disabled config so Notify is a pure no-op; we only inspect cooldown state.
	n := New(Config{Cooldown: time.Minute})
	n.Notify("key1", "subj", "body")
	first := n.lastSent["key1"]
	n.Notify("key1", "subj", "body")
	second := n.lastSent["key1"]
	if !first.Equal(second) {
		t.Errorf("cooldown should have suppressed second notify; first=%v second=%v", first, second)
	}
}
