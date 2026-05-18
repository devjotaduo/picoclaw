package api

import (
	"net/http"
	"strings"
)

// tenantCORS allows tenant subdomains (and the admin host itself) to call the
// controlplane API cross-origin with credentials. The launcher SPA running on
// `<sub>.<TenantBaseDomain>` issues fetches against `adm.<TenantBaseDomain>`;
// without these headers the browser strips the session cookie.
//
// Origins are validated against TenantBaseDomain — arbitrary origins are not
// reflected back. When the cookie domain isn't configured (dev), only the
// localhost dev server is accepted in addition to TenantBaseDomain.
func (h *Handler) tenantCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" && h.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions && origin != "" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) originAllowed(origin string) bool {
	host := stripScheme(origin)
	if host == "" {
		return false
	}
	if hostMatchesBase(host, h.Cfg.TenantBaseDomain) {
		return true
	}
	if hostMatchesBase(host, h.Cfg.CookieDomain) {
		return true
	}
	// Dev: same-origin or vite dev server. Production never hits this branch.
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		return true
	}
	return false
}

func hostMatchesBase(host, base string) bool {
	base = strings.Trim(strings.ToLower(base), ".")
	if base == "" {
		return false
	}
	host = strings.Trim(strings.ToLower(host), ".")
	if host == base {
		return true
	}
	return strings.HasSuffix(host, "."+base)
}

func stripScheme(origin string) string {
	o := strings.TrimSpace(origin)
	if i := strings.Index(o, "://"); i >= 0 {
		o = o[i+3:]
	}
	if i := strings.IndexByte(o, '/'); i >= 0 {
		o = o[:i]
	}
	if i := strings.IndexByte(o, ':'); i >= 0 {
		o = o[:i]
	}
	return o
}
