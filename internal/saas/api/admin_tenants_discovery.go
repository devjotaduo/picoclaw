package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/store"
)

// Discovery-mode liberation flow:
//
// A freshly-provisioned tenant lives in "discovery" mode — the UI hides the
// full feature set and exposes a guided onboarding flow until the operator
// confirms the tenant's workspace is complete enough to flip into "active".
//
// The decision is gated by validate_workspace.py (per-workspace script that
// inspects memory/empresa.md, integrations, and segment-specific knobs). When
// it returns ok=true the admin clicks "LIBERAR TENANT" and we flip
// ui-visibility.json's active_profile from "public" to "tenant".
//
// The script is being authored in a parallel agent; until it's wired up we
// degrade gracefully: when validate_workspace.py is missing OR the tenant has
// no memory/empresa.md, the GET endpoint returns a stubbed
// {ok:false, missing_summary:[…]} response so the UI can still render the
// "needs work" state and the LIBERAR button stays disabled.

// discoveryStatus is the JSON contract returned by GET …/discovery-status.
// Mirrors what validate_workspace.py emits so the frontend renders one
// schema regardless of whether we got the data from the script or the
// fallback file inspection.
type discoveryStatus struct {
	OK                  bool                    `json:"ok"`
	Universal           []discoveryCheck        `json:"universal"`
	SegmentoKey         string                  `json:"segmento_key,omitempty"`
	SegmentoChecks      []discoveryCheck        `json:"segmento_checks,omitempty"`
	IntegracoesRequired []discoveryIntegracao   `json:"integracoes_required"`
	MissingSummary      []string                `json:"missing_summary"`
	Raw                 *map[string]interface{} `json:"raw,omitempty"`
}

type discoveryCheck struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Present bool   `json:"present"`
	Note    string `json:"note,omitempty"`
}

type discoveryIntegracao struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Status string `json:"status"` // "pending" | "resolved" | "skipped"
	Note   string `json:"note,omitempty"`
}

// uiVisibility is the on-disk shape of ui-visibility.json. Written into the
// tenant's bind-mounted home dir at the root (next to config.json).
// active_profile flips from "public" -> "tenant" on liberation.
type uiVisibility struct {
	ActiveProfile string `json:"active_profile"` // "public" | "tenant"
	LiberatedAt   string `json:"liberated_at,omitempty"`
	LiberatedBy   string `json:"liberated_by,omitempty"`
}

const (
	uiVisibilityFile = "ui-visibility.json"
	// Path RELATIVO ao volume do tenant onde o script vive. O nome
	// canonical da skill é "tenant-liberation" (vide
	// workspace/skills/tenant-liberation/SKILL.md). A pasta legada
	// "validate-workspace" não existe — esse era um nome inicial que
	// nunca foi adotado e deixava o botão LIBERAR permanentemente
	// desativado no painel admin.
	validateWorkspaceScript  = "workspace/skills/tenant-liberation/scripts/validate_workspace.py"
	validateWorkspaceTimeout = 15 * time.Second
)

// handleAdminTenantDiscoveryStatus inspects the tenant volume and returns the
// discovery checklist. Tries validate_workspace.py first, falls back to a
// direct memory/empresa.md probe when the script is absent.
//
// Optional query param ?mark_resolved=key1,key2 calls validate.py with
// --mark-resolved so the operator can flip integration items inline from
// the UI without a separate endpoint. Silently ignored when the script
// isn't available yet (UI shows the checkmark next refresh once the
// script lands).
func (h *Handler) handleAdminTenantDiscoveryStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id is required")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	if t.VolumePath == "" {
		writeError(w, http.StatusUnprocessableEntity, "tenant has no volume path")
		return
	}

	markResolved := strings.TrimSpace(r.URL.Query().Get("mark_resolved"))

	status, scriptUsed, err := runDiscoveryValidation(r.Context(), t.VolumePath, markResolved)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "discovery validation failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tenant_id":           id,
		"ok":                  status.OK,
		"universal":           status.Universal,
		"segmento_key":        status.SegmentoKey,
		"segmento_checks":     status.SegmentoChecks,
		"integracoes_required": status.IntegracoesRequired,
		"missing_summary":     status.MissingSummary,
		"script_used":         scriptUsed,
		"active_profile":      readActiveProfile(t.VolumePath),
		"raw":                 status.Raw,
	})
}

// handleAdminTenantDiscoveryLiberate flips ui-visibility.json's
// active_profile to "tenant" iff discovery-status reports ok=true. Returns
// 422 with the failed checklist when the workspace is not yet complete.
func (h *Handler) handleAdminTenantDiscoveryLiberate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "tenant id is required")
		return
	}
	t, err := h.Tenants.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrTenantNotFound) {
			writeError(w, http.StatusNotFound, "tenant not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db error: "+err.Error())
		return
	}
	if t.VolumePath == "" {
		writeError(w, http.StatusUnprocessableEntity, "tenant has no volume path")
		return
	}

	status, _, err := runDiscoveryValidation(r.Context(), t.VolumePath, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "discovery validation failed: "+err.Error())
		return
	}
	if !status.OK {
		// 422: not in a state to liberate. Frontend renders the missing items.
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"tenant_id":            id,
			"liberated":            false,
			"reason":               "discovery_incomplete",
			"missing_summary":      status.MissingSummary,
			"universal":            status.Universal,
			"segmento_checks":      status.SegmentoChecks,
			"integracoes_required": status.IntegracoesRequired,
		})
		return
	}

	actorEmail := ""
	if u, ok := userFromContext(r.Context()); ok {
		actorEmail = u.Email
	}

	if err := writeUIVisibility(t.VolumePath, uiVisibility{
		ActiveProfile: "tenant",
		LiberatedAt:   time.Now().UTC().Format(time.RFC3339),
		LiberatedBy:   actorEmail,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "write ui-visibility: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tenant_id":      id,
		"liberated":      true,
		"active_profile": "tenant",
	})
}

// runDiscoveryValidation prefers validate_workspace.py from the tenant volume
// (workspace/skills/validate-workspace/validate_workspace.py). When the script
// is missing OR fails to execute, falls back to a minimal in-process probe so
// the UI can still surface "needs work" without a 500.
//
// markResolved is a comma-separated list of integration keys passed to the
// script as --mark-resolved=<csv>. Empty string means "no mutation, just
// read the checklist".
func runDiscoveryValidation(ctx context.Context, volumePath string, markResolved string) (discoveryStatus, bool, error) {
	scriptPath := filepath.Join(volumePath, validateWorkspaceScript)
	// O script Python espera --workspace apontando pro WORKSPACE ROOT
	// (diretório que contém memory/empresa.md). No layout do volume do
	// tenant, isso é <volumePath>/workspace/. Passar <volumePath> direto
	// faz o script procurar memory/empresa.md em <volumePath>/memory/
	// que NÃO existe — bug que deixava o checklist sempre vazio.
	workspaceRoot := filepath.Join(volumePath, "workspace")
	if _, err := os.Stat(scriptPath); err == nil {
		// Script exists — invoke it. Pass the workspace root so the script
		// can resolve memory/empresa.md and other workspace files.
		execCtx, cancel := context.WithTimeout(ctx, validateWorkspaceTimeout)
		defer cancel()
		args := []string{scriptPath, "--workspace-root", workspaceRoot, "--json"}
		if markResolved != "" {
			args = append(args, "--mark-resolved", markResolved)
		}
		cmd := exec.CommandContext(execCtx, "python3", args...)
		out, runErr := cmd.Output()
		if runErr == nil {
			// Parse the JSON the script emitted into our typed shape. Tolerate
			// extra fields (script may emit raw schema-of-record we don't model
			// yet) by also stashing the raw map under .Raw for the UI to render.
			var status discoveryStatus
			if err := json.Unmarshal(out, &status); err == nil {
				var raw map[string]interface{}
				_ = json.Unmarshal(out, &raw)
				if raw != nil {
					status.Raw = &raw
				}
				// Defensive: script may forget to populate slices; guarantee
				// non-nil so the frontend renders empty checklists not "null".
				if status.Universal == nil {
					status.Universal = []discoveryCheck{}
				}
				if status.IntegracoesRequired == nil {
					status.IntegracoesRequired = []discoveryIntegracao{}
				}
				if status.MissingSummary == nil {
					status.MissingSummary = []string{}
				}
				return status, true, nil
			}
			// JSON parse failed — fall through to the stub with the parse
			// error surfaced in missing_summary so the operator sees it.
			return discoveryStatus{
				OK:                  false,
				Universal:           []discoveryCheck{},
				IntegracoesRequired: []discoveryIntegracao{},
				MissingSummary: []string{
					"validate_workspace.py output is not valid JSON: " + err.Error(),
				},
			}, true, nil
		}
		// Script ran and failed (non-zero exit). Surface stderr in summary.
		stderr := ""
		var execErr *exec.ExitError
		if errors.As(runErr, &execErr) {
			stderr = strings.TrimSpace(string(execErr.Stderr))
		}
		return discoveryStatus{
			OK:                  false,
			Universal:           []discoveryCheck{},
			IntegracoesRequired: []discoveryIntegracao{},
			MissingSummary: []string{
				fmt.Sprintf("validate_workspace.py failed: %v %s", runErr, stderr),
			},
		}, true, nil
	}

	// Fallback in-process: tenants legados podem ter sido provisionados
	// antes da skill `tenant-liberation` entrar no baseline. Em vez de
	// trancar o botão LIBERAR esperando a skill ser sincronizada, parseamos
	// `empresa.md` direto aqui e devolvemos o mesmo checklist universal
	// que o Python script geraria — admin consegue liberar normalmente.
	//
	// Limitação: não detecta integrações técnicas (`integracoes_required`)
	// nem campos específicos por segmento. Pra esses casos, atualizar a
	// skill no volume do tenant (sync script será admin V2). Por agora,
	// admin assume que o discovery cobriu as integrações na conversa.
	empresaMD := filepath.Join(volumePath, "workspace", "memory", "empresa.md")
	empresaPresent := false
	empresaContent := ""
	if info, err := os.Stat(empresaMD); err == nil && !info.IsDir() && info.Size() > 0 {
		empresaPresent = true
		if b, err := os.ReadFile(empresaMD); err == nil {
			empresaContent = string(b)
		}
	}

	// Parse universal: Nome, Segmento, Email/E-mail, WhatsApp/Telefone.
	// Match case-insensitive, aceita "Chave: valor" ou "Chave:valor" com
	// valor não-vazio (e diferente de placeholder tipo "<...>" ou "(...)").
	universal := []discoveryCheck{
		{Key: "nome", Label: "Nome da empresa", Present: hasFilledField(empresaContent, "nome")},
		{Key: "segmento", Label: "Segmento", Present: hasFilledField(empresaContent, "segmento")},
		{Key: "contato_email", Label: "E-mail de contato", Present: hasFilledField(empresaContent, "email", "e-mail", "contato email", "contato e-mail")},
		{Key: "contato_whatsapp", Label: "WhatsApp / telefone", Present: hasFilledField(empresaContent, "whatsapp", "telefone", "celular", "contato whatsapp")},
	}

	allPresent := empresaPresent
	missing := []string{}
	if !empresaPresent {
		missing = append(missing, "workspace/memory/empresa.md ainda não preenchido")
		allPresent = false
	}
	for _, u := range universal {
		if !u.Present {
			missing = append(missing, u.Label+" ausente em empresa.md")
			allPresent = false
		}
	}

	return discoveryStatus{
		OK:                  allPresent,
		Universal:           universal,
		IntegracoesRequired: []discoveryIntegracao{},
		MissingSummary:      missing,
	}, false, nil
}

// hasFilledField returns true when `empresaContent` contains a line
// matching any of `aliases` as "alias: value" (case-insensitive) with
// a non-trivial value. Rejects empty values and obvious placeholders
// like "<...>", "(...)", "TBD", "todo", "n/a".
func hasFilledField(content string, aliases ...string) bool {
	if content == "" {
		return false
	}
	lower := strings.ToLower(content)
	for _, alias := range aliases {
		aliasLower := strings.ToLower(alias)
		// Look for "alias:" at line start (with optional leading whitespace).
		searchIdx := 0
		for searchIdx < len(lower) {
			idx := strings.Index(lower[searchIdx:], aliasLower+":")
			if idx < 0 {
				break
			}
			absIdx := searchIdx + idx
			// Must be at start of line (no alphanumeric before).
			if absIdx > 0 {
				prev := lower[absIdx-1]
				if prev != '\n' && prev != ' ' && prev != '\t' {
					searchIdx = absIdx + len(aliasLower) + 1
					continue
				}
			}
			// Extract value after colon, until newline.
			valStart := absIdx + len(aliasLower) + 1
			valEnd := strings.IndexByte(lower[valStart:], '\n')
			if valEnd < 0 {
				valEnd = len(lower) - valStart
			}
			value := strings.TrimSpace(content[valStart : valStart+valEnd])
			if value == "" {
				searchIdx = absIdx + len(aliasLower) + 1
				continue
			}
			// Reject placeholders.
			low := strings.ToLower(value)
			if strings.HasPrefix(low, "<") || strings.HasPrefix(low, "(") ||
				low == "tbd" || low == "todo" || low == "n/a" || low == "-" {
				searchIdx = absIdx + len(aliasLower) + 1
				continue
			}
			return true
		}
	}
	return false
}

// readActiveProfile returns the current ui-visibility.active_profile, or
// "public" when the file is missing/unreadable (discovery is the default
// state for freshly-provisioned tenants).
func readActiveProfile(volumePath string) string {
	b, err := os.ReadFile(filepath.Join(volumePath, uiVisibilityFile))
	if err != nil {
		return "public"
	}
	var v uiVisibility
	if err := json.Unmarshal(b, &v); err != nil || v.ActiveProfile == "" {
		return "public"
	}
	return v.ActiveProfile
}

// writeUIVisibility serializes v to <volumePath>/ui-visibility.json with
// 0o644 perms. Atomic write via temp-file + rename so a partially-flushed
// file never leaves the tenant in an undefined visibility state.
func writeUIVisibility(volumePath string, v uiVisibility) error {
	if volumePath == "" {
		return errors.New("empty volume path")
	}
	final := filepath.Join(volumePath, uiVisibilityFile)
	tmp := final + ".tmp"
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	if err := os.WriteFile(tmp, append(b, '\n'), 0o644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}
