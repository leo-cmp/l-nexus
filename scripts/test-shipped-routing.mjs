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
      .replace('    default: { model: anthropic-opus-5, effort: max }\n    alt1: { model: deepseek-v4-pro, effort: max }',
        '    default: { model: openai-gpt-5-6-sol, effort: max }\n    alt1: { model: deepseek-v4-pro, effort: max }'),
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must differ from the planned executor model/);
});

test('E2E 8 — a cheaper tester whose eligibility depends on effort needs an effort-capable runner', () => {
  // openai-gpt-5-6-luna is economical by default and only reaches balanced at
  // high, so an effort-blind runner cannot satisfy the balanced tester floor.
  const task = fixture('e2e-r3-critical.md')
    .replace('    default: { model: openai-gpt-5-6-terra, effort: high }\n    alt1: { model: deepseek-v4-pro, effort: high }',
      '    default: { model: openai-gpt-5-6-luna, effort: high }\n    alt1: { model: deepseek-v4-pro, effort: high }')
    .replace('      model: openai-gpt-5-6-terra\n      effort: high', '      model: openai-gpt-5-6-luna\n      effort: high');
  const result = run({ task });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runner codex does not apply effort high, but openai-gpt-5-6-luna only reaches balanced above its default variant/);
});

test('E2E 9 — the same tester is accepted once the runner declares real effort support', () => {
  const task = fixture('e2e-r3-critical.md')
    .replace('    default: { model: openai-gpt-5-6-terra, effort: high }\n    alt1: { model: deepseek-v4-pro, effort: high }',
      '    default: { model: openai-gpt-5-6-luna, effort: high }\n    alt1: { model: deepseek-v4-pro, effort: high }')
    .replace('      model: openai-gpt-5-6-terra\n      effort: high', '      model: openai-gpt-5-6-luna\n      effort: high');
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

test('every work_routes slot in the shipped catalog is usable', () => {
  const routing = readFileSync(shippedRouting, 'utf8');
  const models = new Map();
  let currentKey = null;
  let inModels = false;
  for (const line of routing.split('\n')) {
    if (/^models:/.test(line)) { inModels = true; continue; }
    if (inModels && /^[a-z_]+:/.test(line)) inModels = false;
    if (!inModels) continue;
    const key = line.match(/^ {2}([a-z0-9-]+):$/);
    if (key) { currentKey = key[1]; models.set(currentKey, { variants: new Set() }); continue; }
    if (!currentKey) continue;
    const status = line.match(/^ {4}status: (\S+)$/);
    if (status) models.get(currentKey).status = status[1];
    const variant = line.match(/^ {6}(default|low|high|max): (\S+)$/);
    if (variant) models.get(currentKey).variants.add(variant[1]);
  }
  assert.ok(models.size > 0, 'no models parsed from the shipped catalog');

  const problems = [];
  const workRoutes = routing.slice(routing.indexOf('\nwork_routes:'), routing.indexOf('\ncli_runners:'));
  for (const [, model, effort] of workRoutes.matchAll(/\{ model: ([a-z0-9.-]+), effort: (\w+) \}/g)) {
    const entry = models.get(model);
    if (!entry) problems.push(`${model} is not a catalog key`);
    else if (entry.status !== 'active') problems.push(`${model} is ${entry.status}, not active`);
    else if (!entry.variants.has(effort)) problems.push(`${model} declares no profile_by_variant.${effort}`);
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
    .replace('    attempts: 2', '    attempts: 3')
    // The reviewer must stay independent of the model that actually executed.
    .replace('    default: { model: anthropic-opus-5, effort: max }\n    alt1: { model: deepseek-v4-pro, effort: max }',
      '    default: { model: deepseek-v4-pro, effort: max }\n    alt1: { model: anthropic-opus-5, effort: max }')
    .replace('      agent: claude-code\n      provider: anthropic\n      model: anthropic-opus-5\n      effort: max\n      runner: claude',
      '      agent: opencode\n      provider: deepseek\n      model: deepseek-v4-pro\n      effort: max\n      runner: opencode');
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
  const leaks = [];
  for (const relative of implementation) {
    readFileSync(path.join(rootDirectory, relative), 'utf8').split('\n').forEach((line, index) => {
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
