# Execution Guidelines

- Ao iniciar uma task, marque a task e `plan.md` como `Em execucao` quando aplicavel.
- Siga `.ai/guidelines/core/environment.md` antes de escolher comandos de execucao local.
- Antes de implementar task executavel, confirme que esta em branch propria da task e nao em branch de PR ja mergeado.
- Antes de modificar codigo, preencha `model_execution.executor` com agente,
  provedor, modelo exato e instante de inicio. Use `unknown` quando o runtime nao
  expuser a identidade; nunca infira.
- Confirme que o executor satisfaz o perfil exigido em `model_plan` e
  `.ai/model-routing.yaml`. Identidade `unknown` nao executa R3 por padrao.
- Nao inicie task que depende de outra task cujo PR ainda nao foi mergeado na branch principal (develop/main). Se houver dependencia aberta, pare e avise o usuario.
- Nao execute pedido generico como "conforme planejado"; exija caminho de task em `.planning/PLAN_VN/tasks/*.md`.
- Se criar ou alterar migrations/seeders, rode-os conforme `.ai/guidelines/stacks/<stack>.md` antes dos testes de aceite.
- Antes de concluir, rode formatacao e o criterio de aceite da task.
- Antes de criar qualquer artefato (model, migration, controller, componente, view), verifique se ele ja existe. Use `find` ou `ls`.
- Antes de encerrar task executavel, confirme o checklist de PR:
  - branch propria da task existe e nao e branch de PR ja mergeado;
  - branch foi enviada para `origin`;
  - PR foi criado no repositorio oficial (conforme `.ai/project.md`);
  - `gh pr view` confirma numero, base, head e estado do PR;
  - relatorio final traz URL do PR.
- Marque entregaveis concluidos com `[x]` apenas depois de implementar e verificar.
- Ao concluir, atualize status da task, progresso/listas em `plan.md` e issue GitHub vinculada.
- Ao concluir task executavel, encaminhe para PR proprio com `Task X.Y` no titulo.
- Antes de concluir, valide a politica de roteamento da task. R3 exige parecer
  aprovado de modelo diferente sobre o commit final e, quando configurado, de
  provedor diferente. R2 segue `project_policy.r2_review`.
- Auto-review do executor nao conta como revisao independente.
- Commit de codigo posterior ao commit registrado pelo revisor invalida o
  parecer e exige nova revisao.
- Se houver falha ou bloqueio, registre na task e comente na issue em vez de marcar concluida.
- O relatorio final deve citar comandos rodados, incluindo migrate/seed quando aplicavel, resultado, arquivos de plano atualizados e issue.
- **PARE E PERGUNTE**: Diante de qualquer ambiguidade, conflito entre especificacao e codigo existente, falta de informacao ou decisao com multiplos caminhos possiveis, PARE imediatamente e pergunte ao usuario. E preferivel interromper o trabalho e aguardar do que supor errado.
- **Sem retrocompatibilidade em dev ativo**: Se o projeto estiver em desenvolvimento ativo (definido no `.ai/project.md` como sem usuarios em producao), nao gaste esforco mantendo rotas, views ou controllers legados/duplicados por compatibilidade. Delete/atualize o antigo em vez de manter ambos em paralelo, a menos que o usuario solicite explicitamente.

## Registro de Evidencias (Anti-Alucinacao)

Toda afirmacao de "fiz", "corrigi", "implementei" ou "funciona" DEVE ter prova.

Prova = comando executado + exit code + resumo (1 linha).

Formato no Log de Evidencias da task:
* YYYY-MM-DD HH:mm - [Acao] `comando` → exit 0 | Resumo: 42 tests passed, 0 failed

Se a saida for longa (>10 linhas), salve em `.planning/PLAN_VN/evidencias/task_X_Y_step_N.log` e referencie:
* YYYY-MM-DD HH:mm - [Acao] `comando` → exit 0 | Ver saida: `.planning/PLAN_VN/evidencias/task_1_2_step_3.log`

Exemplos de provas validas (adapte para a stack do projeto):
- `php spark test → exit 0 | Resumo: Tests: 42, Failures: 0`
- `php spark migrate → exit 0 | Resumo: Migrated: 2026-06-24_CreateUsers`
- `phpstan analyse app/ --level=5 → exit 0 | Resumo: 0 errors`
- `npm test → exit 0 | Resumo: 47 passed, 0 failed`
- `python -m pytest → exit 0 | Resumo: 23 passed`
- `go build ./... → exit 0 | Resumo: compila sem erro`
- `go test -race ./... → exit 0 | Resumo: ok 6 pacotes, 0 falhas, sem data race`
- `go vet ./... → exit 0 | Resumo: 0 diagnosticos`
- `sqlc generate && sqlc vet → exit 0 | Resumo: 12 queries geradas e validadas`
- `goose -dir migrations postgres "$DATABASE_URL" up → exit 0 | Resumo: aplicada 20260816_criar_cotas`

Regras:
- Se nao ha prova, marque o item como `⚠️ Nao verificado` na task.
- Marque `[x]` apenas quando houver prova registrada no Log de Evidencias.
- Log narrativo sem evidencia nao conta como conclusao.
- Erros encontrados devem registrar: erro + causa + correcao + prova de que a correcao funcionou.

## Loop Detection (Circuit Breaker)

Se o mesmo criterio de aceite falhar 3 vezes consecutivas:
1. PARE imediatamente. Nao tente uma quarta abordagem.
2. Registre no Log de Evidencias: as 3 tentativas, o que foi tentado em cada, e o erro.
3. Atualize `.ai/session-memory.md` com o bloqueio.
4. Informe o usuario: "Criterio X falhou 3 vezes. Tentativas: [resumo]. Aguardando orientacao."

Nao continue ate o usuario responder com nova estrategia.

### Limite de iteracoes por task

Se uma task ultrapassar 20 interacoes (turns de conversa) sem ser concluida:
1. Pause e reporte o progresso atual.
2. Atualize `.ai/session-memory.md`.
3. Pergunte ao usuario: "Task X.Y esta em andamento ha 20 interacoes. Progresso: [resumo]. Deseja continuar, pausar ou quebrar em sub-tasks?"

O Context Canary (item 1.1) faz auto-checagem a cada 5 interacoes. O timeout de 20 interacoes e um limite superior — se o canary nao detectou degradacao mas a task ainda nao concluiu, o timeout forca uma pausa.

## Checklist de Encerramento (Obrigatório)

Antes de marcar qualquer task como concluída, confirme TODOS os itens:

- [ ] **Em linguagem compilada, o build passa** (`exit 0`). Codigo que nao compila nao e "quase pronto".
- [ ] **Codigo gerado foi regenerado e commitado** quando o schema ou as queries mudaram (ex.: `sqlc generate`). Codigo gerado desatualizado quebra em runtime, nao no build.
- [ ] Testes relacionados passam (`exit 0`)
- [ ] **Test relevance check:** Pelo menos 1 teste cobre explicitamente o codigo alterado.
  - Confirme que o teste referencia: nome do metodo alterado, rota modificada, ou model/entidade da task.
  - Use `grep` para buscar referencias nos arquivos de teste.
  - Se nenhum teste cobrir: NAO marque como verificado. Adicione teste ou marque como `⚠️ Nao verificado`.
- [ ] Lint/formatacão passam (`exit 0`)
- [ ] `git diff --stat` mostra apenas arquivos esperados para esta task
- [ ] `git diff` não contém: comentários de debug, `dd()`, `var_dump()`, `console.log()`, `fmt.Println` de depuração, `spew.Dump`, `//nolint` sem justificativa, `t.Skip` sem motivo
- [ ] Nenhum arquivo de outra task foi alterado acidentalmente
- [ ] Log de Evidências registrado na task (comando + saída + exit code)
- [ ] Politica de modelo validada para a task; revisao obrigatoria cobre o commit final
- [ ] Nudge de conclusão enviado ao usuario (conforme `.ai/guidelines/core/nudge.md`)
- [ ] Skill `revisar` executada: 3/3 perguntas passaram
- [ ] `plan.md` atualizado com progresso da task
- [ ] `.ai/session-memory.md` atualizado

Se qualquer item falhar, NÃO marque a task como concluída. Corrija e reexecute o checklist.
