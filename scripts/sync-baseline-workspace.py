#!/usr/bin/env python3
"""sync-baseline-workspace.py — keep internal/saas/api/baseline-workspace/
in sync with the repo's workspace/ source-of-truth.

Run via `make sync-baseline` or directly. Wired into `make generate` so
every build picks up workspace changes automatically. Wired into CI via
`make check-baseline-sync` which fails if the working tree is dirty
after running sync (catches a developer who edited workspace/ but
forgot to commit the regenerated baseline).

What it does:
  1. Wipes internal/saas/api/baseline-workspace/{agents,skills,memory}
     and the top-level content files (AGENT.md, SOUL.md, etc.) but
     PRESERVES README.md, SYNCED_FROM, and any *.gitkeep markers.
  2. Copies from workspace/ → baseline-workspace/ filtering:
     - Drops sessions/, whatsapp/, state/, output/, *.log, *.tmp.json,
       *.pid, *.sock, .git/, .vscode/, .idea/
     - Drops auth.json (operator OAuth credentials)
     - Drops scratch files (gerar_pdf_*, mamiferos_*, RELATORIO-*)
  3. Empties workspace/memory/ contents (filenames preserved as stubs,
     bodies become "# Title\n\n") — baseline should NOT ship client data.
  4. Normalizes home/config.json: replaces api_keys with ${LITELLM_KEY}
     placeholder, sets workspace path to /root/.picoclaw/workspace.
  5. Writes SYNCED_FROM manifest with timestamp + git commit hash for
     traceability ("which workspace/ generated this baseline?").

The baseline is then embedded into the controlplane binary via
`//go:embed all:baseline-workspace` and extracted into newly-bootstrapped
workspaces' home/ when no existing default-business workspace is found.

Run order in builds:
  go generate ./internal/saas/api/... → sync-baseline-workspace.py
    → updated baseline-workspace/
    → go build embeds the updated tree
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Paths relative to repo root (script must be invoked from there)
REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_WORKSPACE = REPO_ROOT / "workspace"
DST_BASELINE = REPO_ROOT / "internal" / "saas" / "api" / "baseline-workspace"

# Files in baseline that must SURVIVE the wipe (operator-managed, not synced)
PRESERVE_AT_DST = {"README.md", ".gitkeep", "SYNCED_FROM"}

# What NOT to copy from workspace/ into baseline (runtime state, scratch, secrets)
EXCLUDE_NAMES_EXACT = {
    "sessions",
    "whatsapp",
    "state",
    "output",
    "auth.json",
    "heartbeat.log",
    "gerar_pdf_mamiferos.py",
    "mamiferos_apresentacao.html",
    "RELATORIO-MELHORIAS.md",
    ".git",
    ".vscode",
    ".idea",
    "__pycache__",
}
EXCLUDE_SUFFIXES = (".log", ".tmp.json", ".pid", ".sock", ".pyc")


def log(msg: str) -> None:
    print(f"[sync-baseline] {msg}")


def git_commit_hash() -> str:
    """Return short HEAD commit hash, or 'unknown' when not in a repo."""
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or "unknown"
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def should_skip(name: str) -> bool:
    if name in EXCLUDE_NAMES_EXACT:
        return True
    return name.endswith(EXCLUDE_SUFFIXES)


def copy_filtered(src: Path, dst: Path) -> int:
    """Recursive copy with skip rules. Returns count of files copied."""
    count = 0
    for item in src.iterdir():
        if should_skip(item.name):
            continue
        dst_item = dst / item.name
        if item.is_dir():
            dst_item.mkdir(parents=True, exist_ok=True)
            count += copy_filtered(item, dst_item)
        else:
            shutil.copy2(item, dst_item)
            count += 1
    return count


def empty_memory_files(root: Path) -> int:
    """Replace memory file contents with title-only stubs. Preserves
    filenames so agents that reference memory/<file>.md don't break."""
    if not root.exists():
        return 0
    n = 0
    for p in root.rglob("*"):
        if p.is_dir() or p.name == ".gitkeep":
            continue
        if p.suffix.lower() == ".md":
            title = p.stem.replace("-", " ").replace("_", " ").title()
            p.write_text(f"# {title}\n\n", encoding="utf-8")
            n += 1
        elif p.suffix.lower() == ".json":
            p.write_text("{}\n", encoding="utf-8")
            n += 1
        else:
            p.write_text("", encoding="utf-8")
            n += 1
    return n


def redact_security_yml(path: Path) -> bool:
    """Scrub api_keys from .security.yml.

    The repo's workspace/.security.yml is .gitignored and holds the operator's
    real API keys for dev (OpenRouter, Groq, OpenAI, etc.). The baseline is
    tracked in git and embedded in the binary — those keys MUST NOT leak.

    Strategy: parse line-by-line, when we see an api_keys array entry that
    looks like a real key (long alnum, starts with sk-/gsk_/key-/etc.),
    replace with placeholder. Preserves YAML structure (the launcher needs
    the model-permission shape intact even if keys are blank).
    """
    if not path.is_file():
        return False
    raw = path.read_text(encoding="utf-8")
    # Match `- <key>` lines that follow `api_keys:` indentation.
    # The values are typically API keys: long alnum + common prefixes.
    # Be permissive — anything 30+ chars looking like a token is scrubbed.
    pattern = re.compile(
        r"^(\s*-\s*)([A-Za-z][A-Za-z0-9_\-]{29,})\s*$",
        re.MULTILINE,
    )
    redacted_count = [0]
    def replace(match: re.Match) -> str:
        token = match.group(2)
        # Whitelist obvious placeholders (don't double-replace).
        if token.startswith("${") or token in ("REDACTED", "placeholder"):
            return match.group(0)
        redacted_count[0] += 1
        return f"{match.group(1)}REDACTED  # operator must replace with real key post-deploy"
    new = pattern.sub(replace, raw)
    if redacted_count[0] > 0:
        path.write_text(new, encoding="utf-8")
        log(f"redacted {redacted_count[0]} api_key value(s) in .security.yml")
        return True
    return False


def normalize_config_json(path: Path) -> bool:
    """Sanitize home/config.json so the baseline is safe to ship:
      - Replace per-model api_keys with ${LITELLM_KEY} placeholder
      - Force agents.defaults.workspace to /root/.picoclaw/workspace (Linux container path)
      - Strip Windows/Mac dev paths from agents.list[*].workspace
    Returns True if file was changed."""
    if not path.is_file():
        return False
    raw = json.loads(path.read_text(encoding="utf-8"))

    changed = False

    # agents.defaults.workspace → container path
    defaults = raw.get("agents", {}).get("defaults", {})
    if "workspace" in defaults:
        if defaults["workspace"] != "/root/.picoclaw/workspace":
            defaults["workspace"] = "/root/.picoclaw/workspace"
            changed = True

    # agents.list[*].workspace → container path
    for agent in raw.get("agents", {}).get("list", []) or []:
        ws = agent.get("workspace")
        if isinstance(ws, str) and (
            ws.startswith("C:") or ws.startswith("/Users") or ws.startswith("/home/")
        ):
            agent["workspace"] = "/root/.picoclaw/workspace"
            changed = True

    # model_list[*].api_keys → placeholder
    placeholder_singular = "${LITELLM_KEY}"
    placeholder_plural = ["${LITELLM_KEY}"]
    for m in raw.get("model_list", []) or []:
        # api_keys (plural V3+)
        if "api_keys" in m:
            current = m["api_keys"]
            if current != placeholder_plural:
                m["api_keys"] = placeholder_plural
                changed = True
        # api_key (legacy singular — convert + warn)
        if "api_key" in m:
            del m["api_key"]
            m["api_keys"] = placeholder_plural
            changed = True
        # api_base — if still pointing at upstream provider directly, leave
        # as-is (validator only requires non-empty; operator can route via
        # LITELLM later by changing api_base to ${LITELLM_URL}).

    if changed:
        path.write_text(
            json.dumps(raw, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return changed


def write_manifest(commit: str, file_count: int) -> None:
    manifest = DST_BASELINE / "SYNCED_FROM"
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body = (
        f"# Auto-generated by scripts/sync-baseline-workspace.py — DO NOT EDIT BY HAND.\n"
        f"# Run `make sync-baseline` (or `go generate ./internal/saas/api/...`)\n"
        f"# to regenerate after editing the repo's workspace/ tree.\n"
        f"\n"
        f"source_dir: workspace/\n"
        f"commit_hash: {commit}\n"
        f"generated_at: {ts}\n"
        f"file_count: {file_count}\n"
    )
    manifest.write_text(body, encoding="utf-8")


def main() -> int:
    if not SRC_WORKSPACE.is_dir():
        log(f"ABORT: source not found: {SRC_WORKSPACE}")
        return 1
    if not DST_BASELINE.is_dir():
        log(f"ABORT: destination not found: {DST_BASELINE}")
        return 1

    # Snapshot files to preserve before wipe
    preserved: dict[str, bytes] = {}
    for name in PRESERVE_AT_DST:
        p = DST_BASELINE / name
        if p.is_file():
            preserved[name] = p.read_bytes()

    # Wipe destination (everything inside DST_BASELINE)
    for child in DST_BASELINE.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        elif child.name not in PRESERVE_AT_DST:
            child.unlink()
    log(f"wiped {DST_BASELINE}")

    # Restore preserved files
    for name, content in preserved.items():
        (DST_BASELINE / name).write_bytes(content)

    # Copy filtered content from workspace/
    file_count = copy_filtered(SRC_WORKSPACE, DST_BASELINE)
    log(f"copied {file_count} files from {SRC_WORKSPACE.name}/")

    # Empty memory contents (preserve filenames as stubs)
    emptied = empty_memory_files(DST_BASELINE / "memory")
    log(f"emptied {emptied} files under memory/")

    # Empty per-agent sessions/state if they leaked through
    for agent_dir in (DST_BASELINE / "agents").iterdir() if (DST_BASELINE / "agents").exists() else []:
        if not agent_dir.is_dir():
            continue
        for sub in ("sessions", "state"):
            tgt = agent_dir / sub
            if tgt.exists():
                shutil.rmtree(tgt)

    # Normalize config.json (paths + api_keys placeholders)
    cfg_changed = normalize_config_json(DST_BASELINE / "config.json")
    if cfg_changed:
        log("normalized config.json (paths + api_keys placeholder)")

    # Redact .security.yml api_keys (operator's real dev keys)
    redact_security_yml(DST_BASELINE / ".security.yml")

    # Write manifest for traceability
    commit = git_commit_hash()
    write_manifest(commit, file_count)
    log(f"wrote SYNCED_FROM manifest (commit={commit})")

    # Recount final files for sanity
    final_count = sum(1 for _ in DST_BASELINE.rglob("*") if _.is_file())
    log(f"done — baseline now has {final_count} files total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
