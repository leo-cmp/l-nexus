#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"
GUARD="$ROOT_DIR/src/.agents/hooks/lnx-guard.sh"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

new_repo() {
    local name="$1"
    local repo="$TMP_DIR/$name"

    git init -b main "$repo" >/dev/null
    git -C "$repo" config user.name "l-nexus Test"
    git -C "$repo" config user.email "l-nexus-test@example.com"
    mkdir -p "$repo/.ai/guidelines/domain" "$repo/.agents/hooks"
    cp "$GUARD" "$repo/.agents/hooks/lnx-guard.sh"
    chmod +x "$repo/.agents/hooks/lnx-guard.sh"

    printf '# Project\n' > "$repo/.ai/project.md"
    printf '# Stack\n' > "$repo/.ai/stack.md"
    printf 'schema_version: 1\n' > "$repo/.ai/model-routing.yaml"
    printf '# Memory\n' > "$repo/.ai/session-memory.md"
    cat > "$repo/.ai/decisions.md" <<'EOF'
# Decisions

## Decision one
Keep this entry.

## Decision two
Keep this entry too.
EOF
    printf '# Glossario\n' > "$repo/.ai/guidelines/domain/glossario.md"
    printf '# Unrelated\n' > "$repo/README.md"
    git -C "$repo" add .
    git -C "$repo" commit -m "test: baseline" >/dev/null
    printf '%s\n' "$repo"
}

run_guard() {
    local repo="$1"
    local output="$2"
    (cd "$repo" && .agents/hooks/lnx-guard.sh) >"$output" 2>&1
}

assert_blocked() {
    local repo="$1"
    local expected="$2"
    local output="$TMP_DIR/guard-output.log"
    if run_guard "$repo" "$output"; then
        fail "guarda deveria bloquear: $expected"
    fi
    grep -Fq "$expected" "$output" || fail "diagnostico ausente: $expected"
}

assert_allowed() {
    local repo="$1"
    local output="$TMP_DIR/guard-output.log"
    run_guard "$repo" "$output" || fail "guarda bloqueou alteracao permitida: $(cat "$output")"
}

test_list_protected() {
    local expected="$TMP_DIR/expected-paths"
    local actual="$TMP_DIR/actual-paths"
    cat > "$expected" <<'EOF'
.ai/project.md
.ai/stack.md
.ai/model-routing.yaml
.ai/session-memory.md
.ai/decisions.md
.ai/guidelines/domain/
EOF

    "$GUARD" --list-protected > "$actual"
    cmp -s "$expected" "$actual" || fail "--list-protected retornou caminhos inesperados"
}

test_decision_addition_is_allowed() {
    local repo
    repo="$(new_repo decision-addition)"
    cat >> "$repo/.ai/decisions.md" <<'EOF'

## Decision three
Keep another entry.
EOF
    git -C "$repo" add .ai/decisions.md
    assert_allowed "$repo"
}

test_decision_edit_or_strike_is_allowed() {
    local repo
    repo="$(new_repo decision-edit)"
    cat > "$repo/.ai/decisions.md" <<'EOF'
# Decisions

## ~~Decision one~~
This entry was revoked.

## Decision two
Keep this entry too.
EOF
    git -C "$repo" add .ai/decisions.md
    assert_allowed "$repo"
}

test_decision_entry_reduction_is_blocked() {
    local repo
    repo="$(new_repo decision-reduction)"
    cat > "$repo/.ai/decisions.md" <<'EOF'
# Decisions

## Decision one
Keep this entry.
Add several replacement lines.
They must not hide entry loss.
Even when additions outnumber removals.
EOF
    git -C "$repo" add .ai/decisions.md
    assert_blocked "$repo" "1 entradas removidas] .ai/decisions.md"
}

test_empty_decisions_template_is_blocked() {
    local repo
    repo="$(new_repo empty-decisions)"
    printf '# Decisions\n' > "$repo/.ai/decisions.md"
    git -C "$repo" add .ai/decisions.md
    assert_blocked "$repo" "2 entradas removidas] .ai/decisions.md"
}

test_decisions_deletion_is_blocked() {
    local repo
    repo="$(new_repo decisions-deletion)"
    git -C "$repo" rm .ai/decisions.md >/dev/null
    assert_blocked "$repo" "[deletado] .ai/decisions.md"
}

test_other_protected_deletions_are_blocked() {
    local path name repo
    for path in \
        .ai/project.md \
        .ai/stack.md \
        .ai/model-routing.yaml \
        .ai/session-memory.md \
        .ai/guidelines/domain/; do
        name="$(printf '%s' "$path" | tr '/.' '__')"
        repo="$(new_repo "protected-$name")"
        if [ "${path%/}" != "$path" ]; then
            git -C "$repo" rm -r "$path" >/dev/null
            assert_blocked "$repo" "[deletado] ${path}glossario.md"
        else
            git -C "$repo" rm "$path" >/dev/null
            assert_blocked "$repo" "[deletado] $path"
        fi
    done
}

test_rename_outside_protected_directory_is_blocked() {
    local repo
    repo="$(new_repo domain-rename)"
    git -C "$repo" mv .ai/guidelines/domain/glossario.md glossario.md
    assert_blocked "$repo" "[deletado] .ai/guidelines/domain/glossario.md"
}

test_unrelated_deletion_is_allowed() {
    local repo
    repo="$(new_repo unrelated-deletion)"
    git -C "$repo" rm README.md >/dev/null
    assert_allowed "$repo"
}

test_unrelated_modification_is_allowed() {
    local repo
    repo="$(new_repo unrelated-modification)"
    printf '# Changed outside protected paths\n' > "$repo/README.md"
    git -C "$repo" add README.md
    assert_allowed "$repo"
}

test_invalid_index_blocks_with_diagnostic() {
    local repo invalid_index output
    repo="$(new_repo invalid-index)"
    invalid_index="$repo/invalid-index-directory"
    output="$TMP_DIR/invalid-index-output.log"
    mkdir "$invalid_index"

    if (cd "$repo" && GIT_INDEX_FILE="$invalid_index" .agents/hooks/lnx-guard.sh) >"$output" 2>&1; then
        fail "guarda deveria bloquear quando o index nao pode ser inspecionado"
    fi
    grep -Fq "nao foi possivel inspecionar o index do Git" "$output" ||
        fail "erro de inspecao do index nao produziu diagnostico autoexplicativo"
}

test_all_violations_are_reported() {
    local repo output
    repo="$(new_repo aggregated-violations)"
    output="$TMP_DIR/aggregated-output.log"
    git -C "$repo" rm .ai/project.md >/dev/null
    cat > "$repo/.ai/decisions.md" <<'EOF'
# Decisions

## Decision one
Keep this entry.
EOF
    git -C "$repo" add .ai/decisions.md

    if run_guard "$repo" "$output"; then
        fail "guarda deveria bloquear violacoes agregadas"
    fi
    grep -Fq "[deletado] .ai/project.md" "$output" || fail "deleção protegida ausente do diagnostico agregado"
    grep -Fq "1 entradas removidas] .ai/decisions.md" "$output" || fail "perda de decisao ausente do diagnostico agregado"
}

test_no_verify_bypasses_installed_guard() {
    local repo output
    repo="$(new_repo no-verify)"
    output="$TMP_DIR/commit-output.log"
    cp "$GUARD" "$repo/.git/hooks/pre-commit"
    chmod +x "$repo/.git/hooks/pre-commit"
    git -C "$repo" rm .ai/project.md >/dev/null

    if git -C "$repo" commit -m "test: blocked deletion" >"$output" 2>&1; then
        fail "commit normal deveria ser bloqueado pelo hook"
    fi
    grep -Fq "[deletado] .ai/project.md" "$output" || fail "hook nao explicou o bloqueio"
    git -C "$repo" commit --no-verify -m "test: intentional deletion" >/dev/null ||
        fail "git commit --no-verify deveria permitir a alteracao"
}

test_list_protected
test_decision_addition_is_allowed
test_decision_edit_or_strike_is_allowed
test_decision_entry_reduction_is_blocked
test_empty_decisions_template_is_blocked
test_decisions_deletion_is_blocked
test_other_protected_deletions_are_blocked
test_rename_outside_protected_directory_is_blocked
test_unrelated_deletion_is_allowed
test_unrelated_modification_is_allowed
test_invalid_index_blocks_with_diagnostic
test_all_violations_are_reported
test_no_verify_bypasses_installed_guard

echo "scripts/test-lnx-guard.sh: ok"
