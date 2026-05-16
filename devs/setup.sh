#!/usr/bin/env bash
set -euo pipefail

echo "=== duo setup ==="

# Check Python 3.11+ (needed for tomllib)
PY=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYMIN=$(python3 -c "import sys; print(1 if sys.version_info >= (3,11) else 0)")
if [[ "$PYMIN" != "1" ]]; then
  echo "ERROR: Python 3.11+ required (found $PY)"
  exit 1
fi
echo "✓ Python $PY"

# Check rich
python3 -c "import rich" 2>/dev/null || {
  echo "Installing rich…"
  pip install rich --break-system-packages -q
}
echo "✓ rich"

# Check claude CLI
if ! command -v claude &>/dev/null; then
  echo "ERROR: 'claude' CLI not found. Install Claude Code: https://claude.ai/code"
  exit 1
fi
echo "✓ claude $(claude --version 2>/dev/null | head -1)"

# Check codex CLI
if ! command -v codex &>/dev/null; then
  echo "ERROR: 'codex' CLI not found. Install: npm i -g @openai/codex"
  exit 1
fi
echo "✓ codex $(codex --version 2>/dev/null | head -1)"

# Check OPENAI_API_KEY
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  # Check config.toml
  KEY=$(python3 -c "
import tomllib, pathlib
cfg = tomllib.loads(pathlib.Path('config.toml').read_text())
print(cfg['openai'].get('api_key',''))
" 2>/dev/null || true)
  if [[ -z "$KEY" ]]; then
    echo "WARNING: OPENAI_API_KEY not set. Set it via env or config.toml [openai] api_key."
  else
    echo "✓ api_key found in config.toml"
  fi
else
  echo "✓ OPENAI_API_KEY set in environment"
fi

mkdir -p sessions
echo ""
echo "=== Setup complete ==="
echo ""
echo "Usage:"
echo "  python3 duo.py \"your idea\""
echo "  python3 duo.py --dir /path/to/project \"refactor auth\""
echo "  python3 duo.py --dry-run \"add webhook endpoint\""
