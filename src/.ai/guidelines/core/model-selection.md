# Model Selection Guidelines

## Fonte de Verdade

- Consulte `.ai/model-routing.yaml` antes de recomendar, executar ou revisar
  uma task.
- Se o arquivo nao existir, pare e oriente a instalacao ou configuracao do
  roteamento. Nao invente uma politica implicita.
- Se o runtime nao revelar o modelo exato, registre `unknown`. Nunca deduza o
  nome do modelo pelo agente, CLI ou provedor.

## Roteamento por Perfil

1. Classifique separadamente a complexidade (`L1`, `L2`, `L3`) e o risco
   (`R1`, `R2`, `R3`).
2. Resolva em `routes` o perfil minimo de executor e, quando aplicavel, de
   revisor.
3. Selecione em `models` somente modelos `active` cujo perfil e capacidades
   atendam a demanda.
4. Considere avaliacao valida apenas quando houver `last_evaluated` e
   `evidence`. Popularidade, marketing e nome de versao nao sao evidencia.
5. Se nenhum modelo elegivel existir, registre o bloqueio em vez de rebaixar o
   perfil silenciosamente.

Perfis representam capacidade esperada, nao fornecedores fixos:

- `economical`: mudancas localizadas, reversiveis e de baixo risco;
- `balanced`: implementacao delimitada, integracoes e testes usuais;
- `frontier`: arquitetura, regras criticas, investigacao dificil e R3.

## Politica de Revisao

- R1: revisao formal opcional, salvo override do projeto.
- R2: siga `project_policy.r2_review`.
- R3: revisao independente obrigatoria.
- Em R3, executor e revisor devem usar modelos diferentes. Quando
  `project_policy.r3_cross_provider` for `true`, os provedores tambem devem ser
  diferentes.
- A revisao deve apontar para o commit final avaliado. Commit de codigo posterior
  torna o parecer anterior obsoleto.
- Parecer de modelo nunca substitui build, testes, analise estatica, testes de
  integracao ou validacao humana de dominio.

## Registro na Task

- O criador preenche `model_plan.created_by`, perfis exigidos, modelos sugeridos
  e politica de revisao.
- O executor preenche `model_execution.executor` antes de modificar codigo.
- Cada revisor adiciona uma entrada em `model_execution.reviews` com agente,
  provedor, modelo, commit, instante, veredito e resumo dos achados.
- Identidade `unknown` nao satisfaz execucao ou revisao R3 por padrao.

## Saida do Model Router

Sempre informe agente, cargo, complexidade, risco, perfil exigido, modelo
resolvido, politica de revisao e motivo. Para execucao, inclua o caminho exato da
task e a obrigacao de atualizar os registros de execucao e evidencia.
