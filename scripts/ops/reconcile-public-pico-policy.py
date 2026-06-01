#!/usr/bin/env python3
"""Keep public tenant Pico WebSocket permissions usable.

The current controlplane image generates launcher_policy.json internally. In
this deployment, public tenants can be created with public.channel:pico=none,
which makes /pico/ws reject anonymous discovery users with HTTP 401. This
reconciler is intentionally narrow: it only touches tenants whose
ui-visibility.json is public/public.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


TENANTS_DIR = Path(os.environ.get("SAAS_TENANTS_DIR", "/srv/saas/tenants"))


def load_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as exc:
        print(f"skip {path}: {exc}", file=sys.stderr)
        return None
    return data if isinstance(data, dict) else None


def is_public_tenant(tenant_dir: Path) -> bool:
    ui = load_json(tenant_dir / "ui-visibility.json")
    if not ui:
        return False
    return ui.get("active_profile") == "public" and ui.get("default_profile") == "public"


def atomic_write_json(path: Path, data: dict) -> None:
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(rendered)
        os.replace(tmp_name, path)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def container_is_running(name: str) -> bool:
    result = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", name],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.stdout.strip() == "true"


def restart_container(name: str) -> bool:
    result = subprocess.run(
        ["docker", "restart", name],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        print(f"restart failed {name}: {result.stderr.strip()}", file=sys.stderr)
        return False
    return True


def reconcile_tenant(tenant_dir: Path, restart: bool) -> bool:
    if not is_public_tenant(tenant_dir):
        return False

    policy_path = tenant_dir / "launcher_policy.json"
    policy = load_json(policy_path)
    if not policy:
        return False

    public = policy.setdefault("public", {})
    operator = policy.setdefault("operator", {})
    changed = False

    if public.get("channel:pico") != "write":
        public["channel:pico"] = "write"
        changed = True
    if public.get("chat") != "write":
        public["chat"] = "write"
        changed = True
    if operator.get("channel:pico") != "none":
        operator["channel:pico"] = "none"
        changed = True

    if not changed:
        return False

    atomic_write_json(policy_path, policy)
    print(f"fixed {tenant_dir.name}: public.channel:pico=write operator.channel:pico=none")

    container = f"tenant-{tenant_dir.name}"
    if restart and container_is_running(container):
        if restart_container(container):
            print(f"restarted {container}")
    return True


def main() -> int:
    restart = "--no-restart" not in sys.argv
    fixed = 0
    if not TENANTS_DIR.exists():
        print(f"tenants dir not found: {TENANTS_DIR}", file=sys.stderr)
        return 1

    for tenant_dir in sorted(TENANTS_DIR.iterdir()):
        if tenant_dir.is_dir() and reconcile_tenant(tenant_dir, restart):
            fixed += 1

    print(f"public pico policy reconcile complete: fixed={fixed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
