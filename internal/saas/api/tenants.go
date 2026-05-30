package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// publicTenantDefaultMonthlyBudgetUSD is the LiteLLM cap auto-applied to
// public tenants created without an explicit budget (audit P0 #8). $10/mo
// covers a few hundred Sofia turns at Sonnet rates and keeps a leaked URL
// from blowing up the operator's bill; the admin can raise it in the panel.
const publicTenantDefaultMonthlyBudgetUSD = 10.0

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
	// TenantType is the UX-level type the admin picked in the wizard:
	//   "publico" → ui-visibility active_profile = "public"
	//   "admin"   → ui-visibility active_profile = "admin"
	//   "cliente" → ui-visibility active_profile = "tenant" (default)
	// Empty defaults to "cliente". Anything else is rejected. The mapping
	// to the underlying ui-visibility profile name is done in this handler
	// — the frontend speaks the admin vocabulary, the volume speaks the
	// runtime vocabulary, and we translate at the boundary.
	TenantType string `json:"tenant_type,omitempty"`
	// ModelRouting is the SaaS-admin controlled source of truth for newly
	// materialized tenant model auth: LiteLLM virtual key values, CLI auth
	// selection, and fallback order.
	ModelRouting *createTenantModelRoutingReq `json:"model_routing,omitempty"`
}

type createTenantModelRoutingReq struct {
	Mode    string                         `json:"mode,omitempty"`
	LiteLLM createTenantLiteLLMRoutingReq  `json:"litellm,omitempty"`
	CLI     createTenantCLIModelRoutingReq `json:"cli,omitempty"`
}

type createTenantLiteLLMRoutingReq struct {
	ModelName     string   `json:"model_name,omitempty"`
	APIBase       string   `json:"api_base,omitempty"`
	Fallbacks     []string `json:"fallbacks,omitempty"`
	AllowedModels []string `json:"allowed_models,omitempty"`
}

type createTenantCLIModelRoutingReq struct {
	Order []string `json:"order,omitempty"`
}

// resolveUIProfile maps the admin-facing tenant type to the runtime
// ui-visibility profile name. Returns error for unknown values so typos
// fail fast at the API edge instead of silently boot wrong UI.
func resolveUIProfile(tenantType string) (tenant.UIVisibilityProfile, error) {
	switch strings.ToLower(strings.TrimSpace(tenantType)) {
	case "", "cliente", "tenant":
		return tenant.UIProfileTenant, nil
	case "publico", "public":
		return tenant.UIProfilePublic, nil
	case "admin":
		return tenant.UIProfileAdmin, nil
	default:
		return "", fmt.Errorf("unknown tenant_type %q (expected publico, admin, or cliente)", tenantType)
	}
}

func (req *createTenantModelRoutingReq) toTenantConfig() (*tenant.ModelRoutingConfig, error) {
	if req == nil {
		return nil, nil
	}
	mode := strings.ToLower(strings.TrimSpace(req.Mode))
	if mode == "" {
		mode = "auto"
	}
	switch mode {
	case "auto", "litellm", "cli":
	default:
		return nil, fmt.Errorf("unknown model_routing.mode %q (expected auto, litellm, or cli)", req.Mode)
	}

	order := cleanStringList(req.CLI.Order)
	for _, provider := range order {
		switch strings.ToLower(strings.TrimSpace(provider)) {
		case "claude", "claude-cli", "codex", "codex-cli":
		default:
			return nil, fmt.Errorf("unsupported model_routing.cli.order provider %q", provider)
		}
	}

	return &tenant.ModelRoutingConfig{
		Mode: mode,
		LiteLLM: tenant.LiteLLMModelRoutingConfig{
			ModelName:     strings.TrimSpace(req.LiteLLM.ModelName),
			APIBase:       strings.TrimSpace(req.LiteLLM.APIBase),
			Fallbacks:     cleanStringList(req.LiteLLM.Fallbacks),
			AllowedModels: cleanStringList(req.LiteLLM.AllowedModels),
		},
		CLI: tenant.CLIModelRoutingConfig{
			Order: order,
		},
	}, nil
}

func cleanStringList(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, value := range in {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
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

	uiProfile, err := resolveUIProfile(req.TenantType)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	modelRouting, err := req.ModelRouting.toTenantConfig()
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	isPublic := uiProfile == tenant.UIProfilePublic

	// Public tenants have no human owner — derive a stable ops mailbox from
	// TenantBaseDomain so the owner_email column has a non-empty value the
	// controlplane can audit, and the operator never has to invent one in the
	// wizard. Mirrors what the retired handleBootstrapOnboardingTenant did.
	if isPublic && req.OwnerEmail == "" {
		req.OwnerEmail = "ops@" + strings.Trim(h.Cfg.TenantBaseDomain, ".")
	}

	// Audit P0 #8 (2026-05-27): public tenant URL leaked = unbounded cost
	// spiral for the operator (Sofia chat = LLM calls = JOTADUO pays). The
	// rate-limit-per-IP (30 msg / 10min) doesn't stop a botnet rotating
	// IPs. Force a non-nil MonthlyBudgetUSD on every public tenant so the
	// LiteLLM virtual key has a hard cap. Default to $10/month — the admin
	// can raise it in the panel after observing real demand. Honors an
	// explicit override (admin sending {"monthly_budget_usd": 50}).
	if isPublic && req.MonthlyBudgetUSD == nil {
		defaultCap := publicTenantDefaultMonthlyBudgetUSD
		req.MonthlyBudgetUSD = &defaultCap
		log.Printf(
			"create tenant %s: public tenant without explicit monthly_budget_usd, defaulting to $%.2f/mo (audit P0 #8)",
			req.Subdomain, defaultCap,
		)
	}

	if req.DisplayName == "" || req.Subdomain == "" || req.OwnerEmail == "" {
		writeError(
			w,
			http.StatusBadRequest,
			"nome, endereço curto e email do responsável são obrigatórios",
		)
		return
	}
	if err := tenant.ValidateSubdomain(req.Subdomain); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Dedup by owner email. Surfaced as 409 with the existing tenant info so
	// the admin UI can deep-link instead of silently no-op'ing a destructive
	// click. Skipped for public tenants
	// because they all share the same synthetic ops@<base> address; subdomain
	// uniqueness below catches the real "already provisioned" case.
	if !isPublic {
		if existing, err := h.Tenants.GetByOwnerEmail(r.Context(), req.OwnerEmail); err == nil && existing != nil {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error":     "este email já tem um cliente cadastrado",
				"tenant_id": existing.ID,
				"url":       tenantURL(h.Cfg, existing.Subdomain),
			})
			return
		} else if err != nil && !errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusInternalServerError, "db error")
			return
		}
	}
	if _, err := h.Tenants.GetBySubdomain(r.Context(), req.Subdomain); err == nil {
		writeError(w, http.StatusConflict, "endereço curto já está em uso")
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
		SkipDashboardPassword: uiProfile == tenant.UIProfilePublic, // público não tem owner password
		AuthBackend:           authBackend,
		IsPublic:              uiProfile == tenant.UIProfilePublic,
		UIProfile:             uiProfile,
		ModelRouting:          modelRouting,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Workspace selection (req.WorkspaceID) is the authoritative source of
	// tenant content now; the provisioner's runProvision already copies
	// home/ into the volume and substitutes ${LITELLM_KEY} during Create.

	resp := map[string]any{
		"tenant_id": out.TenantID,
		"url":       out.URL,
	}
	if err := h.persistTenantModelRouting(r.Context(), out.TenantID, modelRouting); err != nil {
		log.Printf("tenant create: save model routing failed for tenant %s: %v", out.TenantID, err)
		resp["warning"] = "Cliente criado, mas não foi possível salvar o roteamento de modelo no painel."
	}

	// Public tenants have no human owner — skip user/membership creation,
	// credentials email, and CRM contact. The ops sentinel email is just an
	// audit anchor, not a real recipient.
	if isPublic {
		resp["is_public"] = true
		resp["info"] = "Atendimento público criado. O visitante entra sem senha."
		h.auditTenantOp(r, out.TenantID, "tenant.create")
		writeJSON(w, http.StatusCreated, resp)
		return
	}

	// Controlplane membership stays per-tenant regardless of dashboard auth
	// backend — the platform admin still needs a row to manage memberships
	// from adm.<base>/users.
	owner, err := h.Users.EnsureInvited(r.Context(), req.OwnerEmail)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "erro ao preparar usuário responsável")
		return
	}
	if err := h.Memberships.Upsert(r.Context(), owner.ID, out.TenantID, store.RoleTenantOwner); err != nil {
		writeError(w, http.StatusInternalServerError, "erro ao preparar acesso do responsável")
		return
	}

	resp["initial_password"] = out.InitialPassword
	resp["login_mode"] = "password"
	mailMagicLink := ""
	if createdTenant, err := h.Tenants.Get(r.Context(), out.TenantID); err != nil {
		log.Printf("tenant create: reload tenant %s for access link failed: %v", out.TenantID, err)
		resp["access_warning"] = "Cliente criado, mas não foi possível carregar os dados para gerar o link de acesso."
	} else if bundle, err := h.createTenantMagicAccessBundle(
		r.Context(),
		createdTenant,
		string(store.RoleTenantOwner),
		defaultMagicLinkTTL,
	); err != nil {
		log.Printf("tenant create: access bundle generation failed for tenant %s: %v", out.TenantID, err)
		resp["access_warning"] = "Cliente criado, mas o link de acesso não foi gerado. Use endereço e senha inicial como alternativa."
	} else {
		resp["magic_link"] = bundle.URL
		resp["short_magic_link"] = bundle.ShortMagicLink
		resp["access_link"] = bundle.AccessLink
		resp["magic_link_expires_at"] = bundle.ExpiresAt
		resp["magic_link_role"] = string(store.RoleTenantOwner)
		if bundle.Warning != "" {
			resp["access_warning"] = bundle.Warning
		}
		mailMagicLink = bundle.AccessLink
	}
	if h.Mailer != nil && h.Mailer.Enabled() {
		go h.Mailer.SendCredentialsEmail(
			req.OwnerEmail,
			req.DisplayName,
			out.URL,
			req.OwnerEmail,
			out.InitialPassword,
			mailMagicLink,
		)
		resp["info"] = "Email com endereço, email de acesso, senha e link enviado para o responsável."
	} else {
		resp["info"] = "Cliente criado. Salve os dados de acesso agora: eles não serão exibidos novamente."
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

	h.auditTenantOp(r, out.TenantID, "tenant.create")
	writeJSON(w, http.StatusCreated, resp)
}

// auditTenantOp records a destructive/sensitive tenant operation in audit_logs.
// Best-effort: errors are swallowed because the caller has already done the
// actual work. Action verbs follow the "tenant.<verb>" convention used by
// members.go and admin_auth.go for tenant.member.* and tenant.invite.*.
func (h *Handler) auditTenantOp(r *http.Request, tenantID, action string) {
	if h.Audit == nil {
		return
	}
	var actorID *int64
	if actor, ok := userFromContext(r.Context()); ok {
		actorID = &actor.ID
	}
	tid := tenantID
	_ = h.Audit.Insert(r.Context(), actorID, &tid, action, "tenant", tenantID)
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
			writeError(w, http.StatusNotFound, "cliente não encontrado")
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
	h.auditTenantOp(r, id, "tenant.recreate")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleResumeTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Resume(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.restart")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleRestartTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Restart(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.resume")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleRecreateTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Recreate(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.suspend")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) handleDeleteTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Provisioner.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Audit BEFORE response — at this point the cascade has run and the row
	// is about to be deleted, but the audit row is FK-protected
	// (audit_logs.tenant_id ON DELETE SET NULL keeps the action verb intact).
	h.auditTenantOp(r, id, "tenant.delete")
	w.WriteHeader(http.StatusAccepted)
}

func (h *Handler) handleRotatePassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	password, err := h.Provisioner.RotatePassword(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.auditTenantOp(r, id, "tenant.password.rotate")
	writeJSON(w, http.StatusOK, map[string]any{
		"initial_password": password,
		"warning":          "Guarde esta senha agora: ela não será exibida novamente.",
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
		// anonymous public-tenant chat over /pico/ws. These two together
		// determine whether the launcher runs in trusted_gateway vs local mode.
		"auth_backend": t.AuthBackend,
		"is_public":    t.IsPublic,
	}
}
