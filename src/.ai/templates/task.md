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
# Contrato de roteamento resolvido pelo Planner e executado pelo Orchestrator.
# O combo de cada papel sai de `roles` no model-routing.yaml, pelo nivel de risco;
# o effort sai de `combos`. Nao ha modelo a escolher: quem escolhe e o gateway.
# Ao terminar de preencher, congele o bloco:
#   npx @leo-cmp/l-nexus validate-task <caminho-da-task> --write-plan-hash
# A flag grava `plan_hash` aqui. Depois disso, mexer em qualquer slot e
# replanejar — precisa do humano, nunca de um hash regravado.
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
# Subestado do workflow. `status` acima continua sendo o estado macro.
orchestration:
  mode: manual
  state: pending
  attempts:
    executor: 0
    reworks: 0
    upgrades: 0
# Proveniencia real. Preenchida durante a execucao, nunca antecipada.
model_execution:
  orchestrator:
    agent: ""
    provider: ""
    model: ""
    started_at: ""
  executor:
    combo: ""
    # O modelo que o gateway informou no campo `model` da RESPOSTA. Nao e o nome
    # do combo e nao e o que o modelo diz de si -- perguntado, ele so conhece o
    # combo. Este campo e a unica prova de quem atendeu.
    model: ""
    effort: ""
    # So quando o provedor reporta. Nem todos reportam; nesse caso remova a
    # linha em vez de inventar numero.
    reasoning_tokens: 0
    runner: ""
    run_id: ""
    started_at: ""
  # Cada entrada repete a mesma forma do executor, mais `commit`, `verdict` e
  # -- na revisao -- `findings`. O `model` de cada uma tem que ser o modelo real,
  # porque e comparando esses nomes que se sabe se alguem assinou o proprio
  # trabalho.
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
