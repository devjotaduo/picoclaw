package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"

	saasPolicy "github.com/sipeed/picoclaw/internal/saas/policy"
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
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"role":        role,
		"feature_ids": saasPolicy.FeatureIDs,
		"features":    saasPolicy.EffectiveFeatures(role, launcherPolicy.RolePolicy),
	})
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
