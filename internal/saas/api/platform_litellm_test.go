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

func TestNormalizePlatformLiteLLMModelReqGeminiShortName(t *testing.T) {
	req := normalizePlatformLiteLLMModelReq(platformLiteLLMModelReq{
		ModelName:         " gemini-3.1-pro-preview ",
		Model:             " gemini-3.1-pro-preview ",
		CustomLLMProvider: "google",
		APIKey:            " os.environ/GEMINI_API_KEY ",
	})

	if req.ModelName != "gemini-3.1-pro-preview" {
		t.Fatalf("model name = %q", req.ModelName)
	}
	if req.Model != "gemini/gemini-3.1-pro-preview" {
		t.Fatalf("model = %q", req.Model)
	}
	if req.CustomLLMProvider != "gemini" {
		t.Fatalf("provider = %q", req.CustomLLMProvider)
	}
	if req.APIKey != "os.environ/GEMINI_API_KEY" {
		t.Fatalf("api key = %q", req.APIKey)
	}
}

func TestNormalizePlatformLiteLLMModelReqInfersGeminiProvider(t *testing.T) {
	req := normalizePlatformLiteLLMModelReq(platformLiteLLMModelReq{
		ModelName: "gemini-preview",
		Model:     "gemini/gemini-3.1-pro-preview",
	})

	if req.Model != "gemini/gemini-3.1-pro-preview" {
		t.Fatalf("model = %q", req.Model)
	}
	if req.CustomLLMProvider != "gemini" {
		t.Fatalf("provider = %q", req.CustomLLMProvider)
	}
}

func TestNormalizePlatformLiteLLMModelReqKeepsOpenRouterModel(t *testing.T) {
	req := normalizePlatformLiteLLMModelReq(platformLiteLLMModelReq{
		ModelName:         "openrouter-gemini",
		Model:             "openrouter/google/gemini-2.5-pro",
		CustomLLMProvider: "openrouter",
	})

	if req.Model != "openrouter/google/gemini-2.5-pro" {
		t.Fatalf("model = %q", req.Model)
	}
	if req.CustomLLMProvider != "openrouter" {
		t.Fatalf("provider = %q", req.CustomLLMProvider)
	}
}
