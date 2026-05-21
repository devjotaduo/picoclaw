package api

import (
	"net/http"
	"net/http/httputil"

	"github.com/sipeed/picoclaw/pkg/logger"
)

// registerPublicChatRoutes proxies /api/public/chat[/*] to the gateway
// HTTP server, where publicweb.Channel handles the requests via the
// channels.WebhookHandler interface.
//
// Anonymous traffic — the controlplane tenant gateway (Phase 3) gates the
// auth bypass on tenants.is_public=true, so the launcher does NOT inject
// Authorization for these routes.
func (h *Handler) registerPublicChatRoutes(mux *http.ServeMux) {
	proxy := h.createPublicChatProxy()
	mux.HandleFunc("POST /api/public/chat", proxy.ServeHTTP)
	mux.HandleFunc("GET /api/public/chat/stream", proxy.ServeHTTP)
	mux.HandleFunc("GET /api/public/chat/health", proxy.ServeHTTP)
}

// createPublicChatProxy returns a reverse proxy tuned for the public-web
// channel:
//
//   - FlushInterval = -1 disables response buffering so the SSE stream is
//     flushed to the client on every write (without this, the SSE events
//     coalesce and the visitor sees the agent reply only after the stream
//     closes).
//   - X-Accel-Buffering: no is forwarded upstream and SHOULD be honored by
//     any intermediate proxy (nginx, Traefik) that might otherwise buffer.
//   - X-Forwarded-For carries the visitor's real IP from the launcher to
//     the gateway, so publicweb.clientIPFromRequest sees something useful
//     instead of the launcher's loopback address.
func (h *Handler) createPublicChatProxy() *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			target := h.gatewayProxyURL()
			r.SetURL(target)
			// No Authorization — public-web is anonymous by design.

			// Propagate the visitor's IP so the channel can hash it into the
			// canonical sender identity. The standard library's reverse proxy
			// rewriter already appends RemoteAddr to X-Forwarded-For; we set
			// the header explicitly only when it would otherwise be empty.
			if r.Out.Header.Get("X-Forwarded-For") == "" {
				if xf := r.In.Header.Get("X-Forwarded-For"); xf != "" {
					r.Out.Header.Set("X-Forwarded-For", xf)
				} else if ra := r.In.RemoteAddr; ra != "" {
					r.Out.Header.Set("X-Forwarded-For", ra)
				}
			}

			// Belt-and-braces: ensure no buffering at any intermediate proxy
			// in front of the gateway. This header is a hint that nginx and
			// Traefik both honor.
			r.Out.Header.Set("X-Accel-Buffering", "no")
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Errorf("Failed to proxy public-chat: %v", err)
			http.Error(w, "Gateway unavailable: "+err.Error(), http.StatusBadGateway)
		},
		// FlushInterval=-1 forces a flush after every write — required for
		// the SSE stream on /api/public/chat/stream.
		FlushInterval: -1,
	}
}
