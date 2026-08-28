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

assert_projection_failure() {
    local case_name="$1"
    local guard_status="$2"
    local expected_error="$3"
    local package_copy="$TMP_DIR/package-$case_name"
    local broken_target="$TMP_DIR/target-$case_name"
    local stdout_file="$TMP_DIR/stdout-$case_name.txt"
    local stderr_file="$TMP_DIR/stderr-$case_name.txt"

    mkdir -p "$package_copy/scripts" "$broken_target"
    cp -R "$ROOT_DIR/src" "$package_copy/src"
    cp "$ROOT_DIR/scripts/install.sh" "$package_copy/scripts/install.sh"
    cp "$ROOT_DIR/VERSION" "$package_copy/VERSION"
    printf '#!/usr/bin/env bash\nexit %s\n' "$guard_status" > "$package_copy/src/.agents/hooks/lnx-guard.sh"
    chmod +x "$package_copy/src/.agents/hooks/lnx-guard.sh"

    if "$package_copy/scripts/install.sh" "$broken_target" > "$stdout_file" 2> "$stderr_file"; then
        fail "o instalador aceitou a projecao protegida invalida: $case_name"
    fi
    grep -Fq 'ERRO:' "$stderr_file" ||
        fail "a projecao $case_name nao produziu ERRO em stderr"
    grep -Fq "$expected_error" "$stderr_file" ||
        fail "a projecao $case_name nao explicou o erro esperado"
    if grep -Fq 'l-nexus instalado com sucesso' "$stdout_file" "$stderr_file"; then
        fail "o instalador anunciou sucesso depois da projecao $case_name"
    fi
}

assert_projection_failure "exit-nonzero" 23 "nao foi possivel obter a lista canonica"
assert_projection_failure "empty-output" 0 "lista canonica de caminhos protegidos esta vazia"

echo "scripts/test-protected-files.sh: ok"
