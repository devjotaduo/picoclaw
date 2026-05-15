package agent

import (
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/providers"
)

func TestBehavior_WithinSchedule_DayOpenAndInWindow(t *testing.T) {
	b := &Behavior{
		Schedule: BehaviorSchedule{
			Monday: BehaviorDay{Open: true, From: "08:00", To: "18:00"},
		},
	}
	// Mon Mar 9 2026 14:00 local
	now := time.Date(2026, 3, 9, 14, 0, 0, 0, time.Local)
	if !b.WithinSchedule(now) {
		t.Fatalf("expected within schedule for Mon 14:00 in 08:00-18:00")
	}
}

func TestBehavior_WithinSchedule_DayClosed(t *testing.T) {
	b := &Behavior{
		Schedule: BehaviorSchedule{
			Sunday: BehaviorDay{Open: false},
		},
	}
	now := time.Date(2026, 3, 8, 14, 0, 0, 0, time.Local) // Sun
	if b.WithinSchedule(now) {
		t.Fatalf("expected outside schedule on closed day")
	}
}

func TestBehavior_WithinSchedule_BeforeAndAfterWindow(t *testing.T) {
	b := &Behavior{
		Schedule: BehaviorSchedule{
			Tuesday: BehaviorDay{Open: true, From: "08:00", To: "18:00"},
		},
	}
	tue7 := time.Date(2026, 3, 10, 7, 30, 0, 0, time.Local)
	tue19 := time.Date(2026, 3, 10, 19, 0, 0, 0, time.Local)
	if b.WithinSchedule(tue7) {
		t.Errorf("07:30 should be before window")
	}
	if b.WithinSchedule(tue19) {
		t.Errorf("19:00 should be after window")
	}
}

func TestBehavior_WithinSchedule_MalformedTreatedAsClosed(t *testing.T) {
	b := &Behavior{
		Schedule: BehaviorSchedule{
			Wednesday: BehaviorDay{Open: true, From: "garbage", To: "18:00"},
		},
	}
	now := time.Date(2026, 3, 11, 10, 0, 0, 0, time.Local) // Wed
	if b.WithinSchedule(now) {
		t.Fatalf("malformed schedule entry should be treated as closed")
	}
}

func TestBehavior_WithinSchedule_NilSafeAndZeroSchedule(t *testing.T) {
	var b *Behavior
	if !b.WithinSchedule(time.Now()) {
		t.Errorf("nil receiver should default to within-schedule (no constraint)")
	}

	bEmpty := &Behavior{}
	// All days closed (zero value) → expect false (not within schedule)
	if bEmpty.WithinSchedule(time.Now()) {
		t.Errorf("zero-valued schedule should be 'closed everyday'")
	}
}

func TestLastAssistantInHistory(t *testing.T) {
	cases := []struct {
		name    string
		history []providers.Message
		want    bool
	}{
		{"empty", nil, false},
		{"only-system", []providers.Message{{Role: "system"}}, false},
		{"user-last", []providers.Message{{Role: "assistant"}, {Role: "user"}}, false},
		{"assistant-last", []providers.Message{{Role: "user"}, {Role: "assistant"}}, true},
		{"system-after-assistant", []providers.Message{{Role: "user"}, {Role: "assistant"}, {Role: "system"}}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := lastAssistantInHistory(tc.history)
			if got != tc.want {
				t.Errorf("lastAssistantInHistory(%v) = %v, want %v", tc.history, got, tc.want)
			}
		})
	}
}

func TestCountUserMessages(t *testing.T) {
	history := []providers.Message{
		{Role: "system"},
		{Role: "user"},
		{Role: "assistant"},
		{Role: "user"},
		{Role: "user"},
	}
	if got := countUserMessages(history); got != 3 {
		t.Errorf("countUserMessages = %d, want 3", got)
	}
	if got := countUserMessages(nil); got != 0 {
		t.Errorf("countUserMessages(nil) = %d, want 0", got)
	}
}

func TestMatchHandoffKeyword(t *testing.T) {
	keywords := []string{"falar com humano", "atendente"}
	cases := []struct {
		content string
		want    bool
	}{
		{"oi", false},
		{"quero FALAR COM HUMANO agora", true},
		{"preciso de um atendente", true},
		{"", false},
	}
	for _, tc := range cases {
		if got := matchHandoffKeyword(tc.content, keywords); got != tc.want {
			t.Errorf("matchHandoffKeyword(%q) = %v, want %v", tc.content, got, tc.want)
		}
	}
	// No keywords configured → always false
	if matchHandoffKeyword("anything", nil) {
		t.Error("nil keywords should never match")
	}
}

func TestMaskPII(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"cpf-punctuated", "Meu CPF é 123.456.789-09 ok?", "Meu CPF é *** ok?"},
		{"cpf-raw", "CPF 12345678909 conferido", "CPF *** conferido"},
		{"email", "Mando para joao.silva@exemplo.com.br", "Mando para ***"},
		{"phone-with-area", "Liga em (11) 98765-4321", "Liga em ***"},
		{"phone-with-country", "Whatsapp +55 11 99999-9999", "Whatsapp ***"},
		{"nothing", "Nada confidencial aqui", "Nada confidencial aqui"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := maskPII(tc.in)
			if got != tc.want {
				t.Errorf("maskPII(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestBehaviorThrottle_Cooldown(t *testing.T) {
	tr := newBehaviorThrottle()
	if !tr.Allow("user1", 0, 1) {
		t.Fatal("first message should pass")
	}
	if tr.Allow("user1", 0, 1) {
		t.Fatal("second message within cooldown should fail")
	}
	// Other user not affected
	if !tr.Allow("user2", 0, 1) {
		t.Fatal("different user should pass independently")
	}
}

func TestBehaviorThrottle_RateLimit(t *testing.T) {
	tr := newBehaviorThrottle()
	for i := 0; i < 3; i++ {
		if !tr.Allow("user", 3, 0) {
			t.Fatalf("message %d should pass", i+1)
		}
	}
	if tr.Allow("user", 3, 0) {
		t.Fatal("4th message in window should be throttled")
	}
}

func TestBehaviorThrottle_Disabled(t *testing.T) {
	tr := newBehaviorThrottle()
	// Both limits 0 → always allow
	for i := 0; i < 100; i++ {
		if !tr.Allow("user", 0, 0) {
			t.Fatal("disabled throttle should never block")
		}
	}
}

func TestParseClock(t *testing.T) {
	cases := []struct {
		s    string
		want int
		ok   bool
	}{
		{"08:00", 480, true},
		{"00:00", 0, true},
		{"23:59", 23*60 + 59, true},
		{"24:00", 0, false}, // hour out of range
		{"08:60", 0, false}, // minute out of range
		{"abc", 0, false},
		{"", 0, false},
		{"8:0", 0, false}, // too short for our minimal validation
	}
	for _, tc := range cases {
		got, ok := parseClock(tc.s)
		if ok != tc.ok || got != tc.want {
			t.Errorf("parseClock(%q) = (%d,%v), want (%d,%v)", tc.s, got, ok, tc.want, tc.ok)
		}
	}
}
