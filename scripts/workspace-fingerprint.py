#!/usr/bin/env python3
"""Read-only workspace fingerprint helper.

Computes the same deterministic SHA256 shape used by
scripts/sync-baseline-workspace.py without writing to workspace/ or
internal/saas/api/baseline-workspace/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE = REPO_ROOT / "workspace"
DEFAULT_BASELINE = REPO_ROOT / "internal" / "saas" / "api" / "baseline-workspace"
DEFAULT_MANIFEST = DEFAULT_BASELINE / "SYNCED_FROM"

EXCLUDE_NAMES_EXACT = {
    "sessions",
    "whatsapp",
    "state",
    "output",
    "logs",
    "cache",
    ".cache",
    "node_modules",
    ".pnpm-store",
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
HOME_ROOT_FILES = {
    ".security.yml",
    "auth.json",
    "config.json",
    "launcher_policy.json",
    "ui-visibility.json",
    "ui.config.fields.json",
}
SECURITY_TOKEN_RE = re.compile(
    r"^(\s*-\s*)([A-Za-z][A-Za-z0-9_\-]{29,})\s*$",
    re.MULTILINE,
)


def should_skip_name(name: str) -> bool:
    return name in EXCLUDE_NAMES_EXACT or name.endswith(EXCLUDE_SUFFIXES)


def should_skip_rel(rel: str) -> bool:
    return any(should_skip_name(part) for part in Path(rel).parts)


def title_from_slug(stem: str) -> str:
    return stem.replace("-", " ").replace("_", " ").title()


def memory_stub(rel: str) -> bytes:
    path = Path(rel)
    suffix = path.suffix.lower()
    if suffix == ".md":
        return f"# {title_from_slug(path.stem)}\n\n".encode("utf-8")
    if suffix == ".json":
        return b"{}\n"
    return b""


def normalize_config_json_bytes(data: bytes) -> bytes:
    try:
        raw = json.loads(data.decode("utf-8"))
    except Exception:
        return data

    changed = False
    defaults = raw.get("agents", {}).get("defaults", {})
    if "workspace" in defaults and defaults["workspace"] != "/root/.picoclaw/workspace":
        defaults["workspace"] = "/root/.picoclaw/workspace"
        changed = True

    for agent in raw.get("agents", {}).get("list", []) or []:
        ws = agent.get("workspace") if isinstance(agent, dict) else None
        if isinstance(ws, str) and (
            ws.startswith("C:") or ws.startswith("/Users") or ws.startswith("/home/")
        ):
            agent["workspace"] = "/root/.picoclaw/workspace"
            changed = True

    placeholder_plural = ["${LITELLM_KEY}"]
    for model in raw.get("model_list", []) or []:
        if not isinstance(model, dict):
            continue
        if "api_keys" in model and model["api_keys"] != placeholder_plural:
            model["api_keys"] = placeholder_plural
            changed = True
        if "api_key" in model:
            del model["api_key"]
            model["api_keys"] = placeholder_plural
            changed = True

    if not changed:
        return data
    return (json.dumps(raw, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def normalize_repo_entry(rel: str, data: bytes) -> bytes:
    if rel.startswith("memory/") and Path(rel).name != ".gitkeep":
        return memory_stub(rel)
    if rel == "config.json":
        return normalize_config_json_bytes(data)
    if rel == ".security.yml":
        return SECURITY_TOKEN_RE.sub(
            r"\1REDACTED  # operator must replace with real key post-deploy",
            data.decode("utf-8", errors="replace"),
        ).encode("utf-8")
    return data


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(root).as_posix()
        if should_skip_rel(rel):
            continue
        yield rel, path


def build_repo_entries(source: Path, baseline_root: Path) -> dict[str, bytes]:
    if not source.is_dir():
        raise FileNotFoundError(f"workspace source not found: {source}")
    entries: dict[str, bytes] = {}
    for rel, path in iter_files(source):
        if rel == "SYNCED_FROM":
            continue
        entries[rel] = normalize_repo_entry(rel, path.read_bytes())

    # baseline-workspace/README.md is intentionally preserved at the embedded
    # baseline root. It is not copied from workspace/, but the manifest hash
    # includes it, so include the current baseline copy for comparison.
    root_readme = baseline_root / "README.md"
    if root_readme.is_file():
        entries["README.md"] = root_readme.read_bytes()
    return entries


def build_baseline_entries(source: Path, _baseline_root: Path) -> dict[str, bytes]:
    if not source.is_dir():
        raise FileNotFoundError(f"baseline source not found: {source}")
    entries: dict[str, bytes] = {}
    for rel, path in iter_files(source):
        if rel == "SYNCED_FROM":
            continue
        entries[rel] = path.read_bytes()
    return entries


def home_rel_to_baseline_rel(rel: str) -> str | None:
    rel = Path(rel).as_posix()
    if rel.startswith("home/"):
        rel = rel.removeprefix("home/")
    if rel.startswith("workspace/"):
        return rel.removeprefix("workspace/")
    if "/" in rel:
        return None
    if rel in HOME_ROOT_FILES:
        return rel
    return None


def build_home_entries(source: Path, baseline_root: Path) -> dict[str, bytes]:
    if not source.is_dir():
        raise FileNotFoundError(f"home source not found: {source}")
    entries: dict[str, bytes] = {}
    for rel, path in iter_files(source):
        mapped = home_rel_to_baseline_rel(rel)
        if not mapped or mapped == "SYNCED_FROM" or should_skip_rel(mapped):
            continue
        entries[mapped] = path.read_bytes()

    # README.md and .gitkeep files are embedded in the deployed baseline hash
    # but not materialized by extractEmbeddedBaseline(). Overlay them from the
    # same deployed baseline so a freshly seeded admin workspace compares OK.
    if baseline_root.is_dir():
        for rel, path in iter_files(baseline_root):
            if rel == "SYNCED_FROM":
                continue
            if Path(rel).name in {"README.md", ".gitkeep"} and rel not in entries:
                entries[rel] = path.read_bytes()
    return entries


def hash_entries(entries: dict[str, bytes]) -> tuple[str, int]:
    h = hashlib.sha256()
    count = 0
    for rel in sorted(k for k in entries if k != "SYNCED_FROM"):
        data = entries[rel]
        h.update(rel.encode("utf-8"))
        h.update(b"\0")
        h.update(str(len(data)).encode("ascii"))
        h.update(b"\0")
        h.update(data)
        h.update(b"\0")
        if rel != "README.md":
            count += 1
    return h.hexdigest(), count


def read_manifest(path: Path) -> tuple[str | None, int | None]:
    if not path.is_file():
        return None, None
    digest: str | None = None
    count: int | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("content_hash_sha256:"):
            digest = line.split(":", 1)[1].strip()
        elif line.startswith("file_count:"):
            try:
                count = int(line.split(":", 1)[1].strip())
            except ValueError:
                count = None
    return digest, count


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute a read-only workspace fingerprint.")
    parser.add_argument("--source", type=Path, default=DEFAULT_WORKSPACE)
    parser.add_argument("--layout", choices=("repo", "baseline", "home"), default="repo")
    parser.add_argument("--baseline-root", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--compare-manifest", action="store_true")
    args = parser.parse_args()

    builders = {
        "repo": build_repo_entries,
        "baseline": build_baseline_entries,
        "home": build_home_entries,
    }
    try:
        entries = builders[args.layout](args.source, args.baseline_root)
        digest, count = hash_entries(entries)
    except Exception as exc:
        print(f"status: unknown")
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"source: {args.source}")
    print(f"layout: {args.layout}")
    print(f"content_hash_sha256: {digest}")
    print(f"file_count: {count}")

    if not args.compare_manifest:
        return 0

    expected_digest, expected_count = read_manifest(args.manifest)
    print(f"manifest: {args.manifest}")
    print(f"manifest_hash_sha256: {expected_digest or ''}")
    print(f"manifest_file_count: {expected_count if expected_count is not None else ''}")

    if not expected_digest:
        print("status: unknown")
        return 2
    if digest == expected_digest:
        print("status: synced")
        return 0
    print("status: diverged")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
