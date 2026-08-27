#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-.}"
case "$TARGET" in
    install|update|--help|-h) TARGET="." ;;
esac
SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
rm -rf "$TARGET/.agents" "$TARGET/.mcp.json"
exec "$(dirname "$SCRIPT_PATH")/install.sh" "$TARGET"
