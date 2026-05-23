package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type createTenantReq struct {
	DisplayName      string   `json:"display_name"`
	OwnerEmail       string   `json:"owner_email"`
	Subdomain        string   `json:"subdomain"`
	MonthlyBudgetUSD *float64 `json:"monthly_budget_usd,omitempty"`
	MemLimitMB       int      `json:"mem_limit_mb,omitempty"`
	CPUQuota         float64  `json:"cpu_quota,omitempty"`
	// WorkspaceID is required: selects the Workspace whose home/ subtree
	// seeds the tenant volume and whose frontend-dist/ is bind-mounted.
	WorkspaceID string `json:"workspace_id"`
}

func (h *Handler) handleCreateTenant(w http.ResponseWriter, r *http.Request) {
	var req createTenantReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.OwnerEmail = strings.TrimSpace(strings.ToLower(req.OwnerEmail))
	req.Subdomain = strings.TrimSpace(strings.ToLower(req.Subdomain))
	if req.DisplayName == "" || req.OwnerEmail == "" || req.Subdomain == "" {
		writeError(w, http.StatusBadRequest, "display_name, owner_email and subdomain are required")
		return
	}
	if err := tenant.ValidateSubdomain(req.Subdomain); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Dedup by owner email — mirrors AutoProvisioner.Run. Surfaced as 409 with
	// the existing tenant info so the admin UI can deep-link instead of
	// silently no-op'ing a destructive click.
	if existing, err := h.Tenants.GetByOwnerEmail(r.Context(), req.OwnerEmail); err == nil && existing != nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "owner already has a tenant",
			"tenant_id": existing.ID,
			"url":       tenantURL(h.Cfg, existing.Subdomain),
		})
		return
	} else if err != nil && !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if _, err := h.Tenants.GetBySubdomain(r.Context(), req.Subdomain); err == nil {
		writeError(w, http.StatusConflict, "subdomain already taken")
		return
	} else if !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	// New tenants always use launcher-native auth (bcrypt password + HttpOnly
	// session cookie via the launcher's dashboardauth). Supabase JWT path is
	// deprecated because the 1h TTL without refresh broke `/pico/ws`.
	// Legacy Supabase-backed tenants keep working — only newly-created ones
	// default to the launcher backend.
	authBackend := "launcher"

	out, err := h.Provisioner.Create(r.Context(), tenant.CreateInput{
		DisplayName:           req.DisplayName,
		OwnerEmail:            req.OwnerEmail,
		Subdomain:             req.Subdomain,
		MonthlyBudgetUSD:      req.MonthlyBudgetUSD,
		MemLimitMB:            req.MemLimitMB,
		CPUQuota:              req.CPUQuota,
		WorkspaceID:           req.WorkspaceID,
		SkipDashboardPassword: false,
		AuthBackend:           authBackend,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Workspace selection (req.WorkspaceID) is the authoritative source of
	// tenant content now; the provisioner's runProvision already copies
	// home/ into the volume and substitutes ${LITELLM_KEY} during Create.

	// Controlplane membership stays per-tenant regardless of dashboard auth
	// backend — the platform admin still needs a row to manage memberships
	// from adm.<base>/users.
	owner, err := h.Users.EnsureInvited(r.Context(), req.OwnerEmail)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "owner user error")
		return
	}
	if err := h.Memberships.Upsert(r.Context(), owner.ID, out.TenantID, store.RoleTenantOwner); err != nil {
		writeError(w, http.StatusInternalServerError, "owner membership error")
		return
	}

	resp := map[string]any{
		"tenant_id": out.TenantID,
		"url":       out.URL,
	}

	resp["initial_password"] = out.InitialPassword
	resp["login_mode"] = "password"
	if h.Mailer != nil && h.Mailer.Enabled() {
		go h.Mailer.SendCredentialsEmail(
			req.OwnerEmail,
			req.DisplayName,
			out.URL,
			req.OwnerEmail,
			out.InitialPassword,
			"", // magic link not used in the launcher-native flow
		)
		resp["info"] = "Email com URL, login e senha enviado para o owner."
	} else {
		resp["info"] = "Tenant criado. Salve as credenciais agora — elas não serão exibidas de novo."
		resp["warning"] = "SMTP não configurado — entregue email + senha manualmente."
	}

	// Best-effort: mirror the new tenant as a Contact in open-crm. Failures
	// here must not block tenant creation — they're a CRM convenience, not a
	// correctness requirement.
	if h.CRM != nil {
		first, last := splitName(req.DisplayName)
		if c, err := h.CRM.CreateContact(r.Context(), first, last, req.OwnerEmail); err != nil {
			log.Printf("opencrm: CreateContact failed for tenant %s: %v", out.TenantID, err)
		} else if err := h.Tenants.SetCRMContact(r.Context(), out.TenantID, c.ID); err != nil {
			log.Printf("opencrm: SetCRMContact failed for tenant %s: %v", out.TenantID, err)
		}
	}

	writeJSON(w, http.StatusCreated, resp)
}

func splitName(displayName string) (first, last string) {
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		return "", ""
	}
	parts := strings.SplitN(displayName, " ", 2)
	if len(parts) == 1 {
		return parts[0], ""
	}
	return parts[0], strings.TrimSpace(parts[1])
}

func (h *Handler) handleListTenants(w http.ResponseWriter, r *http.Request) {
	user, ok := userFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var (
		tenants []*store.Tenant
		err     error
	)
	if user.IsPlatformAdmin() {
		tenants, err = h.Tenants.List(r.Context(), false)
	} else {
		tenants, err = h.Tenants.ListForUser(r.Context(), user.ID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	out := make([]map[string]any, 0, len(tenants))
	for _, t := range tenants {
		out = append(out, summarizeTenant(t))
	}
	writeJSON(w, http.StatusOK, map[string]any{"tenants": out})
}

func (h *Handler) handleGetTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, summarizeTenant(t))
}

func (h *Handler) handleSuspendTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Suspend(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleResumeTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Resume(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleRestartTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Restart(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleRecreateTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Recreate(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleDeleteTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) handleRotatePassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	password, err := h.Provisioner.RotatePassword(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"initial_password": password,
		"warning":          "Save this password now — it will not be shown again.",
	})
}

// bootstrapOnboardingReq is the body of POST /tenants/onboarding/bootstrap.
// All fields default to sane onboarding-tenant values, so callers (typically
// scripts/provision-onboarding-tenant.sh) can POST an empty body.
type bootstrapOnboardingReq struct {
	DisplayName string `json:"display_name"`
	Subdomain   string `json:"subdomain"`
	// WorkspaceID picks the workspace to seed the onboarding tenant from.
	// When empty, falls back to a workspace whose slug is "onboarding".
	WorkspaceID string `json:"workspace_id"`
}

// handleBootstrapOnboardingTenant provisions the singleton public onboarding
// tenant (is_public=true) and overlays workspace-onboarding/ into its volume.
// Idempotent: returns 409 with the existing tenant info if the subdomain is
// already provisioned, so the bootstrap script can re-run safely.
func (h *Handler) handleBootstrapOnboardingTenant(w http.ResponseWriter, r *http.Request) {
	var req bootstrapOnboardingReq
	// Decode is best-effort: an empty body is OK (script may not send any
	// overrides). io.EOF is the canonical "empty body" signal from json.Decoder.
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Subdomain = strings.TrimSpace(strings.ToLower(req.Subdomain))
	if req.DisplayName == "" {
		req.DisplayName = "Onboarding"
	}
	if req.Subdomain == "" {
		req.Subdomain = "onboarding"
	}

	// Dedup by subdomain — the onboarding tenant is a singleton. Surface a
	// 409 so the script can short-circuit cleanly instead of hitting the
	// downstream "subdomain already taken" path with an opaque body.
	if existing, err := h.Tenants.GetBySubdomain(r.Context(), req.Subdomain); err == nil && existing != nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "onboarding tenant already exists",
			"tenant_id": existing.ID,
			"subdomain": existing.Subdomain,
			"url":       tenantURL(h.Cfg, existing.Subdomain),
		})
		return
	} else if err != nil && !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if err := tenant.ValidateSubdomain(req.Subdomain); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// The onboarding tenant has no human owner — derive an ops mailbox from
	// the configured TenantBaseDomain so the owner_email column has a stable
	// non-empty value the controlplane can audit later.
	ownerEmail := "ops@" + strings.Trim(h.Cfg.TenantBaseDomain, ".")

	// Resolve the workspace that seeds the onboarding tenant. Explicit id
	// wins; otherwise we look up by the conventional "onboarding" slug. If
	// the operator hasn't created either, bail with a clear message so the
	// bootstrap script doesn't half-provision a tenant pointing at nothing.
	wsID := strings.TrimSpace(req.WorkspaceID)
	if wsID == "" {
		ws, lerr := h.Workspaces.GetBySlug(r.Context(), "onboarding")
		if lerr != nil {
			writeError(
				w,
				http.StatusBadRequest,
				"create a workspace with slug 'onboarding' first, or pass workspace_id in the body",
			)
			return
		}
		wsID = ws.ID
	}

	out, err := h.Provisioner.Create(r.Context(), tenant.CreateInput{
		DisplayName: req.DisplayName,
		OwnerEmail:  ownerEmail,
		Subdomain:   req.Subdomain,
		MemLimitMB:  512,
		CPUQuota:    0.5,
		IsPublic:    true,
		AuthBackend: "local", // public tenant has no Supabase user
		WorkspaceID: wsID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Surface a clear warning when the HMAC secret is unset on the
	// controlplane — without it, the skill scripts inside the container
	// exit non-zero and Clara can't mark intakes qualified. Container
	// boots either way, so the bootstrap doesn't fail.
	var warning string
	if h.Cfg.OnboardingCallbackSecret == "" {
		warning = "PICOCLAW_ONBOARDING_CALLBACK_SECRET is unset on the controlplane — the onboarding skills will exit with a `required` env error. Set it and `Restart` this tenant before flipping VITE_USE_ONBOARDING_TENANT."
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"tenant_id":    out.TenantID,
		"url":          out.URL,
		"subdomain":    req.Subdomain,
		"is_public":    true,
		"workspace_id": wsID,
		"warning":      warning,
		"info":         "Onboarding tenant provisioned. Content is now driven by the chosen workspace — edit it via /workspaces in the admin.",
	})
}

func (h *Handler) handleMarkPasswordDelivered(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Tenants.MarkPasswordDelivered(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleSetCRMLinks(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		ContactID *int64 `json:"contact_id"`
		CompanyID *int64 `json:"company_id"`
		DealID    *int64 `json:"deal_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	err := h.Tenants.SetCRMLinks(r.Context(), id, store.CRMLinks{
		ContactID: body.ContactID,
		CompanyID: body.CompanyID,
		DealID:    body.DealID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func summarizeTenant(t *store.Tenant) map[string]any {
	return map[string]any{
		"id":                         t.ID,
		"display_name":               t.DisplayName,
		"owner_email":                t.OwnerEmail,
		"subdomain":                  t.Subdomain,
		"status":                     t.Status,
		"container_id":               t.ContainerID,
		"mem_limit_mb":               t.MemLimitMB,
		"cpu_quota":                  t.CPUQuota,
		"monthly_budget_usd":         t.MonthlyBudgetUSD,
		"initial_password_delivered": t.InitialPasswordDelivered,
		"last_error":                 t.LastError,
		"created_at":                 t.CreatedAt,
		"suspended_at":               t.SuspendedAt,
		"crm_contact_id":             t.CRMContactID,
		"crm_company_id":             t.CRMCompanyID,
		"crm_deal_id":                t.CRMDealID,
		"workspace_id":               t.WorkspaceID,
		"workspace_version_applied":  t.WorkspaceVersionApplied,
		// supabase_user_id surfaced so the admin UI can gate the
		// "Reenviar credenciais" button (only works for supabase-backed
		// tenants; legacy local-auth tenants don't have a user to update).
		"supabase_user_id": t.SupabaseUserID,
		// auth_backend + is_public surfaced so the admin tenant list
		// can show how the tenant authenticates and whether it accepts
		// anonymous public-chat traffic. These two together determine
		// whether the launcher runs in trusted_gateway vs local mode.
		"auth_backend": t.AuthBackend,
		"is_public":    t.IsPublic,
	}
}
