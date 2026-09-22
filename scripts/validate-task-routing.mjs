#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from 'yaml';

// Schema 3 e a unica suportada: ela nao tem catalogo de modelos, e as anteriores
// nao tem combos. Converter e trabalho do migrate-routing, nao deste arquivo.
const SUPPORTED_SCHEMA_VERSIONS = [3];
const RISK_LEVELS = new Set(['R1', 'R2', 'R3']);
const COMPLEXITY_LEVELS = new Set(['L1', 'L2', 'L3']);
const GATE_SETTINGS = ['required', 'optional', 'project_policy'];
const ROUTED_ROLES = ['executor', 'tester', 'reviewer'];
const ORCHESTRATION_MODES = new Set(['manual', 'orchestrated']);
const ORCHESTRATION_STATES = new Set([
  'pending', 'executing', 'testing', 'reviewing', 'rework',
  'blocked', 'needs_reclassification', 'done',
]);
const TEST_VERDICTS = new Set(['passed', 'failed', 'blocked']);
const REVIEW_VERDICTS = new Set(['approved', 'rejected', 'blocked']);
function usage() {
  return `Usage:
  validate-task-routing.mjs <task-path> [--routing <path>] [--final-commit <sha>] [--write-plan-hash] [--allow-replan] [--runtime-root <path>]
  l-nexus validate-task <task-path> [--routing <path>] [--final-commit <sha>] [--write-plan-hash] [--allow-replan] [--runtime-root <path>]
  l-nexus migrate-task <task-path> [--to 1|2] [--write]

Validates task front matter against model-routing.yaml (schema_version 1 or 2).
--write-plan-hash freezes task.model_plan by recording its plan_hash and exits.
--allow-replan downgrades the git witness error to a warning. It exists for the
human who deliberately replanned a task already under execution, and for nobody
else: an agent that reaches for it is doing exactly what the check forbids.
--runtime-root points at the lnx-run run directories used to verify run_id
(default: the nearest .lnx/runtime above the task file).`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'validate-task') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  const options = {
    taskPath: null,
    routingPath: '.ai/model-routing.yaml',
    finalCommit: null,
    writePlanHash: false,
    allowReplan: false,
    runtimeRoot: null,
  };
  while (args.length > 0) {
    const value = args.shift();
    if (value === '--write-plan-hash') {
      options.writePlanHash = true;
      continue;
    }
    if (value === '--allow-replan') {
      options.allowReplan = true;
      continue;
    }
    if (value === '--routing' || value === '--final-commit' || value === '--runtime-root') {
      const optionValue = args.shift();
      if (!optionValue) throw new Error(`cli.${value}: requires a value`);
      if (value === '--routing') options.routingPath = optionValue;
      else if (value === '--runtime-root') options.runtimeRoot = optionValue;
      else options.finalCommit = optionValue;
      continue;
    }
    if (value.startsWith('-')) throw new Error(`cli: unknown option ${value}`);
    if (options.taskPath) throw new Error('cli: expected exactly one task path');
    options.taskPath = value;
  }
  if (!options.taskPath) throw new Error('cli.taskPath: is required');
  return options;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

// Avisos usam o mesmo formato dos erros, mas em canal proprio para nunca
// alterar o exit code. Um aviso e um risco conhecido que o projeto aceita; um
// erro e uma violacao do contrato.
function addWarning(warnings, field, message) {
  warnings.push(`${field}: ${message}`);
}

function parseYaml(text, source) {
  const document = parseDocument(text, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`${source}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const value = document.toJS();
  if (!isObject(value)) throw new Error(`${source}: expected a YAML mapping`);
  return value;
}

function parseTaskFrontMatter(text, source) {
  const normalized = text.replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${source}: expected YAML front matter delimited by ---`);
  return parseYaml(match[1], `${source} front matter`);
}

// Serializacao canonica usada pelo plan_hash: JSON com as chaves de todo
// objeto ordenadas recursivamente e sem espacos. Quem gerar o hash fora do
// validador precisa reproduzir exatamente esta regra, senao o plano nunca
// valida por mais correto que esteja. Strings seguem o escape do JSON.stringify.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

// Hash do bloco model_plan inteiro, menos o proprio plan_hash. Congelar o plano
// quebra a checagem circular: o ator medido nao pode acrescentar um slot, reescrever
// a justificativa e ainda ser aprovado contra o plano que ele mesmo editou.
function computePlanHash(plan) {
  const frozen = { ...plan };
  delete frozen.plan_hash;
  return createHash('sha256').update(canonicalJson(frozen), 'utf8').digest('hex');
}

// Sem plan_hash o plano nao esta congelado, mas tasks antigas nao podem quebrar:
// por isso a ausencia e aviso, nunca erro. Um hash presente e divergente e erro,
// porque prova que o bloco foi editado depois de congelado.
function validatePlanHash(plan, field, errors, warnings) {
  if (!isObject(plan)) return;
  if (plan.plan_hash === undefined || plan.plan_hash === null) {
    addWarning(warnings, `${field}.plan_hash`,
      'model_plan is not frozen; run validate-task <task> --write-plan-hash to record it');
    return;
  }
  if (typeof plan.plan_hash !== 'string' || plan.plan_hash.trim() === '') {
    addError(errors, `${field}.plan_hash`, 'must be a non-empty sha256 hex string');
    return;
  }
  const expected = computePlanHash(plan);
  if (plan.plan_hash.trim().toLowerCase() !== expected) {
    addError(errors, `${field}.plan_hash`, `does not match the model plan contents (expected ${expected})`);
  }
}

// Prova de ocorrencia. Todo o resto deste arquivo confere FORMA: se o registro
// esta bem preenchido, se aponta para um slot que existe, se o modelo consta do
// catalogo. Nada disso pergunta se a execucao aconteceu. Um agente pode escrever
// "verdict: approved, findings: sem achados" sem ter chamado revisor nenhum.
//
// O lnx-run.sh ja grava, a cada execucao delegada, um diretorio por run com
// meta.json, exit-code e log. Quem escreve esse diretorio e o script, nao o
// agente medido. Conferir a linha da task contra esse registro troca o custo de
// mentir: deixa de ser uma linha de YAML e passa a ser uma arvore de arquivos
// com carimbos que o agente nao emite.
//
// Limite declarado: .lnx/ nao entra no git. A verificacao so vale na maquina que
// executou — que e onde o gate roda, mas significa que CI nao reconfere depois.
const RUN_EVIDENCE_FIELDS = [
  // [campo no meta.json, campo na entrada da task, rotulo no erro]
  ['role', null, 'role'],
  // `meta.json.model` e o eco de `--model`, que na schema 3 e o COMBO. Ele
  // confere contra `combo`, nao contra `model`: o que o script registrou foi o
  // pedido, e e com o pedido que ele pode ser confrontado.
  //
  // Enquanto isto comparava com `model`, o campo nao tinha valor possivel numa
  // task com run_id -- o modelo real divergia do combo aqui, o combo era
  // recusado como "nome de combo em vez do modelo que respondeu", e `unknown`
  // nao fecha gate em R2/R3. Foi esse beco que produziu um nome inventado: era
  // a unica coisa que ninguem conseguia provar errada de imediato.
  ['model', 'combo', 'combo'],
  ['effort', 'effort', 'effort'],
  ['slot', 'selection', 'slot'],
  ['runner', 'runner', 'runner'],
];

// Mesma regra do sanitize() do lnx-run.sh, que nomeia o diretorio da task.
function sanitizeRunPath(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_');
}

// O .lnx/ fica na raiz do projeto e a task, em geral, varios niveis abaixo.
// Procurar para cima acha a raiz sem exigir que o comando rode de um lugar
// especifico; sem achar, o padrao e o diretorio corrente, que e onde o
// orquestrador roda.
function resolveRuntimeRoot(override, taskPath) {
  if (override) return override;
  let directory = path.dirname(path.resolve(taskPath));
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = path.join(directory, '.lnx', 'runtime');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return path.join(process.cwd(), '.lnx', 'runtime');
}

// Datas: o registro do run e ISO em UTC, o campo da task e texto livre escrito
// por gente ("2026-08-31 10:30"), sem fuso. Comparar com precisao seria inventar
// exatidao que o dado nao tem, entao so um disparate e erro: o run comecar mais
// de um dia DEPOIS do instante que a task diz ter sido avaliado. Isso passa
// longe de qualquer fuso e ainda pega run_id reaproveitado de outra execucao.
const RUN_CLOCK_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function parseLooseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(' ', 'T');
  const parsed = Date.parse(/[Zz]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

function validateRunEvidence(entry, field, context, errors, warnings) {
  const { taskId, role, runtimeRoot, declaredAt, countsForGate } = context;
  const runId = entry.run_id;
  if (runId === undefined || runId === null) {
    if (countsForGate) {
      addWarning(warnings, `${field}.run_id`,
        'is absent, so this gate rests on what the task says about itself; record the lnx-run run_id to make it verifiable');
    }
    return;
  }
  if (typeof runId !== 'string' || runId.trim() === '') {
    addError(errors, `${field}.run_id`, 'must be a non-empty string');
    return;
  }
  const runDirectory = path.join(runtimeRoot, sanitizeRunPath(taskId), runId.trim());
  const metaPath = path.join(runDirectory, 'meta.json');
  if (!existsSync(metaPath)) {
    addError(errors, `${field}.run_id`, `has no run record at ${metaPath}`);
    return;
  }
  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (error) {
    addError(errors, `${field}.run_id`, `has an unreadable run record at ${metaPath}: ${error.message}`);
    return;
  }
  if (!isObject(meta)) {
    addError(errors, `${field}.run_id`, `has a run record that is not a JSON object at ${metaPath}`);
    return;
  }

  // Um run_id copiado de outra task apontaria para um registro perfeitamente
  // valido — de outra task. O campo `task` do proprio registro e quem desmente.
  if (sanitizeRunPath(meta.task ?? '') !== sanitizeRunPath(taskId)) {
    addError(errors, `${field}.run_id`, `belongs to task ${meta.task}, not to ${taskId}`);
  }
  for (const [metaKey, entryKey, label] of RUN_EVIDENCE_FIELDS) {
    const expected = entryKey === null ? role : entry[entryKey];
    if (expected === undefined || expected === null || expected === '') continue;
    const recorded = meta[metaKey];
    if (recorded === undefined || recorded === null || recorded === '') continue;
    if (String(recorded) !== String(expected)) {
      addError(errors, `${field}.run_id`, `records ${label} ${recorded}, but the task declares ${expected}`);
    }
  }

  // Sem exit-code o run comecou e nao se sabe se terminou. Gate fechado por
  // execucao que talvez ainda esteja rodando nao e gate.
  if (!existsSync(path.join(runDirectory, 'exit-code'))) {
    addError(errors, `${field}.run_id`, 'has a run record without exit-code, so the run never finished');
  }

  // Quem atendeu nao e necessariamente quem foi pedido: CLI com fallback e
  // proxy com rodizio trocam de modelo sozinhos. Quando o runner sabe reportar,
  // o observado vale mais que o declarado — foi medido, nao afirmado.
  const observedPath = path.join(runDirectory, 'observed-model');
  if (existsSync(observedPath)) {
    const observed = readFileSync(observedPath, 'utf8').trim();
    if (observed !== '' && entry.model !== undefined && observed !== String(entry.model)) {
      addError(errors, `${field}.run_id`,
        `ran on ${observed}, not on the declared ${entry.model}; the runner reported what actually answered`);
    }
  }

  // Mesmo raciocinio do observed-model, mas para o esforco: um seletor de
  // dashboard no gateway do proxy repassa ou sobrescreve o esforco pedido, e
  // essa configuracao nao aparece nem no kit nem no registro da task. Sem isso,
  // uma task poderia declarar effort: high e ter rodado em low sem denuncia.
  const observedEffortPath = path.join(runDirectory, 'observed-effort');
  if (existsSync(observedEffortPath)) {
    const observedEffort = readFileSync(observedEffortPath, 'utf8').trim();
    if (observedEffort !== '' && entry.effort !== undefined && observedEffort !== String(entry.effort)) {
      addError(errors, `${field}.run_id`,
        `ran at effort ${observedEffort}, not at the declared ${entry.effort}; the runner reported what was actually applied`);
    }
  }

  const startedAt = parseLooseTimestamp(meta.started_at);
  const declared = parseLooseTimestamp(declaredAt);
  if (startedAt !== null && declared !== null && startedAt - declared > RUN_CLOCK_TOLERANCE_MS) {
    addError(errors, `${field}.run_id`, `started at ${meta.started_at}, after the ${role} result it is supposed to back (${declaredAt})`);
  }
}

// Git como testemunha do plano. O plan_hash prova que o bloco nao mudou desde
// que foi congelado, mas quem pode rodar --write-plan-hash contorna a prova em
// um comando: edita o plano, regrava o hash, segue. O historico nao se deixa
// regravar assim. O arquivo da task ja foi commitado com um plano, e essa
// versao esta fora do alcance de quem edita o arquivo agora — reescrever o
// passado exige force-push e deixa rastro. Por isso a comparacao aqui e contra
// o commit, e nao contra um campo que mora no mesmo arquivo que ela protege.
const WITNESS_COMMIT_LIMIT = 50;

function gitText(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// A testemunha e a ultima versao commitada ANTES de a execucao comecar: enquanto
// nenhum executor foi registrado, replanejar e livre e legitimo, e o Planner
// pode corrigir o plano quantas vezes precisar. Depois do primeiro registro de
// execucao, o plano e contrato em vigor.
function findPlanWitness(relativePath, cwd) {
  const log = gitText(['log', '--format=%H', '--', relativePath], cwd).trim();
  if (log === '') return null;
  for (const commit of log.split('\n').slice(0, WITNESS_COMMIT_LIMIT)) {
    let committed;
    try {
      committed = parseTaskFrontMatter(gitText(['show', `${commit}:${relativePath}`], cwd), commit);
    } catch {
      // Versao antiga sem front matter legivel nao serve de testemunho.
      continue;
    }
    if (!hasStartedExecution(committed.model_execution?.executor)) {
      return { commit, plan: committed.model_plan };
    }
  }
  return null;
}

function validatePlanWitness(task, taskPath, field, errors, warnings, { allowReplan = false } = {}) {
  if (!isObject(task.model_plan)) return;
  if (!hasStartedExecution(task.model_execution?.executor)) return;

  const cwd = path.dirname(path.resolve(taskPath));
  let relativePath;
  try {
    relativePath = gitText(['ls-files', '--full-name', '--error-unmatch', '--', path.basename(taskPath)], cwd).trim();
  } catch {
    addWarning(warnings, field, 'is not tracked by git, so the plan has no witness outside the task file itself');
    return;
  }

  let witness;
  try {
    witness = findPlanWitness(relativePath, cwd);
  } catch {
    addWarning(warnings, field, 'could not be read from git history, so the plan has no witness outside the task file itself');
    return;
  }
  // Nenhuma versao commitada antecede a execucao: o arquivo entrou no historico
  // ja com execucao registrada. Nao da para saber qual era o plano quando o
  // trabalho comecou, e inventar um testemunho seria pior que nao ter nenhum.
  if (!witness || !isObject(witness.plan)) {
    addWarning(warnings, field,
      'has no committed version predating its execution record, so git cannot witness the plan that was in force');
    return;
  }

  // Compara o conteudo, nao o plan_hash: regravar o hash nao muda o plano, e
  // mudar o plano nao escapa por regravar o hash.
  if (computePlanHash(task.model_plan) === computePlanHash(witness.plan)) return;
  const message = `differs from the plan committed in ${witness.commit.slice(0, 7)}, the last version recorded before execution started; editing the plan after the work began is replanning`;
  if (allowReplan) addWarning(warnings, field, `${message} (accepted because --allow-replan was passed)`);
  else addError(errors, field, message);
}

// Compara commits por prefixo de SHA: um SHA curto e o SHA completo do mesmo
// commit. A igualdade estrita fazia o bloco de revisao ser PULADO em silencio e
// o comando ainda imprimia "validation passed". Dois SHAs batem quando um e
// prefixo do outro, com no minimo 7 caracteres hexadecimais.
function commitMatches(recorded, expected) {
  if (typeof recorded !== 'string' || typeof expected !== 'string') return false;
  const left = recorded.trim().toLowerCase();
  const right = expected.trim().toLowerCase();
  if (left.length < 7 || right.length < 7) return false;
  if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right)) return false;
  return left.startsWith(right) || right.startsWith(left);
}

// Grava plan_hash no arquivo da task, preservando o restante do front matter.
// Sem esta flag o Planner nao tem como emitir o valor, e toda task ficaria
// eternamente apenas avisada de que o plano nao esta congelado.
function writePlanHash(taskPath) {
  const contents = readFileSync(taskPath, 'utf8');
  const normalized = contents.replace(/^\uFEFF/, '');
  const bom = contents.startsWith('\uFEFF') ? '\uFEFF' : '';
  const match = normalized.match(/^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) throw new Error(`${taskPath}: expected YAML front matter delimited by ---`);
  const newline = match[1];
  const closing = match[3];
  const document = parseDocument(match[2], { prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(`${taskPath}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const value = document.toJS();
  if (!isObject(value) || !isObject(value.model_plan)) {
    throw new Error(`${taskPath}: expected a model_plan mapping to freeze`);
  }
  const hash = computePlanHash(value.model_plan);
  document.setIn(['model_plan', 'plan_hash'], hash);
  const frontMatter = document.toString({ lineWidth: 0 }).trimEnd().replaceAll('\n', newline);
  const body = normalized.slice(match[0].length);
  writeFileSync(taskPath, `${bom}---${newline}${frontMatter}${newline}---${closing}${body}`, 'utf8');
  return hash;
}

// Dizer `unknown` e uma afirmacao -- "ninguem observou" -- e nao a ausencia de
// uma. Campo vazio nao afirma nada, e por isso os dois nao podem ser tratados
// igual.
function declaresUnknown(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'unknown';
}

function valueIsKnown(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== 'unknown';
}

// O template entrega `model_execution.executor` ja montado, com os campos
// vazios, porque o esqueleto e o que ensina ao agente quais campos existem.
// Presenca do mapping, entao, nao prova nada: o que separa task pendente de
// task executada e haver ALGUM valor de verdade ali dentro. Numero nao conta --
// `reasoning_tokens: 0` vem do proprio esqueleto.
function hasStartedExecution(record) {
  return isObject(record) && Object.values(record).some(valueIsKnown);
}

function validateIdentity(errors, value, field, { requireKnown = false } = {}) {
  if (!isObject(value)) {
    addError(errors, field, 'must be a mapping with agent, model, and provider');
    return false;
  }
  for (const key of ['agent', 'model', 'provider']) {
    const identity = value[key];
    if (typeof identity !== 'string' || identity.trim() === '') {
      addError(errors, `${field}.${key}`, 'must be a non-empty string');
    } else if (requireKnown && key !== 'agent' && !valueIsKnown(identity)) {
      addError(errors, `${field}.${key}`, 'must be known and cannot be unknown');
    }
  }
  return true;
}

// Uma task fechada e um registro do passado, e nao um plano em aberto. O campo
// lido aqui e orchestration.state porque ele e enum fechado que este arquivo ja
// valida (ORCHESTRATION_STATES): o `status` do front matter e texto livre que o
// validador nunca leu e que em projeto real ja aparece escrito de dois jeitos
// ("done" e "completed"), entao aceitar ele seria adivinhar uma lista de grafias
// que envelhece em silencio -- e cada grafia nova reabriria a checagem sem
// ninguem notar. Schema 1 nao tem bloco orchestration e por isso nunca fecha:
// e legado, e a flexibilizacao abaixo simplesmente nao o alcanca.
function taskIsClosed(task) {
  return isObject(task) && isObject(task.orchestration) && task.orchestration.state === 'done';
}

function effectiveReviewRequired(riskLevel, routing) {
  if (riskLevel === 'R3') return true;
  if (riskLevel === 'R2') return routing.project_policy.r2_review === 'required';
  return false;
}

function effectiveTestGateRequired(riskLevel, routing) {
  if (riskLevel === 'R3') return true;
  if (riskLevel === 'R2') return routing.project_policy.r2_test_gate === 'required';
  return false;
}

// Um modelo declarado em papeis diferentes (executor, tester, reviewer) e erro
// ja no plano. Se ele pode cair em dois papeis, mais cedo ou mais tarde testa e
// revisa o proprio trabalho, e o gate vira carimbo.
function validateRoleModelDisjointness(errors, plan) {
  const modelRoles = new Map();
  for (const roleName of ROUTED_ROLES) {
    const rolePlan = plan?.[roleName];
    if (!isObject(rolePlan)) continue;
    for (const slot of ROUTING_SLOTS) {
      const value = rolePlan[slot];
      if (!isObject(value) || typeof value.model !== 'string' || value.model.trim() === '') continue;
      const owner = modelRoles.get(value.model);
      if (owner === undefined) {
        modelRoles.set(value.model, roleName);
      } else if (owner !== roleName) {
        addError(errors, `task.model_plan.${roleName}.${slot}.model`,
          `${value.model} is already planned for the ${owner} role; a model must not serve two roles`);
      }
    }
  }
}

// Checks that a recorded execution honours the slot it claims to have used, so
// the orchestrator cannot substitute a model without the task saying so.
function validateExecutionSlot(errors, record, field, plan, roleName) {
  const selection = record.selection;
  if (!ROUTING_SLOTS.includes(selection)) {
    addError(errors, `${field}.selection`, `must be one of ${ROUTING_SLOTS.join(', ')}`);
    return;
  }
  const slot = isObject(plan) ? plan[selection] : undefined;
  if (!isObject(slot)) {
    addError(errors, `${field}.selection`, `must name a slot declared in task.model_plan.${roleName} (${selection})`);
    return;
  }
  if (record.model !== slot.model) {
    addError(errors, `${field}.model`, `must match task.model_plan.${roleName}.${selection}.model (${slot.model})`);
  }
  if (record.effort !== slot.effort) {
    addError(errors, `${field}.effort`, `must match task.model_plan.${roleName}.${selection}.effort (${slot.effort})`);
  }
}

function resolveFinalCommit(override) {
  if (override) return override;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('cli.finalCommit: could not resolve Git HEAD; pass --final-commit <sha>');
  }
}// A partir da schema 3 o kit nao conhece modelos: ele conhece COMBOS do
// gateway. Nenhuma regra abaixo pergunta o que um modelo e -- pergunta se o
// combo esta declarado, se o portao foi cumprido e se quem revisou nao foi quem
// executou. Comparacao de nome, nunca de perfil. E por isso que modelo novo no
// gateway nao reprova task nenhuma: nao ha o que conferir sobre ele.
function validateRouting(routing, errors) {
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(routing.schema_version)) {
    addError(errors, 'routing.schema_version',
      `must be one of ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}; run \`l-nexus migrate-routing\` to convert`);
    return;
  }
  if (!isObject(routing.project_policy)) {
    addError(errors, 'routing.project_policy', 'must be a mapping');
  } else {
    for (const key of ['r2_review', 'r2_test_gate']) {
      if (!['required', 'optional'].includes(routing.project_policy[key])) {
        addError(errors, `routing.project_policy.${key}`, 'must be required or optional');
      }
    }
  }
  if (!isObject(routing.risk_domains)) {
    addError(errors, 'routing.risk_domains', 'must be a mapping');
  } else {
    for (const key of ['generic_r3', 'project']) {
      const domains = routing.risk_domains[key];
      if (!Array.isArray(domains) || domains.some((d) => typeof d !== 'string' || d.trim() === '')) {
        addError(errors, `routing.risk_domains.${key}`, 'must be an array of non-empty strings');
      }
    }
  }
  if (!isObject(routing.routes)) {
    addError(errors, 'routing.routes', 'must be a mapping');
  } else {
    for (const level of RISK_LEVELS) {
      const route = routing.routes[level];
      if (!isObject(route)) { addError(errors, `routing.routes.${level}`, 'must be a mapping'); continue; }
      for (const key of ['review', 'test_gate']) {
        if (!GATE_SETTINGS.includes(route[key])) {
          addError(errors, `routing.routes.${level}.${key}`, `must be one of ${GATE_SETTINGS.join(', ')}`);
        }
      }
      if (typeof route.independent_model !== 'boolean') {
        addError(errors, `routing.routes.${level}.independent_model`, 'must be boolean');
      }
    }
    if (routing.routes.R3?.review !== 'required') {
      addError(errors, 'routing.routes.R3.review', 'must be required');
    }
  }

  // O combo e a unica identidade que o kit tem. Se ele nao estiver declarado
  // aqui, nada mais adiante sabe o que fazer com o nome que a task citar.
  if (!isObject(routing.combos) || Object.keys(routing.combos).length === 0) {
    addError(errors, 'routing.combos', 'must be a mapping with at least one combo');
  } else {
    for (const [name, combo] of Object.entries(routing.combos)) {
      if (!isObject(combo)) { addError(errors, `routing.combos.${name}`, 'must be a mapping'); continue; }
      if (typeof combo.effort !== 'string' || combo.effort.trim() === '') {
        addError(errors, `routing.combos.${name}.effort`, 'must be a non-empty string');
      }
      if (combo.runner !== undefined && !isObject(routing.cli_runners?.[combo.runner])) {
        addError(errors, `routing.combos.${name}.runner`, `must reference a configured cli_runners entry (${combo.runner})`);
      }
    }
  }

  if (!isObject(routing.cli_runners?.[routing.default_runner])) {
    addError(errors, 'routing.default_runner', 'must reference a configured cli_runners entry');
  }

  if (!isObject(routing.roles)) {
    addError(errors, 'routing.roles', 'must be a mapping');
  } else {
    for (const role of ROUTED_ROLES) {
      const entry = routing.roles[role];
      if (!isObject(entry)) { addError(errors, `routing.roles.${role}`, 'must be a mapping'); continue; }
      if (typeof entry.default !== 'string') {
        addError(errors, `routing.roles.${role}.default`, 'must name a combo');
        continue;
      }
      for (const tier of ['default', 'critical']) {
        const combo = entry[tier];
        if (combo === undefined) continue;
        if (!isObject(routing.combos?.[combo])) {
          addError(errors, `routing.roles.${role}.${tier}`, `must reference a declared combo (${combo})`);
        }
      }
    }
  }
}

// O combo que um papel usa depende so do nivel de risco: R3 puxa `critical`
// quando ele existe. Nao ha escolha de modelo, entao nao ha o que justificar.
function comboForRole(routing, role, riskLevel) {
  const entry = routing.roles?.[role];
  if (!isObject(entry)) return undefined;
  if (riskLevel === 'R3' && typeof entry.critical === 'string') return entry.critical;
  return entry.default;
}

function deriveRiskLevel(task, routing, errors) {
  const declared = task.risk?.level;
  if (!RISK_LEVELS.has(declared)) {
    addError(errors, 'task.risk.level', `must be one of ${[...RISK_LEVELS].join(', ')}`);
    return null;
  }
  const domains = Array.isArray(task.risk?.domains) ? task.risk.domains : [];
  const mandatory = new Set([
    ...(routing.risk_domains?.generic_r3 ?? []),
    ...(routing.risk_domains?.project ?? []),
  ]);
  for (const domain of domains) {
    if (mandatory.has(domain) && declared !== 'R3') {
      addError(errors, 'task.risk.level',
        `must be R3 because domain ${domain} is configured as mandatory R3`);
      return declared;
    }
  }
  return declared;
}

// Um slot planejado agora e so um combo mais o esforco que sera pedido. O
// esforco e declaracao e nao prova: o protocolo nao devolve o nivel aplicado,
// entao o kit registra o que pediu e nao finge ter conferido.
function validatePlannedRole(errors, plan, role, routing, riskLevel, { required }) {
  const entry = plan?.[role];
  const field = `task.model_plan.${role}`;
  if (required === false && entry === undefined) return;
  if (!isObject(entry)) { addError(errors, field, 'must be a mapping'); return; }
  // Plano anterior a schema 3: os papeis traziam slots nomeando modelos, e nao
  // um combo. Essas tasks ja estao fechadas e o registro delas guarda o modelo
  // real que respondeu, entao as regras que sobraram valem nelas sem traducao.
  // Reprova-las por nao citarem combo seria obrigar a reescrever historico para
  // ficar verde -- exatamente o que o kit existe para impedir.
  if (entry.combo === undefined && isObject(entry.default)) return;
  if (typeof entry.combo !== 'string' || entry.combo.trim() === '') {
    addError(errors, `${field}.combo`, 'must name a combo');
  } else if (!isObject(routing.combos?.[entry.combo])) {
    addError(errors, `${field}.combo`, `must reference a declared routing.combos entry (${entry.combo})`);
  }
  if (entry.effort !== undefined && (typeof entry.effort !== 'string' || entry.effort.trim() === '')) {
    addError(errors, `${field}.effort`, 'must be a non-empty string when present');
  }
  const esperado = comboForRole(routing, role, riskLevel);
  if (esperado !== undefined && typeof entry.combo === 'string' && entry.combo !== esperado) {
    addError(errors, `${field}.combo`,
      `must be ${esperado} for ${riskLevel}; the catalog decides which combo each role uses`);
  }
}

// O registro de execucao e o unico lugar onde existe modelo de verdade: o nome
// vem do campo `model` da RESPOSTA do gateway, nao do que o modelo diz de si e
// nao do plano. Por isso ele e prova, e nao repeticao do que ja foi planejado.
// `requireKnownModel` separa as duas coisas que este campo pode dizer. A regra
// do kit sempre foi "registre `unknown` quando o runtime nao expuser o modelo;
// nunca deduza" -- so que o validador reprovava `unknown` junto com o vazio, e
// entao a unica saida que passava no gate era inventar um nome plausivel. Foi o
// que aconteceu: um Orchestrator escreveu o modelo default do runner porque a
// resposta honesta nao fechava a task. O kit mandava dizer a verdade e travava
// a porta dela.
//
// Agora `unknown` e registro valido de que ninguem observou, e vale como aviso.
// Onde a rota exige que os papeis caiam em modelos distintos, ele volta a ser
// erro -- sem saber quem respondeu nao ha como provar disjuncao, e e ali que o
// kit ja dizia nao aceitar `unknown`. Campo vazio ou ausente segue sendo erro
// em qualquer nivel: "nao observei" e diferente de "nao preenchi".
function validateExecutionRecord(errors, warnings, record, field, routing,
  { requireKnownModel = false } = {}) {
  if (!isObject(record)) { addError(errors, field, 'must be a mapping'); return; }
  // Registro anterior a schema 3 nao tem combo porque o kit pedia o modelo
  // direto. O que importa aqui -- quem respondeu -- ele ja tem.
  if (record.combo !== undefined && (typeof record.combo !== 'string' || record.combo.trim() === '')) {
    addError(errors, `${field}.combo`, 'must name the combo that was asked for');
  } else if (record.combo !== undefined && !isObject(routing.combos?.[record.combo])) {
    addError(errors, `${field}.combo`, `must reference a declared routing.combos entry (${record.combo})`);
  }
  if (declaresUnknown(record.model)) {
    if (requireKnownModel) {
      addError(errors, `${field}.model`,
        'is unknown, and this risk level needs the roles served by different models; '
        + 'configure lnx-run.sh with --observe-bin so the run records who answered');
    } else {
      addWarning(warnings, `${field}.model`,
        'is unknown: nobody observed which model answered. Honest, but it proves nothing — '
        + '--observe-bin records it');
    }
  } else if (!valueIsKnown(record.model)) {
    addError(errors, `${field}.model`,
      'must record the model the gateway reported in the response, not the combo name');
  } else if (isObject(routing.combos?.[record.model])) {
    addError(errors, `${field}.model`,
      `records the combo name (${record.model}) instead of the model that answered; read the \`model\` field of the response`);
  }
  if (record.reasoning_tokens !== undefined
    && (!Number.isInteger(record.reasoning_tokens) || record.reasoning_tokens < 0)) {
    addError(errors, `${field}.reasoning_tokens`, 'must be a non-negative integer when present');
  }
}

// Mesma regra de sempre, agora com material melhor: compara os modelos REAIS
// que responderam, e nao os nomes planejados. Dois papeis podem citar combos
// diferentes e mesmo assim cair no mesmo modelo, porque quem resolve o combo e
// o gateway. So o registro pos-execucao consegue ver isso.
function validateServedModelDisjointness(errors, execution) {
  const executor = execution?.executor?.model;
  if (!valueIsKnown(executor)) return;
  const ultimoTeste = Array.isArray(execution?.tests)
    ? [...execution.tests].reverse().find((t) => t?.verdict === 'passed') : undefined;
  const revisao = Array.isArray(execution?.reviews)
    ? [...execution.reviews].reverse().find((r) => r?.verdict === 'approved') : undefined;
  if (ultimoTeste && valueIsKnown(ultimoTeste.model) && ultimoTeste.model === executor) {
    addError(errors, 'task.model_execution.tests',
      `was passed by ${ultimoTeste.model}, the same model that executed; a model must not test its own work`);
  }
  if (revisao && valueIsKnown(revisao.model) && revisao.model === executor) {
    addError(errors, 'task.model_execution.reviews',
      `was approved by ${revisao.model}, the same model that executed; a model must not approve its own work`);
  }
  if (revisao && ultimoTeste && valueIsKnown(revisao.model) && revisao.model === ultimoTeste.model) {
    addError(errors, 'task.model_execution.reviews',
      `was approved by ${revisao.model}, the same model that passed the final test`);
  }
}

function validateTask(task, routing, finalCommit, errors, warnings, context) {
  for (const key of ['id', 'title']) {
    if (typeof task[key] !== 'string' || task[key].trim() === '') {
      addError(errors, `task.${key}`, 'must be a non-empty string');
    }
  }
  if (!COMPLEXITY_LEVELS.has(task.complexity)) {
    addError(errors, 'task.complexity', `must be one of ${[...COMPLEXITY_LEVELS].join(', ')}`);
  }
  const riskLevel = deriveRiskLevel(task, routing, errors);
  if (riskLevel === null) return;

  const plan = task.model_plan;
  if (!isObject(plan)) { addError(errors, 'task.model_plan', 'must be a mapping'); return; }
  validateIdentity(errors, plan.created_by, 'task.model_plan.created_by');

  const route = isObject(routing.routes?.[riskLevel]) ? routing.routes[riskLevel] : {};
  const reviewRequired = effectiveReviewRequired(riskLevel, routing);
  const testRequired = effectiveTestGateRequired(riskLevel, routing);

  validatePlannedRole(errors, plan, 'executor', routing, riskLevel, { required: true });
  validatePlannedRole(errors, plan, 'tester', routing, riskLevel, { required: testRequired });
  validatePlannedRole(errors, plan, 'reviewer', routing, riskLevel, { required: reviewRequired });

  validatePlanHash(plan, 'task.model_plan', errors, warnings);

  // Proveniencia so vira exigencia depois que alguem executou. Enquanto o
  // esqueleto do template esta vazio, a task e um plano -- cobrar dela o modelo
  // que atendeu seria cobrar prova de um fato que ainda nao aconteceu.
  const execution = isObject(task.model_execution) ? task.model_execution : {};
  if (!hasStartedExecution(execution.executor)) {
    if (task.orchestration?.state === 'done') {
      addError(errors, 'task.model_execution.executor',
        'must record who executed once the task is done');
    }
    // Teste ou revisao sem execucao e contradicao, nao task pendente: alguem
    // registrou o veredito de um trabalho que o arquivo diz nao ter comecado.
    for (const campo of ['tests', 'reviews']) {
      if ((execution[campo] ?? []).some(hasStartedExecution)) {
        addError(errors, `task.model_execution.${campo}`,
          'records a run, but task.model_execution.executor is empty; nothing can be tested or reviewed before it executes');
      }
    }
    return;
  }
  const exigeModeloConhecido = route.independent_model === true;
  validateExecutionRecord(errors, warnings, execution.executor,
    'task.model_execution.executor', routing, { requireKnownModel: exigeModeloConhecido });

  for (const [indice, entrada] of (execution.tests ?? []).entries()) {
    validateExecutionRecord(errors, warnings, entrada, `task.model_execution.tests[${indice}]`, routing,
      { requireKnownModel: exigeModeloConhecido });
    if (!TEST_VERDICTS.has(entrada?.verdict)) {
      addError(errors, `task.model_execution.tests[${indice}].verdict`,
        `must be one of ${[...TEST_VERDICTS].join(', ')}`);
    }
  }
  for (const [indice, entrada] of (execution.reviews ?? []).entries()) {
    validateExecutionRecord(errors, warnings, entrada, `task.model_execution.reviews[${indice}]`, routing,
      { requireKnownModel: exigeModeloConhecido });
    if (!REVIEW_VERDICTS.has(entrada?.verdict)) {
      addError(errors, `task.model_execution.reviews[${indice}].verdict`,
        `must be one of ${[...REVIEW_VERDICTS].join(', ')}`);
    }
    if (entrada?.verdict === 'approved'
      && (typeof entrada.findings !== 'string' || entrada.findings.trim() === '')) {
      addError(errors, `task.model_execution.reviews[${indice}].findings`,
        'must explicitly summarize findings or state no findings were raised');
    }
  }

  if (testRequired) {
    const passou = (execution.tests ?? []).some(
      (t) => t?.verdict === 'passed' && commitMatches(t.commit, finalCommit));
    if (!passou) {
      addError(errors, 'task.model_execution.tests',
        `requires a passed test run of final commit ${finalCommit}`);
    }
  }
  if (reviewRequired) {
    const aprovou = (execution.reviews ?? []).some(
      (r) => r?.verdict === 'approved' && commitMatches(r.commit, finalCommit));
    if (!aprovou) {
      addError(errors, 'task.model_execution.reviews',
        `requires an approved review of final commit ${finalCommit}`);
    }
  }
  if (route.independent_model === true) validateServedModelDisjointness(errors, execution);

  // A evidencia de rodada e por registro, nao por task: cada execucao, teste e
  // revisao aponta para o seu proprio run_id, e e esse registro que desmente ou
  // confirma o que a entrada afirma sobre si.
  const evid = { taskId: task.id, runtimeRoot: context.runtimeRoot };
  if (isObject(execution.executor)) {
    validateRunEvidence(execution.executor, 'task.model_execution.executor',
      { ...evid, role: 'executor', declaredAt: execution.executor.started_at, countsForGate: false },
      errors, warnings);
  }
  for (const [indice, entrada] of (execution.tests ?? []).entries()) {
    if (!isObject(entrada)) continue;
    validateRunEvidence(entrada, `task.model_execution.tests[${indice}]`,
      { ...evid, role: 'tester', declaredAt: entrada.tested_at,
        countsForGate: testRequired && entrada.verdict === 'passed' && commitMatches(entrada.commit, finalCommit) },
      errors, warnings);
  }
  for (const [indice, entrada] of (execution.reviews ?? []).entries()) {
    if (!isObject(entrada)) continue;
    validateRunEvidence(entrada, `task.model_execution.reviews[${indice}]`,
      { ...evid, role: 'reviewer', declaredAt: entrada.reviewed_at,
        countsForGate: reviewRequired && entrada.verdict === 'approved' && commitMatches(entrada.commit, finalCommit) },
      errors, warnings);
  }
}

export function validateTaskRouting({ taskPath, routingPath = '.ai/model-routing.yaml', finalCommit, allowReplan = false, runtimeRoot = null }) {
  const errors = [];
  const warnings = [];
  let routing;
  let task;
  try {
    routing = parseYaml(readFileSync(routingPath, 'utf8'), routingPath);
  } catch (error) {
    return { valid: false, errors: [error.message], warnings };
  }
  validateRouting(routing, errors);
  if (errors.length > 0) return { valid: false, errors, warnings };
  try {
    task = parseTaskFrontMatter(readFileSync(taskPath, 'utf8'), taskPath);
  } catch (error) {
    return { valid: false, errors: [error.message], warnings };
  }
  let resolvedFinalCommit;
  try {
    resolvedFinalCommit = resolveFinalCommit(finalCommit);
  } catch (error) {
    return { valid: false, errors: [error.message], warnings };
  }
  validateTask(task, routing, resolvedFinalCommit, errors, warnings, {
    runtimeRoot: resolveRuntimeRoot(runtimeRoot, taskPath),
  });
  validatePlanWitness(task, taskPath, 'task.model_plan', errors, warnings, { allowReplan });
  return { valid: errors.length === 0, errors, warnings, finalCommit: resolvedFinalCommit };
}

function main() {
  try {
    const argv = process.argv.slice(2);
    const options = parseArguments(argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    if (options.writePlanHash) {
      const hash = writePlanHash(options.taskPath);
      console.log(`Wrote plan_hash ${hash} to ${options.taskPath}.`);
      return;
    }
    const result = validateTaskRouting(options);
    // Avisos vao para stderr e nunca mudam o exit code: sao riscos conhecidos,
    // nao violacoes do contrato. Saem antes do veredito, e tambem no caminho de
    // falha, porque o aviso costuma ser o contexto que explica por que a task
    // esta naquele estado.
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    if (!result.valid) {
      console.error('Task routing validation failed:');
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Task routing validation passed for final commit ${result.finalCommit}.`);
  } catch (error) {
    console.error(`Task routing validation failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
