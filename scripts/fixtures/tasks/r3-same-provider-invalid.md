---
id: TASK-R3-SAME-PROVIDER
complexity: L3
risk:
  level: R3
  domains: [tenant-account-isolation]
  rationale: An incorrect change could expose another tenant.
model_plan:
  created_by:
    agent: planner
    model: model-plan
    provider: provider-plan
  executor_profile: frontier
  suggested_models: []
  reviewer_profile: frontier
  review_required: true
  cross_provider_required: true
model_execution:
  executor:
    agent: executor
    model: model-executor
    provider: provider-a
    started_at: 2026-08-16 10:00
  reviews:
    - agent: reviewer
      model: model-reviewer
      provider: provider-a
      commit: abc1234
      reviewed_at: 2026-08-16 10:30
      verdict: approved
      findings: No findings.
---

# R3 same provider task
