# Guarda de pre-commit para conteúdo protegido

## Contexto

O l-nexus declara alguns arquivos como conteúdo local protegido do projeto. Uma
atualização do kit deve preservar esses artefatos, mas um processo concorrente
pode alterar a árvore de trabalho entre `git add -A` e `git commit`. Sem uma
verificação no commit, o index pode incorporar a perda e torná-la parte da
história.

Há dois modos de perda que precisam de regras distintas:

- arquivos sob caminhos protegidos podem ser deletados ou movidos para fora
  desses caminhos;
- `.ai/decisions.md` pode continuar existindo, mas perder entradas por
  sobrescrita. Seu próprio contrato diz que entradas nunca são removidas, apenas
  riscadas quando revogadas. Remoção de linhas não serve como aproximação para
  essa regra, pois riscar ou editar uma decisão legítima também altera linhas.

Uma guarda que verifique apenas arquivos deletados não cobre o segundo caso. Uma
lista que alimente apenas a mensagem do instalador e o hook também não comprova
que o comportamento real do instalador preserva os caminhos anunciados.

## Objetivo

Adicionar uma guarda de `pre-commit` que impeça perdas acidentais de conteúdo
protegido de chegarem ao histórico Git, mantendo `--no-verify` como escape
explícito para mudanças intencionais.

A entrega também deve transformar a lista da guarda na fonte canônica da
mensagem "Configurações Locais Protegidas" e verificar por comportamento que o
`update` cumpre essa promessa.

## Limites da proteção

A guarda protege a história, não a árvore de trabalho. Ela não impede que um
processo remova ou sobrescreva arquivos no disco; impede que essa perda staged
seja commitada. Até ser restaurado, o conteúdo pode continuar ausente da árvore
de trabalho. A documentação deve explicar essa distinção e mostrar separadamente
como:

- desfazer apenas o staging da mudança suspeita;
- restaurar conteúdo a partir de `HEAD`, quando necessário.

O segundo comando não deve ser apresentado como primeira ação, pois pode
sobrescrever trabalho local ainda recuperável.

## Fonte canônica e políticas

O script versionado `src/.agents/hooks/lnx-guard.sh` será a autoridade sobre os
caminhos protegidos e suas políticas. Sua estrutura interna associará cada
caminho a uma política:

- `no-delete`: impede deletar o arquivo ou qualquer conteúdo sob o diretório;
- `append-only`: inclui `no-delete` e impede que diminua a quantidade de
  entradas identificadas por cabeçalhos que começam com `## `.

Os caminhos iniciais serão:

| Caminho | Política |
| --- | --- |
| `.ai/project.md` | `no-delete` |
| `.ai/stack.md` | `no-delete` |
| `.ai/model-routing.yaml` | `no-delete` |
| `.ai/session-memory.md` | `no-delete` |
| `.ai/decisions.md` | `append-only` |
| `.ai/guidelines/domain/` | `no-delete` |

O diretório canônico é `.ai/guidelines/domain/`, não apenas
`business-rules/`. A proteção deve cobrir todo o raio da operação destrutiva que
historicamente removeu o diretório pai, incluindo arquivos de projeto como
glossários, personas ou outros temas de domínio.

O modo `lnx-guard.sh --list-protected` projetará a estrutura interna para uma
lista simples de caminhos, sem expor as políticas. `scripts/install.sh` usará
essa projeção para imprimir a seção "Configurações Locais Protegidas".

O instalador manterá blocos explícitos para inicializar e preservar cada
artefato. Esses comportamentos são heterogêneos: alguns arquivos são gerados,
outros são copiados e o diretório de domínio é semeado sob condição. Um loop
genérico exigiria callbacks ou metadados adicionais e esconderia essa diferença.
A conformidade entre a lista declarada e o comportamento real será garantida
por teste comportamental.

## Comportamento da guarda

Em execução normal, a guarda examinará somente o conteúdo staged:

1. obterá deleções com detecção de renome desativada, para que mover conteúdo
   para fora de uma área protegida apareça como remoção da origem;
2. comparará caminhos literalmente, sem interpolá-los como expressões
   regulares;
3. para `.ai/decisions.md`, comparará a quantidade de cabeçalhos `^## ` no blob
   de `HEAD` com a quantidade no blob staged e bloqueará quando a segunda for
   menor; se o arquivo ainda não existir em `HEAD`, a contagem anterior será
   zero;
4. reunirá todas as violações antes de encerrar com status diferente de zero.

A exclusão total de `decisions.md` também será bloqueada. Adicionar entradas,
editar o conteúdo de uma entrada ou riscá-la sem remover seu cabeçalho será
permitido. Mudanças fora dos caminhos protegidos também serão permitidas.

O diagnóstico explicará que o commit foi bloqueado, listará cada violação e
oferecerá ações distintas para desfazer staging, restaurar conteúdo e usar
`git commit --no-verify` quando a remoção for intencional.

Arquivos acima de 100 MB não fazem parte desta entrega.

## Stub de pre-commit

O hook não versionado será um stub mínimo que resolve a raiz da árvore atual com
`git rev-parse --show-toplevel` e delega por caminho absoluto para
`.agents/hooks/lnx-guard.sh` daquela árvore.

O stub será fail-closed: se o guarda estiver ausente ou não for executável, o
commit será bloqueado. Isso cobre a janela em que `update.sh` remove `.agents/`
antes de `install.sh` copiá-lo novamente, além de remoções acidentais do próprio
guarda.

A mensagem desse bloqueio será compreensível sem conhecimento prévio do
l-nexus. Ela mostrará:

- `git commit --no-verify` para concluir apenas o commit atual;
- o caminho efetivo do arquivo `pre-commit` a remover se o projeto não usa mais
  o l-nexus.

Esse comportamento fail-closed e suas saídas serão documentados publicamente.

## Descoberta e contenção do diretório de hooks

O instalador usará o Git para descobrir tanto a raiz física do alvo quanto o
caminho efetivo de hooks, incluindo `core.hooksPath`. Caminhos relativos serão
normalizados antes do uso.

Antes de qualquer `mkdir` ou escrita, o instalador validará fisicamente que o
diretório de hooks é igual à raiz do alvo ou está contido nela. A validação deve
considerar componentes e ancestrais existentes para que um symlink ou um
destino ainda inexistente não permita escapar da raiz. Caminho externo nunca
será criado ou alterado.

Os resultados esperados são:

- alvo sem repositório Git: pular a guarda silenciosamente e concluir a
  instalação;
- caminho interno inexistente: criar o diretório somente depois da validação;
- `core.hooksPath` externo: não escrever e avisar que a instalação afetaria
  outros diretórios;
- hook existente: preservar bytes e permissões e informar a ação aplicável;
- erro real de escrita ou permissão num destino que deveria ser instalável:
  encerrar com status diferente de zero, sem alegar que a guarda foi ativada.

Um novo stub será escrito em arquivo temporário no próprio diretório de hooks,
terá a permissão executável aplicada e será movido para o destino no mesmo
filesystem. Isso evita deixar um hook parcial que o Git tentaria executar.

## Worktrees vinculadas

Numa linked worktree, o caminho padrão de hooks fica no common dir do
repositório principal e, portanto, fora da raiz física do alvo. O instalador não
abrirá exceção à regra de contenção e não escreverá nesse diretório.

O aviso específico informará o caminho externo e orientará o usuário a executar
o instalador na worktree principal. Ali, `.git/hooks` está dentro da raiz; a
instalação passa pela regra de contenção e protege todas as worktrees do mesmo
repositório. Como alternativa, o usuário pode encadear manualmente o guarda no
hook compartilhado.

Hooks compartilhados têm uma consequência deliberada: uma worktree irmã numa
branch anterior à adoção do l-nexus pode não conter `.agents/`. O stub
fail-closed bloqueará commits nessa árvore. A documentação destacará esse caso
e as saídas autoexplicativas do stub.

## Hooks existentes e versão do stub

O instalador nunca sobrescreverá um `pre-commit` existente, inclusive quando ele
for reconhecido como stub do l-nexus. O stub carregará um marcador estável e
versionado, como `# lnx-guard-stub v1`, para permitir diagnóstico sem mutação.

Um hook existente será classificado assim:

| Caso | Comportamento |
| --- | --- |
| Stub l-nexus na versão atual | Preservar e informar que a guarda está ativa |
| Stub l-nexus em versão anterior | Preservar e avisar que está desatualizado; orientar remoção e nova instalação |
| Stub l-nexus em versão posterior | Preservar, não fazer downgrade e informar a situação |
| Hook sem marcador reconhecido | Preservar e mostrar como encadear manualmente o guarda |

As mensagens sempre usarão o caminho efetivo normalizado, em vez de assumir
`.git/hooks/pre-commit`.

## Testes

### Preservação pelo instalador

`scripts/test-protected-files.sh` será comportamental:

1. fará uma instalação inicial;
2. obterá os casos de `lnx-guard.sh --list-protected`;
3. gravará conteúdo reconhecível em cada arquivo e uma sentinela diretamente em
   `.ai/guidelines/domain/`, fora de `business-rules/`;
4. executará `update`, incluindo a remoção real de `.agents/` feita por
   `update.sh`;
5. confirmará que cada conteúdo e sentinela sobreviveu intacto;
6. confirmará que o resumo do instalador usa a lista canônica.

Adicionar um caminho à guarda sem implementar sua preservação fará esse teste
falhar. O teste não se limitará a comparar duas listas ou mensagens.

### Política da guarda

Um teste isolado em repositório temporário cobrirá:

- adições de entradas em `decisions.md` permitidas;
- edição e revogação por risco de uma entrada existente permitidas quando seu
  cabeçalho `## ` permanece;
- redução da quantidade de cabeçalhos `^## ` em `decisions.md` bloqueada,
  inclusive quando acompanhada por mais linhas adicionadas;
- sobrescrita de um arquivo com várias decisões pelo template sem entradas
  bloqueada;
- exclusão total de `decisions.md` bloqueada;
- exclusão dos demais caminhos protegidos bloqueada;
- renome para fora de `.ai/guidelines/domain/` bloqueado;
- alteração e exclusão fora dos caminhos protegidos permitidas;
- múltiplas violações reunidas no mesmo diagnóstico;
- `--no-verify` permitindo a ação intencional;
- stub bloqueando quando o guarda estiver ausente, com instruções de bypass e
  remoção permanente.

### Instalação do hook

Um teste de integração cobrirá:

- diretório sem Git;
- repositório comum com instalação executável do stub;
- `core.hooksPath` interno e ainda inexistente;
- `core.hooksPath` externo sem criação ou alteração do destino;
- linked worktree recusando o common dir e orientando instalação na worktree
  principal;
- hook de terceiro preservado byte por byte e com instrução de encadeamento;
- stub atual reconhecido como ativo sem falso aviso;
- stub antigo preservado byte por byte e diagnosticado como desatualizado;
- stub posterior preservado sem downgrade.

## Documentação pública

A documentação explicará:

- a lista protegida, incluindo todo `.ai/guidelines/domain/`;
- a política append-only de `.ai/decisions.md`;
- que a guarda protege a história, não evita perda na árvore de trabalho;
- como desfazer staging e como restaurar conteúdo a partir de `HEAD`;
- o comportamento fail-closed durante updates, remoção de `.agents/` e branches
  antigas em worktrees;
- como usar `--no-verify` para uma exceção intencional;
- como encadear um hook preexistente ou externo;
- como remover o stub ao deixar de usar o l-nexus.

## Fora de escopo

- barrar blobs acima de 100 MB;
- reescrever, compor ou migrar automaticamente hooks existentes;
- adicionar um comando de desinstalação;
- impedir perdas na árvore de trabalho antes do commit;
- proteger operações que não passam por `pre-commit`, como `reset`, limpeza
  manual ou reescrita de histórico;
- instalar automaticamente um hook compartilhado a partir de linked worktree;
- suportar ambientes Windows sem WSL.
