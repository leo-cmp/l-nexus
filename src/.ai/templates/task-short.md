---
id: TASK-XXX
title: "[Titulo descritivo]"
status: backlog
complexity: L1
risk:
  level: R1
  domains: []
  rationale: "[por que a mudanca e localizada, reversivel e de baixo impacto]"
# Um modelo nao pode aparecer em dois papeis. Ao terminar de preencher, congele:
#   npx @leo-cmp/l-nexus validate-task <caminho-da-task> --write-plan-hash
model_plan:
  schema: 3
  created_by:
    agent: "[agente]"
    provider: "[provedor ou unknown]"
    model: "[modelo exato ou unknown]"
  # Qual combo cada papel usa sai de `roles` no model-routing.yaml, pelo nivel de
  # risco -- nao ha escolha a fazer aqui, e por isso nao ha o que justificar.
  # O `effort` e o que o combo declara; copie, nao invente.
  executor:
    combo: "[combo de roles.executor]"
    effort: "[effort declarado para o combo]"
  tester:
    combo: "[combo de roles.tester, ou remova se o risco nao exige teste]"
    effort: "[effort declarado para o combo]"
  reviewer:
    combo: "[combo de roles.reviewer, ou remova se o risco nao exige revisao]"
    effort: "[effort declarado para o combo]"
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
    started_at: ""
  executor:
    combo: ""
    # O modelo que o gateway informou no campo `model` da RESPOSTA -- nao o nome
    # do combo, e nao o que o modelo diz de si.
    model: ""
    effort: ""
    runner: ""
    started_at: ""
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
