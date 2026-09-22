# Database Guidelines

## O banco nao se adota

Um banco que ja existe nao e sorte: e de alguem. Antes de escrever qualquer
credencial de conexao, rodar migration ou seeder, confirme que o banco e **deste
projeto**. Nao basta conseguir conectar -- conseguir conectar e exatamente o que
torna o erro facil.

Pare e pergunte ao humano, sem escrever nada, quando qualquer um destes for
verdade:

- o banco contem tabelas que este projeto nao criou. Schema alheio no destino e
  a prova de que ele pertence a outro sistema, e migration aditiva contamina do
  mesmo jeito: as tabelas novas passam a conviver com dados de producao de
  terceiros, num backup que nao e seu e num ciclo de vida que voce nao controla;
- o banco que o projeto deveria usar nao existe, e criar exigiria privilegio que
  o usuario configurado nao tem. `Access denied` ao criar banco e resposta, nao
  obstaculo a contornar apontando para outro que ja esta la;
- as credenciais vieram do ambiente, de um `.env` de outro projeto ou de um
  historico de shell, e nao de `.ai/project.md` ou do humano. **Credencial
  encontrada nao e autorizacao de uso.**

Nunca resolva por conta propria renomeando prefixo de tabela, criando schema
dentro do banco alheio ou "isolando por convencao". A decisao de onde os dados
deste projeto vivem e do humano.

Isto ja aconteceu: um executor encontrou um banco de outro sistema no ambiente,
presumiu que fosse o do projeto e escreveu a configuracao apontando para la. A
task seguinte rodaria as migrations dentro dele. Nenhuma regra do kit disparou,
porque criar tabela e aditivo e as guardas existentes falavam de comando
destrutivo.

## Schema e tipos

- Inspecione o schema atual antes de mudancas dependentes do banco (use o MCP da stack quando disponivel).
- Valor monetario usa `DECIMAL(15,2)` por padrao e nunca tipo de ponto flutuante. Projeto que precise de outra precisao registra em `.ai/decisions.md`; precisao maior nao custa nada, precisao insuficiente corrompe valor.
- O tipo correspondente do lado da linguagem esta em `.ai/guidelines/stacks/<stack>.md`.
- Crie indices para FKs e campos de filtro frequente.
- Migrations devem ter rollback coerente.
- Aplique no schema as restricoes declaradas em `.ai/guidelines/domain/business-rules/index.md`. Quando a regra existir, ela vira constraint, FK, unicidade ou trigger — nao apenas validacao na aplicacao.
