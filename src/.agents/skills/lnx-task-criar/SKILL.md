---
name: lnx-task-criar
description: Cria um arquivo de tarefa técnica estruturado em .planning/PLAN_VN/tasks/task_X_Y.md com critérios de aceite e especificações detalhadas.
disable-model-invocation: false
---

# Criar Task

> [!IMPORTANT]
> **OBRIGATORIEDADE DE BRAINSTORMING E DIÁLOGO**:
> Você **NUNCA** deve criar ou detalhar arquivos de tarefas (`task_X_Y.md`) sem alinhar com o usuário. Antes de preencher as especificações técnicas, utilize a skill de `brainstorming` ou faça perguntas objetivas uma a uma para definir a UI, os fluxos, as origens de dados e os cenários de teste específicos que o usuário espera. Não assuma nem infira regras de negócio por conta própria.

Esta skill deve ser ativada quando o usuário solicitar a criação de uma nova tarefa no plano, ou via comando `/lnx-task-criar`.

## Fluxo

1. **Definir Identificadores:**
   - Localize o plano ativo e a pasta da fase correspondente (ex: `.planning/PLAN_VN/tasks/` ou `planning/PLAN_VN/tasks/`).
   - Defina o ID da tarefa com base no padrão da fase (ex: `task_1_1.md`, `task_1_2.md`).

2. **Utilizar o Template:**
   - Use o arquivo de template `.ai/templates/task.md` como base absoluta para a criação da tarefa.

3. **Preencher com Alta Especificidade:**
   - Siga rigorosamente a **Especificidade Mínima de Planejamento** indicada em `.ai/guidelines/core/planning.md`:
     - **Menus e Navegação**: Indicar onde a funcionalidade será acessada na UI e visibilidade de regras de permissão.
     - **Origem de Dados**: Tabelas, endpoints de API e relacionamentos envolvidos.
     - **Regras de Validação**: Campos obrigatórios, limites de dados e comportamento em erros de entrada.
     - **Cenários de Teste**: Descrever cenários de sucesso (happy path) e falha/limites.
     - **Complexidade e Risco**: Classificar `complexity` e `risk` separadamente,
       listar dominios e explicar o impacto concreto de falha em R2/R3.
     - **Classificacao funcional**: Preencher `routing` com `work_type`,
       `categories`, `technologies` e `required_capabilities`. E o que permite
       escolher a entrada certa de `work_routes`.
     - **Plano de Modelos**: Ver "Resolver o roteamento" abaixo.
     - **Atomic Design** (se `.ai/project.md` § Stack tiver o bullet `**Atomic Design:**` marcando o projeto como obrigatório): leia `.ai/guidelines/core/atomic-design.md` e siga a seção "No planejamento da task" ao pé da letra — liste no Plano de Execução, por camada (Atoms/Molecules/Organisms/Templates/Pages), quais componentes novos serão criados e quais existentes serão reaproveitados.

4. **Resolver o roteamento (obrigatorio):**
   - Consulte `.ai/model-routing.yaml`. Resolva em `routes[risk]` o perfil minimo
     de executor, de tester e de revisor, e a politica de teste/revisao.
   - Escolha a entrada de `work_routes` compativel com `routing.work_type` e
     `routing.categories`. Ela e uma recomendacao do projeto, nao uma imposicao:
     ajuste quando a task exigir.
   - Preencha `model_plan.schema: 2` e `model_plan.created_by` com a sua
     identidade real. Use `unknown` quando o runtime nao expuser o modelo — nunca
     infira pelo nome do agente, da CLI ou do provedor.
   - Escolha e persista, para o **executor**, os cinco slots com effort proprio:
     | Slot | Significado |
     |---|---|
     | `default` | preferencia normal |
     | `alt1`, `alt2` | alternativas LATERAIS: indisponibilidade, rate limit, custo, provedor, especializacao, preferencia humana. **Nao** sao retry do default |
     | `upgrade_alt1`, `upgrade_alt2` | escalada VERTICAL: so quando a tarefa se revelar materialmente maior ou o rework se esgotar |
   - Faca o mesmo para **tester** e **reviewer** (ao menos o `default`), quando o
     gate se aplicar.
   - Efforts permitidos: `default`, `low`, `high`, `max`. Nao invente outros.
   - Confira cada slot: modelo `active` no catalogo, `profile_by_variant[effort]`
     no perfil minimo, `capabilities` cobrindo `required_capabilities`, upgrade
     nunca mais fraco que o default, reviewer diferente do executor quando houver
     independencia e, em R3 com cross-provider, de outro provedor.
   - Explique cada decisao em `routing_rationale`.
   - Deixe `orchestration` no estado inicial (`mode: manual`, `state: pending`,
     contadores em zero) e `model_execution` vazio: proveniencia e preenchida
     durante a execucao, nunca antecipada.
   - Valide antes de salvar:
     ```bash
     npx @leo-cmp/l-nexus validate-task <caminho-da-task>
     ```
     Corrija o que o validador apontar em vez de relaxar o roteamento.

5. **Criar a Issue no GitHub:**
   - Confirme o repositório oficial (`git remote -v` ou `gh repo view`) conforme `.ai/project.md` antes de criar qualquer coisa remota.
   - Verifique se o cabeçalho da task já tem `issue:` preenchido. Se sim, reuse — não crie de novo.
   - Se vazio, monte o corpo da issue:
     - **Historia**: infira "Como [persona], quero [ação], para [benefício]" a partir do `Objetivo` da task e confirme com o humano antes de criar (não assuma silenciosamente).
     - **Criterios de Aceite**: copie da seção homônima da task.
     - **Contexto Tecnico**: link do `plan.md`, caminho da task local,
       complexidade, risco, work type/categorias, slots de executor com effort,
       politica de teste/revisao e cargo.
   - Busque por uma Issue existente com título igual a `[Task X.Y] Título descritivo`. Se encontrar, vincule em vez de duplicar.
   - Se não existir, crie com `gh issue create --title "[Task X.Y] Título descritivo" --milestone "VN - Nome da fase" --body "..."` e salve a URL retornada no campo `issue:` do cabeçalho da task.
   - Se a chamada ao `gh` falhar (auth, rede, permissão), pare e avise o humano — nunca prossiga sem o vínculo da issue.
   - Atualize a lista/tabela de tarefas no `plan.md` com a nova tarefa no status `backlog` e a URL da issue.
