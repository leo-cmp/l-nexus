#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

TARGET="$TMP_DIR/project"
mkdir -p "$TARGET"

node "$ROOT_DIR/scripts/validate-task-routing.mjs" install "$TARGET" >/dev/null

[ -f "$TARGET/.ai/model-routing.yaml" ] ||
    fail "model-routing.yaml nao foi criado na primeira instalacao"

cmp -s "$ROOT_DIR/src/.ai/model-routing.yaml" "$TARGET/.ai/model-routing.yaml" ||
    fail "primeira instalacao nao copiou o template distribuido"

cat > "$TARGET/.ai/model-routing.yaml" <<'EOF'
schema_version: 1
project_policy:
  r2_review: required
custom_marker: preserve-me
EOF

node "$ROOT_DIR/scripts/validate-task-routing.mjs" install "$TARGET" >/dev/null
grep -q "custom_marker: preserve-me" "$TARGET/.ai/model-routing.yaml" ||
    fail "install sobrescreveu a politica do projeto"

node "$ROOT_DIR/scripts/validate-task-routing.mjs" install-force "$TARGET" >/dev/null
grep -q "custom_marker: preserve-me" "$TARGET/.ai/model-routing.yaml" ||
    fail "install-force sobrescreveu a politica do projeto"

echo "scripts/test-model-routing-install.sh: ok"
