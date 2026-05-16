package tenant

import "testing"

func TestValidateSubdomain(t *testing.T) {
	cases := []struct {
		in   string
		ok   bool
		name string
	}{
		{"alice", true, "valid simple"},
		{"alice-co", true, "valid with hyphen"},
		{"a1b2c3", true, "valid alphanumeric"},
		{"ab", false, "too short"},
		{"a" + repeat("b", 30), false, "too long"},
		{"-alice", false, "leading hyphen"},
		{"alice-", false, "trailing hyphen"},
		{"Alice", false, "uppercase"},
		{"alice_co", false, "underscore"},
		{"alice.co", false, "dot"},
		{"adm", false, "reserved"},
		{"admin", false, "reserved"},
		{"api", false, "reserved"},
		{"www", false, "reserved"},
		{"traefik", false, "reserved"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidateSubdomain(c.in)
			if c.ok && err != nil {
				t.Errorf("want ok, got %v", err)
			}
			if !c.ok && err == nil {
				t.Errorf("want error for %q, got nil", c.in)
			}
		})
	}
}

func TestGenerateID(t *testing.T) {
	id1, err := GenerateID("alice")
	if err != nil {
		t.Fatal(err)
	}
	id2, err := GenerateID("alice")
	if err != nil {
		t.Fatal(err)
	}
	if id1 == id2 {
		t.Errorf("expected different ids on two calls, got %q twice", id1)
	}
	if len(id1) != len("alice-")+6 {
		t.Errorf("unexpected id length: %q", id1)
	}
}

func repeat(s string, n int) string {
	out := ""
	for i := 0; i < n; i++ {
		out += s
	}
	return out
}
