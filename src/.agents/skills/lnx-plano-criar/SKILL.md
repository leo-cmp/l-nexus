---
name: lnx-plano-criar
description: Cria uma nova fase local de desenvolvimento em .planning/PLAN_VN/plan.md, estruturando marcos e o roadmap inicial da fase.
disable-model-invocation: false
---

# Criar Plano de Fase

> [!IMPORTANT]
> **OBRIGATORIEDADE DE BRAINSTORMING E DIÁLOGO**:
> Você **NUNCA** deve criar arquivos de plano (`plan.md`) diretamente com base em suposições. Antes de escrever o arquivo, você deve obrigatoriamente invocar a skill de `brainstorming` para interagir com o usuário, propor caminhos, fazer perguntas uma a uma e validar o escopo da fase. Somente após a aprovação expressa do design pelo usuário você poderá gerar os arquivos físicos.

Esta skill deve ser ativada quando o usuário solicitar o planejamento de uma nova fase, ou via comando `/lnx-plano-criar`.

## Fluxo

1. **Definir a Fase:**
   - Identifique a próxima versão/fase incremental (`PLAN_V1`, `PLAN_V2`, etc.) analisando as pastas existentes em `.planning/` ou `planning/`.
   - Crie o diretório correspondente da fase: `.planning/PLAN_VN/` (ou `planning/PLAN_VN/` dependendo da convenção do projeto).

2. **Consultar Requisitos e Regras:**
   - Revise minuciosamente o `.ai/project.md` e as diretrizes de regras de negócio em `.ai/guidelines/domain/business-rules/` para garantir o alinhamento comercial e técnico.

3. **Gerar o `plan.md`:**
   - Crie o arquivo de ponto de entrada da fase em `.planning/PLAN_VN/plan.md` (ou `planning/PLAN_VN/plan.md`), usando `.ai/templates/plan.md` como base.
   - Adicione descrição clara da fase, objetivos de negócio, dependências técnicas, requisitos técnicos e a lista de tarefas planejadas (tasks) com status iniciais como `backlog`.

4. **Criar o Milestone no GitHub:**
   - Confirme o repositório oficial (`git remote -v` ou `gh repo view`) conforme `.ai/project.md` antes de criar qualquer coisa remota.
   - Verifique se `plan.md` já tem `milestone:` preenchido no front-matter. Se sim, reuse — não crie de novo.
   - Se vazio, busque um milestone existente com título igual a `VN - Nome da fase` (`gh api repos/{owner}/{repo}/milestones --jq '.[] | select(.title=="VN - Nome da fase")'`). Se encontrar, vincule (salve número/URL em `plan.md`) em vez de duplicar.
   - Se não existir, crie com `gh api repos/{owner}/{repo}/milestones -f title="VN - Nome da fase" -f description="..."` e salve o número/URL retornado no campo `milestone:` de `plan.md`.
   - Se a chamada ao `gh` falhar (auth, rede, permissão), pare e avise o humano — nunca prossiga sem o vínculo do milestone.
