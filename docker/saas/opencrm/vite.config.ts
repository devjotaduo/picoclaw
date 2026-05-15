import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Served behind the picoclaw-saas controlplane reverse proxy at /crm/.
// `base: "/crm/"` makes Vite emit asset URLs prefixed with /crm/ so the proxy
// can route them; the upstream Workers build defaults to `/`.
export default defineConfig({
  base: "/crm/",
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
