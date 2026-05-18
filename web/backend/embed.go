package main

import (
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/sipeed/picoclaw/pkg/logger"
)

//go:embed all:dist
var frontendFS embed.FS

// viteDevURLEnv lets developers proxy the frontend to a running Vite dev
// server instead of serving the embedded production build. When set (e.g.
// "http://127.0.0.1:5194"), GET /, /assets/*, /@vite/*, /@fs/*, /node_modules/*,
// /src/*, and HTML SPA fallbacks are reverse-proxied to that URL — yielding
// real HMR without rebuilding the Go binary on every frontend edit.
const viteDevURLEnv = "PICOCLAW_VITE_DEV_URL"

// registerEmbedRoutes sets up the HTTP handler to serve the embedded frontend files
func registerEmbedRoutes(mux *http.ServeMux) {
	// Register correct MIME type for SVG files
	// Go's built-in mime.TypeByExtension returns "image/svg" which is incorrect
	// The correct MIME type per RFC 6838 is "image/svg+xml"
	if err := mime.AddExtensionType(".svg", "image/svg+xml"); err != nil {
		logger.ErrorC("web", fmt.Sprintf("Warning: failed to register SVG MIME type: %v", err))
	}

	// Dev-only: proxy the frontend to the Vite dev server when configured.
	// This bypasses the embedded `dist/` entirely so every Vite HMR update
	// reaches the browser without a Go rebuild/restart.
	if dev := strings.TrimSpace(os.Getenv(viteDevURLEnv)); dev != "" {
		if handler, err := newViteProxyHandler(dev); err != nil {
			logger.ErrorC("web", fmt.Sprintf("vite dev proxy %s disabled: %v", dev, err))
		} else {
			logger.InfoC("web", fmt.Sprintf("vite dev proxy enabled -> %s (set %s='' to disable)", dev, viteDevURLEnv))
			mux.Handle("/", handler)
			return
		}
	}

	// Attempt to get the subdirectory 'dist' where Vite usually builds
	subFS, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		// Log a warning if dist doesn't exist yet (e.g., during development before a frontend build)
		logger.WarnC("web",
			"Warning: no 'dist' folder found in embedded frontend. "+
				"Ensure you run `pnpm build:backend` in the frontend directory "+
				"before building the Go backend.",
		)
		return
	}

	fileServer := http.FileServer(http.FS(subFS))

	// Serve static assets and fallback to index.html for SPA routes.
	mux.Handle(
		"/",
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				http.NotFound(w, r)
				return
			}

			// Keep unknown API paths as 404 instead of falling back to SPA entry.
			if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
				http.NotFound(w, r)
				return
			}

			cleanPath := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
			if cleanPath == "." {
				cleanPath = ""
			}

			// Existing static files/directories should be served directly.
			if cleanPath != "" {
				if _, statErr := fs.Stat(subFS, cleanPath); statErr == nil {
					fileServer.ServeHTTP(w, r)
					return
				}
				// Missing asset-like paths should remain 404.
				if strings.Contains(path.Base(cleanPath), ".") {
					fileServer.ServeHTTP(w, r)
					return
				}
			}

			indexReq := r.Clone(r.Context())
			indexReq.URL.Path = "/"
			fileServer.ServeHTTP(w, indexReq)
		}),
	)
}

// newViteProxyHandler returns an http.Handler that reverse-proxies every
// non-/api request to the Vite dev server. API paths (`/api/*` and bare
// `/api`) keep 404'ing the way the embedded handler did, so they fall back
// through to the chi router on the same mux. Websocket upgrade headers for
// Vite HMR are preserved because httputil.ReverseProxy passes them through
// by default.
func newViteProxyHandler(rawURL string) (http.Handler, error) {
	target, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("parse %q: %w", rawURL, err)
	}
	if target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("vite url must include scheme and host (got %q)", rawURL)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	original := proxy.Director
	proxy.Director = func(req *http.Request) {
		original(req)
		// Vite generates absolute URLs based on the Host header; keep the
		// origin host so HMR client connects back to the same origin the
		// browser is already using.
		req.Host = target.Host
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		http.Error(w, "vite dev proxy unreachable: "+err.Error(), http.StatusBadGateway)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	}), nil
}
