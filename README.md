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
| **Roteamento & CLI Delegation** | Complexidade L1-L3, risco R1-R3, runners configuráveis (`codex`, `claude`, `opencode`, `agy`, etc.) e revisão independente |
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

## Estrutura instalada no projeto

> 🔒 **Arquivos Locais do Projeto**: Criados uma única vez e **nunca** sobrescritos pelo `npx update`.  
> ⚡ **Componentes do Framework**: Atualizados automaticamente pelo `npx update`.

```
projeto/
├── ⚡ AGENTS.md                  ← ponto de entrada do agente (instruções e atalhos)
├── ⚡ CLAUDE.md                  ← idêntico ao AGENTS.md
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
│   └── skills/                   ← skills de fluxo (lnx-*), gating (TDD, Debugging) e stacks
├── ⚡ .claude/
│   └── skills -> ../.agents/skills
└── ⚡ .mcp.json                  ← servidores MCP locais
```

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
| `/lnx-task-executar` | Executar próxima tarefa do plano |
| `/lnx-task-revisar` | Revisão de diff da tarefa (auto-review) |
| `/lnx-configurar-roteamento` | Configurar interativamente `model-routing.yaml` e CLIs |
| `/lnx-nexus-atualizar` | Atualizar pacote l-nexus via `npx @leo-cmp/l-nexus update` |
| `/lnx-prompt-gerar` | Gerar prompt limpo para nova sessão |
| `/lnx-brainstorm-lite` | Brainstorming rápido (3 perguntas máx) |


---

## Requisitos

- Node.js e npm/npx para instalação e validação estruturada das tasks
- Unix (Linux/macOS/WSL)
- Git + GitHub CLI (`gh`) opcional para integração com issues/PRs

Ver [MODEL_REQUIREMENTS.md](MODEL_REQUIREMENTS.md) para configurar perfis,
avaliações e política de revisão.

---

## Roteamento e Revisão

Cada task registra separadamente:

- complexidade de implementação (`L1`, `L2`, `L3`);
- risco de uma implementação incorreta (`R1`, `R2`, `R3`);
- modelo que criou a task;
- modelo que realmente executou;
- modelos que revisaram e o commit avaliado.

R3 sempre exige revisão independente. R2 segue
`project_policy.r2_review` em `.ai/model-routing.yaml`. O catálogo é do projeto:
o l-nexus fornece perfis e política, mas não presume que uma marca ou versão
seja permanentemente superior.

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

---

## Versão

A versão publicada está em [`VERSION`](VERSION) e nas tags do repositório.
