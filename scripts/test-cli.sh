#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

PACKAGE_FILE="$(cd "$ROOT_DIR" && npm pack --pack-destination "$TMP_DIR" --silent)"
PACKAGE_DIR="$TMP_DIR/package"
mkdir -p "$PACKAGE_DIR"
npm install --prefix "$PACKAGE_DIR" "$TMP_DIR/$PACKAGE_FILE" --silent

CLI="$PACKAGE_DIR/node_modules/.bin/l-nexus"
TARGET="$TMP_DIR/target"

"$CLI" install "$TARGET" > "$TMP_DIR/install.log"
[ -f "$TARGET/AGENTS.md" ] || fail "install did not create AGENTS.md"
grep -q "l-nexus instalado com sucesso" "$TMP_DIR/install.log" ||
  fail "install did not report success"

"$CLI" update "$TARGET" > "$TMP_DIR/update.log"
grep -q "l-nexus instalado com sucesso" "$TMP_DIR/update.log" ||
  fail "update was not dispatched"

"$CLI" --help > "$TMP_DIR/help.log"
grep -q "validate-task" "$TMP_DIR/help.log" || fail "help omits validate-task"
grep -q "migrate-task" "$TMP_DIR/help.log" || fail "help omits migrate-task"

if "$CLI" unknown-command > "$TMP_DIR/unknown.log" 2>&1; then
  fail "unknown command returned success"
fi
grep -q "Unknown command: unknown-command" "$TMP_DIR/unknown.log" ||
  fail "unknown command error is missing"

"$CLI" validate-task --help > "$TMP_DIR/validate-help.log"
grep -q "Validates task front matter" "$TMP_DIR/validate-help.log" ||
  fail "validate-task was not dispatched"

if "$CLI" validate-task "$TMP_DIR/missing-task.md" > "$TMP_DIR/validate-error.log" 2>&1; then
  fail "validate-task failure returned success"
fi
grep -q "Task routing validation failed" "$TMP_DIR/validate-error.log" ||
  fail "validate-task error output was not forwarded"

"$CLI" migrate-task --help > "$TMP_DIR/migrate-help.log"
grep -q "Migrates routing metadata" "$TMP_DIR/migrate-help.log" ||
  fail "migrate-task was not dispatched"
grep -q -- "--to 1|2" "$TMP_DIR/migrate-help.log" ||
  fail "migrate-task help omits the schema target option"

node -e '
  const packageJson = require(process.argv[1]);
  if (packageJson.bin["l-nexus"] !== "scripts/cli.mjs") process.exit(1);
' "$PACKAGE_DIR/node_modules/@leo-cmp/l-nexus/package.json" ||
  fail "packed bin does not point to scripts/cli.mjs"

echo "scripts/test-cli.sh: ok"
