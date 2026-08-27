# Diretriz de Delegação por Terminal CLI (Multi-Model CLI Delegation)

Esta diretriz estabelece o padrão para um agente de IA no runtime atual (seja ele **Codex**, **Cursor**, **Gemini CLI**, **Antigravity**, **Claude Code**, etc.) orquestrar e delegar tarefas para outras ferramentas de CLI instaladas no ambiente via terminal.

---

## 1. Filosofia e Casos de Uso

Diferentes ferramentas de CLI e modelos possuem especialidades distintas:
- **Pesquisa Aprofundada e Documentação:** CLIs com navegação integrada e ferramentas de busca rica (ex: `agy` com `gemini-3.7-flash`).
- **Código Complexo e Risco Crítico (L3 / R3):** Modelos frontier de alta capacidade de raciocínio (ex: `claude` com `claude-opus-5` ou `claude-sonnet-5`, `codex` com `gpt-5.6-sol`, `deepseek-v4-pro`).
- **Código Simples, Refactors Locais e Tarefas Rápidas (L1 / L2):** Modelos ultra-rápidos e balanceados/econômicos (ex: `opencode` com `deepseek-v4-flash`, `qwen` com `qwen3.7-plus`, `kimi` com `moonshot-v1-auto`, `gemini-3.7-flash`, `claude-haiku-4-5`, `gpt-5.6-luna`).

Com este mecanismo, o agente orquestrador não precisa fazer tudo sozinho no mesmo contexto: ele pode disparar a CLI ideal via terminal, capturar o resultado e integrar na task principal.

---

## 2. Comandos Orientados pelo Usuário

O desenvolvedor pode instruir o agente explicitamente em linguagem natural:

> *"Use o codex com o modelo gpt-5.6-sol para refatorar o serviço de pagamento"*  
> *"Use o opencode com o modelo deepseek-v4-flash para criar os testes unitários do helper"*  
> *"Use o claude com o modelo claude-sonnet-5 para revisar o PR de autenticação"*  
> *"Use o agy com o modelo gemini-3.7-flash para pesquisar e documentar a arquitetura"*  
> *"Use o qwen com o modelo qwen3.7-plus para implementar a tela de listagem"*  

Quando o agente receber esse comando, ele deve:
1. Identificar a **CLI de destino** (`codex`, `claude`, `opencode`, `agy`, `gemini`, `qwen`, `kimi`, etc.).
2. Identificar o **modelo solicitado** (`gpt-5.6-sol`, `claude-sonnet-5`, `gemini-3.7-flash`, `deepseek-v4-flash`, `qwen3.7-plus`, etc.).
3. Consultar o template de comando em `.ai/model-routing.yaml` (§ `cli_runners`).
4. Montar o prompt enxuto e executar o comando no terminal.

---

## 3. Configuração dos Runners (`.ai/model-routing.yaml`)

Os runners de CLI são configurados na seção `cli_runners` do `.ai/model-routing.yaml`:

```yaml
cli_runners:
  codex:
    binary: "codex"
    command_template: "codex exec --model {model} -p \"{prompt}\""
    default_model: "gpt-5.6-sol"
  claude:
    binary: "claude"
    command_template: "claude -p \"{prompt}\" --model {model}"
    default_model: "claude-sonnet-5"
  opencode:
    binary: "opencode"
    command_template: "opencode --model {model} \"{prompt}\""
    default_model: "deepseek-v4-flash"
  agy:
    binary: "agy"
    command_template: "agy --model {model} \"{prompt}\""
    default_model: "gemini-3.7-flash"
  gemini:
    binary: "gemini"
    command_template: "gemini run --model {model} \"{prompt}\""
    default_model: "gemini-3.7-flash"
  qwen:
    binary: "qwen"
    command_template: "qwen --model {model} \"{prompt}\""
    default_model: "qwen3.7-plus"
  kimi:
    binary: "kimi"
    command_template: "kimi --model {model} \"{prompt}\""
    default_model: "kimi-k2-chat"
```

> **Dica:** Para reconfigurar facilmente as CLIs e modelos do projeto, execute o atalho `/lnx-configurar-roteamento`.

---

## 4. Workflow de Execução pelo Agente Orquestrador

```
1. Preparação do Prompt Enxuto
   │
   ▼
2. Invocação no Terminal (run_command)
   │
   ▼
3. Captura de Saída & Inspeção (git status / git diff)
   │
   ▼
4. Verificação com Testes (verification-before-completion)
   │
   ▼
5. Registro de Evidências na Task (.planning/)
```

### Passo 1: Montagem do Prompt Enxuto
Não envie todo o histórico de conversas para a CLI externa. Passe apenas:
- O objetivo claro da subtarefa.
- Caminhos absolutos/relativos dos arquivos relevantes.
- Restrições técnicas e critério de aceitação.

### Passo 2: Invocação no Terminal
Execute o comando mapeado no terminal (usando a ferramenta de execução de comandos do seu ambiente).
Se a tarefa envolver modificação em múltiplos arquivos de alto risco, certifique-se de estar em uma branch de trabalho ou worktree dedicada.

### Passo 3: Validação do Resultado
Após o término do comando da CLI externa:
- Execute `git status` e `git diff` para inspecionar exatamente o que foi modificado ou criado.
- Execute linters e testes locais para certificar-se de que o código gerado é válido (`verification-before-completion`).

### Passo 4: Registro no Frontmatter da Task
Ao consolidar a tarefa em `.planning/PLAN_VN/tasks/task_X_Y.md`, registre o executor real e o modelo:

```yaml
---
id: task_01_02
status: completed
complexity: L2
risk: R2
created_by_model: gemini-3.7-flash
executor_model: codex/gpt-5.6-sol
reviewer_model: claude/claude-sonnet-5
---
```
