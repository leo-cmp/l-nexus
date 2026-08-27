---
name: lnx-configurar-roteamento
description: Configura interativamente o roteamento de modelos (.ai/model-routing.yaml) e as diretrizes de delegação de CLIs via terminal (.ai/guidelines/core/cli-delegation.md).
disable-model-invocation: false
---

# Configurar Roteamento e Delegação por Terminal CLI

Esta skill deve ser acionada quando o usuário desejar configurar ou redefinir os modelos de IA, perfis de risco e executores de terminal CLI (`codex`, `claude`, `opencode`, `agy`, `gemini`, `qwen`, `kimi`, etc.), ou via atalho `/lnx-configurar-roteamento`.

## Fluxo Interativo Obrigatório

Não crie ou altere arquivos em silêncio. Conduza o assistente em 4 etapas objetivas:

### 1. Descoberta de CLIs Instaladas no Ambiente
Verifique quais ferramentas de CLI de IA estão disponíveis no ambiente do usuário executando testes rápidos de versão (ou perguntando se não puder executar):
- `codex --version`
- `claude --version`
- `opencode --version`
- `agy --version`
- `gemini --version`
- `ollama --version`
- `gh copilot --version`

Apresente ao usuário a lista de CLIs detectadas e pergunte quais ele deseja habilitar para delegação via terminal no projeto.

### 2. Definição dos Modelos por Perfil de Risco / Complexidade
Alinhe com o usuário os modelos preferidos para cada rank de execução:
- **Rank 1 — Economical (L1 / R1):** Tarefas rápidas, localizadas e de baixo risco (ex: `gpt-4o-mini`, `qwen2.5-coder`, `gemini-2.5-flash`, `claude-3-5-haiku`).
- **Rank 2 — Balanced (L2 / R2):** Implementações delimitadas, testes de unidade e integrações usuais (ex: `claude-3-7-sonnet`, `gemini-2.5-pro`, `gpt-4o`, `deepseek-v3`).
- **Rank 3 — Frontier (L3 / R3):** Arquitetura complexa, domínios críticos (pagamentos, auth, migrations destrutivas) e revisão independente (ex: `claude-3-7-sonnet`, `gpt-5`, `o3-mini`, `gemini-2.5-pro`).

### 3. Configuração dos Templates de Comando CLI
Para cada CLI selecionada, valide o template de execução não-bloqueante / batch. Exemplo padrão:
- **Codex:** `codex exec --model {model} -p "{prompt}"`
- **Claude Code:** `claude -p "{prompt}" --model {model}`
- **OpenCode:** `opencode --model {model} "{prompt}"`
- **AGY (Antigravity CLI):** `agy --model {model} "{prompt}"`
- **Gemini CLI:** `gemini run --model {model} "{prompt}"`
- **Ollama:** `ollama run {model} "{prompt}"`

### 4. Geração e Gravação dos Artefatos
Grave ou atualize os dois arquivos centrais do projeto:
1. `.ai/model-routing.yaml`:
   - Atualize `profiles`, `models`, `risk_domains` e a seção `cli_runners`.
2. `.ai/guidelines/core/cli-delegation.md`:
   - Documente os runners ativos, sintaxe de invocação no terminal, regras para passar contexto enxuto e como registrar os logs de evidência na task pai.

Finalize exibindo um resumo claro das rotas configuradas e dos atalhos disponíveis para a equipe.
