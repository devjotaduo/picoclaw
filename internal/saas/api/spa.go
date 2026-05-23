package api

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// The Vite build output is embedded into the binary. The Dockerfile copies
// web/saas-admin/dist/ into internal/saas/api/dist/ before `go build` runs. A .gitkeep
// placeholder in this directory keeps the directive valid for local builds
// before the frontend has been built.
//
//go:embed all:dist
var spaFS embed.FS

// SPAHandler serves the React admin UI:
//   - /assets/* and other built static files come from embedded dist
//   - any unmatched path returns index.html (SPA fallback) so React Router takes over
//
// The router mounts API + healthz BEFORE this so they take precedence.
func SPAHandler() http.Handler {
	sub, err := fs.Sub(spaFS, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "spa embed not available", http.StatusInternalServerError)
		})
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(r.URL.Path)
		// Bare gitkeep placeholder check — if dist is just the placeholder,
		// at least surface a useful message to the operator.
		if isPlaceholderOnly(sub) {
			http.Error(w,
				"admin UI not built. Run `pnpm --dir web/saas-admin build` and rebuild the binary.",
				http.StatusServiceUnavailable)
			return
		}
		// Direct hits on built files: serve them.
		filePath := strings.TrimPrefix(clean, "/")
		if f, err := fs.Stat(sub, filePath); err == nil && !f.IsDir() {
			// Prevent the HTML shell from being cached — it references hashed
			// assets, and a stale shell would load the wrong (old) JS bundle.
			if filePath == "index.html" {
				w.Header().Set("Cache-Control", "no-store")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		// Fallback: index.html so React Router renders the right page.
		index, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(index)
	})
}

// LandingMux returns a handler that serves the static landing page from
// disk for requests whose Host matches one of the configured apex domains.
// All other hosts (admin.*, <tenant>.*, etc.) fall through to `next`.
//
// The landing page lives at $PICOCLAW_LANDING_DIR (default
// /var/lib/picoclaw-landing) on the host filesystem and is bind-mounted
// into the controlplane container. This keeps the landing OUT of the Go
// binary embed so iterating on copy/design is a single rsync away — no
// container rebuild required. The directory is checked at request time
// (not boot time) so an scp can be made visible without a restart, and
// the landing also "self-heals" if the bind-mount disappears.
//
// If the landing dir is missing, has no index.html, or no apex domains
// are configured, this is effectively a no-op and `next` handles
// everything — that's also the safe default before the operator has
// uploaded any dist.
func LandingMux(landingDir string, apexDomains []string, next http.Handler) http.Handler {
	if landingDir == "" || len(apexDomains) == 0 {
		return next
	}
	apexSet := make(map[string]bool, len(apexDomains))
	for _, d := range apexDomains {
		if d = strings.ToLower(strings.TrimSpace(d)); d != "" {
			apexSet[d] = true
		}
	}
	if len(apexSet) == 0 {
		return next
	}

	indexPath := filepath.Join(landingDir, "index.html")
	landingServer := http.FileServer(http.Dir(landingDir))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Strip port if any (Traefik sometimes forwards Host with :443).
		host := strings.ToLower(r.Host)
		if i := strings.IndexByte(host, ':'); i > 0 {
			host = host[:i]
		}
		if !apexSet[host] {
			next.ServeHTTP(w, r)
			return
		}
		// Apex host. If no index.html on disk yet, fall through gracefully
		// to the SPA admin so the apex doesn't 404 in the gap between deploy
		// and the operator's first scp.
		if _, err := os.Stat(indexPath); err != nil {
			next.ServeHTTP(w, r)
			return
		}
		// HTML shells must not be cached — landing iterations need to be
		// visible to existing visitors immediately after scp.
		clean := path.Clean(r.URL.Path)
		if clean == "/" || strings.HasSuffix(clean, "/index.html") {
			w.Header().Set("Cache-Control", "no-store")
		}
		landingServer.ServeHTTP(w, r)
	})
}

func isPlaceholderOnly(sub fs.FS) bool {
	entries, err := fs.ReadDir(sub, ".")
	if err != nil {
		return true
	}
	if len(entries) > 1 {
		return false
	}
	if len(entries) == 1 && entries[0].Name() == ".gitkeep" {
		// double-check it's the placeholder
		b, _ := fs.ReadFile(sub, ".gitkeep")
		return bytes.Contains(b, []byte("placeholder"))
	}
	return false
}
