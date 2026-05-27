package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/mailer"
	"github.com/sipeed/picoclaw/internal/saas/mcp"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type Handler struct {
	Cfg            *config.Config
	Users          *store.UserStore
	Sessions       *store.SessionStore
	Memberships    *store.MembershipStore
	Invites        *store.InviteStore
	Audit          *store.AuditStore
	Tenants        *store.TenantStore
	Workspaces     *store.WorkspaceStore
	CompanyIntakes *store.CompanyIntakeStore
	MagicLinks     *store.MagicLinkStore
	PasswordResets *store.PasswordResetStore
	Shortlinks     *store.ShortlinkStore
	Usage          *store.UsageStore
	MCP            *store.WorkspaceMCPStore
	// MCPEncKey is the decoded AES-256-GCM key (32 bytes) used to seal
	// per-workspace MCP credentials. Nil when PICOCLAW_SAAS_MCP_ENCRYPTION_KEY
	// is unset or invalid; PUT /api/v1/workspaces/{id}/mcp/* then returns 503.
	MCPEncKey      []byte
	Provisioner    *tenant.Provisioner
	LoginAttempts  *loginAttempts
	ClaraRateLimit *rateLimiter
	// PublicChatRateLimit caps anonymous traffic to the public-onboarding
	// tenant's chat endpoints (matched by isPublicChatRoute). Anonymous
	// POST + SSE on the open internet needs SOME backstop — this is the
	// in-process baseline; pair with Cloudflare Turnstile / WAF for
	// stronger mitigation. Default: 60 hits / 1 min / IP (chat needs
	// more headroom than the 5-min login limiter).
	PublicChatRateLimit *rateLimiter
	CRM                 *crmClient
	Mailer              *mailer.Mailer
	// Supabase is the optional Auth client for tenants whose dashboard logins
	// are gated by Supabase JWT instead of the legacy local sessions table.
	// Nil when SUPABASE_* env vars are unset — controlplane stays fully
	// functional on the legacy auth path.
	Supabase *auth.SupabaseClient
	// AutoProvision wires Clara's mark_qualified directly to a tenant
	// container + Supabase user. Nil when PICOCLAW_SAAS_AUTO_PROVISION=false.
	AutoProvision *AutoProvisioner
	// Reminders schedules + cancels nudge emails for the onboarding flow.
	// Same lifecycle as AutoProvision (only meaningful when that's on).
	Reminders *store.IntakeReminderStore
	// ReminderWorker drains the queue in the background. Started by Routes().
	// Nil when prerequisites (mailer + auto-provision) aren't satisfied.
	ReminderWorker *ReminderWorker
	adminRoutes    http.Handler
}

func NewHandler(cfg *config.Config, db *store.DB, prov *tenant.Provisioner, mlr *mailer.Mailer) *Handler {
	h := &Handler{
		Cfg:            cfg,
		Users:          &store.UserStore{DB: db},
		Sessions:       &store.SessionStore{DB: db},
		Memberships:    &store.MembershipStore{DB: db},
		Invites:        &store.InviteStore{DB: db},
		Audit:          &store.AuditStore{DB: db},
		Tenants:        &store.TenantStore{DB: db},
		Workspaces:     &store.WorkspaceStore{DB: db},
		CompanyIntakes: &store.CompanyIntakeStore{DB: db},
		MagicLinks:     &store.MagicLinkStore{DB: db},
		PasswordResets: &store.PasswordResetStore{DB: db},
		Shortlinks:     &store.ShortlinkStore{DB: db},
		Usage:          &store.UsageStore{DB: db},
		MCP:            &store.WorkspaceMCPStore{DB: db},
		Provisioner:    prov,
		LoginAttempts:  newLoginAttempts(),
		ClaraRateLimit: newRateLimiter(cfg.ClaraRateLimitPerIP, cfg.ClaraRateWindow),
		// Anonymous public-chat traffic gets a moderate per-IP cap when no
		// upstream protection (Cloudflare Turnstile / WAF) is configured.
		// 60/min/IP fits a normal multi-turn discovery chat (~30 user
		// turns × POST + SSE GET counted together) while making a single
		// IP unable to burn arbitrary LiteLLM budget.
		PublicChatRateLimit: newRateLimiter(60, time.Minute),
		Mailer:              mlr,
	}
	if cfg.OpenCRMURL != "" {
		h.CRM = newCRMClient(cfg.OpenCRMURL)
	}

	// Supabase is opt-in: when project_ref/anon/service_role/jwt_secret are
	// configured we wire it up, otherwise the controlplane stays on the
	// legacy local-auth path with no behavior change.
	supa, err := auth.NewSupabaseClient(
		cfg.SupabaseProjectRef,
		cfg.SupabaseAnonKey,
		cfg.SupabaseServiceRoleKey,
		cfg.SupabaseJWTSecret,
		cfg.SupabaseSiteURL,
	)
	if err == nil {
		h.Supabase = supa
		// Provisioner needs the same handle to clean up the Supabase user on
		// tenant delete. SupabaseClient implements SupabaseDeleter.
		if prov != nil {
			prov.Supabase = supa
		}
	} else if !errIsNotConfigured(err) {
		log.Printf("supabase client init failed: %v (falling back to legacy auth)", err)
	}

	h.AutoProvision = NewAutoProvisioner(cfg, prov, h.Supabase, db, mlr)
	h.Reminders = &store.IntakeReminderStore{DB: db}
	h.ReminderWorker = NewReminderWorker(cfg, db, mlr)

	if cfg.MCPEncryptionKey != "" {
		key, err := mcp.LoadEncryptionKey(cfg.MCPEncryptionKey)
		if err != nil {
			log.Printf("WARN: MCP encryption key invalid (%v); MCP activation will be disabled", err)
		} else {
			h.MCPEncKey = key
		}
	}

	return h
}

// StartBackground spawns long-running goroutines (reminder worker, etc.).
// Caller passes a context that, when cancelled, stops them gracefully.
// Idempotent: safe to call once at boot; subsequent calls are no-ops on
// already-started workers.
func (h *Handler) StartBackground(ctx context.Context) {
	// Bootstrap the default-auto workspace if missing. This closes the gap
	// where a fresh install requires the operator to manually create a
	// workspace before Clara can provision the first tenant. Logs and moves
	// on if it fails — startup should not be gated on workspace seeding.
	if err := h.EnsureDefaultWorkspace(ctx); err != nil {
		log.Printf("WARN: bootstrap default workspace failed: %v", err)
	}

	if h.ReminderWorker != nil {
		h.ReminderWorker.Start(ctx)
	}
}

func errIsNotConfigured(err error) bool {
	return err == auth.ErrSupabaseNotConfigured
}

func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(middleware.RequestID)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Shortlink resolver — public, no auth. Lives at /s/{code} on the
	// apex domain (and works on any subdomain too, since the router
	// runs before the tenant gateway dispatch). 302's to the stored
	// target URL or shows a small 404 page on miss/expired.
	r.Get("/s/{code}", h.handleResolveShortlink)

	// open-crm reverse proxy. Mounted at /crm, sits behind platform auth, and
	// forwards every sub-path verbatim to the opencrm container.
	crmProxy := newCRMProxy(h.Cfg.OpenCRMURL)
	r.Route("/crm", func(r chi.Router) {
		r.Use(h.requireAuth)
		r.Use(h.requirePlatformAdmin)
		r.Handle("/*", http.StripPrefix("/crm", crmProxy))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(h.tenantCORS)
		r.Post("/auth/login", h.handleLogin)
		r.Post("/auth/accept-invite", h.handleAcceptInvite)
		r.Post("/auth/forgot-password", h.handleForgotPassword)
		r.Post("/auth/reset-password", h.handleResetPassword)
		r.Post("/admin/login", h.handleLogin)
		r.Post("/public/company-intakes", h.handleCreateCompanyIntake)
		r.Get("/public/company-intakes/{id}", h.handleGetPublicCompanyIntake)
		r.Put("/public/company-intakes/{id}/answers", h.handleSaveCompanyIntakeAnswers)
		r.Post("/public/company-intakes/{id}/attachments", h.handleUploadCompanyIntakeAttachment)
		r.Post("/public/company-intakes/{id}/audio-transcript", h.handleSaveCompanyIntakeAudioTranscript)
		r.Post("/public/company-intakes/{id}/report", h.handleGenerateCompanyIntakeReport)
		r.Post("/public/company-intakes/{id}/submit", h.handleSubmitCompanyIntake)
		r.Post("/public/company-intakes/{id}/chat", h.handleCompanyIntakeChat)
		r.Post("/public/company-intakes/{id}/resend-link", h.handleResendMagicLink)

		// HMAC-authenticated callback from the onboarding tenant's skills
		// (mark-qualified, submit-intake). Not behind requireAuth — the
		// signature in X-Onboarding-Signature is the trust anchor.
		r.Post("/onboarding-callback", h.handleOnboardingCallback)

		r.Group(func(r chi.Router) {
			r.Use(h.requireAuth)

			r.Post("/auth/logout", h.handleLogout)
			r.Get("/auth/me", h.handleMe)
			r.Post("/auth/change-password", h.handleChangePassword)
			r.Post("/admin/logout", h.handleLogout)
			r.Get("/admin/me", h.handleMe)
			r.Post("/admin/change-password", h.handleChangePassword)

			r.Get("/tenants", h.handleListTenants)

			r.Group(func(r chi.Router) {
				r.Use(h.requirePlatformAdmin)
				r.Post("/tenants", h.handleCreateTenant)
				r.Get("/launcher-policy/catalog", h.handleGetLauncherPolicyCatalog)

				// Workspaces — single source of truth for tenant content.
				r.Get("/workspaces", h.handleListWorkspaces)
				r.Post("/workspaces", h.handleCreateWorkspace)
				r.Post("/workspaces/upload", h.handleUploadWorkspace)
				r.Post("/workspaces/import-from-home", h.handleImportWorkspaceFromHome)
				r.Get("/workspaces/{id}", h.handleGetWorkspace)
				r.Put("/workspaces/{id}", h.handleUpdateWorkspace)
				r.Delete("/workspaces/{id}", h.handleDeleteWorkspace)
				r.Get("/mcp/catalog", h.handleGetMCPCatalog)
				r.Get("/workspaces/{id}/mcp", h.handleListWorkspaceMCP)
				r.Put("/workspaces/{id}/mcp/{catalog_id}", h.handlePutWorkspaceMCP)
				r.Delete("/workspaces/{id}/mcp/{catalog_id}", h.handleDeleteWorkspaceMCP)
				r.Get("/workspaces/{id}/files", h.handleReadWorkspaceFile)
				r.Get("/workspaces/{id}/files/tree", h.handleWorkspaceFilesTree)
				r.Get("/workspaces/{id}/validate", h.handleValidateWorkspace)
				r.Put("/workspaces/{id}/files", h.handleWriteWorkspaceFile)
				r.Post("/workspaces/{id}/frontend/build", h.handleBuildWorkspaceFrontend)
				r.Post("/tenants/{id}/clone", h.handleCloneTenant)
				r.Post("/tenants/{id}/promote", h.handlePromoteTenant)
				r.Get("/tenants/{id}/onboarding-state", h.handleGetTenantOnboardingState)
				r.Get("/tenants/{id}/sanity", h.handleTenantSanity)
				// Discovery-mode liberation: per-tenant checklist + flip.
				// GET returns the validate_workspace.py checklist (or a stub
				// when the script isn't installed yet); POST flips
				// ui-visibility.json's active_profile from "public" -> "tenant"
				// when the checklist is complete. See admin_tenants_discovery.go.
				r.Get("/admin/tenants/{id}/discovery-status", h.handleAdminTenantDiscoveryStatus)
				r.Post("/admin/tenants/{id}/discovery-liberate", h.handleAdminTenantDiscoveryLiberate)
				// Budget status dashboard — lists tenants approaching their
				// MonthlyBudgetUSD cap, sorted percent_used desc (audit P1 #29).
				r.Get("/admin/tenants/budget-status", h.handleAdminTenantsBudgetStatus)
				r.Get("/tenants/{id}/files/tree", h.handleTenantFilesTree)
				r.Get("/tenants/{id}/files", h.handleTenantFileRead)
				r.Put("/tenants/{id}/files", h.handleTenantFileWrite)
				r.Post("/tenants/{id}/suspend", h.handleSuspendTenant)
				r.Post("/tenants/{id}/resume", h.handleResumeTenant)
				r.Post("/tenants/{id}/restart", h.handleRestartTenant)
				r.Post("/tenants/{id}/recreate", h.handleRecreateTenant)
				r.Post("/tenants/{id}/rotate-password", h.handleRotatePassword)
				r.Post("/tenants/{id}/magic-link", h.handleGenerateMagicLink)
				r.Get("/tenants/{id}/magic-links", h.handleListMagicLinks)
				r.Post("/tenants/{id}/resend-credentials", h.handleResendCredentials)
				r.Post("/magic-links/{nonce}/consume", h.handleConsumeMagicLink)
				// Shortlinks: admin-only CRUD. The public resolver
				// /s/{code} sits outside the auth group below (added
				// at the root, not under /api/v1).
				r.Post("/shortlinks", h.handleCreateShortlink)
				r.Get("/shortlinks", h.handleListShortlinks)
				r.Delete("/shortlinks/{code}", h.handleDeleteShortlink)
				r.Delete("/tenants/{id}", h.handleDeleteTenant)
				r.Post("/tenants/{id}/mark-delivered", h.handleMarkPasswordDelivered)
				r.Put("/tenants/{id}/crm", h.handleSetCRMLinks)
				r.Get("/tenants/{id}/logs", h.handleGetLogs)
				r.Get("/audit", h.handleListAudit)
				r.Get("/platform/stats", h.handlePlatformStats)
				r.Get("/platform/usage-timeseries", h.handlePlatformTimeseries)
				r.Get("/platform/server-health", h.handleServerHealth)
				r.Get("/users", h.handleListUsers)
				r.Post("/platform/invite-admin", h.handleInvitePlatformAdmin)
				r.Get("/company-intakes", h.handleListCompanyIntakes)
				r.Get("/company-intakes/{id}", h.handleGetCompanyIntake)
				r.Patch("/company-intakes/{id}", h.handleUpdateCompanyIntakeStatus)
				r.Post("/company-intakes/{id}/link-tenant", h.handleLinkCompanyIntakeTenant)
				r.Get("/company-intakes/{id}/attachments/{attachmentId}", h.handleDownloadCompanyIntakeAttachment)
			})

			r.Group(func(r chi.Router) {
				r.Use(h.requireTenantRole(store.RoleViewer))
				r.Get("/tenants/{id}", h.handleGetTenant)
				r.Get("/tenants/{id}/usage", h.handleGetUsage)
				r.Get("/tenants/{id}/members", h.handleListMembers)
				r.Get("/tenants/{id}/agent", h.handleGetAgent)
				r.Get("/tenants/{id}/agent/info", h.handleGetAgentInfo)
				r.Get("/tenants/{id}/skills", h.handleListSkills)
				r.Get("/tenants/{id}/skills/{name}", h.handleGetSkill)
			})

			r.Group(func(r chi.Router) {
				r.Use(h.requireTenantRole(store.RoleTenantAdmin))
				r.Put("/tenants/{id}/agent", h.handleSaveAgent)
				r.Put("/tenants/{id}/agent/info", h.handleSaveAgentInfo)
				r.Post("/tenants/{id}/skills", h.handleCreateSkill)
				r.Put("/tenants/{id}/skills/{name}", h.handleSaveSkill)
				r.Delete("/tenants/{id}/skills/{name}", h.handleDeleteSkill)
				r.Post("/tenants/{id}/skills/{name}/active", h.handleSetSkillActive)
				r.Post("/tenants/{id}/skills/{name}/visible", h.handleSetSkillVisible)
			})

			r.Group(func(r chi.Router) {
				r.Use(h.requireTenantRole(store.RoleTenantAdmin))
				r.Post("/tenants/{id}/members", h.handleUpsertMember)
				r.Delete("/tenants/{id}/members/{userId}", h.handleRemoveMember)
				r.Post("/tenants/{id}/invites", h.handleCreateInvite)
				r.Get("/tenants/{id}/invites", h.handleListInvites)
				r.Delete("/tenants/{id}/invites/{invId}", h.handleRevokeInvite)
			})
		})
	})

	// SPA fallback — must be last so it catches everything API doesn't.
	// Wrapped in LandingMux so the apex domain (jotaduo.com) gets the
	// static React landing from /var/lib/picoclaw-landing/, while admin.*
	// and tenant subdomains keep getting the embedded SPA admin. If the
	// landing dir is missing or has no index.html the wrapper is a no-op
	// and the apex falls through to the SPA admin too — safe default.
	landingDir := strings.TrimSpace(os.Getenv("PICOCLAW_LANDING_DIR"))
	if landingDir == "" {
		landingDir = "/var/lib/picoclaw-landing"
	}
	apexDomains := apexDomainsFromEnv()
	r.Handle("/*", LandingMux(landingDir, apexDomains, SPAHandler()))

	return h.withTenantGateway(r)
}

// apexDomainsFromEnv reads SAAS_BASE_DOMAIN (e.g. "jotaduo.com") and
// PICOCLAW_LANDING_APEX_DOMAINS (comma-separated override for staging or
// alternative hosts). Returns the union, lowercased and trimmed.
func apexDomainsFromEnv() []string {
	out := make([]string, 0, 2)
	if base := strings.TrimSpace(os.Getenv("SAAS_BASE_DOMAIN")); base != "" {
		out = append(out, strings.ToLower(base))
	}
	if extra := strings.TrimSpace(os.Getenv("PICOCLAW_LANDING_APEX_DOMAINS")); extra != "" {
		for _, d := range strings.Split(extra, ",") {
			d = strings.ToLower(strings.TrimSpace(d))
			if d != "" {
				out = append(out, d)
			}
		}
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	// API responses are per-admin and reflect mutable state — never cache.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
