# Pre-commit Protected Content Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a project-scoped, fail-closed `pre-commit` guard that prevents staged loss of l-nexus protected content while keeping intentional `--no-verify` commits possible.

**Architecture:** A versioned Bash guard under `src/.agents/hooks/` owns the protected-path policy and exposes a flat `--list-protected` projection. `scripts/install.sh` consumes that projection for its public summary and installs a versioned stub only when Git's effective hooks directory is physically contained by the requested project root. Behavioral tests separately verify guard policy, safe hook installation, and preservation by `update`.

**Tech Stack:** Bash, Git plumbing commands, Node.js `node:path` for portable lexical path normalization, existing shell integration-test conventions.

**Spec:** `docs/superpowers/specs/2026-08-28-pre-commit-protected-content-guard-design.md`

## Global Constraints

- Protect exactly `.ai/project.md`, `.ai/stack.md`, `.ai/model-routing.yaml`, `.ai/session-memory.md`, `.ai/decisions.md`, and `.ai/guidelines/domain/`.
- Treat `.ai/decisions.md` as append-only by comparing the number of staged `^## ` entry headers with `HEAD`; line deletion counts are not the policy.
- `append-only` implies `no-delete`; `--no-verify` must remain the explicit bypass.
- The guard protects Git history, not the working tree.
- Never overwrite an existing `pre-commit`, including a recognized l-nexus stub.
- Never create or modify a hooks path outside the physical target root.
- A linked worktree must not write to the shared common-dir hooks path; instruct the user to install from the main worktree.
- A present stub with a missing or non-executable versioned guard must fail closed.
- Expected skips (no Git, external hooks path, existing hook) do not fail kit installation; an unexpected write or permission failure for an otherwise valid internal destination does.
- Do not add the optional 100 MB blob guard, automatic hook composition/migration, an uninstall command, or Windows-without-WSL support.
- Add no runtime dependency; use the Node.js runtime already required by the package.

---

### Task 1: Versioned guard and staged-policy tests

**Files:**
- Create: `src/.agents/hooks/lnx-guard.sh`
- Create: `scripts/test-lnx-guard.sh`

**Interfaces:**
- Produces: executable `src/.agents/hooks/lnx-guard.sh`.
- Produces: `lnx-guard.sh --list-protected`, one repository-relative path per line in canonical order.
- Produces: normal guard execution returning `0` when staged content is allowed and nonzero after reporting every violation when it is not.
- Consumes: Git index and `HEAD` from the current repository; no environment configuration.

- [ ] **Step 1: Create the failing guard integration test**

Create `scripts/test-lnx-guard.sh` with the repository's standard `mktemp -d`, cleanup trap, and `fail()` helper. Define `new_repo()` so each case gets an independent repository and no destructive reset is needed:

```bash
new_repo() {
    local name="$1"
    local repo="$TMP_DIR/$name"

    git init -b main "$repo" >/dev/null
    git -C "$repo" config user.name "l-nexus Test"
    git -C "$repo" config user.email "l-nexus-test@example.com"
    mkdir -p "$repo/.ai/guidelines/domain" "$repo/.agents/hooks"
    cp "$GUARD" "$repo/.agents/hooks/lnx-guard.sh"
    chmod +x "$repo/.agents/hooks/lnx-guard.sh"

    printf '# Project\n' > "$repo/.ai/project.md"
    printf '# Stack\n' > "$repo/.ai/stack.md"
    printf 'schema_version: 1\n' > "$repo/.ai/model-routing.yaml"
    printf '# Memory\n' > "$repo/.ai/session-memory.md"
    cat > "$repo/.ai/decisions.md" <<'EOF'
# Decisions

## Decision one
Keep this entry.

## Decision two
Keep this entry too.
EOF
    printf '# Glossario\n' > "$repo/.ai/guidelines/domain/glossario.md"
    git -C "$repo" add .
    git -C "$repo" commit -m "test: baseline" >/dev/null
    printf '%s\n' "$repo"
}
```

Add focused test functions that run the guard from the temporary repository and assert status/output:

```bash
run_guard() {
    local repo="$1"
    local output="$2"
    (cd "$repo" && .agents/hooks/lnx-guard.sh) >"$output" 2>&1
}

assert_blocked() {
    local repo="$1"
    local expected="$2"
    local output="$TMP_DIR/guard-output.log"
    if run_guard "$repo" "$output"; then
        fail "guarda deveria bloquear: $expected"
    fi
    grep -Fq "$expected" "$output" || fail "diagnostico ausente: $expected"
}
```

Cover these exact cases:

1. `--list-protected` prints the six paths from Global Constraints, with `.ai/guidelines/domain/` rather than `business-rules/`.
2. Adding `## Decision three` is allowed.
3. Editing or striking the text of an existing `## ` entry while retaining both headers is allowed.
4. Reducing two `## ` headers to one is blocked, even if several non-heading lines are added.
5. Replacing the decisions file with the empty template is blocked.
6. Deleting `.ai/decisions.md` is blocked.
7. Deleting every other protected file is blocked, one independent repository per path.
8. Renaming `.ai/guidelines/domain/glossario.md` to `glossario.md` is blocked.
9. Deleting an unrelated tracked file is allowed.
10. Staging a protected deletion and a decision-count reduction reports both violations.
11. Installing the guard itself as `.git/hooks/pre-commit` blocks a normal commit but `git commit --no-verify` succeeds.

End with:

```bash
echo "scripts/test-lnx-guard.sh: ok"
```

- [ ] **Step 2: Run the guard test and verify the expected failure**

Run:

```bash
bash scripts/test-lnx-guard.sh
```

Expected: nonzero exit because `src/.agents/hooks/lnx-guard.sh` does not exist.

- [ ] **Step 3: Implement the minimal canonical policy and list projection**

Create `src/.agents/hooks/lnx-guard.sh` with Bash strict mode and a policy-rich indexed array compatible with the Bash version shipped by macOS:

```bash
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

if [ "${1:-}" = "--list-protected" ]; then
    list_protected
    exit 0
fi

if [ "$#" -gt 0 ]; then
    echo "l-nexus: argumento desconhecido: $1" >&2
    exit 2
fi
```

Make both new scripts executable:

```bash
chmod +x src/.agents/hooks/lnx-guard.sh scripts/test-lnx-guard.sh
```

- [ ] **Step 4: Implement literal no-delete detection, including renames**

Collect staged deletions as NUL-delimited paths with rename detection disabled. Match protected files by equality and protected directories by literal prefix:

```bash
is_protected_deletion() {
    local deleted="$1"
    local protected="$2"
    case "$protected" in
        */) [[ "$deleted" == "$protected"* ]] ;;
        *)  [[ "$deleted" == "$protected" ]] ;;
    esac
}

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
```

Do not use `grep -E` for path membership.

- [ ] **Step 5: Implement decision-entry counting from Git blobs**

Only evaluate the append-only rule when `decisions.md` has a staged change. Treat an absent `HEAD` blob as zero and let no-delete own the diagnostic when the staged blob is absent:

```bash
count_decision_entries() {
    grep -c '^## ' || true
}

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
```

Finish with one aggregated Portuguese diagnostic. It must recommend `git restore --staged -- <caminho>` first, show restoration from `HEAD` separately, mention `git commit --no-verify`, and return `1` only when `violations` is nonempty.

- [ ] **Step 6: Run the focused guard tests**

Run:

```bash
bash scripts/test-lnx-guard.sh
```

Expected: `scripts/test-lnx-guard.sh: ok` and exit `0`.

- [ ] **Step 7: Commit the guard deliverable**

```bash
git add src/.agents/hooks/lnx-guard.sh scripts/test-lnx-guard.sh
git commit -m "feat: guard protected content before commit"
```

---

### Task 2: Safe project-scoped stub installation

**Files:**
- Modify: `scripts/install.sh:15-155`
- Create: `scripts/test-hook-install.sh`

**Interfaces:**
- Consumes: executable `src/.agents/hooks/lnx-guard.sh` from Task 1.
- Produces: `install_guard_hook TARGET_ROOT`, which either installs one complete `pre-commit`, preserves an existing hook, safely skips, or returns nonzero on a real installation failure.
- Produces: stub marker `# lnx-guard-stub v1` on line 2.
- Produces: stub that resolves `git rev-parse --show-toplevel` at commit time and delegates to that tree's `.agents/hooks/lnx-guard.sh`.

- [ ] **Step 1: Write the failing hook-installer integration test**

Create `scripts/test-hook-install.sh` using isolated directories under `mktemp -d`. Provide helpers to initialize a main repository, invoke `scripts/cli.mjs install`, and assert bytes and modes:

```bash
init_repo() {
    local repo="$1"
    git init -b main "$repo" >/dev/null
    git -C "$repo" config user.name "l-nexus Test"
    git -C "$repo" config user.email "l-nexus-test@example.com"
}

run_install() {
    local target="$1"
    local output="$2"
    "$CLI" install "$target" >"$output" 2>&1
}
```

Implement these independent cases:

1. A non-Git directory installs the kit, creates no hook, and prints no hook warning.
2. A main repository gets executable `.git/hooks/pre-commit` containing `# lnx-guard-stub v1`.
3. The installed stub blocks when `.agents/hooks/lnx-guard.sh` is temporarily moved aside; its output contains `--no-verify` and the effective hook path.
4. `core.hooksPath=.githooks` creates `.githooks/pre-commit` inside the target when `.githooks` does not yet exist.
5. An absolute external `core.hooksPath` remains absent and receives the external-path warning.
6. Internal-looking hooks paths backed by either a symlink to an external directory or a dangling symlink remain untouched.
7. A linked worktree leaves the common-dir hook absent and tells the user to install from the main worktree.
8. A foreign hook's checksum and executable mode remain unchanged and the output contains the manual chaining command.
9. A current v1 stub remains unchanged and reports the guard active.
10. A v0 stub remains unchanged and reports “desatualizado”.
11. A v2 stub remains unchanged and reports that it is newer; no downgrade occurs.
12. An internal `core.hooksPath` that resolves to a regular file makes installation return nonzero instead of printing success.

For the linked-worktree case, create a baseline commit in the main repository before calling:

```bash
git -C "$main_repo" worktree add "$linked_repo" -b linked >/dev/null
```

End with `scripts/test-hook-install.sh: ok`.

- [ ] **Step 2: Run the hook-installer test and verify it fails**

Run:

```bash
bash scripts/test-hook-install.sh
```

Expected: nonzero exit because `scripts/install.sh` does not install a hook.

- [ ] **Step 3: Add portable normalization and physical containment helpers**

In `scripts/install.sh`, normalize `TARGET` after its initial directories exist and add focused helpers before the copy operations:

```bash
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

    # A dangling symlink is an invalid ancestor, never a missing directory to create.
    [ -d "$cursor" ] || return 1
    cursor="$(cd "$cursor" && pwd -P)"
    printf '%s%s\n' "$cursor" "$suffix"
}

path_is_within() {
    local child="$1"
    local root="$2"
    [ "$child" = "$root" ] || [[ "$child" == "$root/"* ]]
}
```

Pass an already physical `TARGET_ROOT="$(cd "$TARGET" && pwd -P)"` into all hook helpers. Resolve relative output from `git -C "$TARGET_ROOT" rev-parse --git-path hooks` against `TARGET_ROOT` before calling `physical_path_allow_missing`. Do not call `mkdir -p` before `path_is_within` succeeds.

- [ ] **Step 4: Add linked-worktree and external-path diagnostics**

Resolve `--git-dir` and `--git-common-dir` through the same normalization helper. A linked worktree is the case where their physical paths differ. When the rejected hooks directory is under the physical common dir, print the dedicated message:

```text
! Worktree vinculada: os hooks ficam no repositorio principal (<caminho>),
  fora desta arvore. Guarda NAO instalada.
  Para proteger todas as worktrees, rode o instalador no repositorio principal.
  Alternativa: encadeie manualmente .agents/hooks/lnx-guard.sh no hook de la.
```

All other rejected paths use the generic external `core.hooksPath` warning. Neither branch may create the rejected hooks directory.

- [ ] **Step 5: Add exact stub classification without mutation**

Set `LNX_STUB_VERSION=1`. Read only line 2 of an existing `pre-commit` and classify exact markers matching `# lnx-guard-stub v<digits>`:

```bash
classify_existing_hook() {
    local hook="$1"
    local marker version
    marker="$(sed -n '2p' "$hook")"

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
```

The test must compare hook checksum and executable mode before and after every existing-hook case.

- [ ] **Step 6: Install a complete fail-closed stub atomically**

Only after containment succeeds, create the hooks directory. Write the complete executable stub to `mktemp "$hooks_dir/.lnx-pre-commit.XXXXXX"`. Its body must contain:

```bash
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
```

After `chmod +x`, promote the complete temp file without overwriting a concurrently created hook. Use a same-directory hard link as the atomic no-clobber operation, then unlink the temporary name:

```bash
if ln "$temporary_hook" "$hook_path" 2>/dev/null; then
    rm -f "$temporary_hook"
else
    rm -f "$temporary_hook"
    if [ -e "$hook_path" ]; then
        classify_existing_hook "$hook_path"
        return 0
    fi
    echo "ERRO: nao foi possivel instalar a guarda em $hook_path" >&2
    return 1
fi
```

This produces an all-or-nothing final hook on the same filesystem. Cleanup failures and write/permission failures for a valid internal path return nonzero.

- [ ] **Step 7: Invoke hook installation after the versioned guard is copied**

Call `install_guard_hook "$TARGET_ROOT"` after `cp -r "$SRC_DIR/.agents" "$TARGET/.agents"` and before the success banner. If there is no Git repository, return success without output. Do not suppress a real nonzero return from `install_guard_hook`.

- [ ] **Step 8: Run the hook and existing installer tests**

Run:

```bash
bash scripts/test-hook-install.sh
bash scripts/test-lnx-guard.sh
bash scripts/test-cli.sh
```

Expected: all three scripts print `: ok` and exit `0`.

- [ ] **Step 9: Commit the safe installer deliverable**

```bash
git add scripts/install.sh scripts/test-hook-install.sh
git commit -m "feat: install project-scoped pre-commit guard"
```

---

### Task 3: Behavioral preservation contract and canonical install summary

**Files:**
- Modify: `scripts/test-protected-files.sh:18-88`
- Modify: `scripts/install.sh:133-143`

**Interfaces:**
- Consumes: `lnx-guard.sh --list-protected` from Task 1.
- Produces: installer output with one `  ✓ <path>` line for every canonical protected path.
- Produces: a behavioral regression test proving each declared path survives `update`.

- [ ] **Step 1: Replace the hand-maintained preservation cases with a failing behavioral loop**

Keep the temporary non-Git target so the hook installer legitimately skips. After the first install, get the installed guard's canonical list:

```bash
PROTECTED_LIST="$TMP_DIR/protected-paths.txt"
"$TARGET/.agents/hooks/lnx-guard.sh" --list-protected > "$PROTECTED_LIST"
```

For every path, write a deterministic marker. A trailing slash means directory policy, so place the sentinel directly inside that directory:

```bash
while IFS= read -r protected; do
    [ -n "$protected" ] || continue
    case "$protected" in
        */)
            mkdir -p "$TARGET/$protected"
            printf 'custom_marker: survived:%s\n' "$protected" > "$TARGET/${protected}.lnx-protected-sentinel"
            ;;
        *)
            mkdir -p "$(dirname "$TARGET/$protected")"
            printf 'custom_marker: survived:%s\n' "$protected" > "$TARGET/$protected"
            ;;
    esac
done < "$PROTECTED_LIST"
```

Capture `"$CLI" update "$TARGET"` output, then loop over the same list and assert both the marker and the summary line `  ✓ $protected`. Assert explicitly that `.ai/guidelines/domain/.lnx-protected-sentinel` exists, so restoring a destructive `rm -rf .ai/guidelines/domain` fails the test even when `business-rules/` is recreated.

- [ ] **Step 2: Run the preservation test and verify it fails on the public summary**

Run:

```bash
bash scripts/test-protected-files.sh
```

Expected: nonzero exit because the installer still prints `.ai/guidelines/domain/business-rules/` from a duplicated list instead of the canonical `.ai/guidelines/domain/` projection.

- [ ] **Step 3: Render the install summary from the canonical guard**

Replace the six hard-coded protected-path `echo` lines in `scripts/install.sh` with:

```bash
echo "🔒 Configurações Locais Protegidas (preservadas pelo npx update):"
while IFS= read -r protected; do
    [ -n "$protected" ] && echo "  ✓ $protected"
done < <("$SRC_DIR/.agents/hooks/lnx-guard.sh" --list-protected)
```

Use the packaged source guard, not user-modifiable target content, for installer claims.

- [ ] **Step 4: Run preservation and installer regressions**

Run:

```bash
bash scripts/test-protected-files.sh
bash scripts/test-hook-install.sh
bash scripts/test-cli.sh
```

Expected: all scripts print `: ok` and exit `0`.

- [ ] **Step 5: Commit the behavioral contract**

```bash
git add scripts/install.sh scripts/test-protected-files.sh
git commit -m "test: enforce protected path preservation"
```

---

### Task 4: Public documentation and full verification

**Files:**
- Modify: `README.md:28-73`

**Interfaces:**
- Consumes: behavior implemented in Tasks 1-3.
- Produces: public explanation of protection scope, recovery, fail-closed behavior, existing hooks, and linked worktrees.

- [ ] **Step 1: Add the pre-commit guard to the installed-structure documentation**

Update the tree under “Estrutura instalada no projeto” so `.agents/hooks/lnx-guard.sh` appears as an updated framework component and `.ai/guidelines/domain/` remains the protected directory. Do not describe the unversioned stub as part of the copied project tree without explaining that it resides in the effective Git hooks directory.

- [ ] **Step 2: Add a concise “Guarda de conteúdo protegido” section**

Place it after “Atualizar” and include these exact user-facing facts and commands:

````markdown
## Guarda de conteúdo protegido

Em um repositório Git, a instalação tenta ativar um hook `pre-commit` que impede
que deleções dos caminhos 🔒 sejam commitadas. Em `.ai/decisions.md`, a guarda
também impede que a quantidade de decisões (`## `) diminua; editar ou riscar uma
decisão mantendo seu cabeçalho continua permitido.

> A guarda protege a história Git, não a árvore de trabalho. Se um processo
> apagar arquivos no disco, eles continuam ausentes até serem restaurados; a
> guarda impede que a perda staged vire commit.

Desfaça primeiro apenas o staging:

```bash
git restore --staged -- <caminho>
```

Restaure do último commit somente quando também quiser substituir o conteúdo da
árvore de trabalho:

```bash
git restore --source=HEAD --staged --worktree -- <caminho>
```

Uma remoção intencional pode ignorar a guarda uma vez:

```bash
git commit --no-verify
```
````

Continue the section with these points in prose:

- existing or external hooks are never overwritten and must manually chain `.agents/hooks/lnx-guard.sh`;
- the stub fails closed while the versioned guard is absent, including during a concurrent update;
- if l-nexus is no longer used, remove the effective `pre-commit` file named by the blocking message;
- install from the main worktree to protect all linked worktrees;
- a shared fail-closed hook also blocks a sibling worktree on a branch without `.agents/`, where `--no-verify` or removing the shared stub are the explicit exits.

- [ ] **Step 3: Run the focused feature suite**

Run:

```bash
bash scripts/test-lnx-guard.sh
bash scripts/test-hook-install.sh
bash scripts/test-protected-files.sh
```

Expected: each prints `: ok` and exits `0`.

- [ ] **Step 4: Run the complete repository regression suite**

Run:

```bash
bash scripts/test-cli.sh
bash scripts/test-model-routing-install.sh
node --test scripts/test-validate-task-routing.mjs
node --test scripts/test-migrate-task-routing.mjs
bash scripts/test-git-submit.sh
bash scripts/test-release.sh
```

Expected: every shell script prints `: ok`; both Node test suites report zero failures.

- [ ] **Step 5: Inspect the final diff and packaged file inclusion**

Run:

```bash
git diff --check
npm pack --dry-run
```

Expected: `git diff --check` has no output; the dry-run package listing contains `src/.agents/hooks/lnx-guard.sh`, `scripts/install.sh`, and `scripts/update.sh`. Test scripts do not need to ship because `package.json` intentionally publishes only selected scripts.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain protected content guard"
```

- [ ] **Step 7: Record final verification evidence**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: no uncommitted feature files; the four implementation commits are visible in task order.
