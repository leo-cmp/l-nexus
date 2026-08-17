# Database Guidelines

- Inspecione o schema atual antes de mudancas dependentes do banco (use o MCP da stack quando disponivel).
- Valor monetario usa `DECIMAL(15,2)` por padrao e nunca tipo de ponto flutuante. Projeto que precise de outra precisao registra em `.ai/decisions.md`; precisao maior nao custa nada, precisao insuficiente corrompe valor.
- O tipo correspondente do lado da linguagem esta em `.ai/guidelines/stacks/<stack>.md`.
- Crie indices para FKs e campos de filtro frequente.
- Migrations devem ter rollback coerente.
- Aplique no schema as restricoes declaradas em `.ai/guidelines/domain/business-rules/index.md`. Quando a regra existir, ela vira constraint, FK, unicidade ou trigger — nao apenas validacao na aplicacao.
