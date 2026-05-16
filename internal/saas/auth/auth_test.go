package auth

import (
	"strings"
	"testing"
)

func TestHashPassword(t *testing.T) {
	t.Run("empty returns error", func(t *testing.T) {
		_, err := HashPassword("")
		if err == nil {
			t.Fatal("want error for empty password")
		}
	})

	t.Run("valid password produces bcrypt hash", func(t *testing.T) {
		hash, err := HashPassword("secret123")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(hash, "$2") {
			t.Fatalf("hash %q does not look like bcrypt", hash)
		}
	})

	t.Run("same input hashes differently each time due to salt", func(t *testing.T) {
		h1, _ := HashPassword("same")
		h2, _ := HashPassword("same")
		if h1 == h2 {
			t.Fatal("bcrypt hashes must differ between calls (unique salt)")
		}
	})
}

func TestVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct")
	if err != nil {
		t.Fatal(err)
	}

	if !VerifyPassword(hash, "correct") {
		t.Fatal("want true for correct password")
	}
	if VerifyPassword(hash, "wrong") {
		t.Fatal("want false for wrong password")
	}
	if VerifyPassword("not-a-valid-hash", "any") {
		t.Fatal("want false for invalid hash — must not panic")
	}
	if VerifyPassword("", "") {
		t.Fatal("want false for empty hash")
	}
}

func TestGeneratePassword(t *testing.T) {
	p1, err := GeneratePassword()
	if err != nil {
		t.Fatal(err)
	}
	if len(p1) < 16 {
		t.Fatalf("password %q too short (%d chars), want ≥ 16", p1, len(p1))
	}

	p2, err := GeneratePassword()
	if err != nil {
		t.Fatal(err)
	}
	if p1 == p2 {
		t.Fatal("consecutive GeneratePassword calls must return distinct values")
	}
}

func TestHashAndVerifyRoundtrip(t *testing.T) {
	passwords := []string{"short", "correct-horse-battery-staple", "1234567890", "Ação!@#$%"}
	for _, pw := range passwords {
		hash, err := HashPassword(pw)
		if err != nil {
			t.Fatalf("HashPassword(%q): %v", pw, err)
		}
		if !VerifyPassword(hash, pw) {
			t.Errorf("VerifyPassword round-trip failed for %q", pw)
		}
	}
}
