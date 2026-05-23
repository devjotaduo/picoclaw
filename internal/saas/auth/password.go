package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost matches the picoclaw dashboard auth cost (see
// web/backend/dashboardauth/store.go in picoclaw).
const BcryptCost = 12

func HashPassword(plain string) (string, error) {
	if plain == "" {
		return "", errors.New("password must not be empty")
	}
	b, err := bcrypt.GenerateFromPassword([]byte(plain), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func VerifyPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// GeneratePassword returns a 16-character base64 url-safe password (~96 bits of entropy).
func GeneratePassword() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// RandomToken returns a URL-safe random string with the requested byte length.
// 32 bytes → 43-char token = ~256 bits of entropy — appropriate for
// short-lived one-shot tokens (password resets, magic-link nonces, etc.).
// The output is always base64 RawURLEncoding (no padding) so it survives
// embedding in URL paths and query strings without escaping.
func RandomToken(byteLen int) (string, error) {
	if byteLen <= 0 {
		byteLen = 32
	}
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
