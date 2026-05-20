#!/usr/bin/env bash
# Install (or update) the Picoclaw tenant-router watcher on a SaaS VPS.
#
# Why this exists
# ---------------
# Traefik issues per-hostname Let's Encrypt certs only for HOSTS it knows
# about. The controlplane's HostRegexp router matches every tenant subdomain
# at request time but never asks Traefik to *pre-issue* the cert, so the
# first hit on https://<sub>.<base>/ fails the TLS handshake with
# "unrecognized name". This watcher writes a concrete Host() router for
# every running tenant container into Traefik's dynamic config, which makes
# Traefik request the cert lazily and serve it to following requests.
#
# Run as root on the VPS:
#   sudo docker/saas/scripts/tenant-router/install.sh
#
# Or with a custom base domain (defaults to jotaduo.com):
#   sudo SAAS_BASE_DOMAIN=example.com docker/saas/scripts/tenant-router/install.sh
set -e

if [ "$EUID" -ne 0 ]; then
  echo "Run as root (or via sudo)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="${SAAS_BASE_DOMAIN:-jotaduo.com}"
DEBOUNCE="${DEBOUNCE_SECONDS:-3}"

install -m 0755 "$SCRIPT_DIR/picoclaw-traefik-tenants" /usr/local/sbin/picoclaw-traefik-tenants
install -m 0755 "$SCRIPT_DIR/picoclaw-tenant-router-watch" /usr/local/sbin/picoclaw-tenant-router-watch

UNIT=/etc/systemd/system/picoclaw-tenant-router.service
install -m 0644 "$SCRIPT_DIR/picoclaw-tenant-router.service" "$UNIT"

# Patch domain + debounce into the installed unit (the template ships a
# jotaduo.com / 3s default; if the operator overrides via env, persist it).
sed -i \
  -e "s|^Environment=SAAS_BASE_DOMAIN=.*|Environment=SAAS_BASE_DOMAIN=${DOMAIN}|" \
  -e "s|^Environment=DEBOUNCE_SECONDS=.*|Environment=DEBOUNCE_SECONDS=${DEBOUNCE}|" \
  "$UNIT"

systemctl daemon-reload
systemctl enable --now picoclaw-tenant-router.service

echo
echo "==> Installed picoclaw-tenant-router (domain=${DOMAIN}, debounce=${DEBOUNCE}s)"
systemctl status picoclaw-tenant-router.service --no-pager | head -10
