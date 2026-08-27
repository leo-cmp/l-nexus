---
name: test-driven-development
description: Use obrigatoriamente ao implementar qualquer nova funcionalidade ou correção de bug antes de escrever o código de produção.
disable-model-invocation: false
---

# Test-Driven Development (TDD)

Esta skill estabelece o ciclo obrigatório de desenvolvimento orientado por testes no **l-nexus**. Nenhum código de produção deve ser escrito antes de um teste automatizado correspondente falhar demonstrando a ausência da funcionalidade ou a presença do bug.

## O Ciclo Red-Green-Refactor

```
🔴 RED (Escrever teste que falha)
   │
   ▼
🟢 GREEN (Implementar o mínimo para passar)
   │
   ▼
🔵 REFACTOR (Limpar o código mantendo os testes passando)
```

### 1. 🔴 RED — Teste Falhando Primeiro
1. Escreva um teste automatizado (unitário, integração ou ponta a ponta) que expresse o comportamento esperado da nova funcionalidade ou o caso de erro do bug.
2. Execute o teste e **comprove que ele falha** pelo motivo certo.
3. Não prossiga para o código de produção se o teste passar prematuramente ou falhar por erro de sintaxe/importação.

### 2. 🟢 GREEN — Implementação Mínima
1. Escreva apenas o código de produção estritamente necessário para fazer o teste passar.
2. Não antecipe otimizações complexas ou funcionalidades não cobertas pelo teste atual.
3. Execute a suíte de testes e confirme que o teste agora passa com exit code 0.

### 3. 🔵 REFACTOR — Refatoração Segura
1. Com os testes no verde, melhore a legibilidade, remova duplicidades e aplique as boas práticas da stack.
2. Rode novamente a suíte para garantir que todas as asserções continuam passando.

## Regras de Ouro
- **Zero código órfão:** Toda nova rota, método público, regra de validação ou cálculo de domínio precisa de teste associado.
- **Evidências no Log:** Cada ciclo deve registrar no log da task o comando de teste, o status antes (RED) e o status depois (GREEN).
