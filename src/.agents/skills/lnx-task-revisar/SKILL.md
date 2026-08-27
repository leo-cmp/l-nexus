---
name: lnx-task-revisar
description: >
  Code review leve do proprio diff. Use antes de abrir PR ou marcar task como concluida.
  Foco: bugs obvios, seguranca, debug artifacts, desvios do plano.
---

# Revisar

Revise seu proprio diff com 3 perguntas. Responda cada uma com evidencias.

## As 3 Perguntas

1. **Debug artifacts:** `git diff` contem `dd()`, `var_dump()`, `dump()`, `console.log()`, `die()`, comentarios de "TODO" ou "FIXME" nao planejados?
   - Se sim: remova AGORA. Nao comite debug artifacts.

2. **Seguranca:** O diff introduz `float` para dinheiro? Query sem bindings? Rota sem middleware de auth? Dado de usuario sem validacao?
   - Se sim: corrija AGORA. Siga `.ai/guidelines/stacks/<stack>.md` e `.ai/guidelines/core/database.md`.

3. **Desvio do plano:** O diff implementa algo que NAO esta nos criterios de aceite da task?
   - Se sim: remova o codigo extra OU atualize a task para incluir o novo escopo (com aprovacao do usuario).
   - "Enquanto tava aqui ja aproveitei e..." → REVERTA. Foco na task.

## Apos as 3 Perguntas

- Se todas passarem: prossiga para o checklist de encerramento (`execution.md`).
- Se alguma falhar: corrija, rode testes de novo, e reexecute as 3 perguntas.
- Registre o resultado no Log de Evidencias da task: `revisar: 3/3 passaram (exit 0)`.
