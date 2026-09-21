---
id: task_v3_r3
title: "Cobranca recorrente com idempotencia"
status: done
complexity: "L3"
risk:
  level: "R3"
  domains: [payments-money]
  rationale: "Move dinheiro de verdade e uma cobranca duplicada e irreversivel."
model_plan:
  schema: 3
  created_by:
    agent: "orquestrador"
    provider: "provider-a"
    model: "model-planner"
  executor:
    combo: "combo-executor-frontier"
    effort: "max"
  tester:
    combo: "combo-tester"
    effort: "default"
  reviewer:
    combo: "combo-reviewer-frontier"
    effort: "xhigh"
orchestration:
  mode: orchestrated
  state: done
model_execution:
  executor:
    combo: "combo-executor-frontier"
    model: "modelo-que-executou"
    effort: "max"
    reasoning_tokens: 412
    runner: "runner-a"
    started_at: "2026-09-21 09:00"
  tests:
    - combo: "combo-tester"
      model: "modelo-que-testou"
      effort: "default"
      commit: "abc1234"
      verdict: "passed"
  reviews:
    - combo: "combo-reviewer-frontier"
      model: "modelo-que-revisou"
      effort: "xhigh"
      commit: "abc1234"
      verdict: "approved"
      findings: "Dois pontos medios, nenhum bloqueante."
---

# Cobranca recorrente
