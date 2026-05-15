package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/sipeed/picoclaw/internal/saas/config"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type Handler struct {
	Cfg           *config.Config
	Users         *store.UserStore
	Sessions      *store.SessionStore
	Memberships   *store.MembershipStore
	Invites       *store.InviteStore
	Audit         *store.AuditStore
	Tenants       *store.TenantStore
	Usage         *store.UsageStore
	Provisioner   *tenant.Provisioner
	LoginAttempts *loginAttempts
	CRM           *crmClient
}

func NewHandler(cfg *config.Config, db *store.DB, prov *tenant.Provisioner) *Handler {
	h := &Handler{
		Cfg:           cfg,
		Users:         &store.UserStore{DB: db},
		Sessions:      &store.SessionStore{DB: db},
		Memberships:   &store.MembershipStore{DB: db},
		Invites:       &store.InviteStore{DB: db},
		Audit:         &store.AuditStore{DB: db},
		Tenants:       &store.TenantStore{DB: db},
		Usage:         &store.UsageStore{DB: db},
		Provisioner:   prov,
		LoginAttempts: newLoginAttempts(),
	}
	if cfg.OpenCRMURL != "" {
		h.CRM = newCRMClient(cfg.OpenCRMURL)
	}
	return h
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

	// open-crm reverse proxy. Mounted at /crm, sits behind platform auth, and
	// forwards every sub-path verbatim to the opencrm container.
	crmProxy := newCRMProxy(h.Cfg.OpenCRMURL)
	r.Route("/crm", func(r chi.Router) {
		r.Use(h.requireAuth)
		r.Use(h.requirePlatformAdmin)
		r.Handle("/*", http.StripPrefix("/crm", crmProxy))
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/auth/login", h.handleLogin)
		r.Post("/auth/accept-invite", h.handleAcceptInvite)
		r.Post("/admin/login", h.handleLogin)

		r.Group(func(r chi.Router) {
			r.Use(h.requireAuth)

			r.Post("/auth/logout", h.handleLogout)
			r.Get("/auth/me", h.handleMe)
			r.Post("/admin/logout", h.handleLogout)
			r.Get("/admin/me", h.handleMe)

			r.Get("/tenants", h.handleListTenants)

			r.Group(func(r chi.Router) {
				r.Use(h.requirePlatformAdmin)
				r.Post("/tenants", h.handleCreateTenant)
				r.Post("/tenants/{id}/suspend", h.handleSuspendTenant)
				r.Post("/tenants/{id}/resume", h.handleResumeTenant)
				r.Post("/tenants/{id}/restart", h.handleRestartTenant)
				r.Post("/tenants/{id}/recreate", h.handleRecreateTenant)
				r.Post("/tenants/{id}/rotate-password", h.handleRotatePassword)
				r.Delete("/tenants/{id}", h.handleDeleteTenant)
				r.Post("/tenants/{id}/mark-delivered", h.handleMarkPasswordDelivered)
				r.Put("/tenants/{id}/crm", h.handleSetCRMLinks)
				r.Get("/audit", h.handleListAudit)
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
				r.Use(h.requireTenantRole(store.RoleTenantOwner))
				r.Post("/tenants/{id}/members", h.handleUpsertMember)
				r.Post("/tenants/{id}/invites", h.handleCreateInvite)
			})
		})
	})

	// SPA fallback — must be last so it catches everything API doesn't.
	r.Handle("/*", SPAHandler())

	return h.withTenantGateway(r)
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
