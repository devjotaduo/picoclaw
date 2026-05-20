#!/usr/bin/env bash
# Local-dev convenience: install mkcert + generate a trusted wildcard cert
# for *.picoclaw-saas.localhost so browsers don't show TLS warnings.
#
# Without this you can still run the dev stack; Traefik will use its built-in
# self-signed cert and you click through one warning per browser session.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CERTS_DIR="$REPO_DIR/docker/saas/traefik/certs"

# 1. mkcert presence
if ! command -v mkcert >/dev/null 2>&1; then
  echo "mkcert not found. Install instructions:"
  echo "  macOS:    brew install mkcert nss"
  echo "  Linux:    https://github.com/FiloSottile/mkcert#linux"
  echo "  Windows:  scoop install mkcert   (or)   choco install mkcert"
  exit 1
fi

# 2. Install the local CA into the OS / browser trust stores. Idempotent.
echo "==> Installing local CA root (this needs sudo / Administrator the first time)"
mkcert -install

# 3. Generate wildcard cert
mkdir -p "$CERTS_DIR"
echo "==> Generating wildcard cert for *.picoclaw-saas.localhost"
mkcert -cert-file "$CERTS_DIR/dev.pem" \
       -key-file  "$CERTS_DIR/dev-key.pem" \
       "picoclaw-saas.localhost" "*.picoclaw-saas.localhost" \
       "127.0.0.1" "::1"

# 4. .gitignore the certs so nobody commits a private key by accident.
if ! grep -q '^docker/saas/traefik/certs/' "$REPO_DIR/.gitignore" 2>/dev/null; then
  echo 'docker/saas/traefik/certs/' >> "$REPO_DIR/.gitignore"
fi

# 5. Activate the dev TLS dynamic config (gitignored so prod never sees it).
DYNAMIC_DIR="$REPO_DIR/docker/saas/traefik/dynamic"
if [ -f "$DYNAMIC_DIR/dev-tls.yml.sample" ] && [ ! -f "$DYNAMIC_DIR/dev-tls.yml" ]; then
  cp "$DYNAMIC_DIR/dev-tls.yml.sample" "$DYNAMIC_DIR/dev-tls.yml"
  echo "==> Activated dev-tls.yml (gitignored)"
fi

echo
echo "==> Done. Now start the stack with the dev override:"
echo "   docker compose -f docker/saas/docker-compose.yml -f docker/saas/docker-compose.dev.yml --env-file .env up -d --build"
echo
echo "==> Then open:  https://admin.picoclaw-saas.localhost/"
