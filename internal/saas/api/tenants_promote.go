package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/auth"
	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

// onboardingState mirrors the shape produced by
// workspace/skills/onboarding-state/scripts/state.py. Only the fields
// the promote endpoint actually reads are typed strictly; the rest
// stays untyped so additions in the skill don't break the parse.
type onboardingState struct {
	Phase          string                   `json:"phase"`
	OwnerCaptured  onboardingOwnerCaptured  `json:"owner_captured"`
	Promotion      onboardingPromotionField `json:"promotion"`
	Discovery      map[string]any           `json:"discovery"`
	Deepening      map[string]any           `json:"deepening"`
}

type onboardingOwnerCaptured struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	WhatsApp string `json:"whatsapp"`
}

type onboardingPromotionField struct {
	Ready       bool     `json:"ready"`
	BlockedBy   []string `json:"blocked_by"`
	PromotedAt  string   `json:"promoted_at"`
	PromotedBy  string   `json:"promoted_by"`
}

// promoteReq is the body of POST /api/v1/tenants/{id}/promote.
// All fields optional — V1 strict default reads owner from the state
// machine and only proceeds when promotion.ready=true.
type promoteReq struct {
	// Force = true bypasses promotion.ready check. Audit logs the override.
	// Requires the caller to be platform_admin (enforced by the route group).
	Force bool `json:"force,omitempty"`
	// OwnerEmailOverride lets the admin correct/override the email Sofia
	// captured. Empty = use state.owner_captured.email.
	OwnerEmailOverride string `json:"owner_email,omitempty"`
}

// emailRE matches what onboarding-state/state.py validates on capture.
// We re-validate here because an admin might pass an override that
// bypasses the skill's check.
var emailRE = regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)

// handlePromoteTenant migrates a public tenant (is_public=true,
// anonymous chat) into a private one with a real owner. Flow:
//
//  1. Load tenant + verify it's currently is_public=true
//  2. Read workspace/state/onboarding.json from the volume
//  3. Validate promotion.ready (or req.Force for admin override)
//  4. Resolve owner email (state OR override)
//  5. DB: Promote (sets is_public=false, owner_email, auth_backend) +
//     EnsureInvited(user) + Memberships.Upsert(tenant_owner)
//  6. Filesystem: SetUIVisibilityActiveProfile=tenant + SeedDashboardPassword
//  7. Mark state.promoted_at via direct file write (skill exec would
//     require the container alive during the transition)
//  8. Provisioner.Recreate to pick up new container env
//     (PICOCLAW_AUTH_MODE flips trusted_gateway → launcher native)
//  9. Mailer.SendCredentialsEmail (best-effort)
//  10. Audit + return {tenant_id, url, initial_password, ...}
//
// Failure semantics: if step 5 succeeds but 6/7/8 fails, the DB is
// inconsistent (is_public=false but container still trusted_gateway).
// V1 logs loudly and surfaces in the response; V2 should transaction.
func (h *Handler) handlePromoteTenant(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id é obrigatório")
		return
	}

	var req promoteReq
	if r.Body != http.NoBody {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, errEmptyBody) {
			// Tolerate empty body — only require valid JSON if any sent.
			// (json.Decode returns io.EOF for empty; treat as zero-value req.)
			if !errors.Is(err, errEmptyBody) && err.Error() != "EOF" {
				writeError(w, http.StatusBadRequest, "invalid json: "+err.Error())
				return
			}
		}
	}

	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant não encontrado")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}

	if !t.IsPublic {
		writeError(w, http.StatusConflict, "tenant já é privado (is_public=false) — promoção é só pra tenant publico")
		return
	}

	if t.VolumePath == "" {
		writeError(w, http.StatusUnprocessableEntity, "tenant sem volume_path — não dá pra ler onboarding.json")
		return
	}

	state, stateErr := readOnboardingState(t.VolumePath)
	if stateErr != nil && !req.Force {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":       "não consegui ler workspace/state/onboarding.json — Sofia ainda não rodou nesse tenant?",
			"detail":      stateErr.Error(),
			"hint":        "pra prosseguir mesmo assim, mande {\"force\": true, \"owner_email\": \"...\"} no body",
		})
		return
	}

	// Resolve owner email: explicit override beats state capture.
	ownerEmail := strings.TrimSpace(strings.ToLower(req.OwnerEmailOverride))
	if ownerEmail == "" && state != nil {
		ownerEmail = strings.TrimSpace(strings.ToLower(state.OwnerCaptured.Email))
	}
	if ownerEmail == "" {
		writeError(w, http.StatusUnprocessableEntity,
			"owner_email ausente — Sofia não capturou e admin não enviou override")
		return
	}
	if !emailRE.MatchString(ownerEmail) {
		writeError(w, http.StatusBadRequest, "owner_email inválido: "+ownerEmail)
		return
	}

	// Gate on promotion.ready unless force.
	if !req.Force {
		if state == nil || !state.Promotion.Ready {
			blockedBy := []string{"state.promotion.ready=false"}
			if state != nil && len(state.Promotion.BlockedBy) > 0 {
				blockedBy = state.Promotion.BlockedBy
			}
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":      "tenant não está pronto pra promoção",
				"blocked_by": blockedBy,
				"hint":       "complete o discovery + 5 áreas de aprofundamento, OU passe {\"force\":true} se quer pular",
			})
			return
		}
	}

	// Dedup: same email already on another tenant?
	if existing, err := h.Tenants.GetByOwnerEmail(r.Context(), ownerEmail); err == nil && existing != nil && existing.ID != t.ID {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "esse email já é dono de outro tenant",
			"tenant_id": existing.ID,
			"url":       tenantURL(h.Cfg, existing.Subdomain),
		})
		return
	} else if err != nil && !errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error checking owner dedup: "+err.Error())
		return
	}

	// Step 5: DB mutations.
	if err := h.Tenants.Promote(r.Context(), t.ID, ownerEmail, "launcher"); err != nil {
		writeError(w, http.StatusInternalServerError, "db promote failed: "+err.Error())
		return
	}
	owner, err := h.Users.EnsureInvited(r.Context(), ownerEmail)
	if err != nil {
		log.Printf("promote %s: EnsureInvited failed: %v", t.ID, err)
		writeError(w, http.StatusInternalServerError, "criar usuário owner falhou: "+err.Error())
		return
	}
	if err := h.Memberships.Upsert(r.Context(), owner.ID, t.ID, store.RoleTenantOwner); err != nil {
		log.Printf("promote %s: membership upsert failed: %v", t.ID, err)
		writeError(w, http.StatusInternalServerError, "criar membership owner falhou: "+err.Error())
		return
	}

	// Step 6: Filesystem — flip ui-visibility + seed dashboardauth password.
	if err := tenant.SetUIVisibilityActiveProfile(t.VolumePath, tenant.UIProfileTenant); err != nil {
		log.Printf("promote %s: SetUIVisibilityActiveProfile failed (DB already promoted): %v", t.ID, err)
		// Don't abort — UI fallback works, this is recoverable post-hoc.
	}

	password, err := auth.GeneratePassword()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "gerar senha falhou: "+err.Error())
		return
	}
	if err := tenant.SeedDashboardPassword(r.Context(), t.VolumePath, password); err != nil {
		log.Printf("promote %s: SeedDashboardPassword failed (DB already promoted): %v", t.ID, err)
		writeError(w, http.StatusInternalServerError,
			"escrever launcher-auth.db falhou: "+err.Error()+" — DB já marcou is_public=false; corrija manualmente")
		return
	}

	// Step 7: Mark state.json promoted (direct file write — container is
	// about to recreate, can't exec a skill in it right now).
	if state != nil {
		markPromotedInState(t.VolumePath, actorEmailFromCtx(r.Context()))
	}

	// Step 7.5: Revoke the tenant's routes in the jotaduo-wa sidecar so a
	// late inbound reply from a former lead's number stops being routed
	// back to this (now-cliente) tenant. Defense in depth: the recreate
	// at step 8 already strips JOTADUO_WA_HMAC_SECRET from the container
	// env so the launcher endpoint would 503 the webhook anyway — this
	// prevents the sidecar from even firing.
	//
	// Best-effort: a sidecar issue must NOT abort the promotion. The DB
	// row + container recreate are the source of truth; the routing
	// revoke is hygiene. Logged so operators can re-run it manually if
	// the sidecar was momentarily unreachable.
	if err := h.RevokeJotaduoWARouting(r.Context(), t.ID); err != nil {
		log.Printf("promote %s: revoke jotaduo-wa routing failed (non-fatal): %v", t.ID, err)
	}

	// Step 8: Recreate container so it boots with PICOCLAW_AUTH_MODE=launcher
	// (instead of trusted_gateway) and the corrected ALLOWED_CHANNELS.
	if err := h.Provisioner.Recreate(r.Context(), t.ID); err != nil {
		log.Printf("promote %s: container recreate failed (DB promoted + password seeded): %v", t.ID, err)
		// Tenant is now in a consistent DB state but container still old.
		// Admin can manually trigger recreate from the panel.
		writeJSON(w, http.StatusAccepted, map[string]any{
			"tenant_id":        t.ID,
			"url":              tenantURL(h.Cfg, t.Subdomain),
			"owner_email":      ownerEmail,
			"initial_password": password,
			"warning":          "promoção concluída no DB mas recreate do container falhou: " + err.Error(),
			"hint":             "use POST /api/v1/tenants/" + t.ID + "/recreate pra finalizar",
		})
		return
	}

	// Step 9: Email (best-effort).
	if h.Mailer != nil && h.Mailer.Enabled() {
		go h.Mailer.SendCredentialsEmail(
			ownerEmail,
			t.DisplayName,
			tenantURL(h.Cfg, t.Subdomain),
			ownerEmail,
			password,
			"", // no magic link for promotions — could add later
		)
	}

	// Step 10: Audit + response.
	h.auditTenantOp(r, t.ID, "tenant.promote")

	resp := map[string]any{
		"tenant_id":        t.ID,
		"url":              tenantURL(h.Cfg, t.Subdomain),
		"owner_email":      ownerEmail,
		"initial_password": password,
		"login_mode":       "password",
		"info":             "Tenant promovido a cliente. Owner criado, senha gerada, container recriado.",
	}
	if h.Mailer == nil || !h.Mailer.Enabled() {
		resp["warning"] = "SMTP não configurado — entregue email + senha manualmente ao owner"
	} else {
		resp["info"] = resp["info"].(string) + " Email com URL+senha enviado pro owner."
	}
	writeJSON(w, http.StatusOK, resp)
}

// errEmptyBody is what we expect from json.Decoder on an empty body.
// Used so an empty {} doesn't trip the "invalid json" branch.
var errEmptyBody = errors.New("EOF")

// handleGetTenantOnboardingState exposes workspace/state/onboarding.json
// as JSON so the admin panel can render the current phase + pre-fill the
// promote modal with the captured owner email. Returns 404 when the
// state file doesn't exist (tenant created but Sofia never ran).
func (h *Handler) handleGetTenantOnboardingState(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id é obrigatório")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant não encontrado")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	if t.VolumePath == "" {
		writeError(w, http.StatusUnprocessableEntity, "tenant sem volume_path")
		return
	}
	state, err := readOnboardingState(t.VolumePath)
	if err != nil {
		// Distinguish "not yet" (404) from "corrupt" (500). The reader
		// embeds the os.ErrNotExist match in the message — cheap check.
		if strings.Contains(err.Error(), "não existe") {
			http.NotFound(w, r)
			return
		}
		writeError(w, http.StatusInternalServerError, "read state: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// readOnboardingState reads volumePath/workspace/state/onboarding.json
// produced by the onboarding-state skill. Returns (nil, err) when the
// file is missing or unparseable; the caller decides whether to abort
// or accept a force=true override.
func readOnboardingState(volumePath string) (*onboardingState, error) {
	path := filepath.Join(volumePath, "workspace", "state", "onboarding.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("onboarding.json não existe em %s", path)
		}
		return nil, fmt.Errorf("ler %s: %w", path, err)
	}
	var state onboardingState
	if err := json.Unmarshal(raw, &state); err != nil {
		return nil, fmt.Errorf("parse onboarding.json: %w", err)
	}
	return &state, nil
}

// markPromotedInState rewrites onboarding.json with promotion.promoted_at
// = now() + promoted_by = the actor's email. Best-effort; logs on failure.
func markPromotedInState(volumePath, actorEmail string) {
	path := filepath.Join(volumePath, "workspace", "state", "onboarding.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		log.Printf("markPromotedInState: read %s: %v", path, err)
		return
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		log.Printf("markPromotedInState: parse %s: %v", path, err)
		return
	}
	promo, _ := doc["promotion"].(map[string]any)
	if promo == nil {
		promo = map[string]any{}
		doc["promotion"] = promo
	}
	promo["promoted_at"] = time.Now().UTC().Format(time.RFC3339)
	promo["promoted_by"] = actorEmail
	promo["ready"] = false
	doc["phase"] = "promoted"
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		log.Printf("markPromotedInState: marshal: %v", err)
		return
	}
	if err := os.WriteFile(path, append(out, '\n'), 0o600); err != nil {
		log.Printf("markPromotedInState: write %s: %v", path, err)
	}
}

// actorEmailFromCtx returns the email of the platform_admin user
// performing the action, or "system" if not resolvable.
func actorEmailFromCtx(ctx context.Context) string {
	if u, ok := userFromContext(ctx); ok {
		return u.Email
	}
	return "system"
}
