#!/usr/bin/env node

// Upgrades a project-owned model-routing.yaml from schema 1 to schema 2.
//
// The routing file belongs to the project and is never overwritten by an
// install, so a project that updates l-nexus keeps schema 1 while receiving
// schema 2 task templates. This migration closes that gap by adding only the
// fields schema 2 actually requires, preserving every local decision and
// comment, and never inventing a policy the project did not choose.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { isMap, parseDocument } from 'yaml';

const TEST_GATE_BY_LEVEL = { R1: 'optional', R2: 'project_policy', R3: 'required' };
const EXECUTION_POLICY = {
  max_same_executor_reworks: 1,
  max_upgrades: 1,
  max_total_execution_attempts: 3,
};

function usage() {
  return `Usage:
  migrate-routing.mjs <routing-path> [--write]
  l-nexus migrate-routing <routing-path> [--write]

Upgrades .ai/model-routing.yaml from schema 1 to schema 2. Adds only what
schema 2 requires and preserves every local model, policy and comment. The
default is a dry-run that prints the migrated file without modifying it.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'migrate-routing') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  let routingPath = null;
  let write = false;
  for (const value of args) {
    if (value === '--write') write = true;
    else if (value.startsWith('-')) throw new Error(`unknown option ${value}`);
    else if (routingPath) throw new Error('expected exactly one routing path');
    else routingPath = value;
  }
  if (!routingPath) throw new Error('routing path is required');
  return { routingPath, write };
}

export function migrateRoutingContents(contents, source = '<routing>') {
  const document = parseDocument(contents, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`${source}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  if (!isMap(document.contents)) throw new Error(`${source}: expected a YAML mapping`);

  const version = document.get('schema_version');
  if (version === 2) return { changed: false, contents, notes: [] };
  if (version !== 1) throw new Error(`${source}: unsupported schema_version ${version}; expected 1 or 2`);

  const notes = [];
  document.set('schema_version', 2);

  if (!document.hasIn(['project_policy', 'r2_test_gate'])) {
    // Mirrors the review policy shape but starts permissive: turning a gate on
    // is a policy decision the project has to make, not something a migration
    // can decide for it.
    document.setIn(['project_policy', 'r2_test_gate'], 'optional');
    notes.push('project_policy.r2_test_gate: definido como optional; ajuste para required se o projeto exigir gate de teste em R2');
  }

  for (const [level, gate] of Object.entries(TEST_GATE_BY_LEVEL)) {
    if (!document.hasIn(['routes', level])) continue;
    if (!document.hasIn(['routes', level, 'test_gate'])) {
      document.setIn(['routes', level, 'test_gate'], gate);
    }
    if (level === 'R1' || document.hasIn(['routes', level, 'tester_profile'])) continue;
    // Conservative on purpose: reusing the executor floor never lowers a bar.
    // A cheaper tester is a legitimate choice, but it is the project's to make.
    const executorProfile = document.getIn(['routes', level, 'executor_profile']);
    if (typeof executorProfile === 'string') {
      document.setIn(['routes', level, 'tester_profile'], executorProfile);
      notes.push(`routes.${level}.tester_profile: herdou ${executorProfile} do executor; um tester mais barato e valido, mas a escolha e do projeto`);
    }
  }

  if (!document.has('execution_policy')) {
    document.set('execution_policy', { ...EXECUTION_POLICY });
    notes.push('execution_policy: orcamento padrao de rework e upgrade adicionado; revise os limites');
  }

  if (!document.has('work_routes')) {
    notes.push('work_routes: ausente. E opcional, mas sem ela o Planner escolhe os slots sem recomendacao do projeto');
  }
  const runners = document.get('cli_runners');
  if (isMap(runners) && runners.items.length > 0) {
    notes.push('cli_runners: os campos argv, interactive, autonomy e effort nao foram adicionados porque dependem da CLI instalada; confirme com --help antes de declarar');
  }

  return { changed: true, contents: document.toString({ lineWidth: 0 }), notes };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const original = readFileSync(options.routingPath, 'utf8');
    const result = migrateRoutingContents(original, options.routingPath);
    if (!result.changed) {
      console.log(`No routing migration needed: ${options.routingPath}`);
      return;
    }
    if (options.write) {
      writeFileSync(options.routingPath, result.contents, 'utf8');
      console.log(`Migrated routing to schema 2: ${options.routingPath}`);
    } else {
      process.stdout.write(result.contents);
    }
    if (result.notes.length > 0) {
      console.error('\nRevise manualmente:');
      for (const note of result.notes) console.error(`- ${note}`);
    }
  } catch (error) {
    console.error(`Routing migration failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
