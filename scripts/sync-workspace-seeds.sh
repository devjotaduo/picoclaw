#!/usr/bin/env bash
#
# sync-workspace-seeds.sh — copia os arquivos compartilhados (thin-router
# agents + skill cli-delegation) de `workspace/` (fonte da verdade do
# dev launcher) para os templates em `workspace-seeds/<slug>/home/workspace/`.
#
# Quando rodar:
#   - Sempre que editar workspace/agents/{pixel,doc-maker,dev-coder}/ ou
#     workspace/skills/cli-delegation/
#   - Antes de commit (ou via pre-commit hook)
#   - Em CI para garantir que os seeds não dessincronizaram
#
# Modos:
#   --apply  (default)  copia e mostra o que mudou
#   --check             só compara; sai com código 1 se houver diff
#   --help              mostra esta ajuda
#
# Os arquivos no seed que NÃO são desta lista (AGENT.md/SOUL.md raiz,
# config.json, .security.yml) NÃO são tocados — são template-específicos
# e editados à mão.

set -euo pipefail

# ----- Configuração ---------------------------------------------------------

# Diretórios sob workspace/agents/ que viram thin-router compartilhados.
# Adicione aqui quando criar novos agentes internos delegáveis.
THIN_ROUTER_AGENTS=(
  pixel
  doc-maker
  dev-coder
)

# Skills sob workspace/skills/ que são infra compartilhada (não-editáveis
# por tenant).
SHARED_SKILLS=(
  cli-delegation
)

# Slugs de templates em workspace-seeds/ que recebem este conteúdo
# compartilhado. Hoje só "default"; se aparecer "premium", "minimal", etc,
# adicione aqui.
SEED_SLUGS=(
  default
)

# Subdiretórios/arquivos que NÃO devem viajar para o seed: são runtime
# state (memória acumulada, sessões, logs, sqlite). Aplicado após a cópia.
RUNTIME_STATE_EXCLUDES=(
  memory
  sessions
  state
  whatsapp
  matrix
  runtime-user-env
  '*.log'
  '*.db'
  '*.db-wal'
  '*.db-shm'
  '*.db-journal'
)

# ----- Implementação --------------------------------------------------------

MODE="apply"
case "${1:-}" in
  --check) MODE="check" ;;
  --apply|"") MODE="apply" ;;
  --help|-h)
    sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "argumento desconhecido: $1" >&2
    echo "use --apply, --check, ou --help" >&2
    exit 2
    ;;
esac

# Resolve a raiz do repo a partir do script (funciona se rodar de qualquer cwd).
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SRC_AGENTS="workspace/agents"
SRC_SKILLS="workspace/skills"

# Lista de pares (src, dst) a sincronizar.
pairs=()
for slug in "${SEED_SLUGS[@]}"; do
  dst_base="workspace-seeds/$slug/home/workspace"
  for agent in "${THIN_ROUTER_AGENTS[@]}"; do
    pairs+=("$SRC_AGENTS/$agent" "$dst_base/agents/$agent")
  done
  for skill in "${SHARED_SKILLS[@]}"; do
    pairs+=("$SRC_SKILLS/$skill" "$dst_base/skills/$skill")
  done
done

# Verifica que cada source existe (catch typo cedo).
for ((i=0; i<${#pairs[@]}; i+=2)); do
  src="${pairs[i]}"
  if [ ! -d "$src" ]; then
    echo "ERRO: source não existe: $src" >&2
    echo "       confira a lista THIN_ROUTER_AGENTS / SHARED_SKILLS neste script" >&2
    exit 1
  fi
done

# prune_runtime_state <dir>: remove tudo da lista RUNTIME_STATE_EXCLUDES
# de dentro de <dir> recursivamente. Tolera ausência (find -name não falha).
prune_runtime_state() {
  local dir="$1"
  for ex in "${RUNTIME_STATE_EXCLUDES[@]}"; do
    # -depth garante que filhos sumam antes do pai (relevante para diretórios)
    find "$dir" -depth -name "$ex" -exec rm -rf {} + 2>/dev/null || true
  done
}

# diff_filtered <src> <dst>: compara dois diretórios ignorando runtime state.
# Retorna 0 se idênticos (módulo excludes), 1 se diferem.
diff_filtered() {
  local src="$1" dst="$2"
  local diff_args=("--brief" "-r")
  for ex in "${RUNTIME_STATE_EXCLUDES[@]}"; do
    diff_args+=("--exclude=$ex")
  done
  diff "${diff_args[@]}" "$src" "$dst" >/dev/null 2>&1
}

show_diff_filtered() {
  local src="$1" dst="$2"
  local diff_args=("--brief" "-r")
  for ex in "${RUNTIME_STATE_EXCLUDES[@]}"; do
    diff_args+=("--exclude=$ex")
  done
  diff "${diff_args[@]}" "$src" "$dst" 2>&1 | sed 's/^/  /'
}

# --- Modo check -------------------------------------------------------------
if [ "$MODE" = "check" ]; then
  drift=0
  for ((i=0; i<${#pairs[@]}; i+=2)); do
    src="${pairs[i]}"
    dst="${pairs[i+1]}"
    if [ ! -d "$dst" ]; then
      echo "DRIFT: faltando $dst (precisa rodar: scripts/sync-workspace-seeds.sh)"
      drift=1
      continue
    fi
    if ! diff_filtered "$src" "$dst"; then
      echo "DRIFT: $src difere de $dst"
      show_diff_filtered "$src" "$dst"
      drift=1
    fi
  done
  if [ "$drift" -eq 0 ]; then
    echo "OK: workspace-seeds/ em sync com workspace/"
    exit 0
  fi
  echo
  echo "Para corrigir: scripts/sync-workspace-seeds.sh --apply" >&2
  exit 1
fi

# --- Modo apply -------------------------------------------------------------
changed=0
for ((i=0; i<${#pairs[@]}; i+=2)); do
  src="${pairs[i]}"
  dst="${pairs[i+1]}"
  mkdir -p "$(dirname -- "$dst")"

  # Idempotente: se já está em sync (módulo runtime state), pula.
  if [ -d "$dst" ] && diff_filtered "$src" "$dst"; then
    continue
  fi

  rm -rf "$dst"
  cp -R "$src" "$dst"
  prune_runtime_state "$dst"
  echo "sync: $src -> $dst"
  changed=$((changed + 1))
done

if [ "$changed" -eq 0 ]; then
  echo "OK: nenhuma mudança (workspace-seeds/ já em sync)"
else
  echo "OK: $changed diretório(s) atualizado(s). Lembre-se de 'git add workspace-seeds/' e commitar."
fi
