#!/usr/bin/env python3
"""Mint magic links via admin API and report actual TTL per role."""
import subprocess, json, datetime

def mint(role, ttl_s=None):
    body = {"role": role}
    if ttl_s is not None:
        body["ttl_seconds"] = ttl_s
    cmd = ["curl", "-s", "-b", "/tmp/jar", "-X", "POST",
           "-H", "Content-Type: application/json",
           "-d", json.dumps(body),
           "https://adm.jotaduo.com/api/v1/tenants/teste-18141e/magic-link"]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout
    d = json.loads(out)
    exp = datetime.datetime.fromisoformat(d["expires_at"].replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    secs = int((exp - now).total_seconds())
    return d["expires_at"], secs

def fmt_ttl(s):
    if s >= 86400:
        return f"{s // 86400}d{(s % 86400) // 3600:02d}h"
    if s >= 3600:
        return f"{s // 3600}h{(s % 3600) // 60:02d}m"
    return f"{s}s"

def fmt_req(s):
    if s is None:
        return "(default)"
    if s >= 86400:
        return f"{s // 86400}d"
    if s >= 3600:
        return f"{s // 3600}h"
    return f"{s}s"

print()
print(f"{'Role':16s} {'Pedido':>14s} {'TTL real':>14s}   {'expires_at'}")
print("-" * 80)
for role in ["public", "tenant_admin", "tenant_owner"]:
    for req in [60, 3600, 86400, 7 * 86400, 30 * 86400]:
        exp, ttl = mint(role, req)
        print(f"{role:16s} {fmt_req(req):>14s} {fmt_ttl(ttl):>14s}   {exp}")
    exp, ttl = mint(role, None)
    print(f"{role:16s} {fmt_req(None):>14s} {fmt_ttl(ttl):>14s}   {exp}  <- sem ttl_seconds")
    print()
