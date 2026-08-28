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

TARGET="$TMP_DIR/test-project"
PROTECTED_LIST="$TMP_DIR/protected-paths.txt"
UPDATE_OUTPUT="$TMP_DIR/update-output.txt"
mkdir -p "$TARGET"

# Manter o alvo sem Git faz a instalacao da guarda pular legitimamente,
# isolando este teste no contrato de preservacao do update.
"$CLI" install "$TARGET" >/dev/null
"$TARGET/.agents/hooks/lnx-guard.sh" --list-protected > "$PROTECTED_LIST"

[ -s "$PROTECTED_LIST" ] || fail "a guarda nao declarou caminhos protegidos"

while IFS= read -r protected; do
    [ -n "$protected" ] || continue
    case "$protected" in
        */)
            mkdir -p "$TARGET/$protected"
            printf 'custom_marker: survived:%s\n' "$protected" > "$TARGET/${protected}.lnx-protected-sentinel"
            ;;
        *)
            mkdir -p "$(dirname "$TARGET/$protected")"
            printf 'custom_marker: survived:%s\n' "$protected" > "$TARGET/$protected"
            ;;
    esac
done < "$PROTECTED_LIST"

"$CLI" update "$TARGET" > "$UPDATE_OUTPUT"

while IFS= read -r protected; do
    [ -n "$protected" ] || continue
    case "$protected" in
        */) marker="$TARGET/${protected}.lnx-protected-sentinel" ;;
        *) marker="$TARGET/$protected" ;;
    esac

    [ -f "$marker" ] || fail "$protected foi apagado no update"
    grep -Fqx "custom_marker: survived:$protected" "$marker" ||
        fail "$protected perdeu conteudo no update"
    grep -Fqx "  ✓ $protected" "$UPDATE_OUTPUT" ||
        fail "$protected nao apareceu no resumo canonico do instalador"
done < "$PROTECTED_LIST"

[ -f "$TARGET/.ai/guidelines/domain/.lnx-protected-sentinel" ] ||
    fail ".ai/guidelines/domain/ foi recriado depois de apagar conteudo local"

echo "scripts/test-protected-files.sh: ok"
