# Go Guidelines

Regras da linguagem. Valem para qualquer binario Go: API, worker, CLI ou
Control Plane. Para HTTP e acesso a dados, leia tambem `gin.md`. Para
migrations, leia `goose.md`.

## Defaults de Projeto Novo

> Valem quando o projeto nao definiu outra coisa. Para divergir, registre em
> `.ai/decisions.md` com contexto, rationale e impacto. Nao edite este arquivo
> para acomodar um projeto especifico.

- Versao: Go 1.22 ou superior.
- Layout: `cmd/` para binarios, `internal/` para codigo privado.
- Dinheiro: `github.com/shopspring/decimal`.
- Log: `log/slog` da biblioteca padrao.
- Lint: `go vet` e `golangci-lint`.

## Codigo e Nomenclatura

- Verifique `go.mod`, `go.work` e pacotes vizinhos antes de decidir versoes,
  layout ou dependencias.
- Formate com `gofmt`. Estilo nao e assunto de revisao.
- Use MixedCaps. Nunca `snake_case` em identificador Go.
- Nome de pacote e curto, minusculo, sem underscore e sem plural: `lead`, nao
  `leads` nem `lead_service`.
- Evite repeticao entre pacote e tipo. Prefira `lead.Service` a
  `lead.LeadService`.
- Inicial maiuscula exporta o identificador. Exporte apenas o necessario.
- Use `internal/` para impedir import externo do que nao e API publica.
- Um pacote resolve uma responsabilidade. Import ciclico e erro de projeto,
  nao obstaculo a contornar.
- Nao use `init()`. Inicialize explicitamente no `main` ou em construtor.
- Nao use estado global mutavel. Passe dependencia por construtor.
- `log.Fatal` e `os.Exit` so no `main`, durante a inicializacao. Nunca em
  biblioteca, handler ou service.

## Tipos e Valores

- Prefira tipo concreto no retorno e interface no parametro.
- Declare interface no pacote que consome, nao no que implementa. Crie
  interface somente quando houver limite real de teste, dominio ou
  infraestrutura.
- Mantenha interfaces pequenas. Interface com muitos metodos indica limite mal
  definido.
- Padronize o receiver do tipo: se um metodo usa ponteiro, todos usam.
- Use ponteiro quando o valor precisa ser alterado, quando a struct e grande ou
  quando `nil` distingue "ausente" de "zero".
- Inicialize map com `make` antes de escrever. Escrita em map `nil` gera panic.
- Nao dependa da ordem de iteracao de map. Ela e aleatoria por design.
- `append` pode compartilhar o array subjacente. Copie com `slices.Clone` antes
  de guardar ou devolver uma slice recebida.
- Dinheiro usa `decimal.Decimal` e coluna `NUMERIC`. `float32` e `float64` sao
  proibidos para valor monetario, inclusive em variavel intermediaria.
- Converta string para numero decimal com parser explicito. Nunca via `float`.
- Trate `time.Time` zero com `IsZero()`. Persista instantes em UTC e converta
  apenas na borda de apresentacao.
- Em JSON, use ponteiro quando "ausente" e diferente de "zero". `omitempty`
  omite `0`, `""` e `false`.

## Erros

- Erro e valor de retorno. Nao use `panic` para regra de negocio.
- Trate ou propague todo erro. Ignorar exige `_ =` explicito.
- Acrescente contexto ao propagar entre camadas com `fmt.Errorf` e `%w`.
- Mensagem de erro comeca em minuscula e nao termina com pontuacao.
- Declare erro sentinela (`var ErrAlgo = errors.New(...)`) quando quem chama
  precisa distinguir o caso.
- Compare com `errors.Is` e extraia com `errors.As`. Nunca compare texto de
  erro.
- Nao exponha `err.Error()` interno ao usuario final.
- Use `defer` para liberar recurso na mesma linha em que ele e adquirido.
- Nao use `defer` dentro de loop. Extraia o corpo do loop para uma funcao.
- `recover` e rede de seguranca de fronteira: middleware HTTP, goroutine
  disparada e loop principal de worker. Em nenhum outro lugar.

## Concorrencia

- Panic nao recuperado encerra o processo inteiro, nao apenas a requisicao em
  curso.
- `recover` so alcanca a propria pilha. Middleware de recovery do servidor HTTP
  nao protege goroutine disparada por voce.
- Toda goroutine disparada precisa de owner, cancelamento, limite e estrategia
  de erro e de panic.
- Nao dispare goroutine sem saber quem espera por ela e quando ela termina.
- Trabalho que precisa sobreviver ao processo pertence a fila ou worker
  persistente, nao a goroutine solta.
- `context.Context` e o primeiro parametro de toda funcao que faz I/O. Nunca o
  guarde dentro de struct.
- Toda chamada externa tem timeout explicito. Sempre chame o `cancel` de
  `context.WithTimeout` via `defer`.
- Propague cancelamento ate o banco e os clientes externos.
- Estado compartilhado mutavel exige `sync.Mutex` ou `sync.RWMutex`. Map nao e
  seguro para concorrencia.
- Cache em memoria exige TTL e limite de tamanho. Sem os dois, e vazamento.
- Paralelismo tem grau limitado. Use `errgroup` com limite em vez de disparar
  uma goroutine por item.

## Testes

- Use `testing` da biblioteca padrao. Escreva testes table-driven.
- Nomeie subtestes com `t.Run` descrevendo o caso, nao o numero.
- Use `t.Helper()` em funcao auxiliar de teste.
- Execute `go test -race` sempre que houver goroutine ou estado compartilhado.
- Teste regra de negocio contra doubles pequenos das interfaces consumidas.
- Teste integracao com dependencia real quando o comportamento depender dela.
- Nao remova nem enfraqueca teste para fazer build passar.

## Ferramentas

```bash
go build ./...
go vet ./...
gofmt -l .
go test ./...
go test -race ./...
go mod tidy
```

- Use `go get` para dependencias. Nunca edite `go.mod` manualmente para simular
  instalacao.
- Prefira a biblioteca padrao. Justifique dependencia nova.
- Nao mantenha duas bibliotecas para a mesma responsabilidade sem necessidade
  comprovada.
