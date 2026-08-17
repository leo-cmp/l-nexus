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
