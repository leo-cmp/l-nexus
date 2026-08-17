# Gin Guidelines

HTTP com Gin e acesso a dados com sqlc e pgx. Pressupoe `go.md` para regras da
linguagem. Migrations estao em `goose.md`.

## Defaults de Projeto Novo

> Valem quando o projeto nao definiu outra coisa. Para divergir, registre em
> `.ai/decisions.md` com contexto, rationale e impacto. Nao edite este arquivo
> para acomodar um projeto especifico.

- HTTP: Gin.
- Acesso a dados: sqlc v2 com `engine: postgresql` e `sql_package: pgx/v5`.
- Migrations: Goose, conforme `goose.md`.
- Layout: conforme a secao Arquitetura.

Regras fora deste bloco sao normativas e nao dependem de escolha de projeto.

- Verifique `go.mod`, `sqlc.yaml`, `Makefile` e pacotes vizinhos antes de
  decidir versoes, layout ou comandos.
- Preserve ferramenta equivalente ja adotada pelo projeto. Nao mantenha duas
  bibliotecas para a mesma responsabilidade sem necessidade comprovada.

## Arquitetura

Layout de referencia para projetos novos:

```text
cmd/api/                 composicao, servidor e shutdown
internal/transport/http/ handlers, DTOs, middleware e rotas
internal/domain/         entidades, erros e contratos
internal/service/        casos de uso e regras de negocio
internal/database/       sqlc gerado e adapters de persistencia
internal/platform/       config, logs e integracoes
migrations/              migrations Goose
queries/                 SQL de aplicacao
```

- Em repositorio existente, siga limites equivalentes em vez de reorganizar
  pacotes sem solicitacao.
- Monte dependencias explicitamente em `cmd/api`; evite service locator.
- Mantenha handlers focados em bind, validacao, chamada ao service e resposta.
- Services nao recebem `*gin.Context` e nao conhecem status HTTP.
- Evite repository que apenas repete, sem adaptacao, cada metodo gerado pelo
  sqlc.
- Nao exponha DTOs HTTP ou structs geradas pelo sqlc como entidades de dominio
  quando isso acoplar regra de negocio ao transporte ou schema.

## HTTP e Rotas

- Declare rotas explicitamente e agrupe por versao, dominio e politica de
  middleware.
- Prefira `gin.New()` e registre logger e recovery explicitamente para manter
  configuracao e ordem visiveis.
- Use DTOs tipados com tags `json`, `form` e `binding` adequadas.
- Para endpoints JSON, prefira `ShouldBindJSON` a metodos `Bind*`, pois o
  handler mantem controle da resposta de erro.
- Em DTO de resposta, use ponteiro quando "ausente" e diferente de "zero";
  `omitempty` omite `0`, `""` e `false`.
- Limite o corpo antes do binding e imponha limites proprios para uploads.
- Valide formato no handler e regra de negocio no service.
- Use `c.Request.Context()` ao chamar services e integracoes.
- Use verbos e status HTTP semanticos. Rotas de criacao usam `POST`, atualizacao
  idempotente usa `PUT`, atualizacao parcial usa `PATCH` e exclusao usa
  `DELETE`.
- Retorne JSON consistente. Nao use `gin.H` como contrato publico quando um DTO
  nomeado tornar o formato mais claro e testavel.
- Centralize traducao de erros com `errors.Is` e `errors.As`; nunca retorne
  `err.Error()` indiscriminadamente ao cliente.
- Middleware encerra fluxo negado com `Abort*` e `return`. Registre middleware
  antes das rotas que ele protege.
- Quando o projeto expuser contrato publico de API, mantenha as anotacoes de
  documentacao junto ao handler e regenere a especificacao ao alterar rota ou
  DTO.

## Observabilidade

- Use log estruturado com `log/slog`. Nao use `fmt.Println` nem log de texto
  livre em codigo de producao.
- Gere um identificador de correlacao por requisicao em middleware, inclua-o em
  todo log daquela requisicao e devolva-o em cabecalho de resposta.
- Registre metodo, rota, status e duracao. Nao registre corpo por padrao.
- Exponha verificacao de vivacidade e de prontidao em rotas separadas: vivacidade
  responde se o processo esta de pe; prontidao so responde sucesso quando as
  dependencias obrigatorias respondem.
- Exponha profiling apenas em rede interna, nunca em rota publica.

## Banco de Dados

- Mantenha queries SQL versionadas em `queries/`. Codigo gerado fica em pacote
  identificado e nunca recebe edicao manual.
- Nunca use `SELECT *` em query de producao. Liste colunas para manter contrato
  e geracao previsiveis.
- Use parametros do sqlc; concatenacao de input em SQL e proibida.
- Propague `context.Context` em toda query.
- Ordene listagens de modo deterministico e imponha limite de pagina.
- Crie indices para padroes reais de `WHERE`, `JOIN` e `ORDER BY`; valide
  queries criticas com `EXPLAIN (ANALYZE, BUFFERS)` em ambiente seguro.
- Delimite transacao no caso de uso que exige atomicidade. Use `Queries.WithTx`
  e garanta rollback em todo caminho de erro.
- Configure e feche `pgxpool.Pool`; valide conectividade no startup quando o
  banco for dependencia obrigatoria.
- Dimensione o pool com conta, nao com valor padrao: a soma do maximo de
  conexoes de todas as instancias que apontam para o mesmo servidor nao pode
  exceder o limite de conexoes dele. Defina tambem tempo de vida maximo da
  conexao.
- Valor monetario usa coluna `NUMERIC` e tipo decimal na aplicacao, conforme
  `go.md`.
- Execute `sqlc generate` e `sqlc vet` apos alterar schema ou queries.

## Concorrencia e Confiabilidade

Regras gerais de goroutine, `context` e panic estao em `go.md`. Aqui, apenas o
que e especifico do servidor HTTP.

- Nunca use `*gin.Context` fora do ciclo sincrono do handler. Copiar o contexto
  nao transforma trabalho em job duravel.
- Configure `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` e `IdleTimeout`
  no `http.Server` conforme o perfil da aplicacao.
- Configure timeout em todo cliente HTTP de saida e sempre feche o corpo da
  resposta.
- Implemente shutdown gracioso com sinal, prazo finito, `Server.Shutdown` e
  fechamento do pool depois de parar novas requisicoes.

## Seguranca

- Autentique em middleware; autorize a acao e o recurso no service.
- Configure CORS por allowlist. Nao combine origem wildcard com credenciais.
- Leia secrets de ambiente ou provedor dedicado e valide-os no startup.
- Nunca registre senha, token, cookie, secret, cabecalho de autorizacao ou corpo
  sensivel.
- Aplique limite de corpo, upload, taxa e duracao conforme risco do endpoint.
- Use hash de senha adequado e comparacao segura. Nunca armazene senha
  reversivel.
- Nao exponha detalhes internos em respostas de autenticacao ou erros 5xx.

## Testes e Comandos

- Use `testing` e `httptest` para handlers e middleware. Ative `gin.TestMode`.
- Teste services com doubles pequenos das interfaces que eles consomem.
- Teste queries, constraints e migrations contra PostgreSQL real.
- Cubra commit, rollback, conflito e cancelamento em fluxos transacionais.
- Execute race detector para codigo com goroutines ou estado compartilhado.

Comandos base, respeitando wrappers existentes no projeto:

```bash
go fmt ./...
go vet ./...
go test ./...
go test -race ./...
sqlc generate
sqlc vet
```

Comandos de migration estao em `goose.md`.

## Skills

- `gin-best-practices`: use como referencia ao escrever, revisar ou refatorar
  codigo Gin, sqlc, pgx, concorrencia, seguranca e testes.
