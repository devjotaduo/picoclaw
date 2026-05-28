package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/sipeed/picoclaw/pkg/config"
)

// Endpoint do tenant (dono) pra inspecionar a readiness do workspace
// e marcar integrações técnicas como resolvidas. Espelha o que o admin
// vê em adm.<base>/tenants/discovery, mas no escopo do próprio tenant
// (sem rota admin requireRole).
//
// Cobre 2 endpoints:
//   GET  /api/workspace/validate-readiness
//   POST /api/workspace/integration/{key}/mark-resolved
//
// Ambos invocam o mesmo script Python que o admin/sofia usam:
// `workspace/skills/tenant-liberation/scripts/validate_workspace.py`.
//
// Em ambiente single-home (dev local), o workspace é resolvido via
// `cfg.WorkspacePath()`. Em ambiente tenant container, mesmo path
// (rodando dentro do home `/root/.picoclaw/`).

func (h *Handler) registerWorkspaceValidateRoutes(mux *http.ServeMux) {
	mux.HandleFunc(
		"GET /api/workspace/validate-readiness",
		h.handleWorkspaceValidateReadiness,
	)
	mux.HandleFunc(
		"POST /api/workspace/integration/{key}/mark-resolved",
		h.handleWorkspaceIntegrationMarkResolved,
	)
}

// validateScriptRelPath é o caminho RELATIVO ao workspace root onde
// o script Python vive. Mesmo path que a Sofia usa.
const validateScriptRelPath = "skills/tenant-liberation/scripts/validate_workspace.py"

// validateRunTimeout é o teto pra exec do Python. Script é rápido
// (parse markdown + JSON output), mas defendemos contra ambiente
// degradado.
const validateRunTimeout = 30 * time.Second

// validKeyRe restringe a key da integração a slug seguro — letras,
// números, _ e -. Vem da URL e é passada como CLI arg pro Python.
var validKeyRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

func (h *Handler) handleWorkspaceValidateReadiness(
	w http.ResponseWriter, r *http.Request,
) {
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w,
			fmt.Sprintf("failed to load config: %v", err),
			http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	if strings.TrimSpace(workspace) == "" {
		http.Error(w, "workspace path not configured",
			http.StatusInternalServerError)
		return
	}

	payload, err := runValidateScript(r.Context(), workspace, "")
	if err != nil {
		http.Error(w,
			fmt.Sprintf("validate script failed: %v", err),
			http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

func (h *Handler) handleWorkspaceIntegrationMarkResolved(
	w http.ResponseWriter, r *http.Request,
) {
	key := strings.TrimSpace(r.PathValue("key"))
	if key == "" {
		http.Error(w, "missing integration key", http.StatusBadRequest)
		return
	}
	if !validKeyRe.MatchString(key) {
		http.Error(w,
			"invalid integration key (allowed: [a-zA-Z0-9_-]{1,64})",
			http.StatusBadRequest)
		return
	}

	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		http.Error(w,
			fmt.Sprintf("failed to load config: %v", err),
			http.StatusInternalServerError)
		return
	}
	workspace := cfg.WorkspacePath()
	if strings.TrimSpace(workspace) == "" {
		http.Error(w, "workspace path not configured",
			http.StatusInternalServerError)
		return
	}

	payload, err := runValidateScript(r.Context(), workspace, key)
	if err != nil {
		http.Error(w,
			fmt.Sprintf("validate script failed: %v", err),
			http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(payload)
}

// runValidateScript chama o validate_workspace.py com os args certos.
// Se markResolved não-vazio, passa também --mark-resolved <key>.
// Retorna o stdout bruto (que já é JSON) — caller faz Write direto.
//
// O script tem 2 exit codes possíveis: 0 (ok:true) e 1 (ok:false). Ambos
// emitem JSON válido em stdout — não tratamos como erro de servidor.
// Apenas exit codes >=2 ou panic indicam falha estrutural.
func runValidateScript(
	parent context.Context, workspace, markResolved string,
) ([]byte, error) {
	script := filepath.Join(workspace, validateScriptRelPath)
	args := []string{script, "--workspace", workspace, "--json"}
	if markResolved != "" {
		args = append(args, "--mark-resolved", markResolved)
	}

	ctx, cancel := context.WithTimeout(parent, validateRunTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, pythonExecutable(), args...)
	cmd.Dir = workspace
	out, err := cmd.Output()
	if err != nil {
		// exit code 1 do script ainda emite JSON em stdout — aceita.
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 && len(out) > 0 {
			// validate retornou ok:false — comportamento esperado, devolve
			// o JSON normalmente.
		} else {
			stderr := ""
			if exitErr != nil {
				stderr = strings.TrimSpace(string(exitErr.Stderr))
			}
			if stderr != "" {
				return nil, fmt.Errorf("%w: %s", err, stderr)
			}
			return nil, err
		}
	}

	// Sanidade: garante que o output é JSON válido antes de passar pro
	// frontend. Evita responder lixo se script crashar de jeito esquisito.
	if !json.Valid(out) {
		return nil, fmt.Errorf("validate script returned non-JSON output: %q",
			truncateForErr(out, 200))
	}
	return out, nil
}

func truncateForErr(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}

// pythonExecutable retorna o binário Python a usar. Em Windows costuma
// ser "python", em Linux "python3". Preferimos python3 porque a imagem
// launcher instala python3 explicitamente; python é fallback pra Windows/dev.
func pythonExecutable() string {
	return resolvePythonExecutable(exec.LookPath)
}

func resolvePythonExecutable(lookPath func(string) (string, error)) string {
	if p, err := lookPath("python3"); err == nil && strings.TrimSpace(p) != "" {
		return p
	}
	if p, err := lookPath("python"); err == nil && strings.TrimSpace(p) != "" {
		return p
	}
	return "python3"
}
