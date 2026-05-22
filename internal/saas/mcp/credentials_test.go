package mcp

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	creds := map[string]string{
		"NOTION_API_KEY": "secret_abcdef",
		"OTHER":          "value",
	}
	cipher, err := EncryptCredentials(creds, key)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if strings.Contains(cipher, "secret_abcdef") {
		t.Error("ciphertext leaks plaintext")
	}
	out, err := DecryptCredentials(cipher, key)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if out["NOTION_API_KEY"] != "secret_abcdef" {
		t.Errorf("got %q, want secret_abcdef", out["NOTION_API_KEY"])
	}
}

func TestDecryptWithWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	for i := range key2 {
		key2[i] = 1
	}
	cipher, err := EncryptCredentials(map[string]string{"K": "v"}, key1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := DecryptCredentials(cipher, key2); err == nil {
		t.Error("expected error decrypting with wrong key")
	}
}

func TestEncryptInvalidKey(t *testing.T) {
	if _, err := EncryptCredentials(map[string]string{}, []byte("too-short")); err == nil {
		t.Error("expected error for short key")
	}
}

func TestLoadEncryptionKey(t *testing.T) {
	// 32 zero bytes, base64-encoded
	b64 := base64.StdEncoding.EncodeToString(make([]byte, 32))
	key, err := LoadEncryptionKey(b64)
	if err != nil {
		t.Fatal(err)
	}
	if len(key) != 32 {
		t.Errorf("got key len %d, want 32", len(key))
	}
	if _, err := LoadEncryptionKey("not-base64-!@#"); err == nil {
		t.Error("expected error for invalid base64")
	}
	if _, err := LoadEncryptionKey(base64.StdEncoding.EncodeToString(make([]byte, 16))); err == nil {
		t.Error("expected error for 16-byte key")
	}
}
