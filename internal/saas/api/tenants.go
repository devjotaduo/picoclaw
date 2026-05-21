package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	supaauth "github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type createTenantReq struct {
	DisplayName       string   `json:"display_name"`
	OwnerEmail        string   `json:"owner_email"`
	Subdomain         string   `json:"subdomain"`
	MonthlyBudgetUSD  *float64 `json:"monthly_budget_usd,omitempty"`
	MemLimitMB        int      `json:"mem_limit_mb,omitempty"`
	CPUQuota          float64  `json:"cpu_quota,omitempty"`
	LauncherProfileID string   `json:"launcher_profile_id,omitempty"`
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

	// When Supabase is configured, the tenant's dashboard login is gated by
	// Supabase JWT — skip seeding a local bcrypt password and record
	// auth_backend accordingly. Otherwise stay on the legacy local-password
	// + controlplane invite-token flow.
	useSupabase := h.Supabase != nil
	authBackend := "local"
	if useSupabase {
		authBackend = "supabase"
	}

	out, err := h.Provisioner.Create(r.Context(), tenant.CreateInput{
		DisplayName:           req.DisplayName,
		OwnerEmail:            req.OwnerEmail,
		Subdomain:             req.Subdomain,
		MonthlyBudgetUSD:      req.MonthlyBudgetUSD,
		MemLimitMB:            req.MemLimitMB,
		CPUQuota:              req.CPUQuota,
		LauncherProfileID:     req.LauncherProfileID,
		SkipDashboardPassword: useSupabase,
		AuthBackend:           authBackend,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Apply the canonical workspace overlay (same logic as the Clara
	// auto-provision flow) so admin-created tenants get the curated agent
	// roster / skills / config instead of an empty volume. Best-effort: a
	// failure here is logged but does not roll back tenant creation.
	if h.Cfg.AutoProvisionWorkspaceDir != "" {
		if t, gerr := h.Tenants.Get(r.Context(), out.TenantID); gerr == nil && t != nil && t.VolumePath != "" {
			if oerr := tenant.OverlayWorkspace(h.Cfg.AutoProvisionWorkspaceDir, t.VolumePath); oerr != nil {
				log.Printf("workspace overlay failed for tenant %s: %v", out.TenantID, oerr)
			} else if rerr := h.Provisioner.Restart(r.Context(), out.TenantID); rerr != nil {
				log.Printf("restart after workspace overlay failed for tenant %s: %v", out.TenantID, rerr)
			}
		}
	}

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

	if useSupabase {
		// Cria o user com senha (EmailConfirm=true) — Supabase em mode
		// 'password' não envia email automaticamente, então a entrega é
		// nossa.
		userID, _, suerr := h.Supabase.CreateTenantOwner(
			req.OwnerEmail, out.TenantID, req.Subdomain,
			supaauth.LoginModePassword, out.InitialPassword,
		)
		if suerr != nil {
			// Best-effort rollback so we don't leave an orphan tenant without
			// a way to log in.
			_ = h.Provisioner.Delete(r.Context(), out.TenantID)
			writeError(w, http.StatusInternalServerError, "supabase user: "+suerr.Error())
			return
		}
		if err := h.Tenants.SetSupabaseUserID(r.Context(), out.TenantID, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "save supabase user id: "+err.Error())
			return
		}
		// Gera magic link extra para o mesmo user — entrega-se URL + login
		// + senha + magic link juntos no mesmo email. Falha aqui não é
		// fatal: o tenant continua acessível via email + senha.
		var magicLink string
		if ml, mlerr := h.Supabase.GenerateMagicLink(req.OwnerEmail, req.Subdomain); mlerr != nil {
			log.Printf("supabase magic link generation failed for tenant %s: %v", out.TenantID, mlerr)
		} else {
			magicLink = ml
		}

		resp["supabase_user_id"] = userID
		resp["initial_password"] = out.InitialPassword
		if magicLink != "" {
			resp["magic_link"] = magicLink
		}
		if h.Mailer != nil && h.Mailer.Enabled() {
			go h.Mailer.SendCredentialsEmail(req.OwnerEmail, req.DisplayName, out.URL, req.OwnerEmail, out.InitialPassword, magicLink)
			resp["info"] = "Email com URL, login, senha e magic link enviado para o owner."
		} else {
			resp["info"] = "Tenant created. Save the credentials now — they will not be shown again."
			resp["warning"] = "SMTP não configurado — entregue email + senha (e magic link) manualmente."
		}
	} else {
		// Legacy invite-token flow — kept as a fallback for deployments
		// without Supabase Auth wired in.
		var ownerInviteToken string
		var ownerInviteExpiresAt time.Time
		if actor, ok := userFromContext(r.Context()); ok {
			if inv, token, err := h.Invites.Create(r.Context(), out.TenantID, req.OwnerEmail, store.RoleTenantOwner, actor.ID, 7*24*time.Hour); err == nil {
				ownerInviteToken = token
				ownerInviteExpiresAt = inv.ExpiresAt
			} else {
				log.Printf("invite: owner invite failed for tenant %s: %v", out.TenantID, err)
			}
		}
		if ownerInviteToken != "" && h.Mailer != nil && h.Mailer.Enabled() {
			inviteURL := h.Mailer.AdminBaseURL() + "/accept-invite?token=" + ownerInviteToken
			go h.Mailer.SendInviteEmail(req.OwnerEmail, req.DisplayName, string(store.RoleTenantOwner), inviteURL, ownerInviteExpiresAt)
		}
		resp["owner_invite_token"] = ownerInviteToken
		if h.Mailer == nil || !h.Mailer.Enabled() {
			resp["warning"] = "SMTP is not configured — share the invite token manually."
		} else {
			resp["info"] = "Invite email was sent to the owner. The token is included as a delivery fallback."
		}
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
		"id":                               t.ID,
		"display_name":                     t.DisplayName,
		"owner_email":                      t.OwnerEmail,
		"subdomain":                        t.Subdomain,
		"status":                           t.Status,
		"container_id":                     t.ContainerID,
		"mem_limit_mb":                     t.MemLimitMB,
		"cpu_quota":                        t.CPUQuota,
		"monthly_budget_usd":               t.MonthlyBudgetUSD,
		"initial_password_delivered":       t.InitialPasswordDelivered,
		"last_error":                       t.LastError,
		"created_at":                       t.CreatedAt,
		"suspended_at":                     t.SuspendedAt,
		"crm_contact_id":                   t.CRMContactID,
		"crm_company_id":                   t.CRMCompanyID,
		"crm_deal_id":                      t.CRMDealID,
		"launcher_profile_id":              t.LauncherProfileID,
		"launcher_profile_version_applied": t.LauncherProfileVersionApplied,
	}
}
