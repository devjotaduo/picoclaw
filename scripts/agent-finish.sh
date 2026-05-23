#!/usr/bin/env bash
# agent-finish.sh — automated end-of-task validation + git management for agents.
#
# Pipeline:
#   1. Detect changed paths (staged + unstaged + untracked).
#   2. Run only the validations relevant to those paths (fast, no full CI).
#   3. Inspect upstream state (ahead/behind, divergence) and rebase if safe.
#   4. Stage + commit changes. Large changesets require explicit confirmation
#      unless --yes is passed.
#   5. Push when ahead. Refuse to push when diverged.
#
# Flags:
#   --message "<msg>"     Commit subject. Required when committing unless
#                         --amend or --no-commit is set.
#   --body "<body>"       Optional commit body (extra -m).
#   --scope <paths...>    Only stage these paths. Default: all tracked+untracked
#                         changes EXCEPT those listed in agent-finish.ignore.
#   --yes                 Skip the "large changeset" prompt (>50 files or >2000
#                         line delta). CI/automation should pass this.
#   --no-push             Run validations + commit but do not push.
#   --no-commit           Run validations only; report state and exit.
#   --amend               Amend HEAD instead of creating a new commit. Implies
#                         --force-with-lease on push.
#   --signoff             Add a Signed-off-by trailer.
#
# Trailer policy: this script ALWAYS appends the Copilot co-author trailer per
# repo policy. Add your own trailers via --body if needed.
#
# Exit codes:
#   0  success (and pushed if applicable)
#   2  validation failure
#   3  upstream diverged, manual resolution required
#   4  large changeset rejected (no --yes)
#   5  bad usage / missing args

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG=""
BODY=""
SCOPE=()
YES=0
NO_PUSH=0
NO_COMMIT=0
AMEND=0
SIGNOFF=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message) MSG="${2:-}"; shift 2 ;;
    --body) BODY="${2:-}"; shift 2 ;;
    --scope) shift; while [[ $# -gt 0 && "$1" != --* ]]; do SCOPE+=("$1"); shift; done ;;
    --yes) YES=1; shift ;;
    --no-push) NO_PUSH=1; shift ;;
    --no-commit) NO_COMMIT=1; shift ;;
    --amend) AMEND=1; shift ;;
    --signoff) SIGNOFF=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 5 ;;
  esac
done

log() { printf '\033[1;36m[agent-finish]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[agent-finish]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[agent-finish]\033[0m %s\n' "$*" >&2; exit "${2:-1}"; }

# -------- 1. detect changed paths --------
mapfile -t CHANGED < <(git status --porcelain=v1 | awk '{print $2}' | sort -u)
if [[ ${#CHANGED[@]} -eq 0 && $AMEND -eq 0 ]]; then
  log "working tree clean; nothing to commit."
  # still check upstream sync
fi

# Optional ignore list (one path glob per line) so generated files like
# heartbeat.log / routeTree.gen.ts never get auto-staged.
IGNORE_FILE="$ROOT/scripts/agent-finish.ignore"
declare -a IGNORE_PATTERNS=()
if [[ -f "$IGNORE_FILE" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    IGNORE_PATTERNS+=("$line")
  done < "$IGNORE_FILE"
fi

is_ignored() {
  local p="$1"
  for pat in "${IGNORE_PATTERNS[@]:-}"; do
    [[ -z "$pat" ]] && continue
    case "$p" in $pat) return 0 ;; esac
  done
  return 1
}

# Build effective stage list.
declare -a TO_STAGE=()
if [[ ${#SCOPE[@]} -gt 0 ]]; then
  TO_STAGE=("${SCOPE[@]}")
else
  for p in "${CHANGED[@]}"; do
    is_ignored "$p" || TO_STAGE+=("$p")
  done
fi

# -------- 2. selective validations --------
declare -A SUITES
for p in "${TO_STAGE[@]}"; do
  case "$p" in
    *.go) SUITES[go]=1 ;;
    go.mod|go.sum) SUITES[go]=1 ;;
    *.md) SUITES[md]=1 ;;
    *.json) SUITES[json]=1 ;;
    web/frontend/*) SUITES[frontend]=1 ;;
    web/backend/*) SUITES[go]=1 ;;
    pkg/*|cmd/*|internal/*) SUITES[go]=1 ;;
  esac
done

run() { log "▶ $*"; "$@"; }

if [[ -n "${SUITES[go]:-}" ]]; then
  if command -v go >/dev/null 2>&1; then
    # Vet only the packages that actually contain touched files, to keep it fast.
    declare -A PKGS=()
    for p in "${TO_STAGE[@]}"; do
      [[ "$p" == *.go ]] || continue
      d="$(dirname "$p")"
      PKGS["./$d"]=1
    done
    if [[ ${#PKGS[@]} -gt 0 ]]; then
      run go vet -tags goolm,stdjson "${!PKGS[@]}" || die "go vet failed" 2
    fi
  else
    warn "go not found, skipping go vet"
  fi
fi

if [[ -n "${SUITES[md]:-}" ]]; then
  if [[ -x "$ROOT/scripts/lint-docs.sh" ]]; then
    run bash "$ROOT/scripts/lint-docs.sh" || die "docs lint failed" 2
  fi
fi

if [[ -n "${SUITES[json]:-}" ]]; then
  for p in "${TO_STAGE[@]}"; do
    [[ "$p" == *.json ]] || continue
    [[ -f "$p" ]] || continue
    if command -v python >/dev/null 2>&1; then
      python -c "import json,sys; json.load(open(r'$p', encoding='utf-8'))" \
        || die "invalid JSON: $p" 2
    elif command -v node >/dev/null 2>&1; then
      node -e "JSON.parse(require('fs').readFileSync('$p','utf8'))" \
        || die "invalid JSON: $p" 2
    fi
  done
fi

# -------- 3. upstream state --------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"

if [[ -n "$UPSTREAM" ]]; then
  log "fetching $UPSTREAM"
  git fetch --quiet
  AHEAD="$(git rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo 0)"
  BEHIND="$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null || echo 0)"
  log "branch=$BRANCH ahead=$AHEAD behind=$BEHIND"

  if [[ "$BEHIND" -gt 0 && "$AHEAD" -gt 0 ]]; then
    warn "branch has diverged from $UPSTREAM ($AHEAD ahead, $BEHIND behind)."
    warn "agent will NOT auto-merge; run 'git pull --rebase' manually and resolve."
    if [[ ${#TO_STAGE[@]} -gt 0 ]]; then
      warn "your local changes are still uncommitted in working tree."
    fi
    exit 3
  fi

  if [[ "$BEHIND" -gt 0 && "$AHEAD" -eq 0 && ${#CHANGED[@]} -eq 0 ]]; then
    log "fast-forwarding $BRANCH (behind by $BEHIND)"
    git pull --ff-only
  elif [[ "$BEHIND" -gt 0 && ${#CHANGED[@]} -gt 0 ]]; then
    log "stashing local changes for rebase"
    git stash push -u -m "agent-finish-autostash"
    if git pull --rebase; then
      git stash pop || die "stash pop conflict; resolve manually" 3
    else
      warn "rebase failed; restoring working tree"
      git rebase --abort || true
      git stash pop || true
      exit 3
    fi
  fi
fi

# -------- 4. commit --------
if [[ $NO_COMMIT -eq 1 ]]; then
  log "--no-commit: validations passed, not committing."
  exit 0
fi

# Re-read changed paths after potential rebase.
mapfile -t CHANGED < <(git status --porcelain=v1 | awk '{print $2}' | sort -u)
declare -a TO_STAGE2=()
if [[ ${#SCOPE[@]} -gt 0 ]]; then
  TO_STAGE2=("${SCOPE[@]}")
else
  for p in "${CHANGED[@]}"; do
    is_ignored "$p" || TO_STAGE2+=("$p")
  done
fi
TO_STAGE=("${TO_STAGE2[@]}")

if [[ ${#TO_STAGE[@]} -eq 0 && $AMEND -eq 0 ]]; then
  log "nothing in scope to commit."
  # fall through to push check
else
  if [[ $AMEND -eq 0 ]]; then
    [[ -n "$MSG" ]] || die "--message required (or pass --no-commit / --amend)" 5
  fi

  # Large-changeset guard.
  FILES=${#TO_STAGE[@]}
  LINES=$(git diff --shortstat -- "${TO_STAGE[@]}" 2>/dev/null \
    | awk '{for(i=1;i<=NF;i++) if ($i ~ /insertion|deletion/) s+=$(i-1)} END{print s+0}')
  if (( FILES > 50 || LINES > 2000 )) && [[ $YES -eq 0 ]]; then
    warn "large changeset detected: $FILES files, ~$LINES lines."
    warn "re-run with --yes to confirm, or narrow with --scope."
    exit 4
  fi

  log "staging ${#TO_STAGE[@]} path(s)"
  git add -- "${TO_STAGE[@]}"

  COMMIT_ARGS=()
  if [[ $AMEND -eq 1 ]]; then
    COMMIT_ARGS+=(--amend --no-edit)
    [[ -n "$MSG" ]] && COMMIT_ARGS=(--amend -m "$MSG")
  else
    COMMIT_ARGS+=(-m "$MSG")
    [[ -n "$BODY" ]] && COMMIT_ARGS+=(-m "$BODY")
    COMMIT_ARGS+=(-m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>")
  fi
  [[ $SIGNOFF -eq 1 ]] && COMMIT_ARGS+=(--signoff)

  run git commit "${COMMIT_ARGS[@]}"
fi

# -------- 5. push --------
if [[ $NO_PUSH -eq 1 ]]; then
  log "--no-push: skipping push."
  exit 0
fi

if [[ -z "$UPSTREAM" ]]; then
  warn "no upstream tracking branch; skipping push. Set with: git push -u origin $BRANCH"
  exit 0
fi

AHEAD="$(git rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo 0)"
if [[ "$AHEAD" -eq 0 ]]; then
  log "nothing to push."
  exit 0
fi

if [[ $AMEND -eq 1 ]]; then
  run git push --force-with-lease
else
  run git push
fi

log "done."
