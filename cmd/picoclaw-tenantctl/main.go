package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
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
  bootstrap-admin --email <email> --password <password>
        Create or replace the platform_admin account. One-shot bootstrap; do not expose via HTTP.

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
	dk, err := tenant.NewDockerClient(cfg.DockerHost)
	if err != nil {
		return err
	}
	defer dk.Close()
	prov := tenant.NewProvisioner(cfg, db, dk, nil)
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

func cmdBootstrapAdmin(args []string) error {
	fs := flag.NewFlagSet("bootstrap-admin", flag.ExitOnError)
	email := fs.String("email", "", "admin email")
	password := fs.String("password", "", "admin password (plaintext, will be bcrypted)")
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
	u, err := users.CreatePlatformAdmin(ctx, *email, hash)
	if err != nil {
		return fmt.Errorf("create platform admin: %w", err)
	}
	fmt.Printf("platform admin bootstrapped: id=%d email=%s\n", u.ID, u.Email)
	return nil
}
