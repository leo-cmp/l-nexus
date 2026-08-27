---
name: systematic-debugging
description: Use obrigatoriamente ao investigar qualquer bug, falha de teste ou comportamento inesperado antes de propor ou aplicar correções no código.
disable-model-invocation: false
---

# Systematic Debugging

Esta skill estabelece uma abordagem metódica e disciplinada para resolução de bugs. É **estritamente proibido** aplicar correções às cegas ou fazer suposições sem investigar e reproduzir a causa raiz com evidências concretas.

## 4 Fases Obrigatórias

```
1. Investigação & Causa Raiz  -->  2. Reprodução Mínima  -->  3. Correção Cirúrgica  -->  4. Verificação de Regressão
```

### Fase 1: Investigação da Causa Raiz
1. **Colete os Fatos:**
   - Leia a mensagem de erro exata e o stack trace completo.
   - Identifique a linha e o arquivo exatos onde a falha se manifesta.
   - Isole a diferença entre o comportamento esperado e o comportamento observado.
2. **Inspecione o Estado e Fluxo de Dados:**
   - Rastreie as variáveis e payloads de entrada até o ponto de ruptura.
   - Não suponha que funções auxiliares ou bibliotecas funcionam de uma forma: inspecione sua implementação real ou use ferramentas/MCPs.
3. **Identifique a Raiz (Root Cause):**
   - Responda: *Por que esse valor chegou aqui nesse estado?*
   - Não resolva apenas o sintoma (ex: adicionar `if (!val) return;` sem entender por que `val` é nulo).

### Fase 2: Reprodução Mínima
1. Crie um teste automatizado ou um comando de reprodução determinístico que falhe consistentemente com o erro observado.
2. Confirme que a falha observada no teste é exatamente a mesma reportada pelo usuário.

### Fase 3: Correção Cirúrgica
1. Aplique a menor alteração necessária e suficiente para corrigir a causa raiz.
2. Mantenha o estilo e padrões arquiteturais do projeto.
3. Não refatore código não relacionado enquanto corrige o bug.

### Fase 4: Verificação de Regressão
1. Execute novamente o teste de reprodução e comprove que ele agora passa com exit code 0.
2. Execute a suíte de testes do módulo afetado para garantir que nenhuma regressão foi introduzida.
3. Registre no Log de Evidências da task o comando executado, o exit code e o snippet do log.
