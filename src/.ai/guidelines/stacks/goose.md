# Goose Guidelines

Migrations SQL versionadas com `pressly/goose`. Vale para qualquer projeto Go
com banco relacional, com ou sem HTTP. Leia tambem `go.md`. Para queries e pool
de conexao, leia `gin.md`.

## Defaults de Projeto Novo

> Valem quando o projeto nao definiu outra coisa. Para divergir, registre em
> `.ai/decisions.md` com contexto, rationale e impacto.

- Ferramenta: `pressly/goose` v3.
- Diretorio: `migrations/`.
- Formato: SQL com anotacoes `-- +goose`.
- Prefixo: timestamp (`20260816143000_criar_leads.sql`).
- Aplicacao: comando explicito em desenvolvimento; no startup do binario quando
  o deploy for por container.
- Lock de sessao: habilitado.

## Escrita de Migration

- Cada arquivo tem uma secao `-- +goose Up` e, por padrao, uma `-- +goose Down`
  capaz de desfazer a mudanca.
- Uma migration trata uma mudanca coesa. Nao misture DDL amplo com carga de
  dados sem necessidade.
- Use prefixo de timestamp ou numero de largura fixa. Ferramentas de geracao de
  codigo leem migrations em ordem lexicografica.
- Nunca edite migration ja aplicada em ambiente compartilhado. Crie uma nova.
- Nao gere migration com `SELECT *` nem dependa de ordem implicita de coluna.
- Migration em Go (`goose.AddMigrationContext`) e permitida apenas para
  transformacao de dados que exige logica. Estrutura e sempre SQL.

## Transacao e Seguranca de Aplicacao

- Migration roda em transacao por padrao. Falha no meio desfaz tudo, e a
  proxima execucao repete o arquivo com seguranca.
- Use `-- +goose NO TRANSACTION` somente para operacao que nao pode executar em
  transacao, como `CREATE INDEX CONCURRENTLY`, e justifique no proprio arquivo.
- Migration `NO TRANSACTION` pode ficar parcialmente aplicada sem sinalizacao.
  Escreva-a de forma idempotente (`IF NOT EXISTS`, verificacao previa) e
  mantenha-a minima.
- Migration de dados deve ser idempotente e suportar reexecucao.

## Concorrencia na Aplicacao

- Habilite lock de sessao (advisory lock) sempre que a aplicacao das migrations
  for automatica. O goose nao o ativa por padrao.
- Nao trate isso como opcional nem pergunte ao humano. Habilitar sem
  necessidade custa milissegundos no startup; nao habilitar quando havia
  necessidade produz migration aplicada em duplicidade, que falha tarde e de
  forma silenciosa. Desabilitar exige registro em `.ai/decisions.md`.
- Sem lock, duas instancias leem a mesma versao corrente e aplicam a mesma
  migration em paralelo, causando erro de objeto duplicado ou dado duplicado.
- Confirme a API de lock na versao fixada em `go.mod` antes de usar; ela mudou
  ao longo do v3.
- Cubra o cenario com teste: duas instancias aplicando migration em paralelo
  contra o mesmo banco devem resultar em uma unica aplicacao.
- Aplique migrations antes de liberar trafego, nao em paralelo com ele.

## Deploy por Container

- Embarque as migrations no binario com `embed.FS` e `goose.SetBaseFS` quando o
  deploy for por imagem. A versao do schema fica atrelada a tag da imagem.
- Em atualizacao gradual (rolling update), versao antiga e nova coexistem.
  Aplique expand/contract: a release adiciona estrutura; a remocao do que ficou
  obsoleto vem em release posterior, quando nenhuma instancia depender dela.
- Nao faca `DROP` nem `RENAME` de estrutura ainda usada pela versao anterior.
- Rollback de imagem nao reverte schema. Se o projeto oferece rollback, declare
  a versao minima compativel e bloqueie selecao anterior a ela.

## Fluxo de Trabalho

- Depois de alterar schema: rode a migration, regenere o codigo de acesso a
  dados, rode os testes de aceite.
- Valide o `Down` em ambiente descartavel sempre que ele for suportado.
- Nao execute `down` em ambiente com dados persistentes sem confirmacao
  explicita do humano.

```bash
goose -dir migrations create nome_da_mudanca sql
goose -dir migrations postgres "$DATABASE_URL" up
goose -dir migrations postgres "$DATABASE_URL" status
goose -dir migrations postgres "$DATABASE_URL" down
```

Respeite wrappers ja existentes no projeto (Makefile, script ou task runner) em
vez de chamar o binario diretamente.
