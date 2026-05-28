#!/usr/bin/env python3
"""enviar-whatsapp-jotaduo / send.py

POSTs an outbound WhatsApp message to the jotaduo-wa sidecar so the
institutional Jotaduo WA delivers it. Pure-Python port of send.sh — kept
identical contract (CLI args, exit codes, JSON body shape, HMAC
algorithm) but uses stdlib only so it runs in any tenant container,
including the slim ones without bash/openssl (audit 2026-05-28).

Required env (injected by the provisioner ONLY in public tenants):
  JOTADUO_WA_URL          e.g. http://jotaduo-wa:18810
  JOTADUO_WA_HMAC_SECRET  hex string, shared with the sidecar

Auto-injected by every tenant container:
  PICOCLAW_TENANT_ID      the tenant's stable id; used as routing key

Usage:
  send.py <phone> <message...>

Exit codes:
  0   sent (sidecar returned 2xx)
  1   missing args or env (likely running in a cliente tenant by mistake)
  2   network failure talking to sidecar
  3   sidecar returned non-2xx (response body printed to stderr)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request


def fail(code: int, msg: str) -> None:
    sys.stderr.write(f"send.py: {msg}\n")
    sys.exit(code)


def main() -> int:
    if len(sys.argv) < 3:
        fail(1, "usage: send.py <phone> <message>")

    phone = sys.argv[1].strip()
    # Join the rest with spaces so caller can pass multi-word messages
    # without quoting twice (mirrors send.sh's "$*" behavior).
    message = " ".join(sys.argv[2:]).strip()
    if not phone or not message:
        fail(1, "phone and message must be non-empty")

    url = os.environ.get("JOTADUO_WA_URL", "").rstrip("/")
    secret = os.environ.get("JOTADUO_WA_HMAC_SECRET", "")
    tenant = os.environ.get("PICOCLAW_TENANT_ID", "")

    if not url or not secret:
        fail(
            1,
            "JOTADUO_WA_URL and JOTADUO_WA_HMAC_SECRET are required.\n"
            "send.py: these are only injected into public tenants (is_public=true).\n"
            "send.py: in a cliente tenant, use the tenant's own WhatsApp channel instead.",
        )
    if not tenant:
        fail(
            1,
            "PICOCLAW_TENANT_ID is missing — the provisioner should always set it; "
            "check the container env.",
        )

    # Build the body EXACTLY like send.sh did so the sidecar's HMAC verifier
    # sees the same bytes. json.dumps with separators=(",",":") + sort_keys=False
    # would re-order; we hand-format to lock the field order
    # (tenant_id, to, text, ts) deterministically.
    body = (
        '{"tenant_id":' + json.dumps(tenant, ensure_ascii=True)
        + ',"to":' + json.dumps(phone, ensure_ascii=True)
        + ',"text":' + json.dumps(message, ensure_ascii=True)
        + ',"ts":' + str(int(time.time()))
        + '}'
    ).encode("utf-8")

    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    req = urllib.request.Request(
        f"{url}/internal/wa/send",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Jotaduo-WA-Signature": sig,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            response_body = resp.read().decode("utf-8", errors="replace")
            sys.stdout.write(response_body)
            sys.stdout.write("\n")
            return 0
    except urllib.error.HTTPError as e:
        # Non-2xx — surface body to stderr so agent sees the sidecar's
        # error JSON ({"error":"..."}).
        sys.stderr.write(f"send.py: sidecar returned HTTP {e.code}\n")
        try:
            sys.stderr.write(e.read().decode("utf-8", errors="replace"))
            sys.stderr.write("\n")
        except Exception:
            pass
        return 3
    except (urllib.error.URLError, OSError) as e:
        # Network / DNS / connection refused / timeout.
        sys.stderr.write(f"send.py: network failure talking to {url}: {e}\n")
        return 2


if __name__ == "__main__":
    sys.exit(main())
