#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CLI="$ROOT_DIR/scripts/cli.mjs"
TMP_DIR="$(mktemp -d)"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

init_repo() {
    local repo="$1"
    git init -b main "$repo" >/dev/null
    git -C "$repo" config user.name "l-nexus Test"
    git -C "$repo" config user.email "l-nexus-test@example.com"
    git -C "$repo" config core.hooksPath .git/hooks
}

run_install() {
    local target="$1"
    local output="$2"
    "$CLI" install "$target" >"$output" 2>&1
}

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

assert_preserved() {
    local hook="$1"
    local checksum="$2"
    local mode="$3"
    [ "$(cksum < "$hook")" = "$checksum" ] || fail "bytes do hook foram alterados: $hook"
    [ "$(file_mode "$hook")" = "$mode" ] || fail "modo do hook foi alterado: $hook"
}

write_existing_hook() {
    local hook="$1"
    local marker="$2"
    mkdir -p "$(dirname "$hook")"
    printf '#!/usr/bin/env bash\n%s\necho preservado\n' "$marker" > "$hook"
    chmod 740 "$hook"
}

test_non_git_directory_skips_silently() {
    local target="$TMP_DIR/non-git" output="$TMP_DIR/non-git.log"
    mkdir -p "$target"
    run_install "$target" "$output" || fail "instalacao sem Git deveria concluir"
    [ -d "$target/.agents" ] || fail "kit nao foi instalado no diretorio sem Git"
    [ ! -e "$target/.git/hooks/pre-commit" ] || fail "hook criado fora de repositorio Git"
    ! grep -Eqi 'hook|guarda.*(nao|não).*instalad' "$output" || fail "instalacao sem Git imprimiu aviso de hook"
}

test_main_repo_installs_executable_stub() {
    local repo="$TMP_DIR/main" output="$TMP_DIR/main.log" hook
    init_repo "$repo"
    hook="$repo/.git/hooks/pre-commit"
    run_install "$repo" "$output" || fail "instalacao no repositorio principal falhou"
    [ -x "$hook" ] || fail "stub pre-commit nao foi instalado como executavel"
    [ "$(sed -n '2p' "$hook")" = '# lnx-guard-stub v1' ] || fail "marcador v1 ausente da linha 2"
}

test_stub_fails_closed_without_guard() {
    local repo="$TMP_DIR/fail-closed" install_output="$TMP_DIR/fail-closed-install.log"
    local commit_output="$TMP_DIR/fail-closed-commit.log" hook guard
    init_repo "$repo"
    run_install "$repo" "$install_output" || fail "instalacao para teste fail-closed falhou"
    hook="$repo/.git/hooks/pre-commit"
    guard="$repo/.agents/hooks/lnx-guard.sh"
    mv "$guard" "$guard.moved"
    printf 'staged\n' > "$repo/staged.txt"
    git -C "$repo" add staged.txt
    if git -C "$repo" commit -m "test: fail closed" >"$commit_output" 2>&1; then
        fail "stub permitiu commit sem a guarda versionada"
    fi
    grep -Fq -- '--no-verify' "$commit_output" || fail "stub fail-closed nao explicou bypass"
    grep -Fq "$hook" "$commit_output" || fail "stub fail-closed nao mostrou caminho efetivo do hook"
}

test_internal_hooks_path_is_created() {
    local repo="$TMP_DIR/internal" output="$TMP_DIR/internal.log" hook
    init_repo "$repo"
    git -C "$repo" config core.hooksPath .githooks
    hook="$repo/.githooks/pre-commit"
    [ ! -e "$(dirname "$hook")" ] || fail "precondicao: hooksPath interno ja existe"
    run_install "$repo" "$output" || fail "instalacao em hooksPath interno falhou"
    [ -x "$hook" ] || fail "stub nao foi criado em hooksPath interno"
}

test_absolute_external_hooks_path_is_rejected() {
    local repo="$TMP_DIR/external-repo" external="$TMP_DIR/external-hooks" output="$TMP_DIR/external.log"
    init_repo "$repo"
    git -C "$repo" config core.hooksPath "$external"
    run_install "$repo" "$output" || fail "hooksPath externo deveria ser skip seguro"
    [ ! -e "$external" ] || fail "hooksPath externo foi criado ou alterado"
    grep -Fq 'fora do projeto' "$output" || fail "aviso de hooksPath externo ausente"
    grep -Fq 'Guarda NAO instalada' "$output" || fail "aviso externo alegou instalacao"
}

test_symlinked_and_dangling_hooks_paths_are_rejected() {
    local repo external output

    repo="$TMP_DIR/symlink-repo"
    external="$TMP_DIR/symlink-external"
    output="$TMP_DIR/symlink.log"
    init_repo "$repo"
    mkdir -p "$external"
    ln -s "$external" "$repo/.githooks"
    git -C "$repo" config core.hooksPath .githooks
    run_install "$repo" "$output" || fail "symlink externo deveria ser skip seguro"
    [ ! -e "$external/pre-commit" ] || fail "hook foi escrito atraves de symlink externo"
    grep -Fq 'fora do projeto' "$output" || fail "aviso para symlink externo ausente"

    repo="$TMP_DIR/dangling-repo"
    output="$TMP_DIR/dangling.log"
    init_repo "$repo"
    ln -s "$TMP_DIR/missing-external" "$repo/.githooks"
    git -C "$repo" config core.hooksPath .githooks
    run_install "$repo" "$output" || fail "symlink pendente deveria ser skip seguro"
    [ -L "$repo/.githooks" ] || fail "symlink pendente foi alterado"
    [ ! -e "$TMP_DIR/missing-external" ] || fail "destino de symlink pendente foi criado"
    grep -Fq 'fora do projeto' "$output" || fail "aviso para symlink pendente ausente"
}

test_linked_worktree_is_rejected_with_guidance() {
    local main_repo="$TMP_DIR/worktree-main" linked_repo="$TMP_DIR/worktree-linked"
    local output="$TMP_DIR/worktree.log" common_hook
    init_repo "$main_repo"
    printf 'baseline\n' > "$main_repo/README.md"
    git -C "$main_repo" add README.md
    git -C "$main_repo" commit -m "test: baseline" >/dev/null
    git -C "$main_repo" config --unset core.hooksPath
    git -C "$main_repo" worktree add "$linked_repo" -b linked >/dev/null
    common_hook="$main_repo/.git/hooks/pre-commit"
    run_install "$linked_repo" "$output" || fail "linked worktree deveria ser skip seguro"
    [ ! -e "$common_hook" ] || fail "linked worktree escreveu no common dir"
    grep -Fq 'Worktree vinculada' "$output" || fail "diagnostico especifico de linked worktree ausente"
    grep -Fq 'rode o instalador no repositorio principal' "$output" || fail "orientacao da worktree principal ausente"
}

test_foreign_hook_is_preserved() {
    local repo="$TMP_DIR/foreign" output="$TMP_DIR/foreign.log" hook checksum mode
    init_repo "$repo"
    hook="$repo/.git/hooks/pre-commit"
    write_existing_hook "$hook" '# hook de terceiro'
    checksum="$(cksum < "$hook")"
    mode="$(file_mode "$hook")"
    run_install "$repo" "$output" || fail "hook estrangeiro deveria ser preservado sem falhar"
    assert_preserved "$hook" "$checksum" "$mode"
    grep -Fq 'encadeie: .agents/hooks/lnx-guard.sh' "$output" || fail "instrucao de encadeamento ausente"
}

test_current_stub_is_preserved() {
    local repo="$TMP_DIR/v1" output="$TMP_DIR/v1.log" hook checksum mode
    init_repo "$repo"
    hook="$repo/.git/hooks/pre-commit"
    write_existing_hook "$hook" '# lnx-guard-stub v1'
    checksum="$(cksum < "$hook")"
    mode="$(file_mode "$hook")"
    run_install "$repo" "$output" || fail "stub v1 existente deveria ser aceito"
    assert_preserved "$hook" "$checksum" "$mode"
    grep -Fq 'Guarda de pre-commit do l-nexus ativa' "$output" || fail "stub atual nao foi reconhecido"
    ! grep -Fq 'Hook pre-commit ja existe' "$output" || fail "stub atual recebeu falso aviso de conflito"
}

test_old_stub_is_preserved_and_warned() {
    local repo="$TMP_DIR/v0" output="$TMP_DIR/v0.log" hook checksum mode
    init_repo "$repo"
    hook="$repo/.git/hooks/pre-commit"
    write_existing_hook "$hook" '# lnx-guard-stub v0'
    checksum="$(cksum < "$hook")"
    mode="$(file_mode "$hook")"
    run_install "$repo" "$output" || fail "stub antigo deveria ser preservado sem falhar"
    assert_preserved "$hook" "$checksum" "$mode"
    grep -Fq 'desatualizado' "$output" || fail "stub antigo nao foi diagnosticado"
}

test_newer_stub_is_preserved_without_downgrade() {
    local repo="$TMP_DIR/v2" output="$TMP_DIR/v2.log" hook checksum mode
    init_repo "$repo"
    hook="$repo/.git/hooks/pre-commit"
    write_existing_hook "$hook" '# lnx-guard-stub v2'
    checksum="$(cksum < "$hook")"
    mode="$(file_mode "$hook")"
    run_install "$repo" "$output" || fail "stub posterior deveria ser preservado sem falhar"
    assert_preserved "$hook" "$checksum" "$mode"
    grep -Fq 'mais novo que este instalador' "$output" || fail "stub posterior nao foi diagnosticado"
    grep -Fq 'Nao foi alterado nem sofreu downgrade' "$output" || fail "mensagem de nao-downgrade ausente"
}

test_internal_regular_file_hooks_path_fails() {
    local repo="$TMP_DIR/invalid-internal" output="$TMP_DIR/invalid-internal.log"
    init_repo "$repo"
    printf 'nao e diretorio\n' > "$repo/.githooks"
    git -C "$repo" config core.hooksPath .githooks
    if run_install "$repo" "$output"; then
        fail "hooksPath interno como arquivo regular deveria falhar"
    fi
    grep -Fq 'ERRO:' "$output" || fail "falha real nao produziu erro explicito"
    ! grep -Fq 'l-nexus instalado com sucesso' "$output" || fail "falha real imprimiu banner de sucesso"
}

test_non_git_directory_skips_silently
test_main_repo_installs_executable_stub
test_stub_fails_closed_without_guard
test_internal_hooks_path_is_created
test_absolute_external_hooks_path_is_rejected
test_symlinked_and_dangling_hooks_paths_are_rejected
test_linked_worktree_is_rejected_with_guidance
test_foreign_hook_is_preserved
test_current_stub_is_preserved
test_old_stub_is_preserved_and_warned
test_newer_stub_is_preserved_without_downgrade
test_internal_regular_file_hooks_path_fails

echo "scripts/test-hook-install.sh: ok"
