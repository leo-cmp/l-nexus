---
name: lnx-prompt-gerar
description: Gera prompt limpo para iniciar ou continuar trabalho em nova sessao. Le estado atual e produz saida concisa: task, branch, status, proximo passo. Zero fluff, zero redundancia com AGENTS.md.
---

# Gerar Prompt

Produza um prompt para o proximo agente. Apenas fatos. Nada de introducoes, instrucoes ou motivacao — o AGENTS.md do projeto ja faz isso.

## Fluxo

1. **Leia o estado atual:**
   - `.ai/session-memory.md`
   - Task ativa (`.planning/PLAN_VN/tasks/task_X_Y.md`)
   - `git branch --show-current`
   - `git status --short`

2. **Monte o prompt com este formato exato:**

```
[VERBO] [O QUE] — [CONTEXTO MINIMO]

Task: [caminho da task]
Branch: [nome]
Status: [1 linha — o que foi feito, o que falta]
Ultimo comando: [comando] → [exit code e resumo]
Bloqueios: [se houver; se nao, omita esta linha]
Proximo: [acao concreta — 1 linha]
```

3. **Regras de ouro:**
   - NUNCA inclua "Ola", "Voce e um agente", "Chame o usuario de X", "Siga AGENTS.md".
   - NUNCA inclua instrucoes que ja estao no AGENTS.md, roles ou guidelines.
   - NUNCA inclua motivacao ("Vamos fazer um otimo trabalho", "Isso e importante porque...").
   - SEMPRE use verbos no imperativo/infinitivo: "Implementar", "Corrigir", "Revisar".
   - Maximo 10 linhas. Se nao couber, esta muito verboso.

## Exemplo

Entrada: task 1.2 de cadastro de fornecedores, controller update() feito, falta delete().

```
Continuar task 1.2 — Cadastro de fornecedores

Task: .planning/PLAN_V1/tasks/task_1_2.md
Branch: feat/cadastro-fornecedores
Status: Model Supplier + migration ok. Controller store/update ok. Falta: delete() + validacao CNPJ + testes.
Ultimo comando: php spark test --group suppliers → exit 0 | 12 passed, 0 failed
Proximo: Implementar SupplierController::delete(), validar CNPJ com regex, rodar testes
```

## Nota

O prompt gerado e auto-contido. O agente novo le AGENTS.md (bootloader) + este prompt (contexto) + task (detalhes). Nada mais.
