# npx CLI Dispatcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every documented `l-nexus` subcommand execute correctly through the npm-created binary symlink.

**Architecture:** Add a focused Node dispatcher as the package binary. It resolves sibling scripts from its own real module URL, forwards stdio and exit status, and leaves installation, validation, and migration logic in their existing scripts.

**Tech Stack:** Node.js ESM, Bash, npm package tarballs, `node:test`

**Spec:** `docs/superpowers/specs/2026-08-25-npx-cli-dispatcher-design.md`

## Global Constraints

- Keep the documented commands `install`, `install-force`, `validate-task`, and `migrate-task`.
- Add no runtime dependency.
- Preserve the existing Unix/WSL platform check in `scripts/install.sh`.
- Propagate child stdout, stderr, and exit status.
- Do not change installed content, task validation rules, or task migration behavior.
- Do not publish a package version as part of this implementation.

## File Structure

- Create `scripts/cli.mjs`: parse the top-level command, print CLI help, and dispatch to sibling scripts.
- Create `scripts/test-cli.sh`: pack and install the project in a temporary directory, then exercise the npm-created binary.
- Modify `package.json`: point `bin.l-nexus` to the dispatcher and include it in the tarball.
- Modify `package-lock.json`: keep root package metadata aligned with `package.json`.
- Modify `scripts/validate-task-routing.mjs`: remove top-level install and migration dispatch responsibilities.
- Modify `scripts/test-model-routing-install.sh`: invoke the new dispatcher for install commands.
- Modify `scripts/test-migrate-task-routing.mjs`: invoke the new dispatcher for the package migration subcommand.

---

### Task 1: Published CLI Dispatcher

**Files:**
- Create: `scripts/cli.mjs`
- Create: `scripts/test-cli.sh`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `process.argv.slice(2)` in the form `[command, ...commandArgs]`.
- Produces: executable `l-nexus` command supporting `install`, `install-force`, `validate-task`, and `migrate-task` with inherited stdio and child exit status.

- [ ] **Step 1: Write the failing tarball integration test**

Create `scripts/test-cli.sh` with a temporary directory and cleanup trap. Pack the repository, install the tarball, resolve `node_modules/.bin/l-nexus`, and assert the current package fails the core expectation:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP_DIR="$(mktemp -d)"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

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

"$CLI" install-force "$TARGET" > "$TMP_DIR/install-force.log"
grep -q "l-nexus instalado com sucesso" "$TMP_DIR/install-force.log" ||
  fail "install-force was not dispatched"

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

"$CLI" migrate-task --help > "$TMP_DIR/migrate-help.log"
grep -q "Migrates legacy routing metadata" "$TMP_DIR/migrate-help.log" ||
  fail "migrate-task was not dispatched"

node -e '
  const packageJson = require(process.argv[1]);
  if (packageJson.bin["l-nexus"] !== "scripts/cli.mjs") process.exit(1);
' "$PACKAGE_DIR/node_modules/@leo-cmp/l-nexus/package.json" ||
  fail "packed bin does not point to scripts/cli.mjs"

echo "scripts/test-cli.sh: ok"
```

- [ ] **Step 2: Run the integration test and verify it fails**

Run: `bash scripts/test-cli.sh`

Expected: FAIL with `install did not create AGENTS.md`, reproducing the npm symlink bug.

- [ ] **Step 3: Implement the dispatcher and package metadata**

Create executable `scripts/cli.mjs` with this command table and behavior:

```javascript
#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const commands = new Map([
  ['install', { executable: path.join(scriptDirectory, 'install.sh'), prefix: [] }],
  ['install-force', { executable: path.join(scriptDirectory, 'install-force.sh'), prefix: [] }],
  ['validate-task', { executable: process.execPath, prefix: [path.join(scriptDirectory, 'validate-task-routing.mjs')] }],
  ['migrate-task', { executable: process.execPath, prefix: [path.join(scriptDirectory, 'migrate-task-routing.mjs')] }],
]);

function usage() {
  return `Usage: l-nexus <command> [options]

Commands:
  install [target]
  install-force [target]
  validate-task <task-path> [--routing <path>] [--final-commit <sha>]
  migrate-task <task-path> [--write]`;
}

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  console.log(usage());
  process.exit(0);
}

const target = commands.get(command);
if (!target) {
  console.error(`Unknown command: ${command}\n\n${usage()}`);
  process.exit(1);
}

const result = spawnSync(target.executable, [...target.prefix, ...args], { stdio: 'inherit' });
if (result.error) {
  console.error(`Failed to run ${command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
```

Update `package.json` and the root metadata in `package-lock.json` so
`bin.l-nexus` is `scripts/cli.mjs`, and add `scripts/cli.mjs` to `files`.
Run `chmod +x scripts/cli.mjs scripts/test-cli.sh` so npm publishes executable
files.

- [ ] **Step 4: Run the tarball test and package inspection**

Run: `bash scripts/test-cli.sh`

Expected: `scripts/test-cli.sh: ok`.

Run: `npm pack --dry-run --json`

Expected: the file list contains `scripts/cli.mjs` with mode `493`, and package metadata names `scripts/cli.mjs` as the binary.

- [ ] **Step 5: Commit the working dispatcher**

```bash
git add package.json package-lock.json scripts/cli.mjs scripts/test-cli.sh
git commit -m "fix: dispatch npx cli commands"
```

### Task 2: Remove Legacy Dispatch and Verify Regressions

**Files:**
- Modify: `scripts/validate-task-routing.mjs`
- Modify: `scripts/test-model-routing-install.sh`
- Modify: `scripts/test-migrate-task-routing.mjs`

**Interfaces:**
- Consumes: `scripts/cli.mjs <command> [...args]` from Task 1.
- Produces: validator limited to direct task validation while existing tests exercise package subcommands through the real dispatcher.

- [ ] **Step 1: Route existing package-command tests through the dispatcher**

In `scripts/test-model-routing-install.sh`, define:

```bash
CLI="$ROOT_DIR/scripts/cli.mjs"
```

Replace each `node "$ROOT_DIR/scripts/validate-task-routing.mjs" install...`
call with `"$CLI" install...` or `"$CLI" install-force...`.

In `scripts/test-migrate-task-routing.mjs`, define:

```javascript
const cli = path.join(scriptsDirectory, 'cli.mjs');
```

Change the package-subcommand process arguments from
`[validate-task-routing.mjs, 'migrate-task', taskPath, '--write']` to
`[cli, 'migrate-task', taskPath, '--write']`.

- [ ] **Step 2: Run focused tests before removing compatibility code**

Run: `bash scripts/test-model-routing-install.sh && node --test scripts/test-migrate-task-routing.mjs`

Expected: both commands pass through `scripts/cli.mjs`.

- [ ] **Step 3: Remove top-level dispatch from the validator**

Delete the `install`, `install-force`, and `migrate-task` branches from
`main()` in `scripts/validate-task-routing.mjs`. Remove the now-unused
`node:path` and `fileURLToPath` imports, but retain `execFileSync` because
`resolveFinalCommit()` uses it for `git rev-parse HEAD`.

- [ ] **Step 4: Run the complete relevant test suite**

Run:

```bash
bash scripts/test-cli.sh
bash scripts/test-model-routing-install.sh
node --test scripts/test-validate-task-routing.mjs
node --test scripts/test-migrate-task-routing.mjs
bash scripts/test-git-submit.sh
bash scripts/test-release.sh
```

Expected: every command exits zero and prints its final `ok` or passing test summary.

Run: `git diff --check`

Expected: no output and exit zero.

- [ ] **Step 5: Commit the cleanup and test routing**

```bash
git add scripts/validate-task-routing.mjs scripts/test-model-routing-install.sh scripts/test-migrate-task-routing.mjs
git commit -m "test: exercise commands through cli dispatcher"
```
