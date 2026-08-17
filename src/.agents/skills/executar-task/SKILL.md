---
name: executar-task
description: Localiza, valida e executa a proxima task pendente em .planning/, registrando evidencias de progresso.
disable-model-invocation: false
---

# Executar Task

## Fluxo

1. **Localizar a task:**
   - Leia `.planning/PLAN_VN/plan.md` do plano ativo.
   - Identifique a proxima task com status `backlog` ou `in_progress` na ordem de execucao.
   - Abra apenas o arquivo da task identificada (nao carregue todas as tasks).

2. **Validar a task:**
   - Confirme que a task tem: `id`, `title`, `created_at`, `status`,
     `complexity`, `risk`, `model_plan`, `model_execution` e criterios de aceite.
   - Consulte `.ai/model-routing.yaml` e confirme que risco, perfis e politica de
     revisao sao coerentes.
   - Confirme que existe issue vinculada (GitHub ou local).
   - Se o campo `issue:` apontar para caminho local (ex: `.planning/.../issue_X.md`), a task pode prosseguir.
   - Se for task executavel sem issue alguma, pare e crie a issue primeiro.
   - Se faltar informacao, pare e pergunte ao usuario.

2.5. **Sanity check (pré-execução):**
   - Liste todas as entidades mencionadas na task: tabelas, models, rotas, controllers, views, componentes.
   - Para cada entidade:
     - Se a task diz "alterar" ou "usar" a entidade → verifique que ela EXISTE no codigo base.
     - Se a task diz "criar" a entidade → verifique que ela NAO existe ainda (evitar duplicacao).
   - Use `grep`, `find` ou leitura de diretorio para confirmar.
   - Se alguma verificacao falhar:
     - Registre o problema.
     - PARE. Nao implemente.
     - Informe o usuario: "Entidade X referenciada na task nao existe no codigo. Task precisa ser revisada."
   - Se todas passarem: prossiga para o passo 3.
   - Exemplos de verificacao: model existe? `find app/Models -name "User.php"`; rota ja existe? `grep -r "api/products" app/Config/Routes.php`; migration ja existe? `find app/Database/Migrations -name "*CreateOrders*"`.

3. **Preparar execucao:**
   - > [!IMPORTANT]
     > **BRAINSTORMING E DESIGN PRÉVIO MANDATÓRIO**:
     > Antes de modificar ou criar qualquer arquivo de código operacional do projeto, invoque a skill de `brainstorming` para apresentar sua proposta de design técnico e arquitetura para a tarefa. Faça perguntas uma a uma sobre pontos ambíguos e obtenha aprovação expressa do design pelo usuário. **Não faça suposições nem decida caminhos de implementação de forma silenciosa.**
   - > **Brainstorming para L2:** Para tarefas de complexidade padrao (2-5 arquivos, sem nova regra de negocio), use `brainstorming-lite` em vez de `brainstorming` completo.
   - Atualize `status: in_progress` e `updated_at` com data/hora atual.
   - Antes de editar codigo, preencha `model_execution.executor` com agente,
     provedor, modelo exato e `started_at`. Use `unknown` apenas quando o runtime
     nao expuser a identidade; R3 nao aceita executor `unknown` por padrao.
   - Confirme que esta em branch propria da task (nao em main/develop).
   - Identifique o cargo (`role`) indicado na task (campo `role` no cabecalho ou no corpo da task).
   - Leia o arquivo de role correspondente em `.ai/roles/<role>.md` e assuma o comportamento daquele cargo.
   - Leia as guidelines e skills indicadas pela role antes de iniciar a execucao.

4. **Executar:**
   - Siga os passos do `Plano de Execucao` da task.
   - Atualize a secao `Estado Atual` a cada passo significativo.
   - Pare para fazer perguntas quando surgirem duvidas.
   - Se `.ai/project.md` § Stack tiver o bullet `**Atomic Design:**` marcando o projeto como obrigatorio, leia `.ai/guidelines/core/atomic-design.md` e siga a secao "Durante a execucao" ao pe da letra.

5. **Registrar evidencias:**
    - Toda acao concluida deve ir para `Log de Evidencias` com: data/hora + comando + saida + exit code.
    - Se nao conseguir provar que algo funciona, registre em `Nao Verificado`.
    - Erros encontrados vao para `Erros e Correcoes` com: erro + causa + correcao + prova.
    - Consulte `.ai/guidelines/core/execution.md` secao "Registro de Evidencias".

5.5. **Auto-review:** Execute a skill `revisar` (3 perguntas sobre o proprio diff).
    - Se 3/3 passarem: prossiga.
    - Se alguma falhar: corrija e reexecute.
    - Auto-review nao satisfaz revisao independente exigida por R3 ou pela
      politica configurada para R2.

5.6. **Revisao independente quando exigida:**
    - Encaminhe o commit final a um modelo elegivel que nao seja o executor.
    - Se a politica exigir, use tambem provedor diferente.
    - O revisor registra identidade, commit, timestamp, veredito e achados em
      `model_execution.reviews`.
    - Qualquer commit de codigo posterior exige nova revisao.

6. **Concluir:**
   - Se `.ai/project.md` § Stack tiver o bullet `**Atomic Design:**` marcando o projeto como obrigatorio, siga o "Gate final" de `.ai/guidelines/core/atomic-design.md` antes de marcar a task como `done`.
   - Marque criterios de aceite como `[x]` SOMENTE com prova registrada.
   - Execute o validador de roteamento. Nao conclua enquanto a politica da task
     falhar.
   - Atualize `status: done` e `updated_at`.
   - Atualize `plan.md` com o progresso.
   - Siga o checklist de PR de `.ai/guidelines/core/execution.md`.

## Referencia

- Template de task: `.ai/templates/task.md`
- Regras de execucao: `.ai/guidelines/core/execution.md`
- Regras de planejamento: `.ai/guidelines/core/planning.md`
