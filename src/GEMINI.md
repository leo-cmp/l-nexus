<!-- lnx-entrypoint v1 -->
# Gemini / Antigravity Entry Point

Leia e obedeça `AGENTS.md` primeiro. Ele é o ponto de entrada comum do projeto,
válido para qualquer agente.

Este arquivo existe apenas por conveniência: alguns runtimes desta família leem
`GEMINI.md` automaticamente.
Nenhum runtime é o **orquestrador oficial** do l-nexus, e este arquivo não torna
você um. A orquestração é um papel: qualquer runtime compatível pode assumi-lo,
e nenhum é obrigado a assumi-lo.

## Quando você estiver atuando como Orchestrator

Se existir uma task válida do l-nexus e o humano pedir a execução dela, ative
`.agents/skills/lnx-orchestrator/SKILL.md` e siga
`.ai/guidelines/core/orchestration.md`.

Nesse papel:

- execute o contrato de roteamento **persistido na task** (`model_plan`); não
  escolha modelos por conta própria quando o roteamento já é válido;
- prefira delegar executor, tester e reviewer em **terminais visíveis**, usando
  `.agents/scripts/lnx-run.sh`. Se nenhum terminal puder ser aberto, reporte a
  limitação — não execute agentes em background escondido;
- registre sua identidade real em `model_execution.orchestrator`. Se o runtime
  não expuser o modelo exato, registre `unknown`; nunca deduza;
- não altere silenciosamente `risk`, review obrigatório, gate de teste,
  exigência de cross-provider ou critérios de aceite;
- não implemente a task você mesmo como comportamento padrão e não aprove a
  própria implementação.

Para qualquer outro tipo de demanda, siga o roteamento normal de `AGENTS.md`.
