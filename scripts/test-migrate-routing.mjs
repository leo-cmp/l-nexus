import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { migrateRoutingContents } from './migrate-routing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(scriptsDirectory, 'cli.mjs');
const v1Routing = readFileSync(path.join(scriptsDirectory, 'fixtures', 'model-routing.yaml'), 'utf8');

test('adds exactly what schema 2 requires and nothing else', () => {
  const result = migrateRoutingContents(v1Routing);
  assert.equal(result.changed, true);
  const routing = parse(result.contents);

  assert.equal(routing.schema_version, 2);
  assert.equal(routing.project_policy.r2_test_gate, 'optional');
  assert.equal(routing.routes.R1.test_gate, 'optional');
  assert.equal(routing.routes.R2.test_gate, 'project_policy');
  assert.equal(routing.routes.R3.test_gate, 'required');
  assert.deepEqual(routing.execution_policy, {
    max_same_executor_reworks: 1,
    max_upgrades: 1,
    max_total_execution_attempts: 3,
  });

  // A tester floor is never invented below the executor's.
  assert.equal(routing.routes.R2.tester_profile, routing.routes.R2.executor_profile);
  assert.equal(routing.routes.R3.tester_profile, routing.routes.R3.executor_profile);

  // Recommendations are the project's to make, never the migration's.
  assert.equal(routing.work_routes, undefined);
});

test('preserves every local decision', () => {
  const before = parse(v1Routing);
  const after = parse(migrateRoutingContents(v1Routing).contents);

  assert.deepEqual(after.models, before.models);
  assert.deepEqual(after.profiles, before.profiles);
  assert.deepEqual(after.risk_domains, before.risk_domains);
  assert.equal(after.project_policy.r2_review, before.project_policy.r2_review);
  assert.equal(after.project_policy.r3_cross_provider, before.project_policy.r3_cross_provider);
  for (const level of ['R1', 'R2', 'R3']) {
    assert.equal(after.routes[level].executor_profile, before.routes[level].executor_profile);
    assert.equal(after.routes[level].review, before.routes[level].review);
  }
});

test('keeps comments and custom keys the project added', () => {
  const custom = `# comentario do projeto\n${v1Routing}\ncustom_marker: preserve-me\n`;
  const migrated = migrateRoutingContents(custom).contents;
  assert.match(migrated, /# comentario do projeto/);
  assert.equal(parse(migrated).custom_marker, 'preserve-me');
});

test('reports what still needs a human decision', () => {
  const { notes } = migrateRoutingContents(v1Routing);
  assert.ok(notes.some((note) => note.includes('r2_test_gate')), 'test gate policy must be flagged');
  assert.ok(notes.some((note) => note.includes('tester_profile')), 'inherited tester floor must be flagged');
  assert.ok(notes.some((note) => note.includes('work_routes')), 'missing recommendations must be flagged');
  // No runners configured, so there is nothing to say about them.
  assert.ok(!notes.some((note) => note.includes('cli_runners')), 'must not invent a runner warning');
});

test('flags runner fields only when the project actually has runners', () => {
  const withRunners = `${v1Routing}\ncli_runners:\n  local:\n    binary: "local"\n    command_template: "local {prompt}"\n`;
  const { notes } = migrateRoutingContents(withRunners);
  assert.ok(notes.some((note) => note.includes('cli_runners')), 'runner fields must be flagged');
  assert.ok(notes.some((note) => note.includes('--help')), 'the warning must say to verify against the binary');
});

test('is idempotent and refuses an unknown schema', () => {
  const once = migrateRoutingContents(v1Routing);
  assert.equal(migrateRoutingContents(once.contents).changed, false);
  assert.throws(() => migrateRoutingContents('schema_version: 7\n'), /unsupported schema_version 7/);
});

test('the migrated routing actually accepts a schema 2 task', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-migrate-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, migrateRoutingContents(v1Routing).contents);

    // The fixture task is routed against the synthetic v1 catalog, which the
    // migration preserves, so it must validate once the schema is lifted.
    const task = readFileSync(path.join(scriptsDirectory, 'fixtures', 'tasks', 'v2-r3-valid.md'), 'utf8')
      .replace('    required_profile: balanced\n    default:\n      model: model-tester\n      effort: default',
        '    required_profile: frontier\n    default:\n      model: model-reviewer\n      effort: default')
      .replace('      model: model-tester\n      provider: provider-c\n      effort: default\n      runner: runner-a',
        '      model: model-reviewer\n      provider: provider-b\n      effort: default');
    const taskPath = path.join(directory, 'task.md');
    writeFileSync(taskPath, task);

    const result = spawnSync(process.execPath, [
      path.join(scriptsDirectory, 'validate-task-routing.mjs'),
      taskPath, '--routing', routingPath, '--final-commit', 'abc1234',
    ], { encoding: 'utf8' });
    assert.doesNotMatch(result.stderr, /requires routing schema_version 2/,
      'a migrated routing must stop rejecting schema 2 tasks');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('is reachable from the CLI and is a dry run by default', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'l-nexus-routing-migrate-'));
  try {
    const routingPath = path.join(directory, 'model-routing.yaml');
    writeFileSync(routingPath, v1Routing);

    const dry = spawnSync(process.execPath, [cli, 'migrate-routing', routingPath], { encoding: 'utf8' });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(readFileSync(routingPath, 'utf8'), v1Routing, 'a dry run must not touch the file');
    assert.match(dry.stdout, /schema_version: 2/);

    const written = spawnSync(process.execPath, [cli, 'migrate-routing', routingPath, '--write'], { encoding: 'utf8' });
    assert.equal(written.status, 0, written.stderr);
    assert.equal(parse(readFileSync(routingPath, 'utf8')).schema_version, 2);
    assert.match(written.stderr, /Revise manualmente/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
