#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"
CLI="$ROOT_DIR/scripts/cli.mjs"

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

"$CLI" install "$TARGET" >/dev/null

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

"$CLI" install "$TARGET" >/dev/null
grep -q "custom_marker: preserve-me" "$TARGET/.ai/model-routing.yaml" ||
    fail "install sobrescreveu a politica do projeto"

"$CLI" update "$TARGET" >/dev/null
grep -q "custom_marker: preserve-me" "$TARGET/.ai/model-routing.yaml" ||
    fail "update sobrescreveu a politica do projeto"

# O update troca skills e diretrizes e nao encosta no roteamento -- e ficava
# calado sobre isso. Um projeto atualizado seguia com o catalogo da versao
# anterior, e o descompasso so aparecia quando um agente agia por ele: uma poda
# de runners publicada no kit nao chegou ao projeto e o Orchestrator continuou
# oferecendo CLIs que tinham saido. Calar sobre o que nao mudou e o defeito.
DRIFT="$TMP_DIR/drift"
mkdir -p "$DRIFT"
"$CLI" install "$DRIFT" >/dev/null

python3 - "$DRIFT/.ai/model-routing.yaml" <<'PYEOF'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
extra = """  runner-que-saiu:
    binary: "cli-antiga"
    argv: [ "{prompt}" ]
    prompt_delivery: argv
    interactive: { supported: false, argv: [] }
    autonomy: { supported: false, argv: [] }
    effort: { supported: false, argv: [] }
"""
io.open(p, "w", encoding="utf-8").write(s.replace("cli_runners:\n", "cli_runners:\n" + extra))
PYEOF

saida="$("$CLI" update "$DRIFT")"
grep -q "NAO foi atualizado" <<< "$saida" ||
    fail "update nao avisou que o roteamento do projeto ficou para tras"
grep -q "runner-que-saiu" <<< "$saida" ||
    fail "o aviso nao nomeia o que sairia do roteamento"
grep -q "sync-routing .ai/model-routing.yaml --write" <<< "$saida" ||
    fail "o aviso nao diz como aplicar"

# Avisar nao e aplicar: escrever continua sendo decisao de quem atualiza.
grep -q "runner-que-saiu" "$DRIFT/.ai/model-routing.yaml" ||
    fail "o update escreveu no roteamento do projeto em vez de so avisar"

# E o silencio tem que ser verdadeiro: sem divergencia, sem aviso.
"$CLI" sync-routing "$DRIFT/.ai/model-routing.yaml" --write >/dev/null
! grep -q "NAO foi atualizado" <<< "$("$CLI" update "$DRIFT")" ||
    fail "update avisou sobre divergencia num roteamento ja sincronizado"

echo "scripts/test-model-routing-install.sh: ok"
