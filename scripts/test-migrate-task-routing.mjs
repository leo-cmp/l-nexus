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
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
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
