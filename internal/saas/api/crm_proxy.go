package api

import (
	"net/http"
	"net/http/httputil"
	"net/url"
)

// newCRMProxy reverse-proxies admin-authenticated requests to the embedded
// open-crm sidecar (Node + Hono + SQLite). The opencrm container is on an
// internal Docker network (no Traefik label), so this proxy is the only
// public path to it — and it sits behind the same session middleware as the rest
// of /api/v1, so unauthenticated callers get 401.
func newCRMProxy(target string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "opencrm proxy misconfigured: "+err.Error(), http.StatusInternalServerError)
		})
	}
	rp := httputil.NewSingleHostReverseProxy(u)
	// Hide upstream errors from the admin browser; surface a stable shape.
	rp.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, e error) {
		writeError(w, http.StatusBadGateway, "opencrm unreachable: "+e.Error())
	}
	return rp
}
