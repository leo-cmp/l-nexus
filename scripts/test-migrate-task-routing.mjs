import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { migrateTaskContents } from './migrate-task-routing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scriptsDirectory, 'cli.mjs');
const migrator = path.join(scriptsDirectory, 'migrate-task-routing.mjs');
const body = '# Legacy task\n\nKeep  trailing spaces.  \n- [ ] unchanged\n';
const legacyTask = `---
id: TASK-123
title: Legacy
status: backlog
custom:
  keep: true
modelo_recomendado: model-a
substitutos: [model-b, model-c]
motivo: Better for backend work
---
${body}`;

function frontMatter(contents) {
  return parse(contents.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
}

test('maps legacy recommendations without inventing execution identities', () => {
  const result = migrateTaskContents(legacyTask);
  assert.equal(result.changed, true);
  const task = frontMatter(result.contents);
  assert.deepEqual(task.custom, { keep: true });
  assert.equal(task.modelo_recomendado, undefined);
  assert.deepEqual(task.model_plan.suggested_models, ['model-a', 'model-b', 'model-c']);
  assert.equal(task.model_plan.selection_rationale, 'Better for backend work');
  assert.deepEqual(task.model_plan.created_by, { agent: 'unknown', provider: 'unknown', model: 'unknown' });
  assert.equal(task.risk.level, 'R3');
  assert.deepEqual(task.risk.domains, ['legacy-unclassified']);
  assert.equal(task.model_execution.executor.model, 'unknown');
  assert.deepEqual(task.model_execution.reviews, []);
});

test('preserves the task body byte-for-byte and is idempotent', () => {
  const first = migrateTaskContents(legacyTask);
  assert.equal(first.contents.slice(first.contents.indexOf('# Legacy task')), body);
  const second = migrateTaskContents(first.contents);
  assert.equal(second.changed, false);
  assert.equal(second.contents, first.contents);
});

test('dry-run prints the migration without modifying the file', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-migrate-'));
  const taskPath = path.join(temporaryDirectory, 'task.md');
  try {
    writeFileSync(taskPath, legacyTask);
    const result = spawnSync(process.execPath, [migrator, taskPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(taskPath, 'utf8'), legacyTask);
    assert.match(result.stdout, /model_plan:/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('--write updates once and the package subcommand is idempotent', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-migrate-'));
  const taskPath = path.join(temporaryDirectory, 'task.md');
  try {
    writeFileSync(taskPath, legacyTask);
    const writeResult = spawnSync(process.execPath, [migrator, taskPath, '--write'], { encoding: 'utf8' });
    assert.equal(writeResult.status, 0, writeResult.stderr);
    const migrated = readFileSync(taskPath, 'utf8');
    assert.notEqual(migrated, legacyTask);

    const secondResult = spawnSync(process.execPath, [
      cli,
      'migrate-task', taskPath, '--write',
    ], { encoding: 'utf8' });
    assert.equal(secondResult.status, 0, secondResult.stderr);
    assert.match(secondResult.stdout, /No legacy routing migration needed/);
    assert.equal(readFileSync(taskPath, 'utf8'), migrated);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('migrated metadata cannot satisfy the R3 validation gate', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-migrate-'));
  const taskPath = path.join(temporaryDirectory, 'task.md');
  try {
    const migrated = migrateTaskContents(legacyTask).contents;
    writeFileSync(taskPath, migrated);
    const result = spawnSync(process.execPath, [
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
      taskPath,
      '--routing', path.join(scriptsDirectory, 'fixtures', 'model-routing.yaml'),
      '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /executor\.model: must be known/);
    assert.match(result.stderr, /requires an approved review of final commit abc1234/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('leaves non-legacy and already migrated tasks unchanged', () => {
  assert.deepEqual(migrateTaskContents('---\nid: TASK-1\n---\nBody\n'), {
    changed: false,
    contents: '---\nid: TASK-1\n---\nBody\n',
  });
  const withPlan = legacyTask.replace('motivo: Better for backend work', 'motivo: Better for backend work\nmodel_plan: {}');
  assert.equal(migrateTaskContents(withPlan).changed, false);
});

test('refuses to overwrite partial risk or execution metadata', () => {
  const partial = legacyTask.replace('custom:\n  keep: true', `custom:
  keep: true
risk:
  level: R1
model_execution:
  executor:
    model: historical-model`);
  assert.throws(
    () => migrateTaskContents(partial),
    /partial routing metadata \(risk, model_execution\) requires manual migration/,
  );
  assert.match(partial, /level: R1/);
  assert.match(partial, /model: historical-model/);
});

// ---------------------------------------------------------------------------
// Schema 1 -> 2 migration: shape only, never invented routing decisions.
// ---------------------------------------------------------------------------

const v1Task = `---
id: TASK-900
title: Existing
status: done
complexity: L2
risk:
  level: R2
  domains: []
  rationale: Material behaviour change.
model_plan:
  created_by:
    agent: planner
    provider: provider-plan
    model: model-plan
  executor_profile: balanced
  suggested_models: [model-x, model-y]
  selection_rationale: Chosen for backend work.
  reviewer_profile: balanced
  review_required: true
  cross_provider_required: false
model_execution:
  executor:
    agent: executor
    provider: provider-a
    model: model-executor
    started_at: 2026-08-16 10:00
  reviews:
    - agent: reviewer
      provider: provider-b
      model: model-reviewer
      commit: abc1234
      reviewed_at: 2026-08-16 10:30
      verdict: approved
      findings: No findings.
---
# Existing task
`;

test('migrates a v1 task to the v2 shape without inventing models or effort', () => {
  const result = migrateTaskContents(v1Task, '<task>', { to: 2 });
  assert.equal(result.changed, true);
  const task = frontMatter(result.contents);

  assert.equal(task.model_plan.schema, 2);
  assert.equal(task.needs_manual_routing, true);
  assert.deepEqual(task.model_plan.created_by, { agent: 'planner', provider: 'provider-plan', model: 'model-plan' });
  assert.equal(task.model_plan.executor.required_profile, 'balanced');
  assert.equal(task.model_plan.reviewer.required_profile, 'balanced');
  assert.equal(task.model_plan.reviewer.required, true);
  assert.equal(task.model_plan.reviewer.cross_provider_required, false);

  for (const slot of ['default', 'alt1', 'alt2', 'upgrade_alt1', 'upgrade_alt2']) {
    assert.equal(task.model_plan.executor[slot], undefined, `slot ${slot} must not be invented`);
  }
  assert.deepEqual(task.model_plan.migrated_from.suggested_models, ['model-x', 'model-y']);
  assert.equal(task.model_plan.executor_profile, undefined);
  assert.equal(task.model_plan.suggested_models, undefined);

  assert.equal(task.routing_rationale.executor, 'Chosen for backend work.');
  assert.equal(task.orchestration.mode, 'manual');
  assert.equal(task.orchestration.state, 'done');
  assert.deepEqual(task.orchestration.attempts, { executor: 0, reworks: 0, upgrades: 0 });

  assert.equal(task.model_execution.executor.model, 'model-executor');
  assert.equal(task.model_execution.executor.effort, '');
  assert.equal(task.model_execution.executor.selection, '');
  assert.deepEqual(task.model_execution.tests, []);
  assert.equal(task.model_execution.reviews[0].model, 'model-reviewer');
  assert.equal(result.contents.slice(result.contents.indexOf('# Existing task')), '# Existing task\n');
});

test('a v2 migration cannot pass validation until a human completes the routing', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-migrate-v2-'));
  const taskPath = path.join(temporaryDirectory, 'task.md');
  try {
    writeFileSync(taskPath, migrateTaskContents(v1Task, '<task>', { to: 2 }).contents);
    const result = spawnSync(process.execPath, [
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
      taskPath,
      '--routing', path.join(scriptsDirectory, 'fixtures', 'model-routing-v2.yaml'),
      '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task\.needs_manual_routing: routing migrated to schema 2 is incomplete/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('the v2 migration is idempotent and chains a legacy task in one run', () => {
  const once = migrateTaskContents(v1Task, '<task>', { to: 2 });
  assert.equal(migrateTaskContents(once.contents, '<task>', { to: 2 }).changed, false);

  const chained = migrateTaskContents(legacyTask, '<task>', { to: 2 });
  const task = frontMatter(chained.contents);
  assert.equal(task.model_plan.schema, 2);
  assert.equal(task.risk.level, 'R3');
  assert.deepEqual(task.model_plan.migrated_from.suggested_models, ['model-a', 'model-b', 'model-c']);
});

test('the default migration still targets schema 1 only', () => {
  const task = frontMatter(migrateTaskContents(legacyTask).contents);
  assert.equal(task.model_plan.schema, undefined);
  assert.equal(task.model_plan.executor_profile, 'frontier');
});

test('--to 2 is reachable from the CLI', () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'l-nexus-migrate-v2-'));
  const taskPath = path.join(temporaryDirectory, 'task.md');
  try {
    writeFileSync(taskPath, v1Task);
    const result = spawnSync(process.execPath, [cli, 'migrate-task', taskPath, '--to', '2', '--write'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(taskPath, 'utf8'), /schema: 2/);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test('rejects an unsupported migration target', () => {
  const result = spawnSync(process.execPath, [migrator, 'task.md', '--to', '3'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--to: must be 1 or 2/);
});
