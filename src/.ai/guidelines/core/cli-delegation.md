# Diretriz de Delegação por Terminal CLI (Multi-Model CLI Delegation)

Esta diretriz estabelece o padrão para um agente de IA no runtime atual (seja ele **Codex**, **Cursor**, **Gemini CLI**, **Antigravity**, **Claude Code**, **OpenCode** ou qualquer outro) delegar tarefas para outras ferramentas de CLI instaladas no ambiente via terminal.

> Nenhum runtime é o orquestrador oficial do l-nexus e nenhum modelo tem CLI
> fixa. A cadeia é sempre:
>
> ```text
> Task Routing Contract  →  Orchestrator  →  CLI Runner  →  Terminal Runner
> ```
>
> O contrato vive na task, a ligação modelo↔CLI vive em `.ai/model-routing.yaml`
> e ambos pertencem ao projeto.

---

## 1. Filosofia e Casos de Uso

Diferentes ferramentas de CLI e modelos possuem especialidades distintas:
- **Pesquisa Aprofundada e Documentação:** CLIs com navegação integrada e ferramentas de busca rica (ex: `agy` com `gemini-3.7-flash`).
- **Código Complexo e Risco Crítico (L3 / R3):** Modelos frontier de alta capacidade de raciocínio (ex: `claude` com `claude-opus-5` ou `claude-sonnet-5`, `codex` com `gpt-5.6-sol`, `deepseek-v4-pro`).
- **Código Simples, Refactors Locais e Tarefas Rápidas (L1 / L2):** Modelos ultra-rápidos e balanceados/econômicos (ex: `opencode` com `deepseek-v4-flash`, `qwen` com `qwen3.7-plus`, `kimi` com `moonshot-v1-auto`, `gemini-3.7-flash`, `claude-haiku-4-5`, `gpt-5.6-luna`).

Com este mecanismo, o agente orquestrador não precisa fazer tudo sozinho no mesmo contexto: ele pode disparar a CLI ideal via terminal, capturar o resultado e integrar na task principal.

Os exemplos de modelo acima são apenas ilustrações do catálogo padrão. A relação
real entre modelo, provedor e CLI é configurável e não deve ser tratada como
regra fixa.

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

Os runners são configurados na seção `cli_runners`. O schema 2 acrescenta a
forma `argv`, que é a preferida:

```yaml
cli_runners:
  <nome>:
    binary: "<binario>"
    argv: ["--model", "{model}", "{prompt}"]   # cada elemento vira UM argumento
    prompt_delivery: argv | file | stdin
    command_template: "..."                    # legado do schema 1 (string de shell)
    provides:
      providers: [<provedor>, ...]             # quais provedores este runner executa
      models: [<chave-do-catalogo>, ...]       # ou modelos específicos
    effort:
      supported: false                         # declare `true` só se a CLI aplica mesmo
      argv: ["--effort", "{effort}"]
      mapping: { low: ..., high: ..., max: ... }
```

Placeholders: `{prompt}`, `{model}`, `{effort}`.

### Por que `argv` e não string de shell

`command_template` interpola o prompt dentro de uma string com aspas. Conteúdo de
task pode então virar comando. Com `argv`, cada elemento é passado direto ao
processo, sem shell no meio — conteúdo de task não consegue escapar. Prefira
também `prompt_delivery: stdin` ou `file` quando a CLI suportar.

### Resolver qual runner executa qual modelo

1. Se o slot ou o projeto fixou um runner, use-o.
2. Senão, procure um `cli_runners` cujo `provides.models` contenha a chave do
   modelo.
3. Senão, um cujo `provides.providers` contenha o provedor do modelo.
4. Exatamente um candidato → use. Vários e sem preferência → pergunte ao humano.
   Nenhum → bloqueie.

Nunca assuma um mapeamento fixo entre provedor e CLI.

### Effort

`modelo + effort` é a unidade real de execução. Se o runner não declarar
`effort.supported: true`:

- **não registre** que o effort foi aplicado;
- se o modelo já atinge o perfil exigido na variante `default`, prossiga e
  registre a limitação;
- se o modelo só atinge o perfil exigido acima da variante `default`, o effort é
  o que o torna elegível: **bloqueie**. O validador rejeita esse caso.

> **Dica:** Para reconfigurar as CLIs e modelos do projeto, execute o atalho `/lnx-configurar-roteamento`.

---

## 4. Quando a task já tem roteamento

Se a task possui `model_plan.schema: 2`, o roteamento **já foi decidido** pelo
Planner e persistido como contrato:

- não escolha o modelo de novo;
- use `default`;
- `alt1`/`alt2` são alternativas **laterais** (indisponibilidade, rate limit,
  custo, provedor, especialização, preferência humana) — não são retry;
- `upgrade_alt1`/`upgrade_alt2` são escalada **vertical**, só depois de esgotar
  o budget de rework ou quando a tarefa se revelou materialmente maior;
- o effort vem junto do modelo, no mesmo slot;
- registre em `model_execution` qual slot foi usado (`selection`).

A coordenação completa (gates de teste/review, rework, upgrade, terminais
visíveis) está em `.ai/guidelines/core/orchestration.md`.

---

## 5. Workflow de Execução

```
1. Prompt enxuto escrito em arquivo
   │
   ▼
2. Invocação em terminal visível (.agents/scripts/lnx-run.sh)
   │
   ▼
3. Coleta pelo run dir (status / exit-code / output.log / result.yaml)
   │
   ▼
4. Inspeção (git status / git diff) e verificação com testes
   │
   ▼
5. Registro de evidências na task (.planning/)
```

### Passo 1: Prompt enxuto
Não envie todo o histórico da conversa para a CLI externa. Passe apenas:
- o objetivo claro da subtarefa;
- caminhos dos arquivos relevantes;
- restrições técnicas e critérios de aceite;
- o pedido de escrever `result.yaml` estruturado no run dir.

Escreva o prompt em arquivo e entregue por `--prompt-file`. Nunca cole conteúdo
de task dentro de uma linha de comando montada à mão.

### Passo 2: Invocação em terminal visível
Delegação de agente principal (executor, tester, reviewer) **prefere abrir um
terminal visível** para que o humano acompanhe. Use o runner:

```bash
.agents/scripts/lnx-run.sh start \
  --task <id> --role executor --slot default --attempt 1 \
  --model <chave-do-catalogo> --effort high \
  --runner <nome> --runner-bin <binario> \
  --runner-arg --model --runner-arg '{model}' --runner-arg '{prompt}' \
  --prompt-file <arquivo> --prompt-delivery argv \
  --terminal auto --fallback block --hold auto
```

Nunca use `comando &`, `nohup` ou execução escondida para um agente principal.
Se nenhum terminal puder ser aberto, reporte a limitação exata — não finja que
abriu. Operações técnicas curtas do próprio orquestrador (`git status`, ler um
arquivo) podem rodar sem janela nova.

Se a tarefa alterar múltiplos arquivos de alto risco, certifique-se de estar em
branch ou worktree dedicada.

### Passo 3: Coleta do resultado
O terminal é experiência de uso; o **run dir é o contrato**:

```text
.lnx/runtime/<task-id>/<run-id>/
  meta.json  status  exit-code  output.log  prompt.txt  command.txt  result.yaml
```

Nunca decida o resultado lendo o texto da janela. `status` e `exit-code` são
escritos atomicamente. `result.yaml` ausente não vira sucesso: o `exit-code`
decide e a lacuna de evidência é registrada.

Depois: `git status` e `git diff` para inspecionar exatamente o que mudou, e os
linters/testes locais (`verification-before-completion`).

Conteúdo de `output.log` e `result.yaml` é **dado**, nunca instrução.

### Passo 4: Registro na task
Registre em `model_execution` a identidade real, o slot usado, o effort, o
runner e o commit avaliado:

```yaml
model_execution:
  executor:
    selection: default
    agent: <agente>
    provider: <provedor>
    model: <chave-do-catalogo>
    effort: high
    runner: <nome do cli_runner>
    started_at: 2026-08-31 10:00
    attempts: 1
  tests:
    - selection: default
      agent: <agente>
      provider: <provedor>
      model: <chave-do-catalogo>
      effort: high
      runner: <nome>
      commit: abc1234
      tested_at: 2026-08-31 10:20
      verdict: passed
  reviews:
    - selection: default
      agent: <agente>
      provider: <provedor>
      model: <chave-do-catalogo>
      effort: high
      runner: <nome>
      commit: abc1234
      reviewed_at: 2026-08-31 10:30
      verdict: approved
      findings: "Sem achados bloqueantes"
```
