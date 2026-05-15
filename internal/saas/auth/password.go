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
