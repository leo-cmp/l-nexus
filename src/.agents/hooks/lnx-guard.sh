#!/usr/bin/env bash
set -euo pipefail

PROTECTED_RULES=(
    'no-delete|.ai/project.md'
    'no-delete|.ai/stack.md'
    'no-delete|.ai/model-routing.yaml'
    'no-delete|.ai/session-memory.md'
    'append-only|.ai/decisions.md'
    'no-delete|.ai/guidelines/domain/'
)

list_protected() {
    local rule
    for rule in "${PROTECTED_RULES[@]}"; do
        printf '%s\n' "${rule#*|}"
    done
}

is_protected_deletion() {
    local deleted="$1"
    local protected="$2"

    case "$protected" in
        */) [[ "$deleted" == "$protected"* ]] ;;
        *)  [[ "$deleted" == "$protected" ]] ;;
    esac
}

count_decision_entries() {
    grep -c '^## ' || true
}

block_on_git_error() {
    local operation="$1"

    cat >&2 <<EOF
l-nexus: commit bloqueado porque nao foi possivel inspecionar o index do Git.
A guarda falha de forma segura quando o Git retorna erro durante a verificacao.
Etapa que falhou: $operation

Corrija o repositorio ou o index e tente novamente. Para ignorar a guarda apenas
neste commit, use conscientemente:
  git commit --no-verify
EOF
    exit 1
}

if [ "${1:-}" = "--list-protected" ]; then
    list_protected
    exit 0
fi

if [ "$#" -gt 0 ]; then
    echo "l-nexus: argumento desconhecido: $1" >&2
    exit 2
fi

violations=""
deleted_paths_file=""

cleanup() {
    if [ -n "$deleted_paths_file" ]; then
        rm -f "$deleted_paths_file"
    fi
}
trap cleanup EXIT HUP INT TERM

if deleted_paths_file="$(mktemp "${TMPDIR:-/tmp}/lnx-guard-deletions.XXXXXX")"; then
    :
else
    block_on_git_error "criacao do arquivo temporario para inspecionar delecoes staged"
fi

if git diff --cached --name-only -z --diff-filter=D --no-renames -- > "$deleted_paths_file"; then
    :
else
    block_on_git_error "git diff das delecoes staged"
fi

while IFS= read -r -d '' deleted; do
    for rule in "${PROTECTED_RULES[@]}"; do
        protected="${rule#*|}"
        if is_protected_deletion "$deleted" "$protected"; then
            violations+="  [deletado] $deleted"$'\n'
            break
        fi
    done
done < "$deleted_paths_file"

for rule in "${PROTECTED_RULES[@]}"; do
    policy="${rule%%|*}"
    protected="${rule#*|}"
    [ "$policy" = 'append-only' ] || continue

    if git diff --cached --quiet -- "$protected"; then
        staged_diff_status=0
    else
        staged_diff_status=$?
    fi

    case "$staged_diff_status" in
        0)
            continue
            ;;
        1)
            ;;
        *)
            block_on_git_error "git diff de $protected"
            ;;
    esac

    head_entries=0
    staged_entries=0

    if git rev-parse --verify --quiet HEAD >/dev/null; then
        head_status=0
    else
        head_status=$?
    fi

    case "$head_status" in
        0)
            if head_listing="$(git ls-tree --name-only HEAD -- "$protected")"; then
                :
            else
                block_on_git_error "git ls-tree de HEAD para $protected"
            fi

            if [ "$head_listing" = "$protected" ]; then
                if git cat-file -e "HEAD:$protected" 2>/dev/null; then
                    :
                else
                    block_on_git_error "git cat-file de HEAD para $protected"
                fi

                if head_entries="$(git show "HEAD:$protected" | count_decision_entries)"; then
                    :
                else
                    block_on_git_error "git show de HEAD para $protected"
                fi
            fi
            ;;
        1)
            ;;
        *)
            block_on_git_error "git rev-parse de HEAD"
            ;;
    esac

    if staged_listing="$(git ls-files -- "$protected")"; then
        :
    else
        block_on_git_error "git ls-files do index para $protected"
    fi

    if [ "$staged_listing" = "$protected" ]; then
        if git cat-file -e ":$protected" 2>/dev/null; then
            :
        else
            block_on_git_error "git cat-file do index para $protected"
        fi

        if staged_entries="$(git show ":$protected" | count_decision_entries)"; then
            :
        else
            block_on_git_error "git show do index para $protected"
        fi

        if [ "$staged_entries" -lt "$head_entries" ]; then
            violations+="  [$((head_entries - staged_entries)) entradas removidas] $protected"$'\n'
        fi
    fi
done

if [ -n "$violations" ]; then
    cat >&2 <<EOF
l-nexus: commit bloqueado para proteger conteudo local:
$violations
Revise as mudancas acima. Para desfazer apenas o staging, use:
  git restore --staged -- <caminho>

Se tambem precisar restaurar o conteudo versionado em HEAD, use separadamente:
  git restore --source=HEAD --worktree --staged -- <caminho>

Se a perda for intencional, confirme explicitamente com:
  git commit --no-verify
EOF
    exit 1
fi

exit 0
