# Model Catalog Reference Design

**Date:** 2026-08-28
**Status:** Approved for specification
**Scope:** Separate factual model identity from routing catalog lookup for executors and reviewers

## Problem

The task routing schema currently uses `model_execution.*.model` for two
incompatible purposes:

1. recording the exact model identity reported by the executing CLI; and
2. resolving an entry in `routing.models` for policy validation.

Catalog keys are project-owned identifiers such as
`google-gemini-3-7-flash`, while a CLI may report an execution identity such
as `gemini-3.7-flash-medium`. Recording the catalog key makes validation pass
but produces false audit data. Recording the factual identity preserves the
audit trail but fails catalog lookup.

The same conflict affects required reviews. It also affects independence:
com factual identities alone, `gemini-3.7-flash-medium` and
`gemini-3.7-flash-high` appear different even though they are variants of the
same cataloged model and do not provide the intended diversity of review.

## Goals

- Preserve the exact executor and reviewer model identities reported by their
  CLIs.
- Resolve routing policy against an explicit, project-owned catalog key.
- Compare model independence by catalog identity rather than execution-variant
  spelling.
- Keep all tasks written before this change valid without migration.
- Produce field-specific validation errors that identify the reference used
  for lookup.

## Non-Goals

- Model reasoning-effort or variant-aware profile routing.
- Changes to profile ranking, risk classification, or provider-independence
  policy.
- Automatic inference of catalog entries from provider model IDs.
- Rewriting existing task files.
- A routing schema-version increment.

## Considered Approaches

### 1. Optional Explicit Catalog Reference With Fallback

Add `catalog_ref` to executor and review identities. Resolve catalog lookup and
model independence through `catalog_ref ?? model`.

**Decision:** Selected. It separates the two responsibilities while preserving
the exact behavior of existing tasks.

### 2. Match the Factual Model Against `routing.models[*].model`

Search catalog values when a direct key lookup fails. This removes some need
for `catalog_ref`, but it makes lookup implicit and potentially ambiguous when
multiple entries share a provider model ID or represent distinct policies.

**Decision:** Rejected because catalog identity must be explicit and stable.

### 3. Require `catalog_ref` Immediately

Make the new field mandatory and migrate all existing tasks.

**Decision:** Rejected because it would introduce an unnecessary breaking
change and invalidate task history.

## Task Schema

New task records use separate factual and catalog identities for both the
executor and reviewers:

```yaml
model_execution:
  executor:
    agent: "Antigravity"
    provider: "google"
    catalog_ref: "google-gemini-3-7-flash"
    model: "gemini-3.7-flash-medium"
    started_at: "2026-08-28 10:00"
  reviews:
    - agent: "reviewer-cli"
      provider: "openai"
      catalog_ref: "openai-gpt-5-6-sol"
      model: "gpt-5.6-sol-high"
      commit: "abc1234"
      reviewed_at: "2026-08-28 10:30"
      verdict: "approved"
      findings: "No findings."
```

`model` is always the factual identity reported by the CLI. `catalog_ref` is
the key of the corresponding `routing.models` entry.

`catalog_ref` is optional for backward compatibility. When it is absent, the
validator treats `model` as the catalog reference, matching the version 1
behavior. A present `catalog_ref` must be a non-empty, known string; an empty or
`unknown` value does not fall back silently to `model`.

The field is added without changing `schema_version: 1` because all existing
documents retain their meaning and validity.

## Catalog Validation

The validator derives one catalog identity for each executor or approved
review:

```text
catalog identity = catalog_ref when the field is present, otherwise model
```

It uses that identity for:

- lookup in `routing.models`;
- active-status validation;
- provider matching;
- `last_evaluated` and `evidence` requirements; and
- minimum profile-rank validation.

When `catalog_ref` is present, lookup-related errors identify
`task.model_execution.executor.catalog_ref` or the corresponding
`task.model_execution.reviews[index].catalog_ref`. With the legacy fallback,
errors continue to identify `.model`.

Factual `model` and `provider` retain the existing known-identity requirements
for R3 work. `catalog_ref` does not replace either audit field.

## Independence Rules

When a route requires `independent_model`, executor and reviewer independence
is determined by their resolved catalog identities, not their factual `model`
strings:

```text
identity.catalog_ref ?? identity.model
```

Therefore an executor using `gemini-3.7-flash-medium` and a reviewer using
`gemini-3.7-flash-high` are not independent when both reference
`google-gemini-3-7-flash`.

The same resolution rule makes mixed old/new task data coherent. A new
executor with `catalog_ref: model-a` is the same catalog model as a legacy
review with `model: model-a` and no `catalog_ref`.

Cross-provider validation remains based on the factual `provider` fields and
is otherwise unchanged.

## Templates and Migration

Both task templates expose `catalog_ref` beside `model` for the executor. Their
review examples or instructions document the same field for reviewers.

The legacy routing migrator emits `catalog_ref: unknown` for the unexecuted
executor identity it creates. This does not make the migrated R3 task eligible
for execution: the existing unknown-identity and missing-review gates continue
to reject it until a real executor and reviewer are recorded.

Existing structured tasks are not rewritten. Their absent `catalog_ref` fields
use the compatibility fallback.

## Validation and Test Coverage

The automated tests must demonstrate all of the following:

- a legacy task without `catalog_ref` still passes;
- a factual model identity different from its catalog key passes when a valid
  `catalog_ref` is present;
- that same factual identity fails lookup when `catalog_ref` is absent;
- a nonexistent, inactive, empty, `unknown`, or provider-mismatched catalog
  reference is rejected;
- lookup errors point to `catalog_ref` when present and `model` when using the
  fallback;
- executor and reviewer factual model strings may differ and still fail
  independence when their resolved `catalog_ref` values are equal;
- executor and reviewer with different catalog identities can satisfy model
  independence;
- mixed legacy and new identities compare consistently by their resolved
  catalog identities; and
- the complete routing, migration, installation, and repository validation
  suites remain green.

## Documentation

The task-routing documentation must define the two identity fields, their
fallback behavior, and the catalog-based independence rule. It must also state
that reasoning effort is not considered by routing in this delivery and will
be addressed separately, avoiding any implication that existing
`profile_by_variant` metadata is enforced by this change.
