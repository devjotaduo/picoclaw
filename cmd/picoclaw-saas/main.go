package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/alert"
	"github.com/sipeed/picoclaw/internal/saas/api"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/mailer"
	"github.com/sipeed/picoclaw/internal/saas/reconciler"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	db, err := store.Open(ctx, cfg.PGDSN)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		return err
	}

	dk, err := tenant.NewDockerClient(cfg.DockerHost)
	if err != nil {
		return err
	}
	defer dk.Close()

	var llm *litellm.Client
	if cfg.LiteLLMURL != "" && cfg.LiteLLMMasterKey != "" {
		llm = litellm.NewClient(cfg.LiteLLMURL, cfg.LiteLLMMasterKey)
	} else {
		log.Println("LiteLLM not configured — tenants will be provisioned without virtual keys")
	}

	prov := tenant.NewProvisioner(cfg, db, dk, llm)
	mlr := mailer.New(mailer.FromEnv(
		cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword,
		cfg.AlertFrom, cfg.MailerFrom, cfg.MailerAdminURL,
	))
	if !mlr.Enabled() {
		log.Println("mailer: SMTP not configured — invite emails will be no-op")
	}
	h := api.NewHandler(cfg, db, prov, mlr)
	h.StartBackground(ctx)

	if llm != nil {
		poller := &reconciler.UsagePoller{DB: db, LiteLLM: llm, Interval: 5 * time.Minute}
		go poller.Run(ctx)
	}

	rec := &reconciler.Reconciler{
		DB:          db,
		Docker:      dk,
		LiteLLM:     llm,
		BackupDir:   cfg.TenantHostDataDir + "/../backups/deleted",
		HostDataDir: cfg.TenantHostDataDir,
		Interval:    30 * time.Second,
	}
	go rec.Run(ctx)

	alertCfg := alert.ConfigFromEnv(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUsername, cfg.SMTPPassword, cfg.AlertFrom, cfg.AlertTo)
	notifier := alert.New(alertCfg)
	alertPoller := &alert.Poller{
		DB:               db,
		Notifier:         notifier,
		DataDir:          cfg.TenantHostDataDir,
		DiskThresholdPct: cfg.AlertDiskThresholdPct,
		Interval:         5 * time.Minute,
	}
	go alertPoller.Run(ctx)

	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           h.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		// WriteTimeout must accommodate the longest-lived response on the
		// controlplane, which is the SSE proxy of /api/public/chat/stream
		// to the tenant gateway (visitor → controlplane → tenant launcher
		// → gateway). Each agent reply via claude-cli can take 60–180s
		// with a tool-call iteration. At WriteTimeout=60s (the original
		// value), the controlplane killed the SSE connection exactly when
		// the long reply was about to arrive — saudação rápida (~25s)
		// chegava, qualquer turn com tool call era cortado em ~60s.
		// Validated live 2026-05-28 (HTTPS access log: 60017ms then 504).
		// 15min is well beyond any realistic Sofia turn (Sonnet 4.5) while
		// still reaping zombie clients; pairs with the gateway's
		// pkg/channels/manager.go WriteTimeout=10min.
		WriteTimeout: 15 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("controlplane listening on %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		log.Println("shutdown signal received")
	case err := <-errCh:
		return err
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}
