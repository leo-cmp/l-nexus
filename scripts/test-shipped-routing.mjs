// End-to-end checks against the routing catalog that l-nexus actually ships.
// The synthetic fixtures prove the rules; these prove the shipped defaults are
// internally consistent, so a fresh install can produce a task that validates.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.dirname(scriptsDirectory);
const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
const shippedRouting = path.join(rootDirectory, 'src', '.ai', 'model-routing.yaml');

function fixture(name) {
  return readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', name), 'utf8');
}

function run({ task, routing = readFileSync(shippedRouting, 'utf8') }) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-e2e-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(taskPath, task);
    writeFileSync(routingPath, routing);
    return spawnSync(process.execPath, [
      validator, taskPath, '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const gatedRouting = () => readFileSync(shippedRouting, 'utf8')
  .replace('  r2_review: optional', '  r2_review: required')
  .replace('  r2_test_gate: optional', '  r2_test_gate: required');

test('E2E 1 — an R1 documentation task needs no test or review gate', () => {
  const result = run({ task: fixture('e2e-r1-documentation.md') });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 2 — an R2 task passes when the project leaves both gates optional', () => {
  const task = fixture('e2e-r3-critical.md')
    .replace('complexity: L3', 'complexity: L2')
    .replace('  level: R3\n  domains: [payments-money, material-concurrency-idempotency]', '  level: R2\n  domains: [reporting]')
    .replace('    required_profile: frontier\n    required_capabilities:', '    required_profile: balanced\n    required_capabilities:')
    .replace('    required: true\n    required_profile: balanced', '    required: false\n    required_profile: balanced')
    .replace('    required: true\n    required_profile: frontier\n    independent_model: true\n    cross_provider_required: true',
      '    required: false\n    required_profile: balanced\n    independent_model: true\n    cross_provider_required: false');
  const result = run({ task });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 3 — the same R2 task must satisfy both gates once the project enables them', () => {
  const task = fixture('e2e-r3-critical.md')
    .replace('complexity: L3', 'complexity: L2')
    .replace('  level: R3\n  domains: [payments-money, material-concurrency-idempotency]', '  level: R2\n  domains: [reporting]')
    .replace('    required_profile: frontier\n    required_capabilities:', '    required_profile: balanced\n    required_capabilities:')
    .replace('    required_profile: frontier\n    independent_model: true\n    cross_provider_required: true',
      '    required_profile: balanced\n    independent_model: true\n    cross_provider_required: false');
  const result = run({ task, routing: gatedRouting() });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 4 — an R3 task passes with a cross-provider review and a passing test gate', () => {
  const result = run({ task: fixture('e2e-r3-critical.md') });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 5 — a failing test gate blocks completion of an R3 task', () => {
  const result = run({ task: fixture('e2e-r3-critical.md').replace('verdict: passed', 'verdict: failed') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a passed test run of final commit abc1234/);
});

test('E2E 6 — a review of an earlier commit is stale and cannot close the task', () => {
  const result = run({
    task: fixture('e2e-r3-critical.md').replace('      commit: abc1234\n      reviewed_at:', '      commit: 0000000\n      reviewed_at:'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved review of final commit abc1234/);
});

test('E2E 7 — an R3 review from the executor provider is rejected', () => {
  const result = run({
    task: fixture('e2e-r3-critical.md')
      .replace('    default: { model: deepseek-v4-1-flash, effort: max }\n    alt1: { model: openai-gpt-5-6-terra, effort: max }',
        '    default: { model: openai-gpt-5-6-sol, effort: max }\n    alt1: { model: openai-gpt-5-6-terra, effort: max }'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must differ from the planned executor model/);
});

test('E2E 8 — a cheaper tester whose eligibility depends on effort needs an effort-capable runner', () => {
  // openai-gpt-5-6-luna is economical by default and only reaches balanced at
  // high, so an effort-blind runner cannot satisfy the balanced tester floor.
  const task = fixture('e2e-r3-critical.md')
    .replace('    default: { model: xiaomi-mimo-v2-5, effort: high }\n    alt1: { model: alibaba-qwen-3-8-flash, effort: high }',
      '    default: { model: openai-gpt-5-6-luna, effort: high }\n    alt1: { model: alibaba-qwen-3-8-flash, effort: high }')
    .replace('      agent: opencode\n      provider: xiaomi\n      model: xiaomi-mimo-v2-5\n      effort: high\n      runner: opencode',
      '      agent: codex\n      provider: openai\n      model: openai-gpt-5-6-luna\n      effort: high\n      runner: codex');
  const result = run({ task });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runner codex does not apply effort high, but openai-gpt-5-6-luna only reaches balanced above its default variant/);
});

test('E2E 9 — the same tester is accepted once the runner declares real effort support', () => {
  const task = fixture('e2e-r3-critical.md')
    .replace('    default: { model: xiaomi-mimo-v2-5, effort: high }\n    alt1: { model: alibaba-qwen-3-8-flash, effort: high }',
      '    default: { model: openai-gpt-5-6-luna, effort: high }\n    alt1: { model: alibaba-qwen-3-8-flash, effort: high }')
    .replace('      agent: opencode\n      provider: xiaomi\n      model: xiaomi-mimo-v2-5\n      effort: high\n      runner: opencode',
      '      agent: codex\n      provider: openai\n      model: openai-gpt-5-6-luna\n      effort: high\n      runner: codex');
  // Declaring real support means both the flag and the level mapping.
  const routing = readFileSync(shippedRouting, 'utf8').replace(
    '      # Nao verificado nesta versao da CLI. Deixe false ate confirmar.\n      supported: false\n      argv: []\n      mapping: {}',
    '      supported: true\n      argv: ["--effort", "{effort}"]\n      mapping: { low: low, high: high, max: max }',
  );
  const result = run({ task, routing });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 10 — discovering an R3 domain forbids keeping the task at R2', () => {
  const result = run({
    task: fixture('e2e-r1-documentation.md').replace('  domains: [documentation]', '  domains: [payments-money]'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be R3 because domain payments-money is configured as mandatory R3/);
});

// Le o catalogo com o parser de YAML em vez de regex. A versao anterior exigia a
// forma `{ model: x, effort: y }` e por isso enxergava 62 dos 85 slots: slot de
// pool e escrito sem effort, entao os cinco pools do 9router entraram no
// catalogo sem passar por guarda nenhuma. Regex sobre YAML so ve a forma que
// quem escreveu imaginou; o parser ve o que esta la.
function shippedCatalog() {
  return parse(readFileSync(shippedRouting, 'utf8'));
}

function workRouteSlots(routing) {
  const slots = [];
  for (const [route, roles] of Object.entries(routing.work_routes ?? {})) {
    for (const [role, candidates] of Object.entries(roles ?? {})) {
      for (const [slot, value] of Object.entries(candidates ?? {})) {
        if (!value || typeof value !== 'object' || !value.model) continue;
        slots.push({ where: `${route}.${role}.${slot}`, model: value.model, effort: value.effort });
      }
    }
  }
  return slots;
}

test('every work_routes slot in the shipped catalog is usable', () => {
  const routing = shippedCatalog();
  const slots = workRouteSlots(routing);
  assert.ok(slots.length > 0, 'no work_routes slots parsed from the shipped catalog');

  const problems = [];
  for (const { where, model, effort } of slots) {
    const entry = routing.models?.[model];
    if (!entry) { problems.push(`${where}: ${model} is not a catalog key`); continue; }
    if (entry.status !== 'active') problems.push(`${where}: ${model} is ${entry.status}, not active`);
    if (effort !== undefined && !(effort in (entry.profile_by_variant ?? {}))) {
      problems.push(`${where}: ${model} declares no profile_by_variant.${effort}`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// A guarda acima pergunta "esse modelo existe?" e essa pergunta "da para
// EXECUTAR esse modelo?". Sao coisas diferentes, e a distancia entre elas foi
// por onde o defeito passou: os pools ganharam `provider: meituan` e
// `provider: xiaomi` na secao `models` e nenhum runner declarou esses
// provedores 300 linhas abaixo, na mesma arquivo. O catalogo sabia QUEM era o
// modelo e nao sabia POR ONDE ele roda, entao o Orchestrator bloquearia na
// largada de qualquer projeto novo.
//
// A resolucao replica cli-delegation.md: `provides.models` vence
// `provides.providers`, e a partir dai um unico candidato resolve, varios
// obrigam a perguntar ao humano e nenhum bloqueia. Um default que faz o
// Orchestrator perguntar nao e default.
//
// Candidato desligado por `runner_policy` NAO entra na conta de defeito: e
// estado deliberado e documentado -- `claude` e `codex` cobram por token e ficam
// desligados de proposito. O que o teste exige nesse caso e que exista candidato
// a ligar, ou seja, que o unico obstaculo seja a politica e nao a ausencia de
// mapeamento.
function resolveRunners(routing, modelKey) {
  const runners = Object.entries(routing.cli_runners ?? {});
  const provider = routing.models?.[modelKey]?.provider;
  const byModel = runners.filter(([, c]) => (c.provides?.models ?? []).includes(modelKey));
  const candidates = byModel.length > 0
    ? byModel
    : runners.filter(([, c]) => (c.provides?.providers ?? []).includes(provider));
  const names = candidates.map(([name]) => name);
  const enabled = names.filter((name) => routing.runner_policy?.[name]?.enabled !== false);
  return { names, enabled };
}

test('every work_routes slot resolves to exactly one runner the project may use', () => {
  const routing = shippedCatalog();
  const problems = [];
  for (const { where, model } of workRouteSlots(routing)) {
    if (!routing.models?.[model]) continue; // ja reportado pela guarda acima
    const { names, enabled } = resolveRunners(routing, model);
    if (names.length === 0) {
      problems.push(`${where}: no cli_runners entry provides ${model} (provider ${routing.models[model].provider})`);
    } else if (enabled.length > 1) {
      problems.push(`${where}: ${model} resolves to ${enabled.length} runners (${enabled.join(', ')}); the orchestrator would have to ask`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// Terceira forma da mesma pergunta. `effort_levels` foi levantado do painel de
// cada gateway e existe porque pedir um nivel que o modelo nao aceita devolve
// HTTP 400 -- faz parte da elegibilidade, nao e decoracao. Uma rota que pede
// `high` de um modelo sem controle de raciocinio registra um esforco que nunca
// acontece, e e o registro que depois vira prova de que a task rodou como foi
// planejada. Lista vazia significa modelo sem controle nenhum: aceita so o
// implicito, entao qualquer nivel nomeado ali e ficcao.
test('no work_routes slot requests an effort level its model does not declare', () => {
  const routing = shippedCatalog();
  const problems = [];
  for (const { where, model, effort } of workRouteSlots(routing)) {
    if (effort === undefined || effort === 'default') continue;
    const levels = routing.models?.[model]?.effort_levels;
    if (!Array.isArray(levels) || levels.includes(effort)) continue;
    problems.push(`${where}: asks ${model} for effort ${effort}, but it declares ${JSON.stringify(levels)}`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('E2E 11 — a task that finished on an upgrade slot records that slot', () => {
  // Escalation is vertical: the executor moved to upgrade_alt1 after the rework
  // budget, and the recorded model/effort must match that slot, not the default.
  const task = fixture('e2e-r3-critical.md')
    .replace('    selection: default\n    agent: codex\n    provider: openai\n    model: openai-gpt-5-6-sol\n    effort: max\n    runner: codex',
      '    selection: upgrade_alt1\n    agent: claude-code\n    provider: anthropic\n    model: anthropic-opus-5\n    effort: max\n    runner: claude')
    .replace('  attempts: { executor: 2, reworks: 1, upgrades: 0 }', '  attempts: { executor: 3, reworks: 1, upgrades: 1 }')
    .replace('    attempts: 2', '    attempts: 3');
  const result = run({ task });
  assert.equal(result.status, 0, result.stderr);
});

test('E2E 12 — an upgrade slot cannot be claimed while recording the default model', () => {
  const task = fixture('e2e-r3-critical.md').replace('    selection: default\n    agent: codex', '    selection: upgrade_alt1\n    agent: codex');
  const result = run({ task });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match task\.model_plan\.executor\.upgrade_alt1\.model \(anthropic-opus-5\)/);
});

test('E2E 13 — retry budgets from the shipped policy make an endless loop impossible', () => {
  const result = run({
    task: fixture('e2e-r3-critical.md').replace('  attempts: { executor: 2, reworks: 1, upgrades: 0 }', '  attempts: { executor: 9, reworks: 5, upgrades: 4 }'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /attempts\.executor: must not exceed execution_policy\.max_total_execution_attempts \(3\)/);
  assert.match(result.stderr, /attempts\.reworks: must not exceed execution_policy\.max_same_executor_reworks \(1\)/);
  assert.match(result.stderr, /attempts\.upgrades: must not exceed execution_policy\.max_upgrades \(1\)/);
});

test('E2E 14 — a gate role spread across two providers is not warned about a single source', () => {
  // tester usa xiaomi + alibaba e reviewer usa deepseek + openai no fixture:
  // nenhum dos dois papeis depende de um provedor unico, entao nao ha aviso.
  const result = run({ task: fixture('e2e-r3-critical.md') });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /no fallback if that provider's quota runs out/);
});

test('every runner declares interactive and autonomy support explicitly', () => {
  // A flag that does not exist makes the delegation fail at launch, and a
  // missing declaration invites guessing. Both must be stated, never implied.
  const routing = readFileSync(shippedRouting, 'utf8');
  const runners = routing.slice(routing.indexOf('\ncli_runners:'), routing.indexOf('\n# Adaptadores'));
  const names = [...runners.matchAll(/^  ([a-z0-9-]+):$/gm)].map((match) => match[1]);
  assert.ok(names.length > 0, 'no cli_runners parsed');

  const problems = [];
  for (const name of names) {
    const start = runners.indexOf(`\n  ${name}:\n`);
    const rest = runners.slice(start + 1);
    const nextIndex = names
      .map((other) => rest.indexOf(`\n  ${other}:\n`))
      .filter((index) => index > 0)
      .sort((a, b) => a - b)[0];
    const block = nextIndex === undefined ? rest : rest.slice(0, nextIndex);
    for (const section of ['interactive', 'autonomy', 'effort']) {
      if (!new RegExp(`^    ${section}:$`, 'm').test(block)) {
        problems.push(`${name} does not declare ${section}`);
        continue;
      }
      const declared = block.slice(block.indexOf(`    ${section}:`));
      const supported = declared.match(/^      supported: (true|false)$/m);
      if (!supported) problems.push(`${name}.${section} does not state supported`);
      // Claiming support with no argv would be a promise the runner cannot keep.
      else if (supported[1] === 'true' && !/^      argv: \[".+/m.test(declared)) {
        problems.push(`${name}.${section} claims support but declares no argv`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the implementation never hardcodes a model, provider or CLI name', () => {
  // The whole point of the routing layer is that these names live in
  // project-owned configuration. If one leaks into a decision path, the
  // architecture is coupled again.
  const forbidden = /claude|gemini|gpt|opus|sonnet|haiku|deepseek|antigravity|openai|anthropic|google|codex|opencode|qwen|kimi|mimo/i;
  const implementation = [
    'scripts/validate-task-routing.mjs',
    'scripts/migrate-task-routing.mjs',
    'scripts/cli.mjs',
    'src/.agents/scripts/lnx-run.sh',
  ];
  // Comentario nao acopla nada: ninguem troca de provedor por causa de uma
  // palavra dentro de `#`. O risco e codigo que DECIDE por nome de modelo, e a
  // trava fica inteira ai. Antes disso a regra tambem pegava comentario, e o
  // custo aparecia no lugar errado: explicar por que uma variavel de ambiente
  // existe sem poder escrever o nome dela deixa o comentario pior justamente
  // onde ele deveria explicar o porque.
  const comentario = /^\s*(#|\/\/|\*|\/\*)/;
  const leaks = [];
  for (const relative of implementation) {
    readFileSync(path.join(rootDirectory, relative), 'utf8').split('\n').forEach((line, index) => {
      if (comentario.test(line)) return;
      if (forbidden.test(line)) leaks.push(`${relative}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(leaks, [], `provider/model/CLI names leaked into the implementation:\n${leaks.join('\n')}`);
});

test('the orchestrator skill and role name no runtime as the default', () => {
  const claimsDefault = /(antigravity|gemini|claude|codex|opencode)[^\n]{0,40}(padr[aã]o|default|oficial)/i;
  for (const relative of [
    'src/.agents/skills/lnx-orchestrator/SKILL.md',
    'src/.ai/roles/orchestrator.md',
    'src/.ai/guidelines/core/orchestration.md',
  ]) {
    const contents = readFileSync(path.join(rootDirectory, relative), 'utf8');
    assert.equal(claimsDefault.test(contents), false, `${relative} presents a runtime as the architectural default`);
  }
});

test('the update skill quotes the error the validator really emits', () => {
  // The skill teaches an agent to recognise a stale routing by its exact
  // symptom. If the validator's wording drifts, that instruction silently stops
  // matching reality and the agent misses the migration.
  const skill = readFileSync(
    path.join(rootDirectory, 'src/.agents/skills/lnx-nexus-atualizar/SKILL.md'), 'utf8');
  const validator = readFileSync(path.join(rootDirectory, 'scripts/validate-task-routing.mjs'), 'utf8');

  const quoted = skill.match(/task\.model_plan\.schema: ([^\n]+)/);
  assert.ok(quoted, 'the skill must quote the symptom of a stale routing');
  assert.ok(validator.includes(quoted[1].trim()),
    `the skill quotes "${quoted[1].trim()}", which the validator no longer emits`);

  // And it must point at the command that actually fixes it.
  assert.match(skill, /migrate-routing[^\n]*--write/);
});
