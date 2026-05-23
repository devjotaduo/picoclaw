// PicoClaw - Ultra-lightweight personal AI agent
// License: MIT
//
// Copyright (c) 2026 PicoClaw contributors

package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
)

// ValidateBundle does a static parse of a workspace's config.json and the
// sibling .security.yml using the current schema. Unlike LoadConfig, it
// performs NO env-var overrides, NO migrations, and NO global side effects
// (no resolver updates, no log emission). It just answers: "would the
// launcher reject this bundle at boot?".
//
// Used by the SaaS provisioner after placeholder substitution to fail
// fast on a malformed workspace template — the tenant container would
// otherwise boot, return 500 on every workspace endpoint, and look
// "active" in the admin UI while being completely unusable.
//
// Behavior on older config versions (0/1/2): returns nil, since the
// launcher would migrate the file at boot and the same migration paths
// have been exercised across the test suite. We only strictly validate
// the current schema (no migration headroom available).
func ValidateBundle(configPath string) error {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("read config.json: %w", err)
	}
	var versionInfo struct {
		Version int `json:"version"`
	}
	if e := json.Unmarshal(data, &versionInfo); e != nil {
		return wrapJSONError(data, e, "config.json")
	}
	if versionInfo.Version != CurrentVersion {
		// Migration runs at actual load — assume it succeeds. Most
		// shape errors that break the launcher are introduced by hand
		// editing a current-version template, not by stale schema.
		return nil
	}
	cfg, err := loadConfig(data)
	if err != nil {
		return fmt.Errorf("config.json: %w", err)
	}
	if err := loadSecurityConfig(cfg, securityPath(configPath)); err != nil &&
		!errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf(".security.yml: %w", err)
	}
	return nil
}
