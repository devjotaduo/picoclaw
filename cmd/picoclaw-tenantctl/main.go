package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/api"
	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "bootstrap-admin":
		if err := cmdBootstrapAdmin(args); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "recreate":
		if err := cmdRecreate(args); err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
	case "-h", "--help", "help":
		usage()
	default:
		fmt.Fprintln(os.Stderr, "unknown command:", cmd)
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `picoclaw-tenantctl — Picoclaw SaaS control-plane CLI

Commands:
  bootstrap-admin --email <email> --password <password> [--reset]
        Create/promote the platform_admin account without changing an existing
        password. Use --reset to intentionally replace the password.

  recreate <tenant-id> [<tenant-id> ...]
        Stop+remove and recreate tenant container(s) from the current
        TENANT_IMAGE so a rebuilt image takes effect. The bind-mounted
        volume is preserved.
`)
}

func cmdRecreate(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("at least one tenant id is required")
	}
	prov, closeFn, err := newProvisioner()
	if err != nil {
		return err
	}
	defer closeFn()

	ctx := context.Background()
	var firstErr error
	for _, id := range args {
		fmt.Printf("recreating tenant %s ...\n", id)
		if err := prov.Recreate(ctx, id); err != nil {
			fmt.Fprintf(os.Stderr, "  %s: %v\n", id, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		fmt.Printf("  %s: ok\n", id)
	}
	return firstErr
}

func newProvisioner() (*tenant.Provisioner, func(), error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, nil, err
	}
	ctx := context.Background()
	db, err := store.Open(ctx, cfg.PGDSN)
	if err != nil {
		return nil, nil, err
	}
	dk, err := tenant.NewDockerClient(cfg.DockerHost)
	if err != nil {
		db.Close()
		return nil, nil, err
	}
	var llm *litellm.Client
	secretsKey, secretKeyErr := api.ResolveSaaSSecretsEncryptionKey(cfg)
	if secretKeyErr == nil {
		if effective, err := api.LoadEffectiveLiteLLMConfig(
			ctx,
			cfg,
			&store.PlatformSettingsStore{DB: db},
			secretsKey,
		); err == nil {
			cfg.LiteLLMURL = effective.URL
			cfg.LiteLLMMasterKey = effective.MasterKey
		}
	}
	if strings.TrimSpace(cfg.LiteLLMURL) != "" && strings.TrimSpace(cfg.LiteLLMMasterKey) != "" {
		llm = litellm.NewClient(cfg.LiteLLMURL, cfg.LiteLLMMasterKey)
	}
	prov := tenant.NewProvisioner(cfg, db, dk, llm)
	return prov, func() {
		_ = dk.Close()
		db.Close()
	}, nil
}

func cmdBootstrapAdmin(args []string) error {
	fs := flag.NewFlagSet("bootstrap-admin", flag.ExitOnError)
	email := fs.String("email", "", "admin email")
	password := fs.String("password", "", "admin password (plaintext, will be bcrypted)")
	reset := fs.Bool("reset", false, "replace password if the admin already exists")
	if err := fs.Parse(args); err != nil {
		return err
	}
	*email = strings.TrimSpace(strings.ToLower(*email))
	if *email == "" || *password == "" {
		return fmt.Errorf("--email and --password are required")
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()
	db, err := store.Open(ctx, cfg.PGDSN)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	hash, err := auth.HashPassword(*password)
	if err != nil {
		return err
	}
	users := &store.UserStore{DB: db}
	var u *store.User
	if *reset {
		u, err = users.ResetPlatformAdminPassword(ctx, *email, hash)
	} else {
		u, err = users.CreatePlatformAdmin(ctx, *email, hash)
	}
	if err != nil {
		return fmt.Errorf("create platform admin: %w", err)
	}
	if *reset {
		fmt.Printf("platform admin password reset: id=%d email=%s\n", u.ID, u.Email)
		return nil
	}
	fmt.Printf("platform admin bootstrapped: id=%d email=%s (existing password preserved if present)\n", u.ID, u.Email)
	return nil
}
