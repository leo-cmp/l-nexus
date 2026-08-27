---
name: verification-before-completion
description: Use obrigatoriamente antes de declarar qualquer tarefa como concluída, corrigida ou passando, antes de commitar ou abrir PR.
disable-model-invocation: false
---

# Verification Before Completion

Esta skill estabelece a proibição absoluta de alegações de sucesso sem evidências concretas. É **terminantemente proibido** dizer "a tarefa está concluída", "os testes passaram" ou "o bug foi corrigido" sem executar os comandos reais de validação e inspecionar suas saídas.

## Evidência Antes de Afirmação

```
❌ "Pronto! O código foi corrigido e deve funcionar perfeitamente." (Inválido / Alucinação)
✅ "Executei 'npm test' -> 14 testes passaram, 0 falhas (exit code 0). Evidência registrada." (Válido)
```

## Checklist Obrigatório de Validação

Antes de marcar qualquer task como concluída ou emitir relatório final:

1. **Compilação e Linter:**
   - Execute o linter / static analysis da stack (ex: `npm run lint`, `vendor/bin/phpstan analyse`, `dart analyze`).
   - Confirme que não há erros ou warnings impeditivos.

2. **Suíte de Testes Relevante:**
   - Execute a suíte de testes unitários e de integração do domínio alterado (ex: `php artisan test`, `npm test`, `pytest`).
   - Confirme que 100% dos testes passaram com exit code 0.

3. **Inspeção de Alterações (`git status` e `git diff`):**
   - Execute `git status` para garantir que nenhum arquivo temporário ou lixo foi deixado no workspace.
   - Execute `git diff` para revisar se apenas as alterações planejadas foram feitas.

4. **Registro Estruturado no Log de Evidências:**
   - Insira na task (.planning/PLAN_VN/tasks/task_X_Y.md) ou no relatório:
     - Comando exato executado.
     - Código de saída (Exit Code).
     - Trecho relevante da saída de sucesso.

Se qualquer verificação falhar, retorne imediatamente à etapa de diagnóstico e **não** declare a tarefa como finalizada.
