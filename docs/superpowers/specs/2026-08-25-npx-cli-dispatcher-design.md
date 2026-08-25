# Dispatcher do CLI via npx

## Contexto

O pacote `@leo-cmp/l-nexus@0.6.0` publica
`scripts/validate-task-routing.mjs` diretamente como o binario `l-nexus`.
Quando o npm executa esse arquivo por meio do symlink em `node_modules/.bin`, a
guarda que compara `import.meta.url` com `process.argv[1]` nao reconhece o
arquivo como programa principal. O processo termina com codigo zero sem
executar o comando solicitado.

Esse comportamento afeta o fluxo documentado de instalacao e pode afetar os
demais subcomandos do pacote.

## Objetivo

Fazer o binario publicado funcionar de forma consistente quando invocado por
`npx`, mantendo os comandos documentados e propagando corretamente sua saida e
seu codigo de termino.

## Desenho

O campo `bin` de `package.json` apontara para um novo
`scripts/cli.mjs`. Esse arquivo tera apenas a responsabilidade de interpretar o
primeiro argumento e encaminhar a execucao:

| Comando | Destino |
| --- | --- |
| `install` | `scripts/install.sh` |
| `install-force` | `scripts/install-force.sh` |
| `validate-task` | `scripts/validate-task-routing.mjs` |
| `migrate-task` | `scripts/migrate-task-routing.mjs` |

Os scripts Node serao executados com `process.execPath`. Os scripts shell serao
executados diretamente, preservando a verificacao de plataforma existente. O
dispatcher herdara stdin, stdout e stderr e encerrara com o mesmo codigo do
processo filho.

Sem argumentos ou com `--help`, o CLI exibira a ajuda e encerrara com codigo
zero. Um comando desconhecido exibira o erro e a ajuda em stderr e encerrara
com codigo diferente de zero.

O encaminhamento legado presente no validador sera removido para que cada
arquivo tenha uma responsabilidade unica. A execucao direta do validador
continuara suportada para os testes e para uso interno.

## Empacotamento

`scripts/cli.mjs` sera incluido na lista `files` do pacote e marcado como
executavel. Nenhuma dependencia nova sera adicionada.

## Testes

Um teste de integracao criara o tarball local com `npm pack`, instalara esse
tarball em um diretorio temporario e chamara o executavel criado em
`node_modules/.bin`. O teste verificara pelo menos:

- `install` cria os arquivos esperados no destino;
- `install-force` e encaminhado;
- `--help` apresenta os comandos e retorna zero;
- um comando desconhecido retorna codigo diferente de zero;
- o tarball contem o dispatcher e o campo `bin` aponta para ele.

Os testes existentes de validacao, migracao e instalacao continuarao sendo
executados para detectar regressao.

## Fora de escopo

- alterar os arquivos copiados pelo instalador;
- mudar as regras de validacao ou migracao de tasks;
- adicionar suporte nativo ao Windows sem WSL;
- publicar automaticamente uma nova versao no npm.
