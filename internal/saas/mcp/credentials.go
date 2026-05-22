package mcp

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// EncryptCredentials serializes creds as JSON and seals it with AES-256-GCM.
// Returns a base64-encoded "<nonce>|<ciphertext>" string for storage.
// The key must be exactly 32 bytes.
func EncryptCredentials(creds map[string]string, key []byte) (string, error) {
	if len(key) != 32 {
		return "", fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	plaintext, err := json.Marshal(creds)
	if err != nil {
		return "", fmt.Errorf("marshal creds: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}
	sealed := gcm.Seal(nil, nonce, plaintext, nil)
	// Pack as base64(nonce) + "|" + base64(ciphertext) — split avoids needing
	// to know GCM nonce size at decrypt time.
	return base64.StdEncoding.EncodeToString(nonce) + "|" + base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptCredentials reverses EncryptCredentials.
func DecryptCredentials(blob string, key []byte) (map[string]string, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes, got %d", len(key))
	}
	parts := splitPipe(blob)
	if len(parts) != 2 {
		return nil, fmt.Errorf("malformed blob")
	}
	nonce, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("decode nonce: %w", err)
	}
	sealed, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("decode ciphertext: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plaintext, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return nil, fmt.Errorf("gcm open (wrong key or tampered blob): %w", err)
	}
	var out map[string]string
	if err := json.Unmarshal(plaintext, &out); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return out, nil
}

// LoadEncryptionKey decodes a base64-encoded 32-byte key from env-var format.
func LoadEncryptionKey(b64 string) ([]byte, error) {
	if b64 == "" {
		return nil, fmt.Errorf("empty key")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("decode base64: %w", err)
	}
	if len(raw) != 32 {
		return nil, fmt.Errorf("decoded key must be 32 bytes, got %d", len(raw))
	}
	return raw, nil
}

func splitPipe(s string) []string {
	for i := 0; i < len(s); i++ {
		if s[i] == '|' {
			return []string{s[:i], s[i+1:]}
		}
	}
	return []string{s}
}
