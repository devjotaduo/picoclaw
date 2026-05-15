package api

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"path"
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
