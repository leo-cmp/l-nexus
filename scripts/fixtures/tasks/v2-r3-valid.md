---
id: TASK-V2-R3
complexity: L3
status: done
risk:
  level: R3
  domains: [payments-money]
  rationale: An incorrect change could duplicate charges.
routing:
  work_type: implementation
  categories: [backend, tests]
  technologies: [example-language, example-framework]
  required_capabilities: [backend, tests]
model_plan:
  schema: 2
  created_by:
    agent: planner
    model: model-reviewer
    provider: provider-b
  executor:
    required_profile: frontier
    required_capabilities: [backend, tests]
    default:
      model: model-executor
      effort: high
    alt1:
      model: model-reviewer
      effort: high
    alt2:
      model: model-executor
      effort: max
    upgrade_alt1:
      model: model-reviewer
      effort: max
    upgrade_alt2:
      model: model-executor
      effort: max
  tester:
    required: true
    required_profile: balanced
    default:
      model: model-tester
      effort: default
  reviewer:
    required: true
    required_profile: frontier
    independent_model: true
    cross_provider_required: true
    default:
      model: model-reviewer
      effort: high
routing_rationale:
  executor: Frontier capability is required for a payments change.
  tester: An independent lower-cost tester verifies observable behaviour.
  reviewer: Cross-provider review is mandatory for R3 in this project.
  upgrades: Upgrades stay reserved for persistent failure.
orchestration:
  mode: orchestrated
  state: done
  attempts:
    executor: 1
    reworks: 0
    upgrades: 0
model_execution:
  orchestrator:
    agent: orchestrator-runtime
    provider: provider-c
    model: model-tester
    effort: default
    started_at: 2026-08-16 09:55
  executor:
    selection: default
    agent: executor
    model: model-executor
    provider: provider-a
    effort: high
    runner: runner-a
    started_at: 2026-08-16 10:00
    attempts: 1
  tests:
    - selection: default
      agent: tester
      model: model-tester
      provider: provider-c
      effort: default
      runner: runner-a
      commit: abc1234
      tested_at: 2026-08-16 10:20
      verdict: passed
  reviews:
    - selection: default
      agent: reviewer
      model: model-reviewer
      provider: provider-b
      effort: high
      runner: runner-a
      commit: abc1234
      reviewed_at: 2026-08-16 10:30
      verdict: approved
      findings: No findings.
---

# R3 task routed with schema 2
