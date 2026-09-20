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
seis slots, cada um com seu proprio effort:

| Slot | Significado |
|---|---|
| `default` | preferencia normal |
| `alt1`, `alt2`, `alt3` | alternativas LATERAIS: indisponibilidade, rate limit, custo, provedor, especializacao, restricao de runtime, preferencia humana |
| `upgrade_alt1`, `upgrade_alt2` | escalada VERTICAL: so apos esgotar rework ou quando a tarefa se revelou materialmente maior |

`alt1`/`alt2`/`alt3` nao significam "o default falhou". `alt3` fecha a fila
lateral e e o lugar do modelo de cota curta: entra por ultimo sem ocupar degrau
de alternativa farta. E opcional — um plano sem `alt3` segue valido.

Duas laterais com o mesmo modelo e o mesmo effort nao sao duas alternativas.
Se `alt2` repete `alt1`, a mesma cota esgotada derruba as duas e o papel fica
sem saida.

Efforts permitidos: `default`, `low`, `high`, `max` — nao invente outros nomes.

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
- Um modelo nao pode aparecer em dois papeis do mesmo `model_plan`. Repetir
  dentro de um papel e permitido; atravessar papeis nao. Se o mesmo modelo pode
  cair como executor e como revisor, mais cedo ou mais tarde ele revisa o
  proprio trabalho e o gate vira assinatura.
- Quem assinou o teste que passou no commit final nao assina a revisao dele. Um
  modelo que ja disse "passou" nao acrescenta independencia nenhuma ao dizer
  "aprovado".
- Quando todo slot de um papel de gate resolve para o mesmo provedor, o papel
  nao tem alternativa legitima: uma cota esgotada deixa o agente sem saida, e
  agente sem saida fabrica uma. O validador avisa; o Planner corrige na origem.
- A revisao deve apontar para o commit final avaliado. Commit de codigo posterior
  torna o parecer anterior obsoleto.
- Parecer de modelo nunca substitui build, testes, analise estatica, testes de
  integracao ou validacao humana de dominio.

## Plano Congelado

O `model_plan` e o contrato, e contrato que o ator medido pode reescrever nao e
contrato. Por isso o bloco carrega `model_plan.plan_hash`: sha256 da
serializacao canonica do proprio bloco, sem o campo do hash.

- Quem cria a task congela o plano ao final da criacao:
  `validate-task <caminho-da-task> --write-plan-hash`.
- Plano sem `plan_hash` valida com aviso, para nao quebrar task antiga.
- Plano com `plan_hash` divergente e erro: prova que o bloco mudou depois de
  congelado.
- Acrescentar, remover ou editar um slot depois disso e replanejar, e
  replanejar exige o humano. Regravar o hash para acomodar a propria edicao e
  fraude, nao correcao.

## Registro na Task

- O criador preenche `model_plan.created_by`, os perfis exigidos, todos os slots
  com seus efforts, a politica de teste/revisao e o `routing_rationale`, e
  congela o bloco com `--write-plan-hash`.
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
