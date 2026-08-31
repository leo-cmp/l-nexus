#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"
CLI="$ROOT_DIR/scripts/cli.mjs"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

MARKER='<!-- lnx-entrypoint v1 -->'

# --- fresh install ships the managed entry point -------------------------

TARGET="$TMP_DIR/fresh"
mkdir -p "$TARGET"
"$CLI" install "$TARGET" > "$TMP_DIR/fresh.log"

[ -f "$TARGET/GEMINI.md" ] || fail "GEMINI.md nao foi criado na instalacao"
[ "$(head -1 "$TARGET/GEMINI.md")" = "$MARKER" ] || fail "GEMINI.md nao carrega o marcador do l-nexus"
cmp -s "$ROOT_DIR/src/GEMINI.md" "$TARGET/GEMINI.md" || fail "GEMINI.md instalado difere do payload"
grep -q 'lnx-orchestrator' "$TARGET/GEMINI.md" || fail "GEMINI.md nao aponta para a skill do orquestrador"
grep -q 'AGENTS.md' "$TARGET/GEMINI.md" || fail "GEMINI.md nao manda ler AGENTS.md"

# The entry point must not claim any runtime is the official orchestrator.
grep -qi 'orquestrador oficial' "$TARGET/GEMINI.md" ||
    fail "GEMINI.md deveria negar explicitamente ser o orquestrador oficial"

# --- the orchestration runtime is installed and executable ---------------

[ -x "$TARGET/.agents/scripts/lnx-run.sh" ] || fail "lnx-run.sh nao foi instalado como executavel"
[ -x "$TARGET/.agents/scripts/lnx-pty.py" ] || fail "lnx-pty.py nao foi instalado como executavel"
[ -f "$TARGET/.ai/guidelines/core/orchestration.md" ] || fail "orchestration.md nao foi instalada"
[ -f "$TARGET/.ai/roles/orchestrator.md" ] || fail "a role orchestrator nao foi instalada"
[ -f "$TARGET/.agents/skills/lnx-orchestrator/SKILL.md" ] || fail "a skill lnx-orchestrator nao foi instalada"

# --- a managed entry point is refreshed by update ------------------------

printf '%s\nconteudo antigo\n' "$MARKER" > "$TARGET/GEMINI.md"
"$CLI" update "$TARGET" >/dev/null
cmp -s "$ROOT_DIR/src/GEMINI.md" "$TARGET/GEMINI.md" ||
    fail "update nao atualizou um GEMINI.md gerenciado pelo l-nexus"

# --- a file the project owns is never overwritten ------------------------

TARGET="$TMP_DIR/owned"
mkdir -p "$TARGET"
printf '# Meu proprio GEMINI\nregras locais\n' > "$TARGET/GEMINI.md"
"$CLI" install "$TARGET" > "$TMP_DIR/owned.log"

grep -Fqx 'regras locais' "$TARGET/GEMINI.md" || fail "install sobrescreveu um GEMINI.md do projeto"
grep -q 'GEMINI.md ja existe' "$TMP_DIR/owned.log" ||
    fail "install nao avisou que preservou o GEMINI.md do projeto"

"$CLI" update "$TARGET" > "$TMP_DIR/owned-update.log"
grep -Fqx 'regras locais' "$TARGET/GEMINI.md" || fail "update sobrescreveu um GEMINI.md do projeto"

# --- a symlinked entry point is left alone -------------------------------

TARGET="$TMP_DIR/linked"
mkdir -p "$TARGET"
printf 'meu contexto\n' > "$TARGET/CONTEXT.md"
ln -s CONTEXT.md "$TARGET/GEMINI.md"
"$CLI" install "$TARGET" > "$TMP_DIR/linked.log"
[ -L "$TARGET/GEMINI.md" ] || fail "install substituiu um symlink GEMINI.md do projeto"
grep -Fqx 'meu contexto' "$TARGET/CONTEXT.md" || fail "install alterou o alvo do symlink"

# --- transient runtime state stays out of Git ----------------------------

TARGET="$TMP_DIR/gitignore"
mkdir -p "$TARGET"
printf 'node_modules/\n' > "$TARGET/.gitignore"
"$CLI" install "$TARGET" >/dev/null
grep -Fqx '.lnx/' "$TARGET/.gitignore" || fail ".lnx/ nao foi adicionado ao .gitignore"
grep -Fqx 'node_modules/' "$TARGET/.gitignore" || fail "install perdeu entradas existentes do .gitignore"

"$CLI" install "$TARGET" >/dev/null
[ "$(grep -Fxc '.lnx/' "$TARGET/.gitignore")" = 1 ] || fail ".lnx/ foi duplicado no .gitignore"

# Um projeto sem .gitignore ainda precisa ignorar prompts e logs delegados.
TARGET="$TMP_DIR/no-gitignore"
mkdir -p "$TARGET"
"$CLI" install "$TARGET" >/dev/null
[ -f "$TARGET/.gitignore" ] || fail "install nao criou .gitignore para proteger .lnx/"
grep -Fqx '.lnx/' "$TARGET/.gitignore" || fail ".lnx/ nao foi ignorado em projeto sem .gitignore"

echo "scripts/test-gemini-entrypoint.sh: ok"
