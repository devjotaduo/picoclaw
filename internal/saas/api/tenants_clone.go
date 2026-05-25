package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

type cloneTenantReq struct {
	DisplayName      string   `json:"display_name"`
	OwnerEmail       string   `json:"owner_email"`
	Subdomain        string   `json:"subdomain"`
	MonthlyBudgetUSD *float64 `json:"monthly_budget_usd,omitempty"`
	MemLimitMB       int      `json:"mem_limit_mb,omitempty"`
	CPUQuota         float64  `json:"cpu_quota,omitempty"`
}

// handleCloneTenant clones an existing tenant's volume verbatim into a new
// tenant. Restricted to platform_admin (registered under requirePlatformAdmin
// in router.go). The clone preserves all secrets, OAuth tokens, sessions and
// the dashboard password from the source — the new tenant is functionally a
// twin until the operator rotates credentials.
func (h *Handler) handleCloneTenant(w http.ResponseWriter, r *http.Request) {
	srcID := chi.URLParam(r, "id")
	if strings.TrimSpace(srcID) == "" {
		writeError(w, http.StatusBadRequest, "source tenant id is required")
		return
	}

	var req cloneTenantReq
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
	if _, err := h.Tenants.GetBySubdomain(r.Context(), req.Subdomain); err == nil {
		writeError(w, http.StatusConflict, "subdomain already taken")
		return
	} else if !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if _, err := h.Tenants.Get(r.Context(), srcID); err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "source tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	out, err := h.Provisioner.CloneFromTenant(r.Context(), tenant.CloneInput{
		SourceTenantID:   srcID,
		DisplayName:      req.DisplayName,
		OwnerEmail:       req.OwnerEmail,
		Subdomain:        req.Subdomain,
		MonthlyBudgetUSD: req.MonthlyBudgetUSD,
		MemLimitMB:       req.MemLimitMB,
		CPUQuota:         req.CPUQuota,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	owner, err := h.Users.EnsureInvited(r.Context(), req.OwnerEmail)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "owner user error")
		return
	}
	if err := h.Memberships.Upsert(r.Context(), owner.ID, out.TenantID, store.RoleTenantOwner); err != nil {
		writeError(w, http.StatusInternalServerError, "owner membership error")
		return
	}

	var ownerInviteToken string
	var ownerInviteExpiresAt time.Time
	if actor, ok := userFromContext(r.Context()); ok {
		if inv, token, err := h.Invites.Create(r.Context(), out.TenantID, req.OwnerEmail, store.RoleTenantOwner, actor.ID, 7*24*time.Hour); err == nil {
			ownerInviteToken = token
			ownerInviteExpiresAt = inv.ExpiresAt
		} else {
			log.Printf("invite: owner invite failed for cloned tenant %s: %v", out.TenantID, err)
		}
	}
	if ownerInviteToken != "" && h.Mailer != nil && h.Mailer.Enabled() {
		inviteURL := h.Mailer.AdminBaseURL() + "/accept-invite?token=" + ownerInviteToken
		go h.Mailer.SendInviteEmail(req.OwnerEmail, req.DisplayName, string(store.RoleTenantOwner), inviteURL, ownerInviteExpiresAt)
	}

	checks := h.Provisioner.RunPostCloneChecks(r.Context(), out.TenantID)

	resp := map[string]any{
		"tenant_id":          out.TenantID,
		"url":                out.URL,
		"source_tenant_id":   srcID,
		"owner_invite_token": ownerInviteToken,
		"sanity_checks":      checks,
		"info":               "Raw clone preserves the source dashboard password and secrets. Rotate them from the admin UI if intended for a different operator.",
	}
	// Audit the clone with the source tenant captured in the action verb so
	// it stays queryable even if the source is later deleted.
	h.auditTenantOp(r, out.TenantID, "tenant.clone.from."+srcID)
	writeJSON(w, http.StatusCreated, resp)
}
