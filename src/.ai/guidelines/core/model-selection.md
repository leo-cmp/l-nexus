# Model Selection Guidelines

## Fonte de Verdade

- Consulte `.ai/model-routing.yaml` antes de recomendar, executar ou revisar
  uma task.
- Se o arquivo nao existir, pare e oriente a instalacao ou configuracao do
  roteamento. Nao invente uma politica implicita.
- Se o runtime nao revelar o modelo exato, registre `unknown`. Nunca deduza o
  nome do modelo pelo agente, CLI ou provedor.

## Camadas

Modelo, provedor e CLI sao camadas separadas e configuraveis:

```text
ROLE -> MODEL ROUTING (slot + effort) -> CLI RUNNER -> TERMINAL RUNNER
```

Nenhuma delas e fixa no codigo. Perfis representam capacidade esperada, nao
fornecedores fixos, e um modelo nunca tem CLI obrigatoria.

## Roteamento por Perfil

1. Classifique separadamente a complexidade (`L1`, `L2`, `L3`) e o risco
   (`R1`, `R2`, `R3`).
2. Resolva em `routes` o perfil minimo de executor e, quando aplicavel, de
   revisor.
3. Selecione em `models` somente modelos `active` cujo perfil e capacidades
   atendam a demanda. Com `schema_version: 2`, a elegibilidade e resolvida por
   `profile_by_variant[effort]`, nao pelo campo `profile` plano: o mesmo modelo
   pode ser elegivel em `high` e inelegivel em `low`.
4. Considere avaliacao valida apenas quando houver `last_evaluated` e
   `evidence`. Popularidade, marketing e nome de versao nao sao evidencia.
5. Se nenhum modelo elegivel existir, registre o bloqueio em vez de rebaixar o
   perfil silenciosamente.

Perfis representam capacidade esperada, nao fornecedores fixos:

- `economical`: mudancas localizadas, reversiveis e de baixo risco;
- `balanced`: implementacao delimitada, integracoes e testes usuais;
- `frontier`: arquitetura, regras criticas, investigacao dificil e R3.

## Slots e Effort (schema 2)

`modelo + effort` e a unidade real de execucao. Cada papel roteado guarda ate
cinco slots, cada um com seu proprio effort:

| Slot | Significado |
|---|---|
| `default` | preferencia normal |
| `alt1`, `alt2` | alternativas LATERAIS: indisponibilidade, rate limit, custo, provedor, especializacao, restricao de runtime, preferencia humana |
| `upgrade_alt1`, `upgrade_alt2` | escalada VERTICAL: so apos esgotar rework ou quando a tarefa se revelou materialmente maior |

`alt1`/`alt2` nao significam "o default falhou". Efforts permitidos: `default`,
`low`, `high`, `max` — nao invente outros nomes.

O Planner escolhe e PERSISTE esses slots na task; a partir dai a task e o
contrato. `work_routes` no `.ai/model-routing.yaml` guarda as recomendacoes do
projeto por tipo de trabalho e existe para alimentar essa escolha — e
configuracao, nunca decisao fixa de codigo.

Se a CLI escolhida nao aplicar effort, nao registre que aplicou. Quando o effort
e o que torna o modelo elegivel para o perfil exigido, bloqueie.

## Politica de Revisao

- R1: revisao formal opcional, salvo override do projeto.
- R2: siga `project_policy.r2_review`.
- R3: revisao independente obrigatoria.
- O gate de teste segue a mesma forma: R1 opcional, R2 por
  `project_policy.r2_test_gate`, R3 obrigatorio. Tester e Reviewer sao papeis
  distintos: o tester responde "o comportamento observavel esta correto?", o
  reviewer responde "a solucao esta correta, segura e sustentavel?". Nenhum dos
  dois corrige o codigo.
- Em R3, executor e revisor devem usar modelos diferentes. Quando
  `project_policy.r3_cross_provider` for `true`, os provedores tambem devem ser
  diferentes.
- A revisao deve apontar para o commit final avaliado. Commit de codigo posterior
  torna o parecer anterior obsoleto.
- Parecer de modelo nunca substitui build, testes, analise estatica, testes de
  integracao ou validacao humana de dominio.

## Registro na Task

- O criador preenche `model_plan.created_by`, os perfis exigidos, todos os slots
  com seus efforts, a politica de teste/revisao e o `routing_rationale`.
- O executor preenche `model_execution.executor` antes de modificar codigo,
  incluindo `selection` (qual slot foi usado), `effort` e `runner`.
- Quando a execucao for coordenada, o orquestrador registra a propria identidade
  em `model_execution.orchestrator`. Ela e proveniencia: nao e conferida contra
  o catalogo, porque qualquer runtime pode orquestrar.
- Cada revisor adiciona uma entrada em `model_execution.reviews` com agente,
  provedor, modelo, commit, instante, veredito e resumo dos achados.
- Identidade `unknown` nao satisfaz execucao ou revisao R3 por padrao.

## Saida do Model Router

Sempre informe agente, cargo, complexidade, risco, perfil exigido, modelo
resolvido, politica de revisao e motivo. Para execucao, inclua o caminho exato da
task e a obrigacao de atualizar os registros de execucao e evidencia.
