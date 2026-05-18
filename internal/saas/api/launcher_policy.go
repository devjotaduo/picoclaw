package api

import (
	"net/http"

	"github.com/sipeed/picoclaw/internal/saas/policy"
)

func (h *Handler) handleGetLauncherPolicyCatalog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, policy.PolicyCatalog())
}
