import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parseDocument } from 'yaml';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsDirectory, 'validate-task-routing.mjs');
const routing = path.join(scriptsDirectory, 'fixtures', 'model-routing.yaml');

function validate(fixture, options = {}) {
  return spawnSync(process.execPath, [
    validator,
    ...(options.packageCommand ? ['validate-task'] : []),
    options.taskPath ?? path.join(scriptsDirectory, 'fixtures', 'tasks', fixture),
    '--routing', options.routingPath ?? routing,
    '--final-commit', 'abc1234',
  ], { encoding: 'utf8' });
}

test('accepts R1 work without review', () => {
  const result = validate('r1-valid.md', { packageCommand: true });
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a task that downgrades a mandatory R3 domain', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'downgraded-risk.md');
  try {
    const task = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r1-valid.md'), 'utf8');
    writeFileSync(taskPath, task.replace('domains: [documentation]', 'domains: [payments-money]'));
    const result = validate('r1-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be R3 because domain payments-money is configured as mandatory R3/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('requires review when project policy requires R2 review', () => {
  const result = validate('r2-review-required-invalid.md');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved review/);
});

test('requires a different model when project policy requires R2 review', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'r2-same-model.md');
  try {
    const validTask = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, validTask
      .replace('complexity: L3', 'complexity: L2')
      .replace('level: R3', 'level: R2')
      .replaceAll('executor_profile: frontier', 'executor_profile: balanced')
      .replace('reviewer_profile: frontier', 'reviewer_profile: balanced')
      .replace('cross_provider_required: true', 'cross_provider_required: false')
      .replace('model: model-reviewer', 'model: model-executor')
      .replace('provider: provider-b', 'provider: provider-a'));
    const result = validate('r3-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires an approved review by a different model/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('accepts an R3 review by an independent model and provider', () => {
  const result = validate('r3-valid.md');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects an R3 review by the executor model', () => {
  const result = validate('r3-same-model-invalid.md');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved review by a different model/);
});

test('rejects an R3 review from the executor provider when cross-provider review is required', () => {
  const result = validate('r3-same-provider-invalid.md');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved R3 review by a different model and provider/);
});

test('rejects an R3 approval that does not cover the final commit', () => {
  const result = validate('r3-stale-review-invalid.md');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires an approved review of final commit abc1234/);
});

test('rejects unknown executor identity for R3', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'r3-unknown.md');
  try {
    const validTask = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, validTask
      .replace('model: model-executor', 'model: unknown')
      .replace('provider: provider-a', 'provider: unknown'));
    const result = validate('r3-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_execution\.executor\.model: must be known/);
    assert.match(result.stderr, /task\.model_execution\.executor\.provider: must be known/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('requires executor start time', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'missing-started-at.md');
  try {
    const task = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, task.replace('started_at: 2026-08-16 10:00', 'started_at: ""'));
    const result = validate('r3-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_execution\.executor\.started_at: must be a non-empty string/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('rejects routing that makes R3 review optional', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const routingPath = path.join(temporaryDirectory, 'invalid-routing.yaml');
  try {
    const routingContents = readFileSync(routing, 'utf8');
    writeFileSync(routingPath, routingContents.replace(
      /R3:\n([\s\S]*?)review: required/,
      (match) => match.replace('review: required', 'review: optional'),
    ));
    const result = spawnSync(process.execPath, [
      validator,
      path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'),
      '--routing', routingPath,
      '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /routing\.routes\.R3\.review: must be required/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('rejects an executor model outside the active catalog or below its required profile', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'r3-catalog.md');
  const routingPath = path.join(temporaryDirectory, 'model-routing.yaml');
  try {
    const validTask = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, validTask.replace('model: model-executor', 'model: model-not-in-catalog'));
    const unknownResult = validate('r3-valid.md', { taskPath });
    assert.notEqual(unknownResult.status, 0);
    assert.match(unknownResult.stderr, /must reference a configured routing\.models entry/);

    const fixtureRouting = readFileSync(routing, 'utf8');
    writeFileSync(routingPath, fixtureRouting.replace('    profile: frontier\n    status: active', '    profile: economical\n    status: active'));
    writeFileSync(taskPath, validTask);
    const insufficientResult = validate('r3-valid.md', { taskPath, routingPath });
    assert.notEqual(insufficientResult.status, 0);
    assert.match(insufficientResult.stderr, /must use a model with profile rank at least frontier/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('requires an explicit findings summary for an approved review', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'r3-findings.md');
  try {
    const validTask = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, validTask.replace('      findings: No findings.\n', ''));
    const result = validate('r3-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /findings: must explicitly summarize findings or state no findings/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('accepts an independent R3 approval when a self-review is also recorded', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-'));
  const taskPath = path.join(temporaryDirectory, 'r3-multiple-reviews.md');
  try {
    const validTask = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'r3-valid.md'), 'utf8');
    writeFileSync(taskPath, validTask.replace('      findings: No findings.\n---', `      findings: No findings.
    - agent: executor
      model: model-executor
      provider: provider-a
      commit: abc1234
      reviewed_at: 2026-08-16 10:31
      verdict: approved
      findings: Self-review notes.
---`));
    const result = validate('r3-valid.md', { taskPath });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Routing schema v2: slots, effort eligibility, test gate and orchestration.
// ---------------------------------------------------------------------------

const routingV2 = path.join(scriptsDirectory, 'fixtures', 'model-routing-v2.yaml');

function validateV2(fixture, options = {}) {
  return spawnSync(process.execPath, [
    validator,
    options.taskPath ?? path.join(scriptsDirectory, 'fixtures', 'tasks', fixture),
    '--routing', options.routingPath ?? routingV2,
    '--final-commit', 'abc1234',
  ], { encoding: 'utf8' });
}

function withTemporaryTask(fixture, transform, assertions) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-v2-'));
  try {
    const taskPath = path.join(temporaryDirectory, 'task.md');
    const source = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', fixture), 'utf8');
    writeFileSync(taskPath, transform(source));
    assertions(validateV2(fixture, { taskPath }), temporaryDirectory);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test('accepts a v2 R3 task with an independent cross-provider review and a passing test gate', () => {
  const result = validateV2('v2-r3-valid.md');
  assert.equal(result.status, 0, result.stderr);
});

test('accepts a v2 R1 task without test or review gates', () => {
  const result = validateV2('v2-r1-valid.md');
  assert.equal(result.status, 0, result.stderr);
});

test('keeps validating v1 tasks against routing schema 2', () => {
  const result = validateV2('r1-valid.md');
  assert.equal(result.status, 0, result.stderr);
});

test('rejects a v2 task when the project still uses routing schema 1', () => {
  const result = validateV2('v2-r3-valid.md', { routingPath: routing });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /task\.model_plan\.schema: requires routing schema_version 2/);
});

test('rejects an unsupported task model_plan schema', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace('  schema: 2', '  schema: 3'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_plan\.schema: must be 2 when present/);
  });
});

test('rejects a slot whose effort variant is below the required profile', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-executor\n      effort: high',
    '    default:\n      model: model-executor\n      effort: low',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.default: model-executor at effort low resolves to profile balanced, below required frontier/);
  });
});

test('rejects an invalid effort value', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-executor\n      effort: high',
    '    default:\n      model: model-executor\n      effort: medium',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.default\.effort: must be one of default, low, high, max/);
  });
});

test('rejects a slot model that lacks a required capability', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    required_capabilities: [backend, tests]\n    default:',
    '    required_capabilities: [backend, tests, vision]\n    default:',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.default\.model: model-executor does not declare required capability vision/);
  });
});

test('rejects a slot model that is not active in the catalog', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    alt1:\n      model: model-variant\n      effort: high',
    '    alt1:\n      model: model-retired\n      effort: high',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.alt1\.model: must reference an active routing\.models entry \(model-retired\)/);
  });
});

test('rejects an upgrade slot weaker than the default slot', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    upgrade_alt1:\n      model: model-variant\n      effort: max',
    '    upgrade_alt1:\n      model: model-tester\n      effort: default',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.upgrade_alt1: must not resolve to a weaker profile than executor\.default/);
  });
});

test('rejects a missing executor slot', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    alt2:\n      model: model-executor\n      effort: max\n',
    '',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_plan\.executor\.alt2: must be a mapping with model and effort/);
  });
});

test('rejects a plan that reviews with the executor model when independence is required', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-reviewer\n      effort: high\nrouting_rationale:',
    '    default:\n      model: model-executor\n      effort: high\nrouting_rationale:',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewer\.default\.model: must differ from the planned executor model/);
  });
});

test('rejects an execution whose selection does not match the planned slot', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    selection: default\n    agent: executor',
    '    selection: alt1\n    agent: executor',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.model: must match task\.model_plan\.executor\.alt1\.model \(model-variant\)/);
  });
});

test('rejects an execution slot name that does not exist', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    selection: default\n    agent: executor',
    '    selection: alt9\n    agent: executor',
  ), (result) => {
    assert.notEqual(result.status, 0);
    // O slot alt3 entrou na lista de slots validos (item 4), entao a mensagem
    // que enumera os slots incidentes precisa inclui-lo.
    assert.match(result.stderr, /executor\.selection: must be one of default, alt1, alt2, alt3, upgrade_alt1, upgrade_alt2/);
  });
});

test('rejects completion when the required test gate has no passing run', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace('verdict: passed', 'verdict: failed'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_execution\.tests: requires a passed test run of final commit abc1234/);
  });
});

test('rejects a test run that does not cover the final commit', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '      commit: abc1234\n      tested_at:',
    '      commit: def5678\n      tested_at:',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_execution\.tests: requires a passed test run of final commit abc1234/);
  });
});

test('rejects a tester below the profile required by the route', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    default:\n      model: model-tester\n      effort: default\n  reviewer:', '    default:\n      model: model-tester\n      effort: low\n  reviewer:')
    .replace('      model: model-tester\n      provider: provider-c\n      effort: default', '      model: model-tester\n      provider: provider-c\n      effort: low'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /tester\.default: model-tester at effort low resolves to profile economical, below required balanced/);
  });
});

test('rejects execution attempts beyond the configured budget', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    executor: 1\n    reworks: 0\n    upgrades: 0',
    '    executor: 4\n    reworks: 3\n    upgrades: 2',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.orchestration\.attempts\.executor: must not exceed execution_policy\.max_total_execution_attempts \(3\)/);
    assert.match(result.stderr, /task\.orchestration\.attempts\.upgrades: must not exceed execution_policy\.max_upgrades \(1\)/);
  });
});

test('requires orchestrator identity and executor runner in orchestrated mode', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    agent: orchestrator-runtime', '    agent: ""')
    .replace('    runner: runner-a', '    runner: ""'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_execution\.orchestrator\.agent: must be a non-empty string/);
    assert.match(result.stderr, /task\.model_execution\.executor\.runner: is required when task\.orchestration\.mode is orchestrated/);
  });
});

test('hints when a slot references a wire model id instead of its catalog key', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-v2-'));
  try {
    const routingPath = path.join(temporaryDirectory, 'model-routing.yaml');
    const taskPath = path.join(temporaryDirectory, 'task.md');
    writeFileSync(routingPath, readFileSync(routingV2, 'utf8').replace(
      '  model-executor:\n    provider: provider-a',
      '  model-executor:\n    model: "wire-executor-1"\n    provider: provider-a',
    ));
    writeFileSync(taskPath, readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'v2-r3-valid.md'), 'utf8')
      .replace('    default:\n      model: model-executor\n      effort: high', '    default:\n      model: wire-executor-1\n      effort: high'));
    const result = validateV2('v2-r3-valid.md', { taskPath, routingPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did you mean the catalog key model-executor\?/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('rejects routing v2 that omits the execution policy budgets', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-v2-'));
  try {
    const routingPath = path.join(temporaryDirectory, 'model-routing.yaml');
    writeFileSync(routingPath, readFileSync(routingV2, 'utf8').replace('  max_upgrades: 1\n', ''));
    const result = validateV2('v2-r3-valid.md', { routingPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /routing\.execution_policy\.max_upgrades: must be a non-negative integer/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('rejects a runner that cannot apply the effort a slot depends on', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    default:\n      model: model-executor\n      effort: high', '    default:\n      model: model-variant\n      effort: high')
    .replace('    model: model-executor\n    provider: provider-a\n    effort: high', '    model: model-variant\n    provider: provider-b\n    effort: high'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.effort: runner runner-a does not apply effort high, but model-variant only reaches frontier above its default variant/);
  });
});

test('accepts an effort-dependent slot when the runner really applies effort', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    default:\n      model: model-executor\n      effort: high', '    default:\n      model: model-variant\n      effort: high')
    .replace('    model: model-executor\n    provider: provider-a\n    effort: high\n    runner: runner-a', '    model: model-variant\n    provider: provider-b\n    effort: high\n    runner: runner-effort')
    // O revisor troca para o unico frontier provider-a, entao o executor nao
    // pode manter model-executor em nenhum slot: papeis precisam ser disjuntos.
    .replaceAll('      model: model-executor\n      effort: max', '      model: model-variant\n      effort: max')
    .replace('      model: model-reviewer\n      provider: provider-b\n      effort: high', '      model: model-executor\n      provider: provider-a\n      effort: high')
    .replace('    default:\n      model: model-reviewer\n      effort: high\nrouting_rationale:', '    default:\n      model: model-executor\n      effort: high\nrouting_rationale:'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('rejects a runner that is not configured in the catalog', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace('    runner: runner-a', '    runner: runner-ghost'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.runner: must reference a configured routing\.cli_runners entry \(runner-ghost\)/);
  });
});

test('rejects an effort level the runner does not map, even when it applies other levels', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    default:\n      model: model-executor\n      effort: high', '    default:\n      model: model-variant\n      effort: max')
    .replace('    model: model-executor\n    provider: provider-a\n    effort: high\n    runner: runner-a',
      '    model: model-variant\n    provider: provider-b\n    effort: max\n    runner: runner-partial'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.effort: runner runner-partial does not apply effort max/);
  });
});

test('accepts an effort level the runner does map', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    default:\n      model: model-executor\n      effort: high', '    default:\n      model: model-variant\n      effort: high')
    .replace('    model: model-executor\n    provider: provider-a\n    effort: high\n    runner: runner-a',
      '    model: model-variant\n    provider: provider-b\n    effort: high\n    runner: runner-partial')
    .replaceAll('      model: model-executor\n      effort: max', '      model: model-variant\n      effort: max')
    .replace('      model: model-reviewer\n      provider: provider-b\n      effort: high', '      model: model-executor\n      provider: provider-a\n      effort: high')
    .replace('    default:\n      model: model-reviewer\n      effort: high\nrouting_rationale:', '    default:\n      model: model-executor\n      effort: high\nrouting_rationale:'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

// ---------------------------------------------------------------------------
// Item 1 — plan_hash congela o model_plan.
// ---------------------------------------------------------------------------

function fixtureSource(name) {
  return readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', name), 'utf8');
}

function runWithFinalCommit(taskPath, finalCommit, routingPath = routingV2) {
  return spawnSync(process.execPath, [
    validator, taskPath, '--routing', routingPath, '--final-commit', finalCommit,
  ], { encoding: 'utf8' });
}

// Reimplementacao independente da serializacao canonica: ordena as chaves em
// profundidade e delega o resto ao JSON.stringify. Serve para travar a regra
// documentada; se o validador divergir, este teste acusa.
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  }
  return value;
}

test('item 1: accepts a plan without plan_hash and warns that it is not frozen', () => {
  const result = validateV2('v2-r3-valid.md');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /task\.model_plan\.plan_hash: model_plan is not frozen/);
});

test('item 1: --write-plan-hash records a hash matching the documented serialization', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-hash-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    const written = spawnSync(process.execPath, [
      validator, taskPath, '--routing', routingV2, '--write-plan-hash',
    ], { encoding: 'utf8' });
    assert.equal(written.status, 0, written.stderr);
    const match = written.stdout.match(/Wrote plan_hash ([0-9a-f]{64})/);
    assert.ok(match, written.stdout);

    const plan = parseDocument(fixtureSource('v2-r3-valid.md')).get('model_plan').toJSON();
    delete plan.plan_hash;
    const expected = createHash('sha256').update(JSON.stringify(sortDeep(plan))).digest('hex');
    assert.equal(match[1], expected);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 1: a frozen plan validates without the not-frozen warning', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-hash-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    spawnSync(process.execPath, [validator, taskPath, '--routing', routingV2, '--write-plan-hash'], { encoding: 'utf8' });
    const result = validateV2('v2-r3-valid.md', { taskPath });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /plan_hash/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 1: rejects a frozen plan that changed after hashing', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-hash-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    spawnSync(process.execPath, [validator, taskPath, '--routing', routingV2, '--write-plan-hash'], { encoding: 'utf8' });
    const tampered = readFileSync(taskPath, 'utf8')
      .replace('      model: model-tester\n      effort: default', '      model: model-tester\n      effort: high');
    writeFileSync(taskPath, tampered);
    const result = validateV2('v2-r3-valid.md', { taskPath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_plan\.plan_hash: does not match the model plan contents/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 1: the frozen hash survives a reformat that does not change the plan', () => {
  // A serializacao e canonica de proposito: reescrever o mesmo slot em estilo
  // flow, ou em outra ordem de chaves, nao muda o plano e nao pode invalidar o
  // congelamento. Sem isto, qualquer reformatacao viraria acusacao de fraude.
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-hash-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    spawnSync(process.execPath, [validator, taskPath, '--routing', routingV2, '--write-plan-hash'], { encoding: 'utf8' });
    const reformatted = readFileSync(taskPath, 'utf8').replace(
      '    alt1:\n      model: model-variant\n      effort: high',
      '    alt1: { effort: high, model: model-variant }',
    );
    assert.notEqual(reformatted, readFileSync(taskPath, 'utf8'));
    writeFileSync(taskPath, reformatted);
    const result = validateV2('v2-r3-valid.md', { taskPath });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /plan_hash/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 1: rejects a plan_hash that is not a non-empty string', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace('  schema: 2\n', '  schema: 2\n  plan_hash: ""\n'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_plan\.plan_hash: must be a non-empty sha256 hex string/);
  });
});

// ---------------------------------------------------------------------------
// Item 2 — quem testou nao revisa.
// ---------------------------------------------------------------------------

test('item 2: rejects an approval by the same model that passed the final test', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    independent_model: true\n    cross_provider_required: true\n    default:\n      model: model-reviewer\n      effort: high',
      '    independent_model: true\n    cross_provider_required: true\n    default:\n      model: model-tester\n      effort: high')
    .replace('      model: model-reviewer\n      provider: provider-b\n      effort: high',
      '      model: model-tester\n      provider: provider-c\n      effort: high'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not be approved by the same model that passed the final test \(model-tester\)/);
  });
});

test('item 2: accepts an approval by a model other than the tester', () => {
  const result = validateV2('v2-r3-valid.md');
  assert.equal(result.status, 0, result.stderr);
});

// ---------------------------------------------------------------------------
// Item 3 — SHA curto e SHA completo do mesmo commit.
// ---------------------------------------------------------------------------

test('item 3: matches a full recorded commit against a short --final-commit', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replaceAll('commit: abc1234', 'commit: abc1234deadbeef'), (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('item 3: matches a short recorded commit against a full --final-commit', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-sha-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    const result = runWithFinalCommit(taskPath, 'abc1234deadbeef');
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 3: normalizes SHA in the v1 review path too', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-sha-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('r3-valid.md'));
    const result = runWithFinalCommit(taskPath, 'abc1234deadbeef', routing);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('item 3: does not treat a shared prefix shorter than 7 hex chars as a match', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replaceAll('commit: abc1234', 'commit: abc123'), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires an approved review of final commit abc1234/);
  });
});

// ---------------------------------------------------------------------------
// Item 4 — slot lateral alt3.
// ---------------------------------------------------------------------------

test('item 4: accepts an execution that records the alt3 lateral slot', () => {
  // alt3 aponta para um modelo que nenhum outro slot usa, entao passar aqui
  // prova que o slot foi mesmo resolvido, e nao confundido com alt2.
  withTemporaryTask('v2-r3-valid.md', (task) => task
    .replace('    selection: default\n    agent: executor', '    selection: alt3\n    agent: executor')
    .replace('    model: model-executor\n    provider: provider-a\n    effort: high\n    runner: runner-a',
      '    model: model-lateral\n    provider: provider-d\n    effort: max\n    runner: runner-effort'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('item 4: a plan without alt3 stays valid (compatibility)', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    alt3:\n      model: model-lateral\n      effort: max\n',
    '',
  ), (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

test('item 4: alt3 is lateral, so it is not bound by the upgrade-weakness rule', () => {
  // O default sobe para frontier e os upgrades acompanham; alt3 segue economical.
  // Se alt3 fosse tratado como upgrade, seria reprovado por ser mais fraco.
  withTemporaryTask('v2-r1-valid.md', (task) => task
    .replace('    default:\n      model: model-economical\n      effort: default', '    default:\n      model: model-executor\n      effort: high')
    .replace('    upgrade_alt1:\n      model: model-tester\n      effort: default', '    upgrade_alt1:\n      model: model-executor\n      effort: high')
    .replace('    model: model-economical\n    provider: provider-c\n    effort: default', '    model: model-executor\n    provider: provider-a\n    effort: high'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

// ---------------------------------------------------------------------------
// Item 5 — um modelo nao se repete entre papeis.
// ---------------------------------------------------------------------------

test('item 5: rejects one model declared in two different roles', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-tester\n      effort: default',
    '    default:\n      model: model-executor\n      effort: high'),
  (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /is already planned for the executor role/);
  });
});

test('item 5: allows the same model to repeat inside one role', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-tester\n      effort: default\n  reviewer:',
    '    default:\n      model: model-tester\n      effort: default\n    alt1:\n      model: model-tester\n      effort: high\n  reviewer:'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});

// ---------------------------------------------------------------------------
// Item 6 — aviso de fonte unica em papel de gate.
// ---------------------------------------------------------------------------

test('item 6: warns when every tester slot uses the same provider', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    default:\n      model: model-tester\n      effort: default\n  reviewer:',
    '    default:\n      model: model-tester\n      effort: default\n    alt1:\n      model: model-economical\n      effort: high\n  reviewer:'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /every tester slot resolves to provider provider-c/);
  });
});

test('item 6: warns when every reviewer slot uses the same provider', () => {
  withTemporaryTask('v2-r1-valid.md', (task) => task.replace(
    '    default:\n      model: model-reviewer\n      effort: default',
    '    default:\n      model: model-reviewer\n      effort: default\n    alt1:\n      model: model-reviewer\n      effort: low'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /every reviewer slot resolves to provider provider-b/);
  });
});

// ---------------------------------------------------------------------------
// Git como testemunha do plano.
// ---------------------------------------------------------------------------

// A testemunha so existe dentro de um repositorio, entao estes testes montam
// um: a task entra no historico como o Planner a criou, sem execucao
// registrada, e so depois a arvore de trabalho recebe a versao em execucao.
function withTaskInRepository(fixture, { committed, working }, assertions) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-witness-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    const source = fixtureSource(fixture);
    const git = (...args) => spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    writeFileSync(taskPath, committed(source));
    git('init', '-q', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    git('add', 'task.md');
    git('commit', '-qm', 'task created');
    writeFileSync(taskPath, working(source));
    assertions(validateV2(fixture, { taskPath }), taskPath, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Como o Planner deixa a task: plano escrito, nada executado ainda.
function asCreated(source) {
  return source.replace(/\nmodel_execution:[\s\S]*?\n---\n/, '\n---\n');
}

// O ataque: um slot do plano muda depois que a execucao ja foi registrada.
function withEditedPlan(source) {
  return source.replace('    alt3:\n      model: model-lateral\n      effort: max',
    '    alt3:\n      model: model-lateral\n      effort: high');
}

test('git witness: rejects a plan edited after execution was recorded', () => {
  withTaskInRepository('v2-r3-valid.md', { committed: asCreated, working: withEditedPlan }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.model_plan: differs from the plan committed in [0-9a-f]{7}, the last version recorded before execution started/);
  });
});

test('git witness: rewriting plan_hash does not rescue an edited plan', () => {
  // E o furo que a testemunha existe para fechar: quem pode rodar
  // --write-plan-hash regrava o hash do proprio plano editado e o congelamento
  // volta a bater. O historico nao acompanha essa edicao.
  withTaskInRepository('v2-r3-valid.md', { committed: asCreated, working: withEditedPlan }, (result, taskPath) => {
    assert.notEqual(result.status, 0);
    const refrozen = spawnSync(process.execPath, [
      validator, taskPath, '--routing', routingV2, '--write-plan-hash',
    ], { encoding: 'utf8' });
    assert.equal(refrozen.status, 0, refrozen.stderr);
    const after = validateV2('v2-r3-valid.md', { taskPath });
    assert.notEqual(after.status, 0);
    assert.doesNotMatch(after.stderr, /plan_hash: does not match/);
    assert.match(after.stderr, /task\.model_plan: differs from the plan committed in/);
  });
});

test('git witness: --allow-replan downgrades the mismatch to a warning', () => {
  withTaskInRepository('v2-r3-valid.md', { committed: asCreated, working: withEditedPlan }, (result, taskPath) => {
    const allowed = spawnSync(process.execPath, [
      validator, taskPath, '--routing', routingV2, '--final-commit', 'abc1234', '--allow-replan',
    ], { encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stderr, /accepted because --allow-replan was passed/);
  });
});

test('git witness: accepts the same plan that was committed before execution', () => {
  withTaskInRepository('v2-r3-valid.md', { committed: asCreated, working: (source) => source }, (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /differs from the plan committed/);
  });
});

test('git witness: warns instead of failing when the task is not tracked by git', () => {
  // Fora de um repositorio nao ha testemunho, e nao ter testemunho e um risco
  // conhecido — nao uma violacao de contrato.
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-witness-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, fixtureSource('v2-r3-valid.md'));
    const result = validateV2('v2-r3-valid.md', { taskPath });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /task\.model_plan: is not tracked by git/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('git witness: warns when no committed version predates the execution record', () => {
  // A task entrou no historico ja com execucao registrada: nao da para saber
  // qual era o plano quando o trabalho comecou, e inventar um testemunho seria
  // pior do que nao ter nenhum.
  withTaskInRepository('v2-r3-valid.md', { committed: (source) => source, working: (source) => source }, (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /has no committed version predating its execution record/);
  });
});

// ---------------------------------------------------------------------------
// Prova de ocorrencia: a linha da task contra o registro do lnx-run.
// ---------------------------------------------------------------------------

// O validador procura o diretorio que o lnx-run.sh grava. Estes testes montam
// esse diretorio a mao, no mesmo formato do script, e deixam a task ao lado
// dele — que e tambem o caminho que a busca por .lnx/runtime percorre.
const RUN_ID = '20260816T102500Z-reviewer-1-4242';

function withRunRecord({ runId = RUN_ID, meta = {}, exitCode = '0', patch = (task) => task }, assertions) {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-run-'));
  try {
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, patch(fixtureSource('v2-r3-valid.md')));
    const runDirectory = path.join(directory, '.lnx', 'runtime', 'TASK-V2-R3', runId);
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(path.join(runDirectory, 'meta.json'), JSON.stringify({
      schema: 1,
      run_id: runId,
      task: 'TASK-V2-R3',
      role: 'reviewer',
      slot: 'default',
      model: 'model-reviewer',
      effort: 'high',
      runner: 'runner-a',
      started_at: '2026-08-16T10:25:00Z',
      ...meta,
    }, null, 2));
    if (exitCode !== null) writeFileSync(path.join(runDirectory, 'exit-code'), `${exitCode}\n`);
    assertions(validateV2('v2-r3-valid.md', { taskPath }), runDirectory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function withReviewRunId(runId) {
  return (task) => task.replace('      reviewed_at: 2026-08-16 10:30',
    `      run_id: ${runId}\n      reviewed_at: 2026-08-16 10:30`);
}

test('run evidence: warns when a required gate is not backed by a run_id', () => {
  const result = validateV2('v2-r3-valid.md');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /reviews\[0\]\.run_id: is absent, so this gate rests on what the task says about itself/);
});

test('run evidence: accepts a review backed by a matching run record', () => {
  withRunRecord({ patch: withReviewRunId(RUN_ID) }, (result) => {
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /reviews\[0\]\.run_id/);
  });
});

test('run evidence: rejects a run_id with no run record', () => {
  withRunRecord({ patch: withReviewRunId('20260816T999999Z-reviewer-9-1') }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviews\[0\]\.run_id: has no run record at /);
  });
});

test('run evidence: rejects a run record that belongs to another task', () => {
  // O caso do run_id copiado: o registro existe e esta perfeito, mas e de outra
  // task. Quem desmente e o campo `task` do proprio registro.
  withRunRecord({ meta: { task: 'TASK-OTHER' }, patch: withReviewRunId(RUN_ID) }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /belongs to task TASK-OTHER, not to TASK-V2-R3/);
  });
});

test('run evidence: rejects a run record whose model is not the declared one', () => {
  withRunRecord({ meta: { model: 'model-variant' }, patch: withReviewRunId(RUN_ID) }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /records model model-variant, but the task declares model-reviewer/);
  });
});

test('run evidence: rejects a run that never finished', () => {
  withRunRecord({ exitCode: null, patch: withReviewRunId(RUN_ID) }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /without exit-code, so the run never finished/);
  });
});

test('run evidence: rejects a run that started after the result it backs', () => {
  // Quatro dias depois do parecer que ele deveria sustentar: passa longe de
  // qualquer duvida de fuso horario.
  withRunRecord({ meta: { started_at: '2026-08-20T10:00:00Z' }, patch: withReviewRunId(RUN_ID) }, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /after the reviewer result it is supposed to back/);
  });
});
