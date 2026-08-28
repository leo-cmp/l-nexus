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

if [ "${1:-}" = "--list-protected" ]; then
    list_protected
    exit 0
fi

if [ "$#" -gt 0 ]; then
    echo "l-nexus: argumento desconhecido: $1" >&2
    exit 2
fi

violations=""

while IFS= read -r -d '' deleted; do
    for rule in "${PROTECTED_RULES[@]}"; do
        protected="${rule#*|}"
        if is_protected_deletion "$deleted" "$protected"; then
            violations+="  [deletado] $deleted"$'\n'
            break
        fi
    done
done < <(git diff --cached --name-only -z --diff-filter=D --no-renames --)

for rule in "${PROTECTED_RULES[@]}"; do
    policy="${rule%%|*}"
    protected="${rule#*|}"
    [ "$policy" = 'append-only' ] || continue

    if ! git diff --cached --quiet -- "$protected"; then
        head_entries=0
        staged_entries=0

        if git cat-file -e "HEAD:$protected" 2>/dev/null; then
            head_entries="$(git show "HEAD:$protected" | count_decision_entries)"
        fi

        if git cat-file -e ":$protected" 2>/dev/null; then
            staged_entries="$(git show ":$protected" | count_decision_entries)"
            if [ "$staged_entries" -lt "$head_entries" ]; then
                violations+="  [$((head_entries - staged_entries)) entradas removidas] $protected"$'\n'
            fi
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
