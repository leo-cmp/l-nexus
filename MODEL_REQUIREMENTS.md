# Model Requirements and Routing

O l-nexus seleciona modelos por perfil, capacidade avaliada e risco da task. O
núcleo não mantém um ranking permanente de fornecedores: nomes e desempenho
mudam, e uma avaliação genérica não substitui resultados no projeto real.

## Perfis

| Perfil | Rank | Uso esperado |
|---|---:|---|
| `economical` | 1 | Mudanças localizadas, reversíveis e de baixo risco |
| `balanced` | 2 | Implementação delimitada, integrações e testes usuais |
| `frontier` | 3 | Arquitetura, investigação difícil e tarefas R3 |

O rank permite que um perfil superior satisfaça uma exigência inferior. O perfil
é um requisito mínimo. Custo maior não prova adequação, e um modelo não deve ser
promovido de perfil somente pelo nome comercial.

## Catálogo do Projeto

Configure os modelos disponíveis em `.ai/model-routing.yaml`:

```yaml
models:
  provider-model-version:          # esta chave e o identificador usado nas tasks
    provider: provider
    model: "id-de-api"             # id exposto pelo provedor (informativo)
    profile: balanced              # perfil no esforco padrao
    profile_by_variant:            # perfil efetivo por esforco
      default: balanced
      low: economical
      high: frontier
      max: frontier
    status: active
    capabilities: [backend, tests]
    last_evaluated: 2026-08-16
    evidence: "resultado da avaliação local"
```

As tasks referenciam a **chave do catálogo** (`provider-model-version`), não o
`model:` de API. Isso mantém uma única fonte de verdade para provedor, perfil e
capacidades.

Use identificadores versionados quando o provedor os oferecer. Alias móvel pode
ser registrado, mas a evidência precisa informar qual versão foi efetivamente
avaliada.

## Esforço e Perfil Efetivo

`modelo + esforço` é a unidade real de execução: o mesmo modelo em `low` e em
`max` não entrega a mesma capacidade. Esforços permitidos: `default`, `low`,
`high`, `max`.

Com `schema_version: 2`, a elegibilidade é resolvida por
`profile_by_variant[effort]`, não pelo campo `profile` plano. Se a task exige
`balanced` e o modelo declara `low: economical` e `high: balanced`, então
`{model: X, effort: low}` é rejeitado e `{model: X, effort: high}` é aceito.

Uma CLI que não sabe aplicar esforço não recebe crédito por ele. Declare
`effort.supported: true` em `cli_runners` **apenas** quando a CLI realmente
aplicar. Quando o esforço é o que torna o modelo elegível para o perfil exigido,
um runner sem suporte é rejeitado — em vez de fingir que o esforço foi aplicado.

## Slots de Roteamento

Cada papel roteado guarda até cinco opções, cada uma com o seu esforço:

| Slot | Significado |
|---|---|
| `default` | preferência normal |
| `alt1`, `alt2` | alternativas **laterais**: indisponibilidade, rate limit, custo, provedor, especialização, preferência humana. Não são retry do default |
| `upgrade_alt1`, `upgrade_alt2` | escalada **vertical**: só depois de esgotar o rework ou quando a tarefa se revelar materialmente maior |

Um upgrade nunca pode resolver para um perfil mais fraco que o `default`.

As recomendações do projeto por tipo de trabalho vivem em `work_routes`. Elas
selecionam modelos **dentro** do piso definido por `routes`, e nunca podem
enfraquecê-lo: o validador confere os slots contra a rota do risco.

## Capacidades

O projeto pode usar capacidades adequadas ao seu domínio. Um conjunto inicial
útil inclui:

- `planning`: decomposição, dependências e critérios de aceite;
- `backend`: implementação de serviços e integrações;
- `frontend`: componentes, estado e acessibilidade;
- `database`: schema, migrations, SQL e análise de planos;
- `tests`: criação e diagnóstico de testes relevantes;
- `review`: busca de bugs, regressões e violações de contrato;
- `security`: autenticação, autorização, secrets e dados sensíveis;
- `long-context`: reconciliação de especificações e bases extensas.

Capacidades não são notas decorativas. O roteador só deve selecionar um modelo
quando as capacidades exigidas pela task estiverem registradas.

## Avaliação

Cada entrada ativa deve declarar:

1. `last_evaluated`: data da avaliação mais recente;
2. `evidence`: referência curta ao experimento, relatório ou conjunto de tasks;
3. `capabilities`: áreas realmente observadas;
4. `profile`: classe sustentada pelos resultados;
5. `status`: `active` apenas enquanto o modelo estiver disponível e confiável.

Avalie com exemplos do projeto e guarde resultados verificáveis, como:

- taxa de build e testes aprovados sem correção manual;
- aderência ao escopo e aos arquivos autorizados;
- bugs funcionais encontrados por revisão independente;
- respeito a contratos, migrations e regras de segurança;
- quantidade de retrabalho até satisfazer os critérios de aceite;
- custo e latência quando forem relevantes para o fluxo.

Reavalie após mudança relevante de versão ou quando resultados reais divergirem
do perfil registrado.

## Identidade

Registre o modelo exato exposto pelo runtime. Quando essa informação não estiver
disponível, use `unknown`; nunca deduza o modelo pelo nome da CLI ou do agente.
Por padrão, identidade `unknown` não pode executar nem aprovar R3.

## Gate de Teste

Tester e Reviewer são papéis distintos e nenhum deles corrige código:

- **Tester**: build passa? lint passa? testes passam? critérios verificáveis
  passam? há regressão observável?
- **Reviewer**: a solução está correta? há falha arquitetural, risco, edge case,
  duplicação, problema de manutenibilidade ou vulnerabilidade?

- R1: gate de teste opcional.
- R2: `project_policy.r2_test_gate` define `required` ou `optional`.
- R3: gate de teste obrigatório.

Quando o gate é obrigatório, a task só conclui com uma execução `passed` sobre o
commit final.

## Independência da Revisão

- R1: revisão formal opcional.
- R2: `project_policy.r2_review` define `required` ou `optional`.
- R3: revisão obrigatória por modelo diferente.
- Quando `project_policy.r3_cross_provider` for `true`, R3 exige também provedor
  diferente.
- O revisor registra o commit analisado. Commit de código posterior invalida a
  aprovação.

Um segundo modelo reduz correlação de erro, mas não prova correção. Build,
análise estática, testes de integração, contratos externos e validação humana de
domínio continuam obrigatórios conforme a task.
