---
id: TASK-XXX
title: "[Titulo descritivo]"
created_at: YYYY-MM-DD HH:mm
updated_at: YYYY-MM-DD HH:mm
status: backlog
assignee: "[agente responsavel]"
cargo: "[cargo do AGENTS.md]"
complexity: "[L1 | L2 | L3]"
risk:
  level: "[R1 | R2 | R3]"
  domains: []
  rationale: "[impacto caso a implementacao esteja errada]"
# Classificacao funcional. Alimenta a escolha de work_route em .ai/model-routing.yaml.
# work_type sugerido: planning | implementation | bugfix | refactor | testing |
#   review | system-design | documentation | migration | investigation
routing:
  work_type: "[work type]"
  categories: []
  technologies: []
  required_capabilities: []
# Contrato de roteamento resolvido pelo Planner e executado pelo Orchestrator.
# default        preferencia normal
# alt1 / alt2    alternativas LATERAIS (indisponibilidade, custo, rate limit,
#                provedor, especializacao, preferencia humana) — nao sao retry
# upgrade_alt*   escalada VERTICAL, so apos esgotar rework ou quando a tarefa se
#                revelou materialmente maior
# effort: default | low | high | max — resolve a elegibilidade via profile_by_variant
# Os valores de `model` sao CHAVES do catalogo `models:` do model-routing.yaml.
model_plan:
  schema: 2
  created_by:
    agent: "[agente]"
    provider: "[provedor ou unknown]"
    model: "[modelo exato ou unknown]"
  executor:
    required_profile: "[economical | balanced | frontier]"
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
    required: "[true | false]"
    required_profile: "[economical | balanced | frontier]"
    default:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
  reviewer:
    required: "[true | false]"
    required_profile: "[economical | balanced | frontier]"
    independent_model: "[true | false]"
    cross_provider_required: "[true | false]"
    default:
      model: "[chave do catalogo]"
      effort: "[default | low | high | max]"
routing_rationale:
  executor: "[por que este executor e este effort]"
  tester: "[por que este tester, ou por que nao ha gate de teste]"
  reviewer: "[por que este revisor e esta politica de independencia]"
  upgrades: "[quando os upgrades sao permitidos]"
# Subestado do workflow. `status` acima continua sendo o estado macro.
orchestration:
  mode: manual
  state: pending
  attempts:
    executor: 0
    reworks: 0
    upgrades: 0
# Proveniencia real. Preenchida durante a execucao, nunca antecipada.
# `selection` registra qual slot foi de fato usado (default/alt1/alt2/upgrade_alt*).
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
issue: "[URL da issue GitHub]"
---

# [Titulo]

## Objetivo

[O que precisa ser feito e por que]

## Criterios de Aceite

- [ ] Criterio 1
- [ ] Criterio 2

## Plano de Execucao

- [ ] Passo 1
- [ ] Passo 2

## Estado Atual

> Ultima atualizacao: YYYY-MM-DD HH:mm

[Onde parou, o que funciona, o que falta, proxima prioridade]

## Log de Evidencias

Cada entrada deve ter: data/hora + acao + comando executado + exit code + resumo (1 linha).

Formato:
* YYYY-MM-DD HH:mm - [Acao] `comando` → exit 0 | Resumo: [1 linha]
* YYYY-MM-DD HH:mm - [Acao] `comando` → exit 0 | Saida longa: ver arquivo anexo

## Contador de Tentativas

| Criterio | Tentativas | Ultima tentativa | Status |
|----------|------------|------------------|--------|
| Criterio 1 | 0 | — | pendente |
| Criterio 2 | 0 | — | pendente |

- Maximo 3 tentativas por criterio.
- Na 3a falha consecutiva: marcar como BLOQUEADO, parar, informar usuario.
- No handoff, o proximo agente le esta tabela e sabe o historico.

## Erros e Correcoes

Se um criterio falhar 3x consecutivas, nao registre como "Erros e Correcoes" —
registre como "BLOQUEIO" e pare.

* [Descricao do erro] → [Causa] → [Correcao aplicada + prova]

## BLOQUEIO

Registre aqui criterios que falharam 3x consecutivas. Nao tente correcao — aguarde orientacao do usuario.

* [Criterio X] — [3 tentativas resumidas] — [data/hora]

## Nao Verificado

Items registrados como concluidos mas sem prova de verificacao.
Mova para "Log de Evidencias" assim que verificar.

* [Item pendente de verificacao]
