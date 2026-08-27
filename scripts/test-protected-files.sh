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
mkdir -p "$TARGET"

# 1. Primeira instalação
"$CLI" install "$TARGET" >/dev/null

# 2. Gravar marcadores e conteúdos customizados em TODOS os arquivos protegidos
cat > "$TARGET/.ai/project.md" <<'EOF'
# 🔒 [PROJETO] Meu Projeto Customizado
custom_marker: project-survived
EOF

cat > "$TARGET/.ai/stack.md" <<'EOF'
# 🔒 [PROJETO] Minhas Stacks
custom_marker: stack-survived
EOF

cat > "$TARGET/.ai/model-routing.yaml" <<'EOF'
schema_version: 1
custom_marker: routing-survived
EOF

cat > "$TARGET/.ai/session-memory.md" <<'EOF'
# 🔒 [PROJETO] Memoria
custom_marker: memory-survived
EOF

cat > "$TARGET/.ai/decisions.md" <<'EOF'
# 🔒 [PROJETO] Decisoes
custom_marker: decisions-survived
EOF

cat > "$TARGET/.ai/guidelines/domain/business-rules/index.md" <<'EOF'
# 🔒 [PROJETO] Indice Customizado
custom_marker: index-survived
EOF

cat > "$TARGET/.ai/guidelines/domain/business-rules/pagamentos.md" <<'EOF'
# Regra Critica de Pagamentos
custom_marker: rule-pagamentos-survived
EOF

# 3. Executar o update
"$CLI" update "$TARGET" >/dev/null

# 4. Validar que nenhum arquivo protegido foi apagado ou resetado
grep -q "custom_marker: project-survived" "$TARGET/.ai/project.md" ||
    fail ".ai/project.md foi sobrescrito no update"

grep -q "custom_marker: stack-survived" "$TARGET/.ai/stack.md" ||
    fail ".ai/stack.md foi sobrescrito no update"

grep -q "custom_marker: routing-survived" "$TARGET/.ai/model-routing.yaml" ||
    fail ".ai/model-routing.yaml foi sobrescrito no update"

grep -q "custom_marker: memory-survived" "$TARGET/.ai/session-memory.md" ||
    fail ".ai/session-memory.md foi sobrescrito no update"

grep -q "custom_marker: decisions-survived" "$TARGET/.ai/decisions.md" ||
    fail ".ai/decisions.md foi sobrescrito no update"

grep -q "custom_marker: index-survived" "$TARGET/.ai/guidelines/domain/business-rules/index.md" ||
    fail ".ai/guidelines/domain/business-rules/index.md foi sobrescrito no update"

[ -f "$TARGET/.ai/guidelines/domain/business-rules/pagamentos.md" ] ||
    fail ".ai/guidelines/domain/business-rules/pagamentos.md foi apagado no update"

grep -q "custom_marker: rule-pagamentos-survived" "$TARGET/.ai/guidelines/domain/business-rules/pagamentos.md" ||
    fail ".ai/guidelines/domain/business-rules/pagamentos.md perdeu conteudo no update"

echo "scripts/test-protected-files.sh: ok (todos os 6 artefatos protegidos sobreviveram ao update)"
