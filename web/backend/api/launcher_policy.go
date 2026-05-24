package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
	"github.com/sipeed/picoclaw/pkg/config"
	"github.com/sipeed/picoclaw/web/backend/middleware"
)

func (h *Handler) registerLauncherPolicyRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/launcher/policy", h.handleGetLauncherPolicy)
}

func (h *Handler) PolicyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := middleware.TrustedGatewayClaims(r)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		feature, required, known := saasPolicy.FeatureForRequest(r.Method, r.URL.Path)
		if !known {
			next.ServeHTTP(w, r)
			return
		}
		launcherPolicy, err := saasPolicy.LoadFile(h.homeDir())
		if err != nil {
			http.Error(w, "failed to load launcher policy", http.StatusInternalServerError)
			return
		}
		if !saasPolicy.Allowed(claims.Role, launcherPolicy.RolePolicy, feature, required) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "role policy does not allow this action"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) handleGetLauncherPolicy(w http.ResponseWriter, r *http.Request) {
	role := saasPolicy.RolePlatformAdmin
	if claims, ok := middleware.TrustedGatewayClaims(r); ok {
		role = claims.Role
	}
	launcherPolicy, err := saasPolicy.LoadFile(h.homeDir())
	if err != nil {
		http.Error(w, "failed to load launcher policy", http.StatusInternalServerError)
		return
	}
	// is_saas_admin enables the embedded SaaS administration sidebar group
	// and the /admin/* routes on the frontend. It's a coarse gate driven by
	// env (PICOCLAW_SAAS_ADMIN_MODE) plus the presence of controlplane creds.
	// The trusted-gateway role check still keeps tenant-scoped roles out.
	saasReady := loadSaaSAdminConfig().Ready() && role == saasPolicy.RolePlatformAdmin
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"role":          role,
		"feature_ids":   saasPolicy.FeatureIDs,
		"features":      saasPolicy.EffectiveFeatures(role, launcherPolicy.RolePolicy),
		"ui":            launcherUIResponse(h.launcherUIConfig()),
		"is_saas_admin": saasReady,
		// onboarding sinaliza pro frontend que o cadastro da empresa
		// (memory/empresa.md) ainda está em template — banner deve
		// chamar o operador a completar (com Sofia). Mesmos marcadores
		// que pkg/agent/onboarding_default.go usa pra promover Sofia
		// a default agent — mantém consistência entre backend e UI.
		"onboarding": h.checkOnboardingState(),
	})
}

// onboardingState é o que vai no campo "onboarding" da launcher policy.
// Campos não-vazios são surface-explicito pro banner exibir.
type onboardingState struct {
	Incomplete bool     `json:"incomplete"`
	Pending    []string `json:"pending,omitempty"` // ids amigáveis dos campos vazios
}

// reOnboardingEmptyField — marca linhas no formato "Chave:" sem valor.
// Usado pra extrair quais campos exatos faltam (e.g. ["Nome","Segmento"]).
var reOnboardingEmptyField = regexp.MustCompile(`(?m)^([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^:\n]{0,40}):\s*$`)

func (h *Handler) checkOnboardingState() onboardingState {
	state := onboardingState{Incomplete: false}
	home := h.homeDir()
	if home == "" {
		return state
	}
	path := filepath.Join(home, "workspace", "memory", "empresa.md")
	data, err := os.ReadFile(path)
	if err != nil {
		// Sem arquivo = sem cadastro. Sofia deve estar como default.
		if os.IsNotExist(err) {
			state.Incomplete = true
		}
		return state
	}
	content := string(data)
	if strings.Contains(content, "Status: pendente de validação") {
		state.Incomplete = true
	}
	matches := reOnboardingEmptyField.FindAllStringSubmatch(content, -1)
	for _, m := range matches {
		field := strings.TrimSpace(m[1])
		// Filtra rótulos óbvios que não são bloqueantes (subtítulos, headers, etc).
		// Aceita só campos identificadores que importam pro atendimento.
		switch field {
		case "Nome", "Segmento", "Horário", "Endereço", "WhatsApp",
			"Site", "Instagram", "Formas de pagamento", "Faixa de preço",
			"Quando chamar humano", "Pode falar preço":
			state.Pending = append(state.Pending, field)
			state.Incomplete = true
		}
	}
	return state
}

func (h *Handler) launcherUIConfig() config.UIConfig {
	ui := config.DefaultUIConfig()
	if h.configPath == "" {
		return ui
	}
	cfg, err := config.LoadConfig(h.configPath)
	if err != nil {
		return ui
	}
	return cfg.UI
}

func launcherUIResponse(ui config.UIConfig) map[string]any {
	tasks := make([]map[string]string, 0, len(ui.QuickTasks))
	for _, task := range ui.QuickTasks {
		label := strings.TrimSpace(task.Label)
		prompt := strings.TrimSpace(task.Prompt)
		if label == "" || prompt == "" {
			continue
		}
		entry := map[string]string{
			"label":  label,
			"prompt": prompt,
		}
		if icon := strings.TrimSpace(task.Icon); icon != "" {
			entry["icon"] = icon
		}
		tasks = append(tasks, entry)
	}
	return map[string]any{
		"show_reasoning":      ui.ShowReasoning,
		"show_tool_calls":     ui.ShowToolCalls,
		"show_model_selector": ui.ShowModelSelector,
		"chat_intro":          strings.TrimSpace(ui.ChatIntro),
		"quick_tasks":         tasks,
	}
}

func (h *Handler) homeDir() string {
	if home := os.Getenv("PICOCLAW_HOME"); home != "" {
		return home
	}
	if h.configPath == "" {
		return ""
	}
	return filepath.Dir(h.configPath)
}
