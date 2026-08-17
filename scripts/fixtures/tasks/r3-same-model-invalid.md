---
id: TASK-R3-SAME-MODEL
complexity: L3
risk:
  level: R3
  domains: [authentication-authorization]
  rationale: An incorrect change could grant access.
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
    model: model-shared
    provider: provider-a
    started_at: 2026-08-16 10:00
  reviews:
    - agent: reviewer
      model: model-shared
      provider: provider-b
      commit: abc1234
      reviewed_at: 2026-08-16 10:30
      verdict: approved
      findings: No findings.
---

# R3 same model task
