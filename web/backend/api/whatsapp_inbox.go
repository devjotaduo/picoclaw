package api

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httputil"
	"strconv"
	"strings"
)

// registerWhatsAppInboxRoutes mounts the WhatsApp inbox proxy. Every request
// is reverse-proxied to the gateway's /whatsapp_native/inbox/* endpoints,
// which is where the whatsmeow client and the SQLite inbox store live.
//
// The launcher does not duplicate state — it only forwards authenticated
// dashboard requests, so the inbox stays in lockstep with what the agent
// pipeline sees.
func (h *Handler) registerWhatsAppInboxRoutes(mux *http.ServeMux) {
	mux.Handle("/api/whatsapp/", h.inboxReverseProxy())
}

// inboxReverseProxy builds a ReverseProxy that rewrites `/api/whatsapp/*` to
// `/whatsapp_native/inbox/*` on the gateway. SSE streams (`/events`) work
// because httputil.ReverseProxy auto-detects `text/event-stream` and switches
// to unbuffered streaming.
func (h *Handler) inboxReverseProxy() http.Handler {
	rp := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			target := h.gatewayProxyURL()
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.Host = target.Host

			suffix := strings.TrimPrefix(req.URL.Path, "/api/whatsapp")
			// Map `/api/whatsapp` (root) and `/api/whatsapp/foo` to the gateway:
			//   /api/whatsapp           → /whatsapp_native/inbox
			//   /api/whatsapp/chats     → /whatsapp_native/inbox/chats
			//   /api/whatsapp/chats/X   → /whatsapp_native/inbox/chats/X
			req.URL.Path = singleSlashJoin("/whatsapp_native/inbox", suffix)

			// httputil sets X-Forwarded-For automatically; clean up any
			// incoming forgery attempts on the launcher boundary.
			req.Header.Del("X-Forwarded-Host")
		},
		ErrorHandler: func(rw http.ResponseWriter, _ *http.Request, err error) {
			rw.Header().Set("Content-Type", "application/json")
			rw.WriteHeader(http.StatusBadGateway)
			_, _ = rw.Write([]byte(`{"error":"failed to reach gateway: ` + escapeJSONString(err.Error()) + `"}`))
		},
		ModifyResponse: func(res *http.Response) error {
			applyWhatsAppInboxUnavailableFallback(res)
			return nil
		},
		// FlushInterval -1 forces flush after every Write — required for SSE
		// to stream events to the dashboard without buffering.
		FlushInterval: -1,
	}
	return rp
}

func applyWhatsAppInboxUnavailableFallback(res *http.Response) {
	if res == nil || res.StatusCode != http.StatusNotFound || res.Request == nil {
		return
	}
	if res.Request.Method != http.MethodGet {
		return
	}
	path := strings.TrimSuffix(res.Request.URL.Path, "/")
	var body []byte
	contentType := "application/json"
	switch path {
	case "/whatsapp_native/inbox", "/whatsapp_native/inbox/chats":
		body = []byte(`{"chats":[],"unavailable":true,"error":"whatsapp native inbox unavailable"}`)
	case "/whatsapp_native/inbox/reports":
		body = []byte(emptyWhatsAppInboxReportJSON(res.Request))
	case "/whatsapp_native/inbox/events":
		body = []byte(": whatsapp native inbox unavailable\n\n")
		contentType = "text/event-stream"
		res.Header.Set("Cache-Control", "no-cache")
	default:
		return
	}
	_ = res.Body.Close()
	res.StatusCode = http.StatusOK
	res.Status = "200 OK"
	res.Header.Set("Content-Type", contentType)
	res.Header.Set("X-PicoClaw-Upstream-Unavailable", "whatsapp-native-inbox")
	res.Body = io.NopCloser(bytes.NewReader(body))
	res.ContentLength = int64(len(body))
	res.Header.Set("Content-Length", strconv.Itoa(len(body)))
}

func emptyWhatsAppInboxReportJSON(r *http.Request) string {
	from, _ := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
	to, _ := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
	return `{"from":` + strconv.FormatInt(from, 10) +
		`,"to":` + strconv.FormatInt(to, 10) +
		`,"contacts":0,"new_contacts":0,"messages":0,"inbound_messages":0,"outbound_messages":0,` +
		`"agent_replies":0,"human_replies":0,"paused_chats":0,"qualified_leads":0,"handoffs":0,` +
		`"unanswered":0,"avg_first_response_seconds":0,"by_intent":[],"by_priority":[],` +
		`"by_lead_stage":[],"top_products":[],"daily":[],"unavailable":true,` +
		`"error":"whatsapp native inbox unavailable"}`
}

// singleSlashJoin joins `base + suffix` ensuring exactly one slash between
// them and no trailing slash unless the suffix carried one explicitly.
func singleSlashJoin(base, suffix string) string {
	if suffix == "" {
		return base
	}
	if strings.HasPrefix(suffix, "/") {
		return base + suffix
	}
	return base + "/" + suffix
}

// escapeJSONString does the minimum escaping needed to embed err.Error() in
// a hand-written JSON literal: backslash and double-quote.
func escapeJSONString(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '\\', '"':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				continue
			}
			b.WriteRune(r)
		}
	}
	return b.String()
}
