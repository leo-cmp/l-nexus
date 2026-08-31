# Planning Guidelines

- Repositorio oficial para issues, milestones e PRs: conforme `.ai/project.md`.
- Confirme o repositorio com `git remote -v` ou `gh repo view` antes de criar, consultar, comentar ou fechar issues.
- Se o repositorio local nao bater com o de `.ai/project.md`, pare e alerte o humano.
- Cada `.planning/PLAN_VN` representa uma fase local e um milestone no GitHub.
- O nome publico do milestone deve ser humano: `VN - Nome da fase`, nao `PLAN_VN`.
- O ponto de entrada da fase deve ser `.planning/PLAN_VN/plan.md`, criado a partir de `.ai/templates/plan.md`.
- Cada task em `.planning/PLAN_VN/tasks/*.md` deve ter uma GitHub Issue correspondente.
- Titulo de Issue de task: `[Task X.Y] Titulo descritivo` (ex.: `[Task 1.2] Cadastro de fornecedores`).
- Corpo da Issue: secao "Historia" (Como [persona], quero [acao], para [beneficio] — inferida do `Objetivo` da task e confirmada com o humano antes de criar), secao "Criterios de Aceite" (copiada da task) e secao "Contexto Tecnico" (link do plano, link/caminho da task local, modelo recomendado e cargo).
- **Criacao automatica via `gh`**: as skills `criar-plano` e `criar-task` devem criar milestone/issue diretamente via `gh` (nao apenas orientar o humano a criar manualmente). Antes de criar, confirme o repositorio oficial (`git remote -v` ou `gh repo view`) conforme `.ai/project.md`.
- **Idempotencia e duplicidade**: antes de criar milestone ou issue, verifique primeiro a referencia local (`milestone:` em `plan.md`, `issue:` em `task.md`) — se ja preenchida, reuse e nao crie de novo. Se vazia, busque no GitHub por titulo igual; se ja existir, vincule ao existente em vez de duplicar. Crie apenas se nada for encontrado.
- **Falha de `gh` — fallback offline**: se `gh` CLI nao estiver disponivel ou falhar (auth, rede, permissao):
  1. Crie a issue como arquivo local: `.planning/PLAN_VN/issues/issue_X.md`
  2. Formato do arquivo: use o template `.ai/templates/issue-local.md`
  3. No campo `issue:` do cabecalho da task, preencha com o caminho local: `issue: .planning/PLAN_VN/issues/issue_X.md`
  4. Marque a task como `⚠️ issue pendente de sincronizacao com GitHub`
  5. Quando `gh` estiver disponivel, rode `scripts/sync-github.sh` (item 5.2) para criar as issues no GitHub
- **Criacao de milestones offline:** mesmo principio. Crie `.planning/PLAN_VN/milestone.md` localmente.
- Cada task executavel deve resultar em um PR proprio; agrupamento de tasks exige autorizacao explicita do humano.
- Cada issue deve apontar para o arquivo local da task, e cada task deve guardar a issue.
- Agentes devem ler `plan.md` e apenas a task atual, nao todas as tasks por padrao.
- `index.md` e `roadmap.md` nao devem coexistir com `plan.md` para evitar duplicidade.
- Toda demanda que virar trabalho deve ter task local antes de ir para execucao.
- Toda task local deve ter issue vinculada (GitHub ou local) antes de ir para execucao, salvo bloqueio explicito.
- Ao criar task, atualize `plan.md` com status, issue, progresso/listas e ordem de execucao.
- Toda task executavel deve declarar no cabecalho `complexity`, `risk`,
  `routing`, `model_plan`, `routing_rationale`, `orchestration` e
  `model_execution`, conforme `.ai/templates/task.md`.
- O bloco `routing` classifica funcionalmente a demanda: `work_type`,
  `categories`, `technologies` e `required_capabilities`. E o que permite o
  Planner escolher a entrada certa de `work_routes`.
- Complexidade mede escopo e coordenacao; risco mede a consequencia de uma
  implementacao incorreta. Classifique os dois e nunca use quantidade de
  arquivos como substituto do risco.
- Consulte `.ai/model-routing.yaml` para resolver perfil de executor, slots de
  modelo e politica de revisao/teste. Nao fixe fornecedor como preferencia
  global e nao acople modelo a uma CLI especifica.
- O Planner resolve e PERSISTE o roteamento completo na task: para o executor,
  os cinco slots (`default`, `alt1`, `alt2`, `upgrade_alt1`, `upgrade_alt2`),
  cada um com seu `effort`; para tester e reviewer, ao menos o `default`.
  `alt1`/`alt2` sao alternativas laterais, `upgrade_alt*` sao escalada vertical.
- Cada escolha precisa ser auditavel em `routing_rationale`.
- Risco R2 ou R3 exige `risk.rationale` explicando o impacto concreto da falha.
- Dominios listados em `risk_domains.generic_r3` sao R3 por padrao. O projeto
  pode acrescentar dominios, mas nao rebaixar um dominio R3 obrigatorio.
- R3 sempre exige revisao independente. R2 segue
  `project_policy.r2_review`. R1 permite revisao opcional.
- O bloco de risco e roteamento deve ficar no front matter para que a decisao
  seja visivel e validavel sem interpretar texto livre.
- Tasks legadas com `modelo_recomendado`, `substitutos` e `motivo` devem passar
  por `l-nexus migrate-task <task> --write`. Revise a classificacao conservadora
  `R3/legacy-unclassified` antes da execucao; a migracao nao comprova identidade
  nem revisao historica.
- Tasks no schema 1 continuam validas. Para adotar os slots, rode
  `l-nexus migrate-task <task> --to 2 --write`: a migracao reformata a task mas
  nao inventa modelo nem effort, marca `needs_manual_routing: true` e o
  validador reprova ate um humano completar o roteamento e remover a marca.
- Ao criar nova task, use o template de `.ai/templates/task.md` como base.
- Para tarefas L1/R1, use `.ai/templates/task-short.md`. Uma task pequena com
  risco R2 ou R3 usa obrigatoriamente o template completo.
- Ao criar task, verifique se o escopo estimado ultrapassa 10 arquivos. Se sim, quebre em sub-tasks antes de criar a task.
- O campo `Plano de Execucao` da task deve listar os arquivos esperados.
- Toda task deve ter `created_at` preenchido na criacao e `updated_at` atualizado a cada mudanca de status ou progresso significativo.
- A secao `Estado Atual` da task deve refletir o ultimo ponto de parada para facilitar handoff entre sessoes.

## Especificidade Minima de Planejamento

Para evitar retrabalho e ambiguidade, todo plano ou especificacao de task deve respeitar os seguintes criterios minimos:

1. **Menus e Navegacao**: Especifique exatamente onde o novo recurso/tela sera acessado no painel, incluindo links de menu, botoes de atalho, Breadcrumbs e regras de visibilidade (roles/permissoes).
2. **Origem de Dados**: Indique claramente de qual tabela, endpoint API ou Service vem cada dado que sera exibido na tela, alem de listar dependencias de relacionamentos de banco de dados.
3. **Regras de Validacao**: Liste explicitamente os campos obrigatorios, tipos de dados, limites de caracteres e comportamentos esperados do backend em caso de falha de validacao (ex: redirects, flash messages).
4. **Cenarios de Teste**: Descreva pelo menos 2 cenarios de teste basicos na task: um de sucesso (happy path) e um de erro/excecao (ex: tenant diferente, dados duplicados, input vazio).
5. **Analise de Requisitos**: Antes de propor o plano de uma fase, revise as diretrizes de regras de negocio do projeto (`.ai/guidelines/domain/business-rules/`) e identifique potenciais conflitos ou restricoes tecnicas da stack.
