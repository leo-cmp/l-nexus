import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

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
    '    alt1:\n      model: model-reviewer\n      effort: high',
    '    alt1:\n      model: model-retired\n      effort: high',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.alt1\.model: must reference an active routing\.models entry \(model-retired\)/);
  });
});

test('rejects an upgrade slot weaker than the default slot', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    upgrade_alt1:\n      model: model-reviewer\n      effort: max',
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
    assert.match(result.stderr, /executor\.model: must match task\.model_plan\.executor\.alt1\.model \(model-reviewer\)/);
  });
});

test('rejects an execution slot name that does not exist', () => {
  withTemporaryTask('v2-r3-valid.md', (task) => task.replace(
    '    selection: default\n    agent: executor',
    '    selection: alt9\n    agent: executor',
  ), (result) => {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.selection: must be one of default, alt1, alt2, upgrade_alt1, upgrade_alt2/);
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
    .replace('      model: model-reviewer\n      provider: provider-b\n      effort: high', '      model: model-executor\n      provider: provider-a\n      effort: high')
    .replace('    default:\n      model: model-reviewer\n      effort: high\nrouting_rationale:', '    default:\n      model: model-executor\n      effort: high\nrouting_rationale:'),
  (result) => {
    assert.equal(result.status, 0, result.stderr);
  });
});
