---
id: TASK-XXX
title: "[Titulo descritivo]"
status: backlog
complexity: L1
risk:
  level: R1
  domains: []
  rationale: "[por que a mudanca e localizada, reversivel e de baixo impacto]"
routing:
  work_type: "[work type]"
  categories: []
  technologies: []
  required_capabilities: []
model_plan:
  schema: 2
  created_by:
    agent: "[agente]"
    provider: "[provedor ou unknown]"
    model: "[modelo exato ou unknown]"
  executor:
    required_profile: economical
    required_capabilities: []
    default:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
    alt1:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
    alt2:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
    upgrade_alt1:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
    upgrade_alt2:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
  tester:
    required: false
    required_profile: economical
    default:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
  reviewer:
    required: false
    required_profile: economical
    independent_model: false
    cross_provider_required: false
    default:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
routing_rationale:
  executor: "[por que este executor e este effort]"
orchestration:
  mode: manual
  state: pending
  attempts:
    executor: 0
    reworks: 0
    upgrades: 0
model_execution:
  orchestrator:
    agent: ""
    provider: ""
    model: ""
    effort: ""
    started_at: ""
  executor:
    selection: ""
    agent: ""
    provider: ""
    model: ""
    effort: ""
    runner: ""
    started_at: ""
    attempts: 0
  tests: []
  reviews: []
---

# [Titulo]

## O que fazer
[1-2 linhas]

## Critérios de Aceite
- [ ] Criterio unico (max 2)

## Como verificar
[Comando para testar: ex: `php spark test --group X`]
