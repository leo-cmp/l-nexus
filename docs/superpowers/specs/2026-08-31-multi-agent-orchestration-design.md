# Multi-Agent Orchestration Design (Routing v2 + Orchestrator + Visible Terminals)

**Date:** 2026-08-31
**Status:** Approved for implementation
**Scope:** Generic l-nexus control plane. Runtime-, provider-, CLI- and terminal-neutral.

## Problem

`l-nexus` today persists a task with complexity, risk, a required executor
profile, a flat list of suggested models and execution provenance. Three gaps
block the intended workflow:

1. The task stores *a profile* and *loose suggestions*, not an executable
   routing contract. The agent that executes still has to re-decide which model
   to use, so the planning decision is not binding.
2. Reasoning effort is not part of the contract, even though `model + effort`
   is the real unit of capability (`profile_by_variant` already exists in the
   catalog but nothing consumes it).
3. There is no coordinator role. Executor, tester and reviewer gates exist only
   as prose inside `lnx-task-executar`, executed by whichever agent happens to
   be running, with no mechanically traceable state.

## Goals

- Keep l-nexus **model-neutral, provider-neutral, CLI-neutral and
  terminal-adapter-aware**. No runtime, model, CLI or terminal emulator may be
  an architectural default in code, schema or skill logic.
- Make the Planner persist a complete, auditable routing contract:
  `default / alt1 / alt2 / upgrade_alt1 / upgrade_alt2`, each with its own
  effort, for executor and (where applicable) tester and reviewer.
- Add an Orchestrator role/skill that executes that contract as a predictable
  state machine.
- Delegate work to **visible terminals** on Linux while keeping workflow state
  mechanically trackable (not screen-scraped).
- Preserve every existing safety property: R3 cross-provider, independent
  review, stale review invalidation, project-owned routing, protected paths.

## Non-Goals

- A distributed agent framework, external state store, or SaaS dependency.
- Parallel writers in one worktree.
- Windows/macOS parity. Linux is the target; other platforms degrade to a
  documented, honest fallback.
- Automatic adjudication of executor-vs-reviewer conflicts (deferred, see
  "Deferred").

---

## 1. Coupling audit of the source plan

Every mention of a concrete runtime, model, CLI or terminal in the source plan
was classified. Only `configuration` and `example` survive; every
`architectural rule` was removed.

| Plan ref | Occurrence | Class | Treatment |
|---|---|---|---|
| §6 | `deepseek-v4-pro`, `gpt-5.6-terra`, `claude-sonnet-5`, `gpt-5.6-sol`, `claude-opus-5`, `gpt-5.6-luna`, `gemini-3.7-flash` in `model_plan` | example | Template ships placeholders. Concrete ids only in the project-owned catalog. |
| §8 | `work_routes` sample table | configuration | Becomes `work_routes` in `.ai/model-routing.yaml` (project-owned, never read from code as a literal). |
| §9 | "Criar task técnica → Sonnet 5 High…" table | recommendation | Seeded as `work_routes` entries in the shipped default file only. |
| §11 | "skill principal utilizada pelo **Antigravity**" | **architectural rule** | **Removed.** `lnx-orchestrator` names no runtime. |
| §16 | "Antigravity como Orchestrator **padrão**" + "Antigravity + Gemini 3.7 Flash" | **architectural rule** | **Removed.** Any runtime may orchestrate; the actual one is recorded in `model_execution.orchestrator`. |
| §17 | `GEMINI.md` | configuration | Thin entrypoint. Declares *how to act when orchestrating*, not that it is the orchestrator. |
| §26 | `orchestrator: {agent: antigravity, model: gemini-3.7-flash}` | example | Written at runtime from the live identity; never pre-filled. |
| §29 | "não usar o Orchestrator **Flash** como árbitro" | recommendation w/ leaked model | Reworded: the orchestrator runtime never arbitrates an R3 technical dispute, regardless of which model it is. |
| §30 | Final report "Antigravity / Gemini 3.7 Flash High" | example | Report renders whatever identity was recorded. |
| §34 | `cli_runners.codex.effort_mapping` | configuration | Per-runner effort contract in YAML. |
| §42 | "compatível com Claude Code / Codex / Gemini CLI / Cursor / OpenCode" | recommendation | Reinforced as a first-class requirement. |
| §53 | Diagram node `ANTIGRAVITY ORCHESTRATOR / Gemini 3.7 Flash` | **architectural rule** | **Removed.** Diagram node is `ORCHESTRATOR (any compatible runtime)`. |
| §47 | E2E scenarios named by real models | example | Fixtures use synthetic catalog ids, matching existing fixture style. |
| — | `gnome-terminal` | (added requirement) | One adapter among several in an extensible table; detected, never assumed. |

**Resulting invariant:** grep of the implementation (validator, migration,
launcher, skill logic) must never contain a provider, model, CLI or terminal
name as a decision literal. Names appear only in (a) the project-owned catalog,
(b) the launcher's adapter table, which is an extensible registry rather than a
policy, and (c) documentation examples.

---

## 2. Layer separation

Three layers, deliberately decoupled:

```
ROLE            planner | orchestrator | executor | tester | reviewer
                  (what kind of work is being done)
                             │
                             ▼
MODEL ROUTING   default | alt1 | alt2 | upgrade_alt1 | upgrade_alt2
                  + effort per slot          (which capability is required)
                             │
                             ▼
CLI RUNNER      how that model is actually invoked
                             │
                             ▼
TERMINAL RUNNER where that invocation becomes visible to the human
```

A role never names a model. A slot never names a CLI unless the project pins
one. A CLI never names a terminal. Each downward binding is resolved at run
time from project-owned configuration, and a binding that cannot be resolved
unambiguously **blocks** instead of guessing.

### Actor relations

| Actor | Decides | Never does |
|---|---|---|
| **Planner** (`technical-lead` + `lnx-task-criar`) | work type, categories, technologies, capabilities, L1-L3, R1-R3, all routing slots + efforts, tester/reviewer policy, rationale | execute code, run gates |
| **Model Router** (`model-router`) | ad-hoc recommendation before a task exists; assists the Planner | persist the decision into a task |
| **Orchestrator** (`orchestrator` + `lnx-orchestrator`) | which planned slot to activate now, when to rework, when to upgrade within budget, when to block | change risk, skip a mandatory gate, edit code as normal behaviour, re-plan |
| **Executor** | implementation inside the task scope | approve its own work |
| **Tester** | does it build/lint/test/meet verifiable acceptance criteria | fix the code |
| **Reviewer** | is it correct, safe, maintainable | fix the code |
| **Model Router config** (`model-routing.yaml`) | catalog, profiles, routes, budgets, runners, terminal adapters | — |
| **CLI Runner** | argv/stdin contract to invoke one model | choose a model |
| **Terminal Runner** | make an invocation visible and supervised | change what is invoked |
| **Validator** | mechanical enforcement of all of the above | interpret intent |

---

## 3. `model-routing.yaml` schema v2

`schema_version: 2`. v1 remains fully supported: consumer projects own this
file and `update` never overwrites it, so the validator must keep accepting v1
indefinitely.

Preserved unchanged: `project_policy`, `profiles`, `models`, `risk_domains`,
`routes`, `cli_runners`.

Added:

```yaml
project_policy:
  r2_review: optional|required          # v1
  r2_test_gate: optional|required       # v2, mirrors r2_review
  r3_cross_provider: true|false         # v1
  unknown_model_identity: reject_for_r3 # v1

routes:
  R2:
    test_gate: project_policy           # v2: optional | required | project_policy
    tester_profile: <profile>           # v2, required for R2/R3, may be lower than executor
    # R1 -> optional, R3 -> required (fixed, like review)

execution_policy:                       # v2
  max_same_executor_reworks: 1
  max_upgrades: 1
  max_total_execution_attempts: 3

work_routes:                            # v2, declarative planner input
  backend-implementation:
    executor: { default: {model: <catalog-key>, effort: high}, alt1: …, alt2: …,
                upgrade_alt1: …, upgrade_alt2: … }
    tester:   { default: …, alt1: … }
    reviewer: { default: …, alt1: … }

cli_runners:                            # v2 fields, additive
  <name>:
    binary: <bin>
    argv: ["-p", "{prompt}", "--model", "{model}"]   # preferred, injection-safe
    command_template: "…"                            # v1, legacy shell string
    prompt_delivery: argv|stdin|file
    provides:
      providers: [<provider>, …]
      models: [<catalog-key>, …]
    effort:
      supported: true|false
      argv: ["--effort", "{effort}"]
      mapping: { low: …, high: …, max: … }

terminal_runners:                       # v2
  preference: [<adapter>, …]
  fallback: inline|block
  adapters:
    <adapter>:
      binary: <bin>
      argv: ["--title", "{title}", "--working-directory", "{cwd}", "--wait", "--", "{command}"]
```

`work_routes` does not duplicate `models`, `profiles` or `routes`. It only
selects catalog keys and efforts. `routes` still defines the mandatory minimum
per risk level, and the validator checks the selected slots against it, so a
`work_routes` entry can never weaken a risk floor.

### Model reference convention

Slots and provenance reference the **catalog key** of `models:` (for example
`anthropic-sonnet-5`), not the wire id (`claude-sonnet-5`). This matches the v1
validator contract. The validator emits a targeted hint when a value matches
some entry's `model:` field instead.

---

## 4. Task schema v2

`model_plan.schema: 2` is an explicit marker. Absent means v1. Present and not
`2` is an error. A v2 task requires routing v2. Missing fields are never
silently interpreted.

```yaml
routing:
  work_type: implementation
  categories: [backend, tests]
  technologies: [go, gin]
  required_capabilities: [backend, tests]

model_plan:
  schema: 2
  created_by: {agent, provider, model}
  executor:
    required_profile: <profile>
    required_capabilities: [...]
    default:       {model, effort}
    alt1:          {model, effort}
    alt2:          {model, effort}
    upgrade_alt1:  {model, effort}
    upgrade_alt2:  {model, effort}
  tester:
    required: true|false
    required_profile: <profile>
    default: {model, effort}          # alt/upgrade slots optional
  reviewer:
    required: true|false
    required_profile: <profile>
    independent_model: true|false
    cross_provider_required: true|false
    default: {model, effort}          # alt/upgrade slots optional

routing_rationale: {executor, tester, reviewer, upgrades}

orchestration:
  mode: manual|orchestrated
  state: pending|executing|testing|reviewing|rework|blocked|needs_reclassification|done
  attempts: {executor: 0, reworks: 0, upgrades: 0}

model_execution:
  orchestrator: {agent, provider, model, effort, started_at}
  executor:  {selection, agent, provider, model, effort, runner, started_at, attempts}
  tests:   [{selection, agent, provider, model, effort, commit, tested_at, verdict}]
  reviews: [{selection, agent, provider, model, effort, commit, reviewed_at, verdict, findings}]
```

Top-level `status` is unchanged for compatibility; workflow sub-state lives in
`orchestration.state`.

### Slot semantics

- `default` — the normally preferred option.
- `alt1` / `alt2` — **lateral** alternatives (unavailability, rate limit, cost,
  provider constraint, specialisation, explicit human preference). Not a retry
  ladder.
- `upgrade_alt1` / `upgrade_alt2` — **vertical** escalation, only after the
  rework budget is spent or the task proved materially harder.

### Effort semantics

Allowed values: `default`, `low`, `high`, `max`. Eligibility is decided by
`models.<key>.profile_by_variant[effort]`, not by the flat `profile`. So
`{model: m, effort: low}` can be rejected while `{model: m, effort: high}` is
accepted for the same required profile. This is the core v2 validation change.

---

## 5. Validator rules added in v2

Planning time, for every declared slot:

1. model exists in `models`, `status: active`, has `last_evaluated` and
   `evidence`;
2. `effort` ∈ {default, low, high, max};
3. `profile_by_variant[effort]` rank ≥ required profile rank;
4. model `capabilities` ⊇ `required_capabilities` (skipped when empty);
5. upgrade slots rank ≥ `default` slot rank (reject, not warn);
6. `executor.required_profile` == `routes[risk].executor_profile`;
7. `reviewer.required` == effective review policy; `tester.required` ==
   effective test-gate policy; `reviewer.cross_provider_required` == computed;
8. when review is required and the route demands independence, the planned
   reviewer `default` model differs from the executor `default` model, and for
   R3 cross-provider the providers differ too.

Execution time:

9. `selection` names a slot that exists, and the recorded `model` + `effort`
   equal that slot — the orchestrator cannot silently substitute a model;
9b. a recorded `runner` must exist in `cli_runners`, and a runner that does not
   declare `effort.supported: true` may not carry a slot whose eligibility
   depends on effort (the model only reaches the required profile above its
   `default` variant) — the effort is never credited without support;
10. R3 rejects `unknown` identity (v1 rule, preserved);
11. when the test gate is required, a `passed` test entry must cover the final
    commit;
12. when review is required, an `approved` review must cover the final commit,
    by a different model, and for R3 a different provider (v1 rules, preserved
    and extended with effort eligibility);
13. `orchestration.attempts` must stay within `execution_policy` — an infinite
    loop is rejected by contract;
14. `orchestration.mode: orchestrated` requires orchestrator identity and an
    executor `runner`.

---

## 6. Linux strategy for visible terminals

### Decision

A single POSIX-shell launcher, `.agents/scripts/lnx-run.sh`, provides the
`detect / open / execute` abstraction. It receives **already-resolved**
values as explicit arguments (model, effort, runner binary and argv, terminal
preference). It never parses YAML: the orchestrator reads
`.ai/model-routing.yaml` and resolves the three layers, keeping configuration
declarative and the launcher dumb, safe and testable.

Subcommands:

```
lnx-run.sh detect-terminal [--terminal <name>] [--terminal-preference a,b,c]
lnx-run.sh start  --task <id> --role <role> --slot <slot> --model <m> --effort <e>
                  --runner <name> --prompt-file <f> [--runner-arg <a>]…
                  [--terminal auto|<name>|none] [--terminal-cmd <argv-template>]…
                  [--fallback inline|block] [--attempt N] [--cwd DIR] [--wait]
lnx-run.sh supervise <run-dir>        # internal: runs inside the opened terminal
lnx-run.sh status <run-dir>
lnx-run.sh wait   <run-dir> [--timeout S]
```

### Detection

Order: `--terminal` > `LNX_TERMINAL` > `--terminal-preference` (which the
orchestrator fills from `terminal_runners.preference`) > built-in order. A
graphical session is required (`DISPLAY` or `WAYLAND_DISPLAY`); without one, no
adapter is considered available. Adapter binaries are probed with
`command -v`. Built-in adapters: `gnome-terminal`, `konsole`,
`xfce4-terminal`, `kitty`, `alacritty`, `wezterm`, `tilix`, `terminator`,
`xterm`, `x-terminal-emulator`, plus `tmux` (new window in the current session).
`--terminal-cmd` accepts a custom argv template
(`{title}`, `{cwd}`, `{command}`), so a project can add an adapter without
touching l-nexus. An explicitly named adapter that is unavailable is an error;
it never silently degrades.

### Fallback

If nothing can open, the launcher does **not** fork. `--fallback block`
(default for `start`) exits non-zero with a precise reason. `--fallback inline`
runs the command in the caller's own terminal, still fully visible, still fully
supervised. `nohup`, `&` and hidden background execution are never used for an
agent invocation.

### Window budget

One window per role per attempt, opened when the gate starts. Because gates are
sequential, at most one agent window is live at a time, which reproduces the
requested "Executor window / Tester window / Reviewer window" sequence without
terminal spam. A rework opens a new window whose title carries the attempt
number, which keeps per-attempt output separable.

*Rejected alternative:* one long-lived window per role reading a command queue.
It reuses windows but needs a persistent shell, a FIFO protocol and its own
liveness handling, and it makes per-attempt output interleave in one scrollback.
The traceability loss was not worth the saved windows.

### Why the window is UX only

Terminal exit-code propagation is not portable (`gnome-terminal --wait`
propagates, `xterm -e` does not). The launcher therefore treats the window as
presentation and the **run directory as the contract**.

---

## 7. Structured run artifacts

```
.lnx/runtime/<task-id>/<run-id>/
  meta.json      role, slot, model, effort, runner, terminal, attempt, argv (redacted), timestamps
  prompt.txt     exact prompt handed to the agent (file/stdin, never interpolated into a shell string)
  stdout.log     tee'd — visible in the window and captured
  stderr.log
  status         starting | running | done | failed   (written atomically)
  exit-code      the real exit status of the delegated CLI
  result.yaml    structured self-report the delegated agent is asked to write
```

`status` and `exit-code` are written with `write-temp + mv`, so a reader never
observes a half-written value. `.lnx/` is git-ignored: it is transient runtime
state, not project history. Evidence that must survive is copied into the task
by the orchestrator, as today.

`result.yaml` shape by role:

```yaml
# executor
status: success|failure|blocked
files_changed: [...]
commands: [{command, exit_code}]
notes: "..."
# tester
verdict: passed|failed|blocked
tests_run: [...]
failures: [...]
observations: [...]
# reviewer
verdict: approved|rejected|blocked
findings: [{id, severity, file, line, issue, recommendation}]
```

If a delegated agent fails to write `result.yaml`, the run is not silently
treated as success: `exit-code` still decides pass/fail, and the missing
artifact is reported as an evidence gap.

---

## 8. Shell and prompt safety

- The prompt is always written to a file and delivered by `--prompt-file`,
  substituted as a **single argv element** or piped on stdin. It is never
  interpolated into a shell string, so task content cannot inject commands.
- `argv` runner definitions are preferred; the legacy `command_template` shell
  string remains supported for v1 compatibility and is documented as such.
- The launcher executes `binary` + argv directly, without an intermediate
  shell, except for the deliberate `bash -c` that runs `supervise` inside the
  opened window, whose argv is entirely launcher-generated.
- Delegated agents inherit no authority the orchestrator lacks. Destructive
  commands still require explicit human confirmation. Task/log content remains
  data, never instruction.

---

## 9. Compatibility

| Surface | Strategy |
|---|---|
| routing v1 files | fully supported, unchanged validation |
| task v1 front matter | fully supported under both routing versions |
| `migrate-task` default | unchanged: legacy → v1 |
| `migrate-task --to 2` | v1 → v2 skeleton, `needs_manual_routing: true`, never invents a model or an effort, never makes an R3 task pass by guessing |
| `lnx-task-executar` | preserved as the human-facing entry; delegates to `lnx-orchestrator` when the task carries `model_plan.schema: 2` |
| `.ai/model-routing.yaml` | still project-owned; installer still refuses to overwrite it |
| `GEMINI.md` | l-nexus-managed **only** when absent or carrying the `lnx-entrypoint` marker; a foreign file is left untouched with a warning |

---

## Deferred

- **Adjudicator** for executor-vs-reviewer disputes (source plan §29). No field
  or gate was added; for R3 a persistent dispute blocks and escalates to the
  human instead. Documented as deferred rather than half-built.
- **Structural validation of `work_routes`.** It is advisory planner input; the
  contract that gets validated is the task. A typo there surfaces as a task
  validation error, which is where enforcement belongs.
- Parallel gates and multi-writer worktrees.
- Windows/macOS terminal adapters beyond what already works incidentally.
