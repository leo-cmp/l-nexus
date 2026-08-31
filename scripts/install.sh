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
LNX_ENTRYPOINT_MARKER='<!-- lnx-entrypoint v1 -->'

physical_path_allow_missing() {
    node - "$1" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const input = process.argv[2];
if (!path.isAbsolute(input)) process.exit(4);

let resolved = path.parse(input).root;
const components = input.slice(resolved.length).split('/');
let crossedMissingComponent = false;

for (const component of components) {
    if (!component || component === '.') continue;
    if (component === '..') {
        // O kernel precisa atravessar o componente anterior antes de aplicar `..`.
        // Se ele nao existe, missing/../hooks falha em vez de virar apenas hooks.
        if (crossedMissingComponent) process.exit(4);
        resolved = path.dirname(resolved);
        continue;
    }

    const next = path.join(resolved, component);
    let entry;
    try {
        entry = fs.lstatSync(next);
    } catch (error) {
        if (error.code === 'ENOENT') {
            resolved = next;
            crossedMissingComponent = true;
            continue;
        }
        process.exit(4);
    }

    if (entry.isSymbolicLink()) {
        try {
            resolved = fs.realpathSync(next);
            entry = fs.statSync(resolved);
        } catch (error) {
            // Symlink pendente e sempre rejeitado, nunca tratado como diretorio a criar.
            process.exit(error.code === 'ENOENT' ? 3 : 4);
        }
    } else {
        resolved = next;
    }

    if (!entry.isDirectory()) {
        process.stdout.write(resolved);
        process.exit(2);
    }
}

process.stdout.write(resolved);
NODE
}

directory_identity() {
    node -e '
const stat = require("node:fs").statSync(process.argv[1]);
if (!stat.isDirectory()) process.exit(1);
process.stdout.write(`${stat.dev}:${stat.ino}`);
' "$1"
}

path_is_within() {
    local child="$1"
    local root="$2"
    [ "$child" = "$root" ] || [[ "$child" == "$root/"* ]]
}

resolve_git_path() {
    local target_root="$1"
    local path="$2"

    case "$path" in
        /*) printf '%s\n' "$path" ;;
        *) printf '%s/%s\n' "$target_root" "$path" ;;
    esac
}

normalize_decimal() {
    local value="$1"
    while [ "${#value}" -gt 1 ] && [ "${value#0}" != "$value" ]; do
        value="${value#0}"
    done
    printf '%s\n' "$value"
}

decimal_is_less_than() {
    local left right
    left="$(normalize_decimal "$1")"
    right="$(normalize_decimal "$2")"

    if [ "${#left}" -ne "${#right}" ]; then
        [ "${#left}" -lt "${#right}" ]
    else
        [[ "$left" < "$right" ]]
    fi
}

classify_existing_hook() {
    local hook="$1"
    local marker version normalized_version normalized_current
    marker="$(sed -n '2p' "$hook" 2>/dev/null || true)"

    if [[ "$marker" =~ ^#\ lnx-guard-stub\ v([0-9]+)$ ]]; then
        version="${BASH_REMATCH[1]}"
        normalized_version="$(normalize_decimal "$version")"
        normalized_current="$(normalize_decimal "$LNX_STUB_VERSION")"
        if [ "$normalized_version" = "$normalized_current" ]; then
            if [ -x "$hook" ]; then
                echo "  ✓ Guarda de pre-commit do l-nexus ativa: $hook"
            else
                echo "  ! Stub do l-nexus v$version existe, mas nao e executavel: $hook"
                echo "    Nao foi alterado. Para ativar manualmente: chmod +x \"$hook\""
            fi
        elif decimal_is_less_than "$normalized_version" "$normalized_current"; then
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
    local resolution_status revalidated_hooks_dir hooks_identity revalidated_identity

    if ! git -C "$target_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return 0
    fi

    if ! hooks_value="$(git -C "$target_root" rev-parse --git-path hooks 2>/dev/null)"; then
        echo "ERRO: nao foi possivel descobrir o diretorio de hooks Git em $target_root" >&2
        return 1
    fi
    hooks_candidate="$(resolve_git_path "$target_root" "$hooks_value")"

    if hooks_dir="$(physical_path_allow_missing "$hooks_candidate")"; then
        resolution_status=0
    else
        resolution_status=$?
    fi
    if [ "$resolution_status" -ne 0 ]; then
        case "$resolution_status" in
            2)
                if [ -n "$hooks_dir" ] && path_is_within "$hooks_dir" "$target_root"; then
                    echo "ERRO: o caminho interno de hooks nao pode ser usado como diretorio: $hooks_dir" >&2
                    return 1
                fi
                ;;
            4)
                echo "ERRO: nao foi possivel validar fisicamente o diretorio de hooks: $hooks_candidate" >&2
                return 1
                ;;
        esac
        warn_external_hooks_path "${hooks_dir:-$hooks_candidate}"
        return 0
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

    # Re-resolver depois do mkdir reduz a janela em que uma troca por symlink
    # poderia mover a escrita para fora da raiz validada.
    if ! revalidated_hooks_dir="$(physical_path_allow_missing "$hooks_candidate")" ||
        [ "$revalidated_hooks_dir" != "$hooks_dir" ] ||
        ! path_is_within "$revalidated_hooks_dir" "$target_root"; then
        echo "ERRO: o diretorio de hooks mudou durante a instalacao: $hooks_candidate" >&2
        return 1
    fi
    hooks_dir="$revalidated_hooks_dir"
    if ! hooks_identity="$(directory_identity "$hooks_dir")"; then
        echo "ERRO: nao foi possivel identificar o diretorio de hooks: $hooks_dir" >&2
        return 1
    fi

    hook_path="$hooks_dir/pre-commit"
    if [ -e "$hook_path" ] || [ -L "$hook_path" ]; then
        classify_existing_hook "$hook_path"
        return 0
    fi

    # Revalidar imediatamente antes da criacao reduz outra janela de corrida.
    if ! revalidated_hooks_dir="$(physical_path_allow_missing "$hooks_candidate")" ||
        [ "$revalidated_hooks_dir" != "$hooks_dir" ] ||
        ! path_is_within "$revalidated_hooks_dir" "$target_root" ||
        ! revalidated_identity="$(directory_identity "$revalidated_hooks_dir")" ||
        [ "$revalidated_identity" != "$hooks_identity" ]; then
        echo "ERRO: o diretorio de hooks mudou antes da criacao do stub: $hooks_candidate" >&2
        return 1
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

    # A ultima revalidacao, imediatamente antes da promocao no-clobber, reduz
    # a corrida restante sem enfraquecer a garantia de nunca sobrescrever.
    if ! revalidated_hooks_dir="$(physical_path_allow_missing "$hooks_candidate")" ||
        [ "$revalidated_hooks_dir" != "$hooks_dir" ] ||
        ! path_is_within "$revalidated_hooks_dir" "$target_root" ||
        ! revalidated_identity="$(directory_identity "$revalidated_hooks_dir")" ||
        [ "$revalidated_identity" != "$hooks_identity" ]; then
        rm -f "$temporary_hook" || true
        echo "ERRO: o diretorio de hooks mudou antes da promocao do stub: $hooks_candidate" >&2
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

install_managed_entrypoint() {
    local target_root="$1" name="$2" source="$3"
    local path="$target_root/$name"

    if [ -L "$path" ]; then
        echo "  ! $name ja existe como symlink do projeto e nao foi alterado: $path"
        echo "    Para ativar o fluxo do l-nexus, aponte-o para AGENTS.md ou copie src/$name."
        return 0
    fi
    if [ -e "$path" ] && [ "$(head -1 "$path" 2>/dev/null || true)" != "$LNX_ENTRYPOINT_MARKER" ]; then
        echo "  ! $name ja existe e pertence ao projeto: nao foi alterado."
        echo "    Para ativar o fluxo do orquestrador, acrescente a ele:"
        echo "      Leia AGENTS.md. Ao atuar como Orchestrator, use .agents/skills/lnx-orchestrator/SKILL.md."
        return 0
    fi
    cp "$source" "$path"
}

mkdir -p "$TARGET/.ai/guidelines/domain/business-rules"
mkdir -p "$TARGET/.ai/decisions"
mkdir -p "$TARGET/.claude"

TARGET_ROOT="$(cd "$TARGET" && pwd -P)"
TARGET="$TARGET_ROOT"

# AGENTS.md e CLAUDE.md
cp "$SRC_DIR/AGENTS.md" "$TARGET/AGENTS.md"
cp "$SRC_DIR/AGENTS.md" "$TARGET/CLAUDE.md"

# GEMINI.md e gerenciado pelo l-nexus somente enquanto carregar o marcador.
# Um arquivo escrito pelo projeto e preservado, com aviso.
install_managed_entrypoint "$TARGET" GEMINI.md "$SRC_DIR/GEMINI.md"

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
install_managed_entrypoint() {
    local target_root="$1" name="$2" source="$3"
    local path="$target_root/$name"

    if [ -L "$path" ]; then
        echo "  ! $name ja existe como symlink do projeto e nao foi alterado: $path"
        echo "    Para ativar o fluxo do l-nexus, aponte-o para AGENTS.md ou copie src/$name."
        return 0
    fi
    if [ -e "$path" ] && [ "$(head -1 "$path" 2>/dev/null || true)" != "$LNX_ENTRYPOINT_MARKER" ]; then
        echo "  ! $name ja existe e pertence ao projeto: nao foi alterado."
        echo "    Para ativar o fluxo do orquestrador, acrescente a ele:"
        echo "      Leia AGENTS.md. Ao atuar como Orchestrator, use .agents/skills/lnx-orchestrator/SKILL.md."
        return 0
    fi
    cp "$source" "$path"
}

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

# `.lnx/` guarda prompts, logs e exit codes de execucoes delegadas. E gerado
# pelo l-nexus, entao a entrada e garantida mesmo sem .gitignore previo: caso
# contrario um `git add -A` levaria prompts e logs para o historico.
if [ ! -e "$TARGET/.gitignore" ] || ! grep -Fqx ".lnx/" "$TARGET/.gitignore"; then
    printf "\n# l-nexus runtime (estado transitorio de execucao)\n.lnx/\n" >> "$TARGET/.gitignore"
fi

if ! protected_paths="$("$SRC_DIR/.agents/hooks/lnx-guard.sh" --list-protected)"; then
    echo "ERRO: nao foi possivel obter a lista canonica de caminhos protegidos." >&2
    exit 1
fi
if [ -z "$protected_paths" ]; then
    echo "ERRO: a lista canonica de caminhos protegidos esta vazia." >&2
    exit 1
fi

echo "=== l-nexus instalado com sucesso ==="
echo "Versão: $(cat "$ROOT_DIR/VERSION")"
echo ""
echo "🔒 Configurações Locais Protegidas (preservadas pelo npx update):"
while IFS= read -r protected; do
    [ -n "$protected" ] && echo "  ✓ $protected"
done <<< "$protected_paths"
echo ""
echo "⚡ Componentes do Framework Atualizados:"
echo "  ✓ .ai/roles/"
echo "  ✓ .ai/guidelines/core/ & stacks/"
echo "  ✓ .ai/templates/ & subagents/"
echo "  ✓ .agents/skills/"
echo "  ✓ .agents/scripts/ (lnx-run.sh — delegacao em terminal visivel)"
echo "  ✓ AGENTS.md, CLAUDE.md, GEMINI.md"
echo "  ✓ .mcp.json"
echo ""
echo "Proximo passo:"
echo "  Se o projeto ja possui codigo existente, execute /lnx-projeto-revisar para"
echo "  analisar automaticamente a stack, preencher .ai/project.md e mapear"
echo "  as regras de negocio detectadas."
echo "  Se for um projeto novo, use /lnx-projeto-iniciar para configurar manualmente."
