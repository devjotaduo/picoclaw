package api

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/sipeed/picoclaw/internal/saas/config"
)

func TestResolveSaaSSecretsEncryptionKeyPrefersDedicatedKey(t *testing.T) {
	dedicated := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("a", 32)))
	mcpFallback := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("b", 32)))
	t.Setenv("PICOCLAW_SAAS_SECRETS_ENCRYPTION_KEY", dedicated)

	key, err := resolveSaaSSecretsEncryptionKey(&config.Config{MCPEncryptionKey: mcpFallback})
	if err != nil {
		t.Fatal(err)
	}
	if string(key) != strings.Repeat("a", 32) {
		t.Fatalf("got %q, want dedicated key", string(key))
	}
}

func TestResolveSaaSSecretsEncryptionKeyFallsBackToMCPKey(t *testing.T) {
	mcpFallback := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("b", 32)))

	key, err := resolveSaaSSecretsEncryptionKey(&config.Config{MCPEncryptionKey: mcpFallback})
	if err != nil {
		t.Fatal(err)
	}
	if string(key) != strings.Repeat("b", 32) {
		t.Fatalf("got %q, want MCP fallback key", string(key))
	}
}

func TestPlatformSecretEncryptionRoundTripDoesNotLeakPlaintext(t *testing.T) {
	key := []byte(strings.Repeat("c", 32))
	ciphertext, err := encryptPlatformSecret("sk-master-secret", key)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(ciphertext, "sk-master-secret") {
		t.Fatalf("ciphertext leaked plaintext: %s", ciphertext)
	}
	plaintext, err := decryptPlatformSecret(ciphertext, key)
	if err != nil {
		t.Fatal(err)
	}
	if plaintext != "sk-master-secret" {
		t.Fatalf("roundtrip = %q", plaintext)
	}
}
