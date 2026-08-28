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

# A entrada de diretorio e validada pelo mesmo loop; sua sentinela fica
# diretamente em .ai/guidelines/domain/, fora de business-rules/.

PACKAGE_COPY="$TMP_DIR/broken-package"
BROKEN_TARGET="$TMP_DIR/broken-target"
BROKEN_STDOUT="$TMP_DIR/broken-stdout.txt"
BROKEN_STDERR="$TMP_DIR/broken-stderr.txt"
mkdir -p "$PACKAGE_COPY/scripts" "$BROKEN_TARGET"
cp -R "$ROOT_DIR/src" "$PACKAGE_COPY/src"
cp "$ROOT_DIR/scripts/install.sh" "$PACKAGE_COPY/scripts/install.sh"
cp "$ROOT_DIR/VERSION" "$PACKAGE_COPY/VERSION"
printf '#!/usr/bin/env bash\nexit 23\n' > "$PACKAGE_COPY/src/.agents/hooks/lnx-guard.sh"
chmod +x "$PACKAGE_COPY/src/.agents/hooks/lnx-guard.sh"

if "$PACKAGE_COPY/scripts/install.sh" "$BROKEN_TARGET" > "$BROKEN_STDOUT" 2> "$BROKEN_STDERR"; then
    fail "o instalador aceitou falha ao projetar caminhos protegidos"
fi
grep -q 'ERRO:' "$BROKEN_STDERR" ||
    fail "a falha da projecao nao produziu diagnostico em stderr"
if grep -q 'l-nexus instalado com sucesso' "$BROKEN_STDOUT" "$BROKEN_STDERR"; then
    fail "o instalador anunciou sucesso depois da falha da projecao"
fi

echo "scripts/test-protected-files.sh: ok"
