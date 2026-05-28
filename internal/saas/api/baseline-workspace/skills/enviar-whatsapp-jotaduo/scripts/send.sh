#!/bin/sh
# enviar-whatsapp-jotaduo / send.sh — POSIX wrapper.
#
# Originally implemented in bash + openssl + curl. Audit 2026-05-28
# discovered that slim tenant container images ship without bash and
# without openssl, so this was failing silently in prod. send.py
# (stdlib python, no extra deps) is now the source of truth; this
# wrapper exists so existing callers that invoke `sh send.sh` or
# `bash send.sh` (or just `send.sh`) keep working without changes.
#
# Resolves python3 first, then python, then exits with the original
# bash+openssl fallback (in case someone someday strips python too).
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT_PY="$DIR/send.py"

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_PY" "$@"
fi
if command -v python >/dev/null 2>&1; then
  exec python "$SCRIPT_PY" "$@"
fi
echo "send.sh: neither python3 nor python in PATH. Install one (~5MB) or use scripts/send.py directly." >&2
exit 1
