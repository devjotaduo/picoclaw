// jotaduo-wa-sidecar — long-running service that owns Jotaduo's institutional
// WhatsApp pairing and exposes a tiny HTTP API so multiple public tenants can
// send/receive messages on Jotaduo's behalf without each running their own
// whatsmeow client.
//
// Why this exists: whatsmeow enforces one active device per pairing. Bind-
// mounting the same store.db into N tenant containers would cause SQLite
// locking and trigger WhatsApp's "duplicate device" disconnect on the real
// number. The sidecar centralises the single allowed connection.
//
// Architecture: the sidecar runs alongside the controlplane in docker-compose.
// Public tenants call POST /internal/wa/send with an HMAC-signed body to
// dispatch outbound messages. Inbound messages from leads are routed back to
// the correct tenant via a phone→tenant_id mapping (see internal/jotaduowa
// routing.go). At promotion, the controlplane calls
// DELETE /internal/wa/routing/by-tenant/{id} to revoke a tenant's access.
//
// The QR pairing flow is exposed at GET /pair (HTML) for the operator to
// scan once on initial setup. The pairing persists in the store.db on the
// bind-mounted volume across container restarts.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/sipeed/picoclaw/internal/jotaduowa"
)

func main() {
	listen := flag.String("listen", envOr("JOTADUO_WA_LISTEN", ":18810"), "HTTP listen address")
	storeDir := flag.String("store-dir", envOr("JOTADUO_WA_STORE_DIR", "/var/lib/jotaduo-wa"), "directory for store.db + routing.db")
	flag.Parse()

	secret := strings.TrimSpace(os.Getenv("JOTADUO_WA_HMAC_SECRET"))
	if secret == "" {
		log.Fatal("JOTADUO_WA_HMAC_SECRET is required")
	}
	adminToken := strings.TrimSpace(os.Getenv("JOTADUO_WA_ADMIN_TOKEN"))
	if adminToken == "" {
		log.Fatal("JOTADUO_WA_ADMIN_TOKEN is required (gates /pair + /qr endpoints)")
	}
	// Compose convention: tenant containers are named tenant-<id> on the
	// saas_edge network, listening on 18800 (picoclaw-launcher default).
	// Operators can override (e.g. for HA with reverse proxies) but the
	// pattern MUST keep the "{id}" placeholder; the dispatcher refuses
	// patterns without it to prevent cross-tenant delivery accidents.
	tenantPattern := envOr("JOTADUO_WA_TENANT_URL_PATTERN", "http://tenant-{id}:18800")

	if err := os.MkdirAll(*storeDir, 0o700); err != nil {
		log.Fatalf("create store dir %s: %v", *storeDir, err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	routing, err := jotaduowa.OpenRouting(*storeDir)
	if err != nil {
		log.Fatalf("open routing store: %v", err)
	}
	defer routing.Close()

	wa, err := jotaduowa.NewWhatsApp(*storeDir)
	if err != nil {
		log.Fatalf("init whatsapp: %v", err)
	}

	// Wire inbound dispatch BEFORE Start so the very first event (which may
	// arrive immediately if whatsmeow had unread messages queued from a prior
	// session) gets routed instead of dropped.
	dispatcher := jotaduowa.NewDispatcher(routing, secret, tenantPattern)
	wa.SetInboundHandler(dispatcher.Dispatch)

	if err := wa.Start(ctx); err != nil {
		log.Fatalf("start whatsapp: %v", err)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = wa.Stop(shutdownCtx)
	}()

	srv := jotaduowa.NewServer(jotaduowa.ServerConfig{
		HMACSecret: secret,
		AdminToken: adminToken,
		WhatsApp:   wa,
		Routing:    routing,
	})

	httpSrv := &http.Server{
		Addr:              *listen,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("jotaduo-wa-sidecar: listening on %s (store=%s)", *listen, *storeDir)
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("jotaduo-wa-sidecar: shutdown requested")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := httpSrv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http shutdown: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
