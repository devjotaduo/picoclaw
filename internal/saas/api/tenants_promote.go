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
	Phase         string                   `json:"phase"`
	OwnerCaptured onboardingOwnerCaptured  `json:"owner_captured"`
	Promotion     onboardingPromotionField `json:"promotion"`
	Discovery     map[string]any           `json:"discovery"`
	Deepening     map[string]any           `json:"deepening"`
}

type onboardingOwnerCaptured struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	WhatsApp string `json:"whatsapp"`
}

type onboardingPromotionField struct {
	Ready      bool     `json:"ready"`
	BlockedBy  []string `json:"blocked_by"`
	PromotedAt string   `json:"promoted_at"`
	PromotedBy string   `json:"promoted_by"`
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
			"error":  "não consegui ler workspace/state/onboarding.json — Sofia ainda não rodou nesse tenant?",
			"detail": stateErr.Error(),
			"hint":   "pra prosseguir mesmo assim, mande {\"force\": true, \"owner_email\": \"...\"} no body",
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

	// Compute what would block this promotion if not forced. Used both for
	// the 422 response (when !req.Force) AND for the audit-trail log line
	// when an admin force-promotes despite blockers (audit P0 #9).
	var bypassedBlockers []string
	if state == nil {
		bypassedBlockers = []string{"onboarding_state_missing"}
	} else if !state.Promotion.Ready {
		if len(state.Promotion.BlockedBy) > 0 {
			bypassedBlockers = state.Promotion.BlockedBy
		} else {
			bypassedBlockers = []string{"state.promotion.ready=false"}
		}
	}

	// Gate on promotion.ready unless force.
	if !req.Force {
		if len(bypassedBlockers) > 0 {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
				"error":      "tenant não está pronto pra promoção",
				"blocked_by": bypassedBlockers,
				"hint":       "complete o discovery + 5 áreas de aprofundamento, OU passe {\"force\":true} se quer pular",
			})
			return
		}
	} else if len(bypassedBlockers) > 0 {
		// Admin force-promoted DESPITE blockers — record what was bypassed
		// so post-hoc audit can answer "did this tenant skip discovery?".
		// Logged as a single line for easy grep, and the audit action verb
		// changes to tenant.promote.forced so dashboards can filter for it.
		log.Printf(
			"promote %s: FORCED by %s — bypassing blockers: [%s] | owner_email=%s",
			t.ID, actorEmailFromCtx(r.Context()),
			strings.Join(bypassedBlockers, ","),
			ownerEmail,
		)
	}

	// Dedup: same email already on another tenant?
	if existing, err := h.Tenants.GetByOwnerEmail(
		r.Context(),
		ownerEmail,
	); err == nil && existing != nil &&
		existing.ID != t.ID {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":     "esse email já é dono de outro tenant",
			"tenant_id": existing.ID,
			"url":       tenantURL(h.Cfg, existing.Subdomain),
		})
		return
	} else if err != nil &&
		!errors.Is(err, store.ErrTenantNotFound) {
		writeError(w, http.StatusInternalServerError, "db error checking owner dedup: "+err.Error())
		return
	}

	// Step 5: DB mutations. Capture the original auth_backend BEFORE the
	// UPDATE so a downstream failure can rollback via UnpromoteRollback
	// (audit P1 #21). Without this, a failure at step 6+ left the DB
	// claiming "cliente" while the container was still publico —
	// promote returned 500 but the row was stuck in the inconsistent state.
	originalAuthBackend := t.AuthBackend
	if err := h.Tenants.Promote(r.Context(), t.ID, ownerEmail, "launcher"); err != nil {
		// Concurrent Promote landed first (audit P1 #24) — answer
		// idempotently with the existing tenant info instead of
		// clobbering with parallel filesystem writes + recreates.
		if errors.Is(err, store.ErrTenantAlreadyPromoted) {
			writeJSON(w, http.StatusConflict, map[string]any{
				"error":     "tenant já foi promovido (race com outro request)",
				"tenant_id": t.ID,
				"url":       tenantURL(h.Cfg, t.Subdomain),
				"hint":      "se você precisa da senha gerada, use password.rotate",
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "db promote failed: "+err.Error())
		return
	}
	owner, err := h.Users.EnsureInvited(r.Context(), ownerEmail)
	if err != nil {
		log.Printf("promote %s: EnsureInvited failed: %v", t.ID, err)
		rollbackPromote(r.Context(), h.Tenants, t.ID, ownerEmail, originalAuthBackend, "EnsureInvited")
		writeError(w, http.StatusInternalServerError, "criar usuário owner falhou: "+err.Error())
		return
	}
	if err := h.Memberships.Upsert(r.Context(), owner.ID, t.ID, store.RoleTenantOwner); err != nil {
		log.Printf("promote %s: membership upsert failed: %v", t.ID, err)
		rollbackPromote(r.Context(), h.Tenants, t.ID, ownerEmail, originalAuthBackend, "Memberships.Upsert")
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
		rollbackPromote(r.Context(), h.Tenants, t.ID, ownerEmail, originalAuthBackend, "GeneratePassword")
		writeError(w, http.StatusInternalServerError, "gerar senha falhou: "+err.Error())
		return
	}
	if err := tenant.SeedDashboardPassword(r.Context(), t.VolumePath, password); err != nil {
		log.Printf("promote %s: SeedDashboardPassword failed: %v", t.ID, err)
		rollbackPromote(r.Context(), h.Tenants, t.ID, ownerEmail, originalAuthBackend, "SeedDashboardPassword")
		writeError(w, http.StatusInternalServerError,
			"escrever launcher-auth.db falhou: "+err.Error()+" — DB foi revertido pra is_public=true")
		return
	}

	// Step 7: Mark state.json promoted (direct file write — container is
	// about to recreate, can't exec a skill in it right now).
	if state != nil {
		markPromotedInState(t.VolumePath, actorEmailFromCtx(r.Context()))
	}

	// Step 7.5: Restore the canonical workspace/AGENT.md from the
	// AGENT.cliente.md backup the provisioner left behind when this
	// tenant was created as public. Without this, the cliente boots into
	// the Sofia-mode prompt that was active while public — Rafael+team
	// orchestration is gone, the main agent keeps "BEing Sofia" and
	// keeps trying to run jotaduo-discovery on a tenant that's already
	// past discovery. Idempotent: no-op when the backup doesn't exist
	// (tenant was never public, e.g. cliente created directly).
	if err := tenant.RestoreClienteAgentMD(t.VolumePath); err != nil {
		log.Printf(
			"promote %s: restore cliente AGENT.md failed (non-fatal — cliente will boot with Sofia prompt until manual fix): %v",
			t.ID,
			err,
		)
	}

	// Step 8: Recreate container so it boots with PICOCLAW_AUTH_MODE=launcher
	// (instead of trusted_gateway) and the corrected ALLOWED_CHANNELS.
	if err := h.Provisioner.Recreate(r.Context(), t.ID); err != nil {
		log.Printf("promote %s: container recreate failed (DB promoted + password seeded): %v", t.ID, err)
		// Distinct audit action so dashboards can highlight partial
		// failures the operator might miss in the 202 response (P1 #22).
		h.auditTenantOp(r, t.ID, "tenant.promote.recreate_failed")
		// Tenant is now in a consistent DB state but container still old.
		// Admin can manually trigger recreate from the panel. We do NOT
		// revoke the jotaduo-wa routes here — if Recreate failed the
		// container is likely still running the OLD spec (publico) and
		// stripping routing would silently lose pending lead replies
		// (P1 #25). Routing cleanup waits until Recreate actually succeeds.
		writeJSON(w, http.StatusAccepted, map[string]any{
			"tenant_id":        t.ID,
			"url":              tenantURL(h.Cfg, t.Subdomain),
			"owner_email":      ownerEmail,
			"initial_password": password,
			"warning":          "promoção concluída no DB mas recreate do container falhou: " + err.Error(),
			"hint":             "use POST /api/v1/tenants/" + t.ID + "/recreate pra finalizar — jotaduo-wa routing NÃO foi revogada pra não perder leads",
		})
		return
	}

	// Step 8.5 (was 7.5): Revoke the tenant's routes in the jotaduo-wa
	// sidecar NOW that Recreate succeeded — running container is on the
	// cliente spec, has no JOTADUO_WA_HMAC_SECRET, would 503 any inbound
	// webhook. Removing the sidecar routes prevents the round-trip even.
	// Audit P1 #25 (2026-05-27): originally this ran BEFORE Recreate, so
	// a Recreate failure left the OLD publico container running with no
	// routing — leads got silently dropped. Now revoke only happens once
	// the cliente container is up.
	//
	// Best-effort: a sidecar issue must NOT abort the (already-succeeded)
	// promotion. Operator can re-run the revoke manually if the sidecar
	// was momentarily unreachable.
	if err := h.RevokeJotaduoWARouting(r.Context(), t.ID); err != nil {
		log.Printf(
			"promote %s: revoke jotaduo-wa routing failed (non-fatal, container already on cliente spec): %v",
			t.ID,
			err,
		)
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

	// Step 10: Audit + response. Distinct verb when force bypassed real
	// blockers so audit dashboards can highlight forced promotions (P0 #9).
	auditAction := "tenant.promote"
	if req.Force && len(bypassedBlockers) > 0 {
		auditAction = "tenant.promote.forced"
	}
	h.auditTenantOp(r, t.ID, auditAction)

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

// rollbackPromote reverses the Step 5 DB Promote when any later step
// fails. Best-effort: a rollback error is logged but doesn't replace
// the original failure that the user sees. Audit P1 #21 (2026-05-27):
// without this helper, a 500 from EnsureInvited/Memberships/SeedPassword
// left the tenant row with is_public=false + owner_email=<x> but no
// matching user + no dashboard password — operator had to manually
// `UPDATE tenants` to re-enable the public funnel.
func rollbackPromote(
	ctx context.Context,
	tenants *store.TenantStore,
	tenantID, ownerEmail, originalAuthBackend, failedStep string,
) {
	if err := tenants.UnpromoteRollback(ctx, tenantID, ownerEmail, originalAuthBackend); err != nil {
		log.Printf("promote %s: UnpromoteRollback after %s failure ALSO failed (manual SQL needed): %v",
			tenantID, failedStep, err)
		return
	}
	log.Printf("promote %s: rolled back DB to is_public=true after %s failure",
		tenantID, failedStep)
}

// actorEmailFromCtx returns the email of the platform_admin user
// performing the action, or "system" if not resolvable.
func actorEmailFromCtx(ctx context.Context) string {
	if u, ok := userFromContext(ctx); ok {
		return u.Email
	}
	return "system"
}
