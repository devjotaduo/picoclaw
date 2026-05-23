// PicoClaw - Ultra-lightweight personal AI agent
// License: MIT
//
// Copyright (c) 2026 PicoClaw contributors

package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateBundle_ValidCurrentVersion(t *testing.T) {
	dir := t.TempDir()
	cfg := `{
  "version": 3,
  "agents": {"defaults": {"workspace": "/root/.picoclaw/workspace"}},
  "channel_list": {},
  "model_list": [
    {
      "model_name": "default",
      "provider": "litellm",
      "model": "gpt-4o-mini",
      "api_base": "http://litellm:4000/v1",
      "api_keys": ["sk-test"]
    }
  ]
}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateBundle(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("expected valid bundle, got: %v", err)
	}
}

func TestValidateBundle_RejectsAPIKeySingular(t *testing.T) {
	dir := t.TempDir()
	cfg := `{
  "version": 3,
  "agents": {"defaults": {}},
  "channel_list": {},
  "model_list": [
    {
      "model_name": "default",
      "provider": "litellm",
      "model": "gpt-4o-mini",
      "api_key": "sk-test"
    }
  ]
}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	err := ValidateBundle(filepath.Join(dir, "config.json"))
	if err == nil {
		t.Fatal("expected error for api_key singular, got nil")
	}
	if !strings.Contains(err.Error(), "api_key") {
		t.Errorf("error should mention api_key, got: %v", err)
	}
}

func TestValidateBundle_RejectsBogusSecurityChannels(t *testing.T) {
	dir := t.TempDir()
	cfg := `{
  "version": 3,
  "agents": {"defaults": {}},
  "channel_list": {},
  "model_list": []
}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	sec := "channels:\n  allowed: []\n"
	if err := os.WriteFile(filepath.Join(dir, ".security.yml"), []byte(sec), 0o600); err != nil {
		t.Fatal(err)
	}
	err := ValidateBundle(filepath.Join(dir, "config.json"))
	if err == nil {
		t.Fatal("expected error for channels.allowed in .security.yml, got nil")
	}
	if !strings.Contains(err.Error(), ".security.yml") {
		t.Errorf("error should mention .security.yml, got: %v", err)
	}
}

func TestValidateBundle_OlderVersionSkipped(t *testing.T) {
	dir := t.TempDir()
	// Version 0 — would be migrated at real load. ValidateBundle skips strict
	// schema check on older versions because the migration handles the
	// transformation that brings them into the current shape.
	cfg := `{"version": 0, "agents": {}}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ValidateBundle(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("expected nil for older version, got: %v", err)
	}
}

func TestValidateBundle_MissingSecurityYAML_IsOK(t *testing.T) {
	dir := t.TempDir()
	cfg := `{
  "version": 3,
  "agents": {"defaults": {}},
  "channel_list": {},
  "model_list": []
}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfg), 0o600); err != nil {
		t.Fatal(err)
	}
	// No .security.yml on disk — bundle is still valid.
	if err := ValidateBundle(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("expected valid bundle without .security.yml, got: %v", err)
	}
}
