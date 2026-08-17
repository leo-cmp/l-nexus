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
model_plan:
  created_by:
    agent: "[agente]"
    provider: "[provedor ou unknown]"
    model: "[modelo exato ou unknown]"
  executor_profile: "[economical | balanced | frontier]"
  suggested_models: []
  reviewer_profile: "[economical | balanced | frontier]"
  review_required: "[true | false]"
  cross_provider_required: "[true | false]"
model_execution:
  executor:
    agent: ""
    provider: ""
    model: ""
    started_at: ""
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
