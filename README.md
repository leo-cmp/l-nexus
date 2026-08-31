# l-nexus

**l-nexus** é um kit de contexto portátil para agentes de IA (Claude, Gemini, Codex, Copilot).
Skills, roles, guidelines e templates versionados — instaláveis em qualquer projeto com um comando.

```bash
npx @leo-cmp/l-nexus install
```

---

## O que vem no pacote

| Componente | Descrição |
|-----------|-----------|
| **Roles** | Backend, frontend, fullstack, database, QA, tech-lead, product-analyst, project-planner, model-router |
| **Skills** | Planejamento, execução, revisão, TDD, debugging sistemático, verificação de evidências, handoff e configuração CLI |
| **Subagentes** | Templates e protocolo de isolamento para research, coder, reviewer e qa-tester |
| **Guidelines** | Regras centrais, delegação por terminal CLI e práticas específicas de stacks |
| **Templates** | plan.md, task.md, task-short.md, issue-local.md |
| **Roteamento & CLI Delegation** | Complexidade L1-L3, risco R1-R3, slots `default/alt1/alt2/upgrade_alt1/upgrade_alt2` com effort, runners configuráveis e revisão independente |
| **Orquestração multi-LLM** | Role `orchestrator` + skill `lnx-orchestrator`: delega executor, tester e reviewer em **terminais visíveis**, coleta resultados estruturados e aplica gates de rework/upgrade |
| **MCP** | context7, github, sequential-thinking, chrome-devtools, daisyui-github, nudge |
| **Circuit breakers** | Max 5 skills/sessão, max 3 tentativas/critério, max 10 arquivos/task, loop detection |
| **Memória entre sessões** | session-memory.md + decisions.md (zero dependência externa) |

---

## Instalação

```bash
npx @leo-cmp/l-nexus install
```

---

## Atualizar

Para atualizar o l-nexus para a versão mais recente em um projeto existente (recria `.agents/` e `.mcp.json` sem alterar seus dados em `.ai/`):

```bash
npx @leo-cmp/l-nexus update
```

---

## Guarda de conteúdo protegido

Em um repositório Git, a instalação tenta ativar um hook `pre-commit` que impede
que deleções dos caminhos 🔒 sejam commitadas. Em `.ai/decisions.md`, a guarda
também impede que a quantidade de decisões (cabeçalhos que começam com `## `,
representados por `^## `) diminua; editar ou riscar uma decisão mantendo seu
cabeçalho continua permitido.

> A guarda protege a história Git, não a árvore de trabalho. Se um processo
> apagar arquivos no disco, eles continuam ausentes até serem restaurados; a
> guarda impede que a perda staged vire commit. A preservação durante uma
> atualização é responsabilidade do instalador, enquanto a guarda funciona como
> uma rede de segurança para a história.

Desfaça primeiro apenas o staging:

```bash
git restore --staged -- <caminho>
```

Restaure do último commit somente quando também quiser substituir o conteúdo da
árvore de trabalho:

```bash
git restore --source=HEAD --staged --worktree -- <caminho>
```

Uma remoção intencional pode ignorar a guarda uma vez:

```bash
git commit --no-verify
```

Hooks `pre-commit` existentes nunca são sobrescritos. O mesmo vale quando
`core.hooksPath` aponta para fora do projeto: nesse caso, a instalação avisa e
não escreve no diretório externo. Para ativar a proteção, encadeie manualmente
`.agents/hooks/lnx-guard.sh` no hook efetivo.

O stub instalado no diretório efetivo de hooks falha de forma segura quando a
guarda versionada está ausente ou não é executável, inclusive durante uma
atualização concorrente. A mensagem de bloqueio informa o arquivo `pre-commit`
efetivo: use `git commit --no-verify` para liberar somente o commit atual ou,
se o l-nexus não estiver mais em uso, remova esse stub.

Em worktrees vinculadas, rode o instalador na worktree principal. Os hooks ficam
no diretório Git compartilhado e, instalados a partir da principal, protegem
todas as worktrees. Por serem compartilhados e fail-closed, eles também bloqueiam
commits em uma worktree irmã cuja branch não contenha `.agents/`; nesse caso, as
saídas explícitas são `git commit --no-verify` ou a remoção do stub compartilhado.

---

## Estrutura instalada no projeto

> 🔒 **Arquivos Locais do Projeto**: Criados uma única vez e **nunca** sobrescritos pelo `npx update`.  
> ⚡ **Componentes do Framework**: Atualizados automaticamente pelo `npx update`.

```
projeto/
├── ⚡ AGENTS.md                  ← ponto de entrada do agente (instruções e atalhos)
├── ⚡ CLAUDE.md                  ← idêntico ao AGENTS.md
├── ⚡ GEMINI.md                  ← ponto de entrada fino p/ runtimes que leem GEMINI.md
│                                  (preservado se o projeto já tiver o seu)
├── .ai/
│   ├── 🔒 project.md             ← contexto e escopo do projeto (preservado)
│   ├── 🔒 stack.md               ← stacks ativas do projeto (preservado)
│   ├── 🔒 model-routing.yaml     ← catálogo de modelos e runners de CLI locais (preservado)
│   ├── 🔒 session-memory.md      ← memória e handoff entre sessões (preservado)
│   ├── 🔒 decisions.md           ← registro de decisões arquiteturais do projeto (preservado)
│   ├── 🔒 guidelines/domain/     ← regras de negócio locais (preservado)
│   ├── ⚡ roles/                 ← personas especializadas de IA (atualizado)
│   ├── ⚡ subagents/             ← templates e protocolo de subagentes (atualizado)
│   ├── ⚡ templates/             ← templates de plan, task e issues (atualizado)
│   └── ⚡ guidelines/
│       ├── core/                 ← execution, planning, cli-delegation, testing, etc. (atualizado)
│       └── stacks/               ← diretrizes por stack: Laravel, Tailwind, DaisyUI, etc. (atualizado)
├── ⚡ .agents/
│   ├── hooks/
│   │   └── lnx-guard.sh        ← guarda versionada de conteúdo protegido (atualizado)
│   ├── scripts/
│   │   ├── lnx-run.sh          ← delegação supervisionada em terminal visível (atualizado)
│   │   └── lnx-pty.py          ← supervisor de PTY: deixa o agente falar com o agente
│   └── skills/                   ← skills de fluxo (lnx-*), gating (TDD, Debugging) e stacks
├── .lnx/runtime/                 ← estado transitório de execução (git-ignored)
├── ⚡ .claude/
│   └── skills -> ../.agents/skills
└── ⚡ .mcp.json                  ← servidores MCP locais
```

O stub não versionado que chama a guarda não faz parte dessa árvore copiada:
ele reside no diretório efetivo de hooks determinado pelo Git.

---

## Atalhos do Agente (Slash Commands)

Organizados pela hierarquia **`/lnx-<recurso>-<ação>`**:

| Atalho | Ação |
|--------|------|
| `/lnx-projeto-iniciar` | Bootstrap de projeto novo (`project.md`, `stack.md`, regras) |
| `/lnx-projeto-revisar` | Scan e mapeamento automático de projeto existente |
| `/lnx-projeto-atualizar` | Sincronizar regras e stack do projeto |
| `/lnx-plano-criar` | Criar plano de fase local (`plan.md`) |
| `/lnx-task-criar` | Criar tarefa detalhada (`task_X_Y.md`) |
| `/lnx-task-executar` | Executar próxima tarefa do plano (encaminha para o orquestrador quando a task já está roteada) |
| `/lnx-orchestrator` | Coordenar executor → tester → reviewer em terminais visíveis, com rework e upgrade |
| `/lnx-task-revisar` | Revisão de diff da tarefa (auto-review) |
| `/lnx-configurar-roteamento` | Configurar interativamente `model-routing.yaml` e CLIs |
| `/lnx-nexus-atualizar` | Atualizar pacote l-nexus via `npx @leo-cmp/l-nexus update` |
| `/lnx-prompt-gerar` | Gerar prompt limpo para nova sessão |
| `/lnx-brainstorm-lite` | Brainstorming rápido (3 perguntas máx) |


---

## Requisitos

- Node.js e npm/npx para instalação e validação estruturada das tasks
- Unix (Linux/macOS/WSL); Linux é o ambiente prioritário
- Python 3 (stdlib) para o modo `--io broker`, que permite o Orchestrator
  conversar com os agentes que abriu. Sem ele, a delegação ainda funciona em
  `--io tty` (só leitura) ou `--io pipe`
- Git + GitHub CLI (`gh`) opcional para integração com issues/PRs

Ver [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md) para configurar perfis,
avaliações e política de revisão.

---

## Roteamento e Revisão

Cada task registra separadamente:

- complexidade de implementação (`L1`, `L2`, `L3`);
- risco de uma implementação incorreta (`R1`, `R2`, `R3`);
- classificação funcional (`work_type`, categorias, tecnologias, capabilities);
- o contrato de roteamento, com **modelo + effort** por slot;
- modelo que criou a task;
- modelo que realmente executou, com o slot usado e a CLI;
- execuções de teste e reviews, com o commit avaliado.

R3 sempre exige revisão independente. R2 segue
`project_policy.r2_review` em `.ai/model-routing.yaml`. O catálogo é do projeto:
o l-nexus fornece perfis e política, mas não presume que uma marca ou versão
seja permanentemente superior.

### Slots de roteamento

O Planner escolhe e persiste na task, para o executor (e, quando o gate se
aplica, para tester e reviewer):

| Slot | Significado |
|---|---|
| `default` | preferência normal |
| `alt1`, `alt2` | alternativas **laterais**: indisponibilidade, rate limit, custo, provedor, especialização, preferência humana — **não** são retry |
| `upgrade_alt1`, `upgrade_alt2` | escalada **vertical**: só depois de esgotar o rework ou quando a tarefa se revelar materialmente maior |

Cada slot carrega seu próprio `effort` (`default`, `low`, `high`, `max`), porque
`modelo + effort` é a unidade real de execução. A elegibilidade é resolvida por
`profile_by_variant[effort]`: o mesmo modelo pode ser elegível em `high` e
inelegível em `low`.

### Neutralidade

A arquitetura é **model-neutral, provider-neutral, CLI-neutral e
terminal-adapter-aware**:

```text
ROLE → MODEL ROUTING (slot + effort) → CLI RUNNER → TERMINAL RUNNER
```

Nenhum runtime é o orquestrador oficial, nenhum modelo tem CLI fixa e nenhum
emulador de terminal está preso à arquitetura. Tudo isso é configuração em
`.ai/model-routing.yaml`, que pertence ao projeto. Um teste do próprio repositório
falha se um nome de modelo, provedor ou CLI vazar para o código.

### Orquestração com terminais visíveis (Linux-first)

Quando uma task já tem roteamento, o `lnx-orchestrator` delega cada papel em uma
janela de terminal que você acompanha:

```text
Terminal principal   Orchestrator
Terminal visível     Executor  → Tester → Reviewer (um por vez, sequencial)
```

A detecção percorre `terminal_runners.preference` (tmux, gnome-terminal,
konsole, xfce4-terminal, kitty, alacritty, wezterm, tilix, terminator, xterm…),
e um emulador fora da lista entra via `--terminal-cmd` sem alterar o l-nexus. Se
nenhuma janela puder ser aberta, o l-nexus **não finge que abriu**: ele bloqueia
com o motivo exato ou roda inline no terminal atual. Agente principal nunca roda
em background escondido (`&`, `nohup`).

### O agente conduz o agente

O ponto da orquestração não é o humano digitar em várias janelas: é o
Orchestrator **abrir e conduzir** os outros agentes, enquanto você assiste.

```bash
lnx-run.sh start ... --io broker --detach     # abre e devolve o controle
lnx-run.sh send  <run-dir> --text "REWORK: ..."  # o Orchestrator digita
lnx-run.sh read  <run-dir> --plain --tail 40     # e lê, sem escape codes
```

Isso exige ser dono do PTY. Um pipe tira o TTY e o agente interativo não desenha
nada; `script` dá TTY mas não dá entrada; injetar em tty alheio precisaria do
ioctl `TIOCSTI`, desabilitado nos kernels atuais. Por isso o supervisor do
l-nexus (`lnx-pty.py`, stdlib do Python) segura o PTY master e multiplexa o
teclado do humano com um FIFO de controle. `status` informa `can_send`, e um
modo sem canal nunca finge que aceita instrução.

No rework, se a sessão do executor ainda está viva, o Orchestrator manda a
correção **para ela** — o contexto é preservado e não nasce uma janela por
tentativa.

A janela **nunca fecha sozinha** (`--hold keep` é o padrão); fechar
automaticamente é opt-in. Isso não atrasa gate nenhum, porque o `start` decide
pelo arquivo de estado e não pela vida da janela. Ao fechar, o supervisor
derruba o agente junto e grava o resultado; se ele for morto sem gravar,
`status` responde `orphaned` em vez de mentir `running`.

A janela é experiência de uso; o **contrato é o diretório de execução**:

```text
.lnx/runtime/<task-id>/<run-id>/
  meta.json  status  exit-code  output.log  prompt.txt  command.txt
  control.in (FIFO)  result.yaml
```

`status` e `exit-code` são escritos atomicamente, então o orquestrador sabe com
segurança quando o agente terminou e qual foi o resultado — sem depender de ler
o texto da tela.

Valide uma task contra a política do projeto:

```bash
npx @leo-cmp/l-nexus validate-task \
  .planning/PLAN_VN/tasks/task_X_Y.md \
  --final-commit "$(git rev-parse HEAD)"
```

Para converter o front matter de uma task legada sem inventar identidades de
executor ou revisor, simule primeiro e aplique explicitamente:

```bash
npx @leo-cmp/l-nexus migrate-task .planning/tasks/TASK-001.md
npx @leo-cmp/l-nexus migrate-task .planning/tasks/TASK-001.md --write
```

A migracao marca a task como `R3/legacy-unclassified` ate reclassificacao e
revisao. O corpo Markdown nao e alterado.

Para adotar os slots do schema 2 em uma task existente:

```bash
npx @leo-cmp/l-nexus migrate-task .planning/tasks/TASK-001.md --to 2 --write
```

A migracao reformata a task mas **nao inventa modelo nem effort**: ela marca
`needs_manual_routing: true` e o validador reprova ate um humano completar o
roteamento e remover a marca. Tasks no schema 1 continuam validas sem migrar.

---

## Versão

A versão publicada está em [`VERSION`](VERSION) e nas tags do repositório.
