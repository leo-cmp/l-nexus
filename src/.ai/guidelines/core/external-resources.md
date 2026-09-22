# External Resources Guidelines

## Recurso externo nao se adota

Todo recurso com estado fora do repositorio tem dono e ciclo de vida. Antes de
gravar configuracao, provisionar dentro dele, publicar dados ou executar uma
ferramenta que possa escrever, confirme que o recurso e **deste projeto**. Para
banco de dados, siga a regra especifica em [database.md](database.md).

Pare e pergunte ao humano, sem escrever nem apontar o projeto para o recurso,
quando qualquer um destes sinais aparecer:

- um bucket ou object storage ja contem objetos, prefixos, metadados, regras de
  retencao ou politicas com nomes que este projeto nao criou. Usar outro prefixo
  nao torna o bucket seu: uma limpeza, regra de ciclo de vida ou mudanca de
  acesso pode apagar ou expor objetos do outro sistema;
- um cache ja contem chaves ou namespaces alheios, ou uma fila ja tem mensagens,
  consumidores, grupos, topicos ou dead-letter queues que o projeto nao define.
  Conectar para "testar" ja pode expirar chaves, confirmar mensagens ou competir
  com consumidores que estao processando trabalho real;
- um servico de busca ja possui indices, aliases, mappings ou documentos que o
  projeto nao criou. Reutilizar o indice ou apenas acrescentar um alias mistura
  dados e permite que reindexacao, rollover ou exclusao atinja o outro sistema;
- o projeto ou conta cloud mostra recursos, labels, membros de IAM, cobranca ou
  nomes de sistemas que nao constam neste repositorio nem em `.ai/project.md`.
  Criar um recurso ali vincula custo, permissao e remocao ao ambiente de outro
  sistema;
- a credencial de uma conta de servico veio do ambiente, de arquivo global, do
  diretorio de outro projeto ou de historico de shell, e nao de
  `.ai/project.md` ou do humano. O fato de a credencial listar ou alterar o
  recurso prova capacidade tecnica, nao autorizacao para usa-lo.

Nao contorne esses sinais criando prefixo, namespace, topico, indice ou recurso
"isolado" dentro do destino encontrado. Se o recurso esperado nao existe ou a
credencial nao permite cria-lo, pare e pergunte ao humano qual destino usar.
Acesso obtido nao e posse, e ausencia do recurso e pergunta ao humano, nao
obstaculo a contornar.
