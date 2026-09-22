# Testing Guidelines

- Toda mudanca deve ter verificacao programatica proporcional ao risco.
- Siga `.ai/guidelines/core/environment.md`; nao use Docker por padrao.
- Rode o menor conjunto de testes que prove a alteracao.
- Comandos e frameworks de teste especificos estao em `.ai/guidelines/stacks/<stack>.md`.
- Nao remova testes sem aprovacao explicita.
- Antes de rodar testes ou preparar o banco, confira a configuracao efetiva de
  host, porta, nome do banco ou schema, usuario e ambiente. Se ela apontar para
  producao, para um servidor remoto ou compartilhado, para um nome de outro
  projeto, ou para um banco com tabelas ou dados que este projeto nao criou,
  pare e pergunte ao humano; o teste nao pode rodar contra esse banco.
- Trate `migrate:fresh`, `RefreshDatabase`, `truncate`, `drop`, recriacao de
  schema e comandos equivalentes de reset ou setup como destruicao do banco
  configurado. So os execute depois de confirmar que o destino e um banco de
  teste separado e descartavel.
- Se nao existir um banco de teste separado, pare e pergunte ao humano. Nunca
  reaproveite o banco de desenvolvimento por conveniencia, pois setup, limpeza
  e isolamento de testes podem apagar ou alterar dados existentes.
- Antes de abrir ferramentas de navegador/MCP para validacao visual ou E2E manual (Chrome DevTools, Playwright MCP, screenshots, cliques automatizados etc.), pergunte ao humano se ele quer que a IA teste no navegador ou se prefere testar manualmente. Aguarde a resposta antes de chamar qualquer ferramenta de navegador, mesmo para uma verificacao pequena.
