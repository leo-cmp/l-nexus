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

mkdir -p "$TARGET/.ai/guidelines/domain/business-rules"
mkdir -p "$TARGET/.ai/decisions"
mkdir -p "$TARGET/.claude"

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
rm -rf "$TARGET/.ai/guidelines/domain"
cp -r "$SRC_DIR/.ai/guidelines/domain" "$TARGET/.ai/guidelines/domain"

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

ln -sfn "../.agents/skills" "$TARGET/.claude/skills"

# .mcp.json
cp "$SRC_DIR/.mcp.json" "$TARGET/.mcp.json"

# project.md
if [ ! -f "$TARGET/.ai/project.md" ]; then
    cat > "$TARGET/.ai/project.md" << 'EOF'
# Novo Projeto

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
# Stacks do Projeto

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
cp "$SRC_DIR/.ai/decisions.md" "$TARGET/.ai/decisions.md"

# .gitignore
if [ -f "$TARGET/.gitignore" ]; then
    if ! grep -q "^l-nexus" "$TARGET/.gitignore"; then
        printf "\n# l-nexus\nl-nexus/\n" >> "$TARGET/.gitignore"
    fi
fi

echo "=== l-nexus instalado com sucesso ==="
echo "Versão: $(cat "$ROOT_DIR/VERSION")"
echo ""
echo "Proximo passo:"
echo "  Se o projeto ja possui codigo existente, execute /l-nexus:review para"
echo "  analisar automaticamente a stack, preencher .ai/project.md e mapear"
echo "  as regras de negocio detectadas."
echo "  Se for um projeto novo, use /l-nexus:iniciar para configurar manualmente."
