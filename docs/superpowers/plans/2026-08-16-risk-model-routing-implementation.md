# Risk-Aware Model Routing Implementation Plan

**Design:** `docs/superpowers/specs/2026-08-16-risk-model-routing-design.md`
**Repositories:** `/home/leo/Dev/l-nexus` and `/home/leo/Dev/i3tech/i3crm/docs`
**Delivery style:** bounded tasks with one atomic commit per task

## Objective

Implement generic, enforceable model routing in l-nexus while keeping project
risk domains and R2 review policy configurable. Record task creator, actual
executor, and reviewers, and prevent R3 completion without an independent review
of the final commit. Document the Go adoption guardrails and AI review policy in
i3CRM without duplicating the generic engine.

## Technical Decisions

- Keep complexity (`L1`-`L3`) and risk (`R1`-`R3`) as independent fields.
- Store project routing in `.ai/model-routing.yaml`.
- Parse YAML with the maintained npm `yaml` package; do not parse front matter
  with regular expressions.
- Expose validation as an l-nexus CLI subcommand so the parser dependency stays
  inside the npm package instead of being copied into every target repository.
- Preserve an existing project `.ai/model-routing.yaml` during install and
  force-update; project policy is user-owned configuration.
- Require R3 review by a different model and, by default, a different provider.
- Make R2 review controlled by `project_policy.r2_review`.
- Tie every approval to a Git commit and invalidate approval after later code
  commits.
- Treat an undisclosed model identity as `unknown`; never infer it.

## Task 1: Routing Configuration and Task Schema

**Files:**

- Create: `src/.ai/model-routing.yaml`
- Modify: `src/.ai/templates/task.md`
- Modify: `src/.ai/templates/task-short.md`
- Modify: `src/.ai/guidelines/core/model-selection.md`
- Modify: `src/.ai/guidelines/core/planning.md`

### Steps

1. Add a generic routing file with schema version, project review policy,
   capability profiles, an initially empty/illustrative model catalog, generic
   risk domains, and R1/R2/R3 routes.
2. Keep concrete model entries editable by the installed project. Do not claim
   capability scores without `last_evaluated` and `evidence`.
3. Replace flat task recommendation fields with `complexity`, `risk`,
   `model_plan`, and `model_execution` structures in the full template.
4. Keep the short template valid for R1 work while still recording creator and
   actual executor identities.
5. Document classification rules and require a rationale whenever risk is R2 or
   R3.
6. Document that generic mandatory R3 domains may be raised but not silently
   downgraded by a project.

### Verification

```bash
bash scripts/validate.sh src
git diff --check
```

Inspect both templates as YAML front matter using the parser introduced in Task
3 before final integration.

### Commit

```text
feat: add risk-aware model routing schema
```

## Task 2: Workflow and Role Integration

**Files:**

- Modify: `src/AGENTS.md`
- Modify: `src/.ai/guidelines/core/execution.md`
- Modify: `src/.ai/roles/model-router.md`
- Modify: `src/.ai/roles/qa-release-engineer.md`
- Modify: `src/.ai/roles/technical-lead.md`
- Modify: `src/.agents/skills/criar-task/SKILL.md`
- Modify: `src/.agents/skills/executar-task/SKILL.md`

### Steps

1. Change initial classification to produce both complexity and risk.
2. Make the technical lead and task creator resolve capability profiles through
   `.ai/model-routing.yaml`, then record suggested concrete models.
3. Require the executor to record actual agent, provider, model, and start time
   before changing application code.
4. Require the reviewer to record model identity, provider, reviewed commit,
   timestamp, verdict, and findings status.
5. Add completion rules for R3 and configurable R2 review.
6. Explicitly state that a review is stale when the reviewed commit is no longer
   the task's final code commit.
7. Keep deterministic evidence gates mandatory regardless of review verdict.

### Verification

```bash
bash scripts/validate.sh src
rg -n "complexity|risk|model_plan|model_execution|review" \
  src/AGENTS.md src/.ai/roles src/.ai/guidelines/core \
  src/.agents/skills/criar-task src/.agents/skills/executar-task
git diff --check
```

### Commit

```text
feat: integrate risk routing into agent workflow
```

## Task 3: Structured Validator and Tests

**Files:**

- Create: `scripts/validate-task-routing.mjs`
- Create: `scripts/test-validate-task-routing.mjs`
- Create: `scripts/fixtures/model-routing.yaml`
- Create: `scripts/fixtures/tasks/r1-valid.md`
- Create: `scripts/fixtures/tasks/r2-review-required-invalid.md`
- Create: `scripts/fixtures/tasks/r3-valid.md`
- Create: `scripts/fixtures/tasks/r3-same-model-invalid.md`
- Create: `scripts/fixtures/tasks/r3-same-provider-invalid.md`
- Create: `scripts/fixtures/tasks/r3-stale-review-invalid.md`
- Modify: `package.json`

This task reaches the ten-file limit and must not absorb workflow or
documentation changes.

### Steps

1. Add the maintained `yaml` npm dependency.
2. Add a package binary or `l-nexus validate-task` dispatch that accepts a task
   path, optional routing path, and optional final commit override.
3. Parse the routing file and Markdown front matter structurally.
4. Validate supported schema versions and report actionable field paths.
5. Enforce R1, configurable R2, and mandatory R3 policies.
6. Enforce known model identity, distinct model, cross-provider policy, approved
   verdict, and final-commit equality.
7. Exit `0` on success and non-zero on policy or parsing failure.
8. Test every valid and invalid fixture through Node's built-in test runner.

### Verification

```bash
npm install
node --test scripts/test-validate-task-routing.mjs
node scripts/validate-task-routing.mjs \
  scripts/fixtures/tasks/r3-valid.md \
  --routing scripts/fixtures/model-routing.yaml \
  --final-commit abc1234
git diff --check
```

### Commit

```text
feat: validate task model routing policy
```

## Task 4: Distribution and Compatibility

**Files:**

- Modify: `scripts/install.sh`
- Create: `scripts/test-model-routing-install.sh`
- Modify: `scripts/validate.sh`
- Modify: `scripts/test-release.sh`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `MODEL_REQUIREMENTS.md`

### Steps

1. Install `.ai/model-routing.yaml` only when it does not already exist.
2. Confirm `install-force`, which delegates to `install.sh`, also preserves
   project-owned routing policy without requiring separate behavior.
3. Ensure the validator CLI and parser dependency are included in `npm pack`.
4. Add validation for the presence and parseability of the distributed routing
   template.
5. Add install tests proving first-install creation and update preservation.
6. Add release tests proving routing, templates, and CLI changes cause the
   expected release classification.
7. Document routing configuration, task provenance, review policy, validator
   command, and unknown-model behavior.
8. Remove stale README counts or versions that would immediately become wrong;
   prefer generated/current descriptions over hard-coded totals.

### Verification

```bash
bash scripts/validate.sh src
bash scripts/test-model-routing-install.sh
bash scripts/test-release.sh
npm pack --dry-run
git diff --check
```

### Commit

```text
feat: distribute model routing policy and validator
```

## Task 5: Existing-Task Migration Strategy

**Files:**

- Create: `scripts/migrate-task-routing.mjs`
- Create: `scripts/test-migrate-task-routing.mjs`
- Modify: `src/.ai/guidelines/core/planning.md`
- Modify: `package.json`
- Modify: `README.md`

### Steps

1. Detect legacy tasks containing `modelo_recomendado`, `substitutos`, and
   `motivo` without the new schema.
2. Provide a dry-run by default and an explicit `--write` mode.
3. Map legacy recommendations into `model_plan` without fabricating creator,
   executor, provider, or reviewer identities.
4. Record unknown historical fields as `unknown` and prevent migrated legacy
   tasks from satisfying R3 review until reclassified and reviewed.
5. Preserve the task body byte-for-byte and preserve the values of unrelated
   front-matter fields; tests must cover idempotent second execution.
6. Include the migration command in the published package CLI and package file
   list.

### Verification

```bash
node --test scripts/test-migrate-task-routing.mjs
node scripts/migrate-task-routing.mjs path/to/task.md
git diff --check
```

### Commit

```text
feat: migrate legacy task routing metadata
```

## Task 6: i3CRM Go and AI Governance Documentation

**Repository:** `/home/leo/Dev/i3tech/i3crm/docs`

**Files:**

- Modify: `00_stack_e_padroes/01_backend_frontend_stack.md`
- Modify: `00_stack_e_padroes/05_padroes_ia_e_guidelines.md`

### Steps

1. Add the canonical rationale for Go: tenant deployment model, typed SQL,
   integration workers, explicit contracts, and deterministic toolchain.
2. State what is not a rationale: hype, salaries, presumed hyper-scale, or the
   belief that goroutines automatically prevent concurrency bugs.
3. Add adoption guardrails: modular monolith, durable outbox workers, bounded
   concurrency, real external-contract fixtures, required build/static/test
   gates, PostgreSQL integration tests, and human domain validation.
4. Add i3CRM-specific R3 domains without placing them in generic l-nexus.
5. Define mandatory cross-model review for R3 and project-configured behavior
   for R2.
6. Link the AI governance document to the canonical Go section instead of
   duplicating it.
7. Preserve unrelated and currently uncommitted documentation changes.

### Verification

```bash
git diff --check -- \
  00_stack_e_padroes/01_backend_frontend_stack.md \
  00_stack_e_padroes/05_padroes_ia_e_guidelines.md
rg -n "R1|R2|R3|revisão|Go|sqlc|outbox|race" \
  00_stack_e_padroes/01_backend_frontend_stack.md \
  00_stack_e_padroes/05_padroes_ia_e_guidelines.md
```

### Commit

```text
docs: define Go and AI delivery guardrails
```

## Final Verification

Run from `/home/leo/Dev/l-nexus`:

```bash
bash scripts/validate.sh src
node --test scripts/test-validate-task-routing.mjs
node --test scripts/test-migrate-task-routing.mjs
bash scripts/test-model-routing-install.sh
bash scripts/test-git-submit.sh
bash scripts/test-release.sh
npm pack --dry-run
git status --short
```

Run from `/home/leo/Dev/i3tech/i3crm/docs`:

```bash
git diff --check -- \
  00_stack_e_padroes/01_backend_frontend_stack.md \
  00_stack_e_padroes/05_padroes_ia_e_guidelines.md
git status --short
```

## Completion Gate

- All six tasks have atomic commits in their respective repositories.
- R3 valid and invalid cases are enforced by executable tests.
- R2 behavior demonstrably changes with project configuration.
- Installer preservation is tested.
- Legacy migration is dry-run by default and idempotent.
- npm package contents include the routing template and validation command.
- i3CRM documentation has one canonical Go rationale and linked AI governance.
- No pre-existing user changes are reverted or included accidentally.
