---
id: task_v3_r1
title: "Corrige um link quebrado no README"
status: done
complexity: "L1"
risk:
  level: "R1"
  domains: [documentation]
  rationale: "Texto, reversivel por revert."
model_plan:
  schema: 3
  created_by:
    agent: "orquestrador"
    provider: "provider-a"
    model: "model-planner"
  executor:
    combo: "combo-executor"
    effort: "default"
orchestration:
  mode: manual
  state: done
model_execution:
  executor:
    combo: "combo-executor"
    model: "modelo-que-executou"
    effort: "default"
    runner: "runner-a"
    started_at: "2026-09-21 09:00"
---

# Link quebrado
