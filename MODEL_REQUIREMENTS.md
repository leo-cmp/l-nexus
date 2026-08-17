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
  provider-model-version:
    provider: provider
    profile: balanced
    status: active
    capabilities: [backend, tests]
    last_evaluated: 2026-08-16
    evidence: "resultado da avaliação local"
```

Use identificadores versionados quando o provedor os oferecer. Alias móvel pode
ser registrado, mas a evidência precisa informar qual versão foi efetivamente
avaliada.

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
