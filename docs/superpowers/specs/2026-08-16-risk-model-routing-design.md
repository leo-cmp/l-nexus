# Risk-Aware Model Routing Design

**Date:** 2026-08-16
**Status:** Approved for specification
**Scope:** Generic l-nexus workflow plus project-level overrides

## Problem

The current l-nexus workflow uses the number of changed files as the main proxy
for task complexity and stores only a recommended model in task front matter.
This creates three gaps:

1. Change size and business risk are conflated. A one-line authorization,
   payment, migration, or destructive-data change can be more dangerous than a
   broad visual refactor.
2. Model recommendations are static and become stale as providers release new
   models or as project-specific evaluations reveal different strengths.
3. The task does not provide complete provenance for who created, executed, and
   reviewed the final change, nor prove that the review covered the final
   commit.

## Goals

- Keep l-nexus generic across languages, frameworks, and business domains.
- Separate implementation complexity from failure impact.
- Route work by capability profile and risk before resolving concrete models.
- Record the models that created, executed, and reviewed each task.
- Require independent review for critical work.
- Make the policy mechanically enforceable instead of prompt-only.
- Allow each project to add domains and override the R2 review policy.

## Non-Goals

- Automatically benchmark commercial models inside l-nexus.
- Claim permanent capability rankings for model families.
- Store credentials, provider API configuration, pricing, or billing data.
- Encode i3CRM-specific domains in the generic l-nexus defaults.
- Replace build, tests, static analysis, or human review with model consensus.

## Considered Approaches

### 1. Markdown Guidance Only

Add recommendations to `model-selection.md` and fields to the task template.
This is easy to implement but cannot block completion when fields are absent or
when the same model executes and reviews critical work.

**Decision:** Rejected as insufficiently enforceable.

### 2. One Routing File, Task Provenance, and Validator

Ship one generic routing configuration, add structured provenance to task front
matter, and validate the policy at task transitions and completion. Projects
customize the installed routing file without changing l-nexus core files.

**Decision:** Selected. It is explicit, local, versionable, and does not require
an external service.

### 3. External Dynamic Model Registry

Use a service or benchmark database to score and route models dynamically. This
could support richer cost and quality optimization, but adds availability,
authentication, schema, and lifecycle dependencies that are not justified for
the current kit.

**Decision:** Deferred. The selected file format must remain extensible enough
to consume generated evaluation data later.

## Two-Axis Classification

Every non-trivial task has two independent classifications.

### Complexity

Complexity retains the existing `L1`, `L2`, and `L3` terminology and measures
scope, coordination, and implementation effort. File count remains one signal,
not the full definition.

| Level | Meaning |
|---|---|
| `L1` | Local, reversible, and narrowly scoped |
| `L2` | Multiple related changes or one new bounded behavior |
| `L3` | Cross-domain, architectural, or broadly coordinated work |

### Risk

Risk uses `R1`, `R2`, and `R3` and measures the consequence of an incorrect
change.

| Level | Meaning | Default review |
|---|---|---|
| `R1` | Low impact and readily reversible | Optional |
| `R2` | Material functional or operational impact | Project-configurable |
| `R3` | Security, financial, destructive, legal, isolation, or irreversible impact | Mandatory independent review |

The generic R3 defaults include these domain families:

- authentication and authorization;
- secrets and cryptography;
- payments and monetary calculations;
- destructive data operations and irreversible migrations;
- personal-data deletion, retention, or disclosure;
- tenant or account isolation;
- backup, restore, deployment, or infrastructure control;
- concurrency, idempotency, or externally visible side effects when duplication
  or loss has material impact.

Projects may add domains in their routing configuration. A project-specific
domain can raise risk but cannot lower a generic mandatory R3 domain without an
explicit decision record.

## Routing Configuration

The installed project contains one canonical file:

```text
.ai/model-routing.yaml
```

The file has four top-level sections:

```yaml
schema_version: 1

project_policy:
  r2_review: required # required | optional
  r3_cross_provider: true
  unknown_model_identity: reject_for_r3

profiles:
  economical:
    rank: 1
    description: "Localized, reversible work"
  balanced:
    rank: 2
    description: "Bounded implementation and tests"
  frontier:
    rank: 3
    description: "Architecture and high-risk work"

models:
  example-model:
    provider: example
    profile: balanced
    status: active
    capabilities: [backend, tests]
    last_evaluated: 2026-08-16
    evidence: "manual project evaluation"

routes:
  R1:
    executor_profile: economical
    review: optional
    independent_model: false
  R2:
    executor_profile: balanced
    review: project_policy
    reviewer_profile: balanced
    independent_model: true
  R3:
    executor_profile: frontier
    review: required
    reviewer_profile: frontier
    independent_model: true
    cross_provider: true
```

The distributed file contains illustrative placeholders or currently supported
defaults, but concrete rankings are project-owned. Models are selected from
profiles and capabilities, not by hard-coded provider preference.

Profile ranks define minimum capability ordering: a higher-ranked profile may
satisfy a lower requirement, but not the reverse.

`last_evaluated` and `evidence` prevent an old opinion from looking like a
current fact. Identity `unknown` may be allowed for R1/R2 according to project
policy, but a concrete catalog entry used for execution or approval must be
active and evaluated. An unevaluated model cannot satisfy an R3 frontier
requirement.

## Task Schema

The task template replaces the current flat recommendation fields with
structured planning and provenance fields:

```yaml
complexity: L2
risk:
  level: R3
  domains: [payments, personal-data]
  rationale: "May duplicate a charge or disclose payer data"

model_plan:
  created_by:
    agent: codex
    model: gpt-example-frontier
    provider: example
  executor_profile: frontier
  suggested_models: [model-a, model-b]
  reviewer_profile: frontier
  review_required: true
  cross_provider_required: true

model_execution:
  executor:
    agent: codex
    model: model-a
    provider: provider-a
    started_at: YYYY-MM-DD HH:mm
  reviews:
    - agent: claude
      model: model-b
      provider: provider-b
      commit: abc1234
      reviewed_at: YYYY-MM-DD HH:mm
      verdict: approved
```

The creator records the creation identity and recommended profiles. The
executor records the actual identity when starting work. The reviewer appends a
review entry after reviewing the final commit.

An agent must record `unknown` when the runtime does not expose its exact model
identity. It must never infer or invent a model name. By default, `unknown`
cannot execute or approve R3 work.

## Review Independence

For R3 tasks:

- at least one approved review is mandatory;
- executor and reviewer model identifiers must differ;
- when `r3_cross_provider` is true, providers must differ;
- the review must reference the final commit under completion evaluation;
- a new code commit invalidates previous approvals until the resulting commit
  is reviewed;
- review output must include findings or an explicit no-findings verdict;
- tests and other deterministic evidence remain mandatory.

For R2 tasks, `project_policy.r2_review` determines whether the same completion
gate applies. R1 review remains optional unless a project override raises it.

Model independence is a minimum safeguard, not proof of correctness. A second
model can repeat the first model's mistake, so review never replaces acceptance
tests, integration tests, or domain validation.

## Validation and Workflow Integration

A validator must parse task front matter structurally and return a non-zero exit
code for policy violations. It must not validate YAML using regular expressions.

Validation occurs at these transitions:

1. **Task creation:** complexity, risk, rationale, creator identity, and routing
   plan are present and resolve against `.ai/model-routing.yaml`.
2. **Execution start:** actual executor identity is recorded and satisfies the
   required profile.
3. **Review:** reviewer identity, provider, commit, timestamp, and verdict are
   recorded.
4. **Completion:** required reviews cover the final commit and all existing
   evidence gates pass.

The validator should expose a narrow command suitable for local use and CI,
for example:

```bash
scripts/validate-task-routing.sh .planning/PLAN_VN/tasks/task_X_Y.md
```

The implementation may use an existing YAML parser already available to the
project. If none exists, the design must choose one explicit dependency rather
than implementing an ad hoc parser.

## l-nexus Changes

The implementation is expected to update these responsibilities:

- `AGENTS.md`: classify complexity and risk separately and invoke routing gates;
- `.ai/model-routing.yaml`: canonical generic routing configuration;
- `.ai/guidelines/core/model-selection.md`: explain profile-based resolution;
- `.ai/guidelines/core/execution.md`: record actual executor and enforce final
  review state;
- `.ai/guidelines/core/planning.md`: require risk classification and rationale;
- `.ai/templates/task.md`: full provenance schema;
- `.ai/templates/task-short.md`: compact schema appropriate for R1 work;
- `.ai/roles/model-router.md`: resolve profiles to eligible concrete models;
- `.ai/roles/qa-release-engineer.md`: verify independence and final commit;
- `.agents/skills/criar-task/SKILL.md`: populate planning-time fields;
- validation scripts and their automated tests.

No implementation task should modify more than the l-nexus scope limit. This
work should therefore be split into bounded tasks for schema/configuration,
workflow integration, and validator/tests.

## i3CRM Documentation Integration

The generic routing engine remains in l-nexus. i3CRM only supplies project
policy and project-specific risk domains.

The canonical Go decision and its technical guardrails belong in:

```text
docs/00_stack_e_padroes/01_backend_frontend_stack.md
```

The AI-assisted implementation policy, cross-model review, task provenance, and
required verification gates belong in:

```text
docs/00_stack_e_padroes/05_padroes_ia_e_guidelines.md
```

The second document links to the first instead of duplicating the Go adoption
conditions.

Suggested i3CRM-specific R3 domains include:

- `quote-pricing`;
- `tenant-isolation`;
- `sga-transmission`;
- `payment-idempotency`;
- `lgpd-purge`;
- `auth-and-portfolio-scope`;
- `schema-and-rollback`;
- `backup-and-restore`.

## Go Guideline Release Status

The Go and Goose guidelines are tracked as of commit `fb7aa13` and included in
l-nexus `0.5.1`. The routing implementation may therefore reference
`src/.ai/guidelines/stacks/go.md` and `goose.md` as distributed files. Package
contents must still be covered by the existing release validation so future
guidelines cannot be referenced without being published.

## Acceptance Criteria

- Complexity and risk are independently represented in every full task.
- R3 completion fails without an approved independent review of the final
  commit.
- R2 review behavior is controlled by project policy.
- Project-specific domains can raise routing requirements without changing
  generic l-nexus files.
- Model names are resolved through capability profiles and an evaluated local
  catalog.
- Creator, actual executor, and every reviewer are recorded without inferred
  identities.
- The validator rejects same-model R3 review and, when configured, same-provider
  review.
- The validator has automated success and failure tests.
- Existing task files receive an explicit migration or compatibility strategy.
- i3CRM documents Go guardrails and AI review policy in their canonical files.

## Spec Self-Review

- No placeholder is required for implementation decisions.
- Risk and complexity terminology is consistent throughout the design.
- Generic l-nexus policy and i3CRM-specific domains remain separated.
- Review provenance is tied to the final commit, avoiding stale approvals.
- Enforcement includes a structured validator and does not rely only on prompts.
- Existing-task migration is explicitly required before rollout.
