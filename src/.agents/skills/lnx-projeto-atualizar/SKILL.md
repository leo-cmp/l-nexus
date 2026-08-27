---
name: lnx-projeto-atualizar
description: Atualiza a documentação técnica central do projeto em .ai/project.md com novas stacks, configurações de ambiente e regras de negócio.
disable-model-invocation: false
---

# Atualizar Projeto

Esta skill deve ser ativada quando houver mudanças nas regras de negócio globais, nova stack ou reconfiguração do ambiente, ou via comando `/lnx-projeto-atualizar`.

## Fluxo

1. **Revisar o Contexto Atual:**
   - Leia `.ai/project.md` e `.ai/stack.md` para entender as configurações e escopo vigentes.

2. **Aplicar Modificações:**
   - Insira as novas regras de negócio, limites operacionais ou técnicos, chaves/configurações de ambiente informadas pelo usuário.
   - Caso novas stacks sejam introduzidas no ecossistema local, atualize a lista no `.ai/stack.md` correspondente.

3. **Notificar Impactos em Planos:**
   - Se a alteração impactar tarefas e planos que já foram estruturados em `.planning/`, faça um levantamento das tarefas que precisarão ser adaptadas ou corrigidas e as liste no relatório final para o usuário.
