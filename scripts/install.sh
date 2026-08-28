#!/usr/bin/env bash
set -euo pipefail

case "$(uname -s 2>/dev/null || echo 'Unknown')" in
    MINGW*|MSYS*|CYGWIN*)
        echo "AVISO: Ambiente Windows detectado sem WSL."
        echo "O l-nexus requer ambiente Unix (Linux, macOS ou Windows com WSL)."
        echo "Alternativas:"
        echo "  1. Use WSL (recomendado): https://learn.microsoft.com/windows/wsl/install"
        echo "  2. Instale manualmente: copie src/AGENTS.md para a raiz, src/.ai/ para .ai/, etc."
        exit 1
        ;;
esac

SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TARGET="${1:-.}"
# Se o argumento for "install" ou "update", é invocação via npx sem target
case "$TARGET" in
    install|update|--help|-h)
        TARGET="."
        ;;
esac

echo "=== l-nexus install ==="
echo "Target: $TARGET"

SRC_DIR="$ROOT_DIR/src"

LNX_STUB_VERSION=1

normalize_absolute_path() {
    node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$1"
}

physical_path_allow_missing() {
    local candidate cursor suffix base parent
    candidate="$(normalize_absolute_path "$1")"
    cursor="$candidate"
    suffix=""

    while [ ! -e "$cursor" ] && [ ! -L "$cursor" ]; do
        base="$(basename "$cursor")"
        suffix="/$base$suffix"
        parent="$(dirname "$cursor")"
        [ "$parent" != "$cursor" ] || return 1
        cursor="$parent"
    done

    # Um symlink pendente nunca e tratado como diretorio ausente a criar.
    [ -d "$cursor" ] || return 1
    cursor="$(cd "$cursor" && pwd -P)"
    printf '%s%s\n' "$cursor" "$suffix"
}

path_is_within() {
    local child="$1"
    local root="$2"
    [ "$child" = "$root" ] || [[ "$child" == "$root/"* ]]
}

path_has_symlink_component() {
    local cursor parent
    cursor="$(normalize_absolute_path "$1")"

    while :; do
        [ -L "$cursor" ] && return 0
        parent="$(dirname "$cursor")"
        [ "$parent" != "$cursor" ] || return 1
        cursor="$parent"
    done
}

resolve_git_path() {
    local target_root="$1"
    local path="$2"

    case "$path" in
        /*) normalize_absolute_path "$path" ;;
        *) normalize_absolute_path "$target_root/$path" ;;
    esac
}

classify_existing_hook() {
    local hook="$1"
    local marker version
    marker="$(sed -n '2p' "$hook" 2>/dev/null || true)"

    if [[ "$marker" =~ ^#\ lnx-guard-stub\ v([0-9]+)$ ]]; then
        version="${BASH_REMATCH[1]}"
        if [ "$version" = "$LNX_STUB_VERSION" ]; then
            echo "  ✓ Guarda de pre-commit do l-nexus ativa: $hook"
        elif [ "$((10#$version))" -lt "$LNX_STUB_VERSION" ]; then
            echo "  ! Stub do l-nexus desatualizado (v$version, atual v$LNX_STUB_VERSION): $hook"
            echo "    Nao foi alterado. Remova o arquivo e rode o install novamente."
        else
            echo "  ! Stub do l-nexus v$version e mais novo que este instalador (v$LNX_STUB_VERSION)."
            echo "    Nao foi alterado nem sofreu downgrade: $hook"
        fi
        return 0
    fi

    echo "  ! Hook pre-commit ja existe e nao foi alterado: $hook"
    echo "    Para ativar a guarda, encadeie: .agents/hooks/lnx-guard.sh"
}

warn_external_hooks_path() {
    local hooks_dir="$1"
    echo "  ! core.hooksPath aponta para fora do projeto ($hooks_dir)."
    echo "    Guarda NAO instalada - instalar ali afetaria outros diretorios."
    echo "    Para ativar manualmente, acrescente ao seu hook:"
    echo "      .agents/hooks/lnx-guard.sh"
}

warn_linked_worktree() {
    local hooks_dir="$1"
    echo "  ! Worktree vinculada: os hooks ficam no repositorio principal ($hooks_dir),"
    echo "    fora desta arvore. Guarda NAO instalada."
    echo "    Para proteger todas as worktrees, rode o instalador no repositorio principal."
    echo "    Alternativa: encadeie manualmente .agents/hooks/lnx-guard.sh no hook de la."
}

install_guard_hook() {
    local target_root="$1"
    local hooks_value hooks_candidate hooks_dir hook_path temporary_hook
    local git_dir_value common_dir_value git_dir common_dir

    if ! git -C "$target_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return 0
    fi

    if ! hooks_value="$(git -C "$target_root" rev-parse --git-path hooks 2>/dev/null)"; then
        echo "ERRO: nao foi possivel descobrir o diretorio de hooks Git em $target_root" >&2
        return 1
    fi
    hooks_candidate="$(resolve_git_path "$target_root" "$hooks_value")"

    if ! hooks_dir="$(physical_path_allow_missing "$hooks_candidate")"; then
        if ! path_is_within "$hooks_candidate" "$target_root" || path_has_symlink_component "$hooks_candidate"; then
            warn_external_hooks_path "$hooks_candidate"
            return 0
        fi
        echo "ERRO: o caminho interno de hooks nao pode ser usado como diretorio: $hooks_candidate" >&2
        return 1
    fi

    if ! path_is_within "$hooks_dir" "$target_root"; then
        git_dir_value="$(git -C "$target_root" rev-parse --git-dir 2>/dev/null || true)"
        common_dir_value="$(git -C "$target_root" rev-parse --git-common-dir 2>/dev/null || true)"
        git_dir=""
        common_dir=""
        if [ -n "$git_dir_value" ]; then
            git_dir="$(physical_path_allow_missing "$(resolve_git_path "$target_root" "$git_dir_value")" 2>/dev/null || true)"
        fi
        if [ -n "$common_dir_value" ]; then
            common_dir="$(physical_path_allow_missing "$(resolve_git_path "$target_root" "$common_dir_value")" 2>/dev/null || true)"
        fi

        if [ -n "$git_dir" ] && [ -n "$common_dir" ] && [ "$git_dir" != "$common_dir" ] && path_is_within "$hooks_dir" "$common_dir"; then
            warn_linked_worktree "$hooks_dir"
        else
            warn_external_hooks_path "$hooks_dir"
        fi
        return 0
    fi

    if ! mkdir -p "$hooks_dir"; then
        echo "ERRO: nao foi possivel criar o diretorio de hooks: $hooks_dir" >&2
        return 1
    fi

    hook_path="$hooks_dir/pre-commit"
    if [ -e "$hook_path" ] || [ -L "$hook_path" ]; then
        classify_existing_hook "$hook_path"
        return 0
    fi

    if ! temporary_hook="$(mktemp "$hooks_dir/.lnx-pre-commit.XXXXXX")"; then
        echo "ERRO: nao foi possivel preparar a guarda em $hooks_dir" >&2
        return 1
    fi

    if ! cat > "$temporary_hook" <<'EOF'
#!/usr/bin/env bash
# lnx-guard-stub v1
set -u

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
guard="$repo_root/.agents/hooks/lnx-guard.sh"

if [ -n "$repo_root" ] && [ -x "$guard" ]; then
    exec "$guard"
fi

hook_dir="$(cd "$(dirname "$0")" 2>/dev/null && pwd -P || dirname "$0")"
hook_path="$hook_dir/$(basename "$0")"

echo ""
echo "Commit bloqueado: a guarda de conteudo do projeto nao esta disponivel."
echo "Isso pode acontecer durante uma atualizacao ou apos remover o l-nexus."
echo "Para este commit: git commit --no-verify"
echo "Se o l-nexus nao e mais usado, remova este hook: $hook_path"
echo ""
exit 1
EOF
    then
        rm -f "$temporary_hook" || true
        echo "ERRO: nao foi possivel escrever a guarda temporaria em $hooks_dir" >&2
        return 1
    fi

    if ! chmod +x "$temporary_hook"; then
        rm -f "$temporary_hook" || true
        echo "ERRO: nao foi possivel tornar a guarda executavel em $hooks_dir" >&2
        return 1
    fi

    if ln "$temporary_hook" "$hook_path" 2>/dev/null; then
        if ! rm -f "$temporary_hook"; then
            echo "ERRO: a guarda foi instalada, mas o arquivo temporario nao pode ser removido: $temporary_hook" >&2
            return 1
        fi
        echo "  ✓ Guarda de pre-commit do l-nexus instalada: $hook_path"
        return 0
    fi

    if ! rm -f "$temporary_hook"; then
        echo "ERRO: nao foi possivel limpar o arquivo temporario: $temporary_hook" >&2
        return 1
    fi
    if [ -e "$hook_path" ] || [ -L "$hook_path" ]; then
        classify_existing_hook "$hook_path"
        return 0
    fi
    echo "ERRO: nao foi possivel instalar a guarda em $hook_path" >&2
    return 1
}

mkdir -p "$TARGET/.ai/guidelines/domain/business-rules"
mkdir -p "$TARGET/.ai/decisions"
mkdir -p "$TARGET/.claude"

TARGET_ROOT="$(cd "$TARGET" && pwd -P)"
TARGET="$TARGET_ROOT"

# AGENTS.md e CLAUDE.md
cp "$SRC_DIR/AGENTS.md" "$TARGET/AGENTS.md"
cp "$SRC_DIR/AGENTS.md" "$TARGET/CLAUDE.md"

# Limpar symlinks obsoletos
for f in CODEX.md COPILOT.md ANTIGRAVITY.md; do
    if [ -L "$TARGET/$f" ]; then rm -f "$TARGET/$f"; fi
done

# Roles
rm -rf "$TARGET/.ai/roles"
cp -r "$SRC_DIR/.ai/roles" "$TARGET/.ai/roles"

# Guidelines
rm -rf "$TARGET/.ai/guidelines/core"
cp -r "$SRC_DIR/.ai/guidelines/core" "$TARGET/.ai/guidelines/core"
rm -rf "$TARGET/.ai/guidelines/stacks"
cp -r "$SRC_DIR/.ai/guidelines/stacks" "$TARGET/.ai/guidelines/stacks"

# Domain (regras de negocio pertencem exclusivamente ao projeto)
mkdir -p "$TARGET/.ai/guidelines/domain/business-rules"
if [ ! -f "$TARGET/.ai/guidelines/domain/business-rules/index.md" ]; then
    cp -r "$SRC_DIR/.ai/guidelines/domain/." "$TARGET/.ai/guidelines/domain/"
fi

# Templates
rm -rf "$TARGET/.ai/templates"
cp -r "$SRC_DIR/.ai/templates" "$TARGET/.ai/templates"

# Subagents
rm -rf "$TARGET/.ai/subagents"
cp -r "$SRC_DIR/.ai/subagents" "$TARGET/.ai/subagents"


# Roteamento de modelos pertence ao projeto depois da primeira instalacao.
if [ ! -f "$TARGET/.ai/model-routing.yaml" ]; then
    cp "$SRC_DIR/.ai/model-routing.yaml" "$TARGET/.ai/model-routing.yaml"
fi

# Skills
rm -rf "$TARGET/.agents"
cp -r "$SRC_DIR/.agents" "$TARGET/.agents"

install_guard_hook "$TARGET_ROOT"

ln -sfn "../.agents/skills" "$TARGET/.claude/skills"

# .mcp.json
cp "$SRC_DIR/.mcp.json" "$TARGET/.mcp.json"

# project.md
if [ ! -f "$TARGET/.ai/project.md" ]; then
    cat > "$TARGET/.ai/project.md" << 'EOF'
# 🔒 [PROJETO] Novo Projeto

> 🔒 **ARQUIVO LOCAL PROTEGIDO**: Este arquivo pertence ao projeto e NUNCA é sobrescrito pelo `npx update`.

## Ambiente e Estrutura
- **Localização:** Os arquivos rodam diretamente na raiz.
- **Idioma da UI:** pt-BR

## Stack
- Backend: 
- Database: 
EOF
fi

# stack.md
if [ ! -f "$TARGET/.ai/stack.md" ]; then
    cat > "$TARGET/.ai/stack.md" << 'EOF'
# 🔒 [PROJETO] Stacks do Projeto

> 🔒 **ARQUIVO LOCAL PROTEGIDO**: Este arquivo pertence ao projeto e NUNCA é sobrescrito pelo `npx update`.
> Preencha abaixo as stacks do projeto. Remova as que não se aplicam.

Consulte as diretrizes específicas em `.ai/guidelines/stacks/`:

- [ ] Backend: (ex: Laravel, CodeIgniter 4)
- [ ] Frontend: (ex: Tailwind CSS, daisyUI, Astro)
- [ ] Database: (ex: MySQL, PostgreSQL)
EOF
fi

# session-memory.md
if [ ! -f "$TARGET/.ai/session-memory.md" ]; then
    cp "$SRC_DIR/.ai/session-memory.md" "$TARGET/.ai/session-memory.md"
fi

# decisions.md
if [ ! -f "$TARGET/.ai/decisions.md" ]; then
    cp "$SRC_DIR/.ai/decisions.md" "$TARGET/.ai/decisions.md"
fi

# .gitignore
if [ -f "$TARGET/.gitignore" ]; then
    if ! grep -q "^l-nexus" "$TARGET/.gitignore"; then
        printf "\n# l-nexus\nl-nexus/\n" >> "$TARGET/.gitignore"
    fi
fi

echo "=== l-nexus instalado com sucesso ==="
echo "Versão: $(cat "$ROOT_DIR/VERSION")"
echo ""
echo "🔒 Configurações Locais Protegidas (preservadas pelo npx update):"
echo "  ✓ .ai/project.md"
echo "  ✓ .ai/stack.md"
echo "  ✓ .ai/model-routing.yaml"
echo "  ✓ .ai/session-memory.md"
echo "  ✓ .ai/decisions.md"
echo "  ✓ .ai/guidelines/domain/business-rules/"
echo ""
echo "⚡ Componentes do Framework Atualizados:"
echo "  ✓ .ai/roles/"
echo "  ✓ .ai/guidelines/core/ & stacks/"
echo "  ✓ .ai/templates/ & subagents/"
echo "  ✓ .agents/skills/"
echo "  ✓ .mcp.json"
echo ""
echo "Proximo passo:"
echo "  Se o projeto ja possui codigo existente, execute /lnx-projeto-revisar para"
echo "  analisar automaticamente a stack, preencher .ai/project.md e mapear"
echo "  as regras de negocio detectadas."
echo "  Se for um projeto novo, use /lnx-projeto-iniciar para configurar manualmente."
