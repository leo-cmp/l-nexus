# CodeIgniter 4 Guidelines

- **Tipagem Estrita**: Sempre declare `declare(strict_types=1);` na primeira linha de todos os arquivos PHP criados ou modificados.
- **Tipagem de Retorno e Parametros**: Use tipagem explicita e coerente para todos os metodos e propriedades de classe.
- **Estrutura de Rotas**: Defina todas as rotas da aplicacao explicitamente em `app/Config/Routes.php`. Evite roteamento automatico para manter controle rigido sobre os endpoints publicos e paineis privados.

---

## Padroes de Arquitetura (Entities, Models, Services)

### 1. Entities (Objeto de Dominio)
- Representam uma unica linha da tabela como um objeto.
- **Nao** conhecem o banco de dados.
- Devem conter apenas **Mutators e Accessors** (getters e setters) para sanitizar ou formatar dados (ex: e-mail em minusculo, hash de senha automatico).

### 2. Models (Repositorio de Dados)
- Camada estrita de acesso a dados. **Nao** tomam decisoes de negocio.
- Devem conter apenas: configuracoes de tabela (nome, PK, `$allowedFields`), validacoes brutas e metodos de Query Builder customizados.
- **PROIBIDO** colocar logicas de disparo de e-mails, integracoes externas ou validacoes de regra de negocio nos Models.

### 3. Services (Camada de Regras de Negocio)
- Orquestram as Entities e os Models de forma isolada do protocolo HTTP.
- Registre as classes de servico em `app/Config/Services.php` utilizando a flag `$getShared` (Singletons) quando fizer sentido.
- Controllers devem ser **ultra-enxutos** (no maximo **5 linhas** por metodo), apenas recebendo parametros HTTP, delegando a logica para o Service correspondente e retornando a resposta.

---

## Praticas Essenciais de Desenvolvimento no CI4

### 1. View Cells (Componentizacao do Front-end via Atomic Design)
- Use **View Cells** (`<?= view_cell('App\Cells\NomeCell') ?>`) para criar componentes de tela reaproveitaveis e independentes.
- Toda criacao de componentes visuais deve seguir a nomenclatura do **Atomic Design** organizando os subdiretorios de `app/Cells/`:
  - **Atoms** (`app/Cells/Atoms/`): Menor unidade visual sem composicao (ex: `StatusBadge`, `Button`, `Icon`).
  - **Molecules** (`app/Cells/Molecules/`): Composicao pequena de atoms (ex: `FormField`, `MetricCard`, `FlashAlert`).
  - **Organisms** (`app/Cells/Organisms/`): Blocos funcionais maiores (ex: `Sidebar`, `Topbar`, `DataTableCard`, `ModalConfirm`).
  - **Templates** (`app/Cells/Templates/`): Estruturas de layout de pagina (ex: `PanelShell`, `AuthShell`).
  - **Pages** (`app/Cells/Pages/`): Telas completas ou secoes de pagina com dados ja preparados.
- **Regras de Reuso**:
  - Antes de criar markup novo em uma tela, procure por Cells ou blocos repetidos em `app/Cells/` ou nas views.
  - Se um Cell existente serve: reutilize-o.
  - Se um Cell quase serve, mas falta uma variacao (classe CSS, prop opcional, icone): **prefira estender o Cell existente** adicionando props com valores default para nao quebrar usos antigos, ao inves de duplicar codigo.
  - **Toda peca de UI nasce como Cell**, mesmo que hoje tenha um unico uso. Atomic Design e decomposicao total e bottom-up, nao uma tecnica de deduplicacao aplicada so depois que o markup ja se repetiu em 2+ views. Nao espere surgir uma segunda ocorrencia para extrair: se o trecho tem qualquer potencial de reuso (um badge, um card de linha de lista, um par label+valor, um bloco de estado vazio), ele ja nasce como Atom/Molecule/Organism em `app/Cells/`, e a view/pagina apenas o invoca via `view_cell(...)`.
  - Nao insira regras de negocio ou consultas diretas ao banco de dados dentro de Cells; o preparo de dados e responsabilidade de Controllers/Services.
- **Props publicas de Cells sempre inicializadas**: toda propriedade publica tipada de uma classe de Cell deve ter valor default (`public string $titulo = '';`, `public ?string $valor = null;`, `public array $itens = [];`). Propriedades tipadas sem default ficam "uninitialized"; o mecanismo interno de Cells do CI4 usa `get_object_vars()` e pode nao enxergar essas props, fazendo o valor passado em `view_cell(...)` ser descartado silenciosamente. Se uma prop non-nullable puder receber `null` em runtime (ex: `old('campo')`), coalesca no ponto de chamada ou declare a prop como nullable.
- **Escaping em atributos HTML dentro de Cells**: o helper `esc($valor, 'attr')` usa o contexto de atributo do Laminas Escaper, que codifica **espaco, `:` e `/`** como entidades HTML (`&#x20;`, `&#x3A;`, `&#x2F;`). Isso e inofensivo no navegador (o parser HTML decodifica antes de expor via `getAttribute()`, entao CSS/JS/htmx continuam funcionando), mas polui o HTML fonte e quebra qualquer teste que compare string literal contra o HTML renderizado. Para valores que a propria aplicacao ja construiu/validou (classes CSS montadas a partir de props, URLs geradas por `site_url()`, atributos `hx-*`, `title=`), use `esc($valor)` no contexto padrao (`html`) — ja escapa `< > & " '`, suficiente para nao quebrar o atributo, sem o ruido extra. So use o contexto `'attr'` quando houver uma razao concreta pra semantica mais agressiva dele (ex: valor vindo de input livre de usuario sendo inserido num atributo cujo formato voce nao controla).
- **Montagem de string de classes com partes opcionais**: ao compor `class="..."` a partir de variaveis que podem vir vazias (ex: um Cell com prop de tamanho/variante opcional), use `implode(' ', array_filter([...], fn ($parte) => trim($parte) !== ''))` em vez de `trim("base {$a} {$b} {$c}")` simples — a segunda forma deixa espaco duplo no meio da string quando algum prop vem `''`, mesmo que o resultado visual seja identico (o navegador colapsa espacos), isso ainda quebra comparacoes de string exata em testes.
- **Validacao HTTP depois de migrar views para Cells**: depois de extrair views ou fragments para Cells, valide as rotas afetadas por requisicao HTTP real (`curl`, teste de feature ou navegador aprovado pelo humano), alem de testes unitarios de Cell. Teste isolado de `view_cell()` pode passar mesmo quando a pagina completa quebra por props ausentes, `old()` retornando `null`, sessao limpa ou integracao com layout/htmx.

### 2. Filters (Middlewares)
- Regras de seguranca, CORS, autenticacao de sessao e isolamento multi-tenant devem ser executadas em **Filters** (`app/Config/Filters.php`).
- **Nunca** faca validacoes manuais de sessao repetitivas dentro de metodos de Controllers.

### 3. Events (Publish/Subscribe)
- Utilize o sistema de **Events** do CI4 (`Events::trigger('algo_aconteceu', ...)`) para desacoplar tarefas secundarias da logica de negocio principal dos Services.
- Tarefas como envio de e-mail ou notificacoes pos-acao devem ser ouvidas por Listeners, mantendo o Service principal focado na operacao primaria.

### 4. Migrations e Seeders
- Toda alteracao estrutural no banco deve possuir uma Migration Spark (`php spark make:migration`).
- A funcao `down()` de cada migration deve desfazer corretamente as alteracoes feitas em `up()`.
- Seeders devem ser utilizados para popular tabelas auxiliares ou dados ficticios (Faker) para testes.

### 5. Custom Spark Commands (CLI)
- Tarefas periodicas ou rotinas do sistema devem ser implementadas como comandos Spark customizados estendendo `BaseCommand`.
- Podem ser agendadas usando o scheduler do pacote **Tasks**, quando disponivel.

### 6. Custom Validation Rules
- Regras de validacao de negocio avancadas (ex: documentos, formatos especificos) devem ser implementadas em classes de validacao customizadas e injetadas no validador do framework.

---

## Banco de Dados

- Todas as alteracoes de schema devem ser feitas via migrations Spark (`php spark make:migration`).
- Crie indices em FKs e campos de busca/filtro frequente.
- Todas as PKs sao **ULID** (`VARCHAR(26)`, sem auto-increment).
- Valores monetarios (ex: `valor_estimado`, `valor_real`, tetos) usam a precisao definida em `.ai/guidelines/core/database.md`. Nunca `FLOAT`/`DOUBLE`. No PHP, trafegue e calcule como string/inteiro de centavos; nunca como `float`.

### Geracao de ULID

- **Biblioteca**: `symfony/uid` (`composer require symfony/uid`). E a opcao mais madura e mantida para gerar ULIDs em PHP, sem trazer um framework completo como dependencia.
- **Onde gerar**: no callback `$beforeInsert` do Model correspondente (nunca no Controller/Service), setando o campo de PK antes da insercao:
  ```php
  use Symfony\Component\Uid\Ulid;

  protected $beforeInsert = ['generateUlid'];

  protected function generateUlid(array $data): array
  {
      $data['data']['id'] ??= (string) new Ulid();

      return $data;
  }
  ```
- Isso garante ordenacao cronologica fisica no disco (requisito do projeto) sem acoplar a geracao do ID a nenhuma camada de negocio.

## Testes

- Use a suite PHPUnit integrada do CodeIgniter 4.
- Executar todos os testes: `vendor/bin/phpunit`.
- Executar teste especifico: `vendor/bin/phpunit caminho/do/Teste.php`.
- Filtrar por metodo: `vendor/bin/phpunit --filter nomeDoTeste`.

## Frontend

- **Stack de UI**: Tailwind CSS v4 + daisyUI v5, com interatividade assincrona via **htmx**. Ver `tailwind.md` e `daisyui.md` neste mesmo diretorio para as regras detalhadas de estilizacao (proibicao de `style=` inline, uso de tokens de tema, etc.).
- **Componentizacao**: estritamente via View Cells (Atomic Design), conforme secao "View Cells" acima. Telas completas sao proibidas antes de existirem os atoms/molecules/organisms que as compoem (metodologia bottom-up).
- **htmx**: gatilhos (`hx-post`, `hx-target`, `hx-swap`) ficam definidos dentro do proprio View Cell que os utiliza, nunca espalhados soltos nas views de pagina.
- **Estados visuais**: cada Organism/Molecule que depende de dados assincronos deve prever os estados de loading, empty, erro e sucesso como variantes do proprio Cell (nao como markup ad-hoc na pagina).
- **Verbos HTTP reais em rotas de mutacao**: ao contrario de um `<form>` HTML puro (preso a `GET`/`POST`), o htmx suporta os verbos semanticos completos via `hx-put`, `hx-patch` e `hx-delete` sem precisar de method-spoofing. Por isso, toda rota de **criacao** usa `POST`, **atualizacao** usa `PUT`/`PATCH` e **exclusao** usa `DELETE` — nunca `POST` com o verbo escrito na URL (ex: `POST /recurso/(:segment)/excluir`). Principio geral: se a ferramenta disponivel suporta a forma correta, use a forma correta, nao a que "tambem funciona".
  - No Controller, `$request->getPost()` so le `$_POST`, que o PHP so popula em requisicoes `POST` reais. Em `PUT`/`PATCH`/`DELETE` o corpo vem em `php://input` — use `$request->getRawInput()` (ou verifique `$request->getMethod()` para escolher a origem certa).
- **Mascara de campos de dinheiro**: todo `<input>` que representa um valor monetario (R$) deve ter um atributo `data-money-mask` (ou equivalente) ligado a um listener global de input, delegado em `document.body` (funciona tambem em campos injetados via htmx, sem precisar re-vincular por elemento). A mascara formata como calculadora — direita para esquerda, sem separador de milhar, virgula nos centavos (ex: "1500000" digitado vira "15000,00"). Nao usar em campos percentuais (ex: `percentual_comissao`), so em campos de valor monetario de fato. O Controller converte a virgula para ponto antes de repassar ao Service/Model — o banco sempre recebe o valor tratado.

---

## Traducao e Localizacao (pt-BR)

- **Pacote Base**: O projeto utiliza a traducao fornecida por `natanfelles/CodeIgniter4-pt-BR`.
- **Termos Ausentes e Novas Bibliotecas**: Mensagens de erro de pacotes novos (como Shield ou validacoes customizadas) que estiverem em ingles devem ser traduzidas criando/complementando arquivos locais correspondentes em `app/Language/pt-BR/` para manter a experiencia nativa em portugues.

## Skills
- `ci4-best-practices`: use como referencia de padroes e boas praticas CodeIgniter 4.
