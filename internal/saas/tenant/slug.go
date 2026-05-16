package tenant

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	subdomainRE       = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)
	reservedSubdomain = map[string]struct{}{
		"adm": {}, "admin": {}, "api": {}, "www": {}, "traefik": {}, "litellm": {},
		"postgres": {}, "controlplane": {}, "root": {}, "mail": {},
		"docs": {}, "blog": {}, "status": {},
	}
)

// ValidateSubdomain enforces a DNS-safe subdomain that won't clash with infra.
// Callers should already have lowercased + trimmed the input (the API layer does).
func ValidateSubdomain(s string) error {
	if s != strings.TrimSpace(s) {
		return errors.New("subdomain must not have surrounding whitespace")
	}
	if len(s) < 3 || len(s) > 30 {
		return errors.New("subdomain must be 3-30 chars")
	}
	if !subdomainRE.MatchString(s) {
		return errors.New("subdomain must match ^[a-z0-9](-?[a-z0-9])*$ (lowercase only)")
	}
	if _, bad := reservedSubdomain[s]; bad {
		return fmt.Errorf("subdomain %q is reserved", s)
	}
	return nil
}

// GenerateID returns a tenant id like "alice-7f3a2c" from a subdomain.
func GenerateID(subdomain string) (string, error) {
	if err := ValidateSubdomain(subdomain); err != nil {
		return "", err
	}
	b := make([]byte, 3)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return subdomain + "-" + hex.EncodeToString(b), nil
}
