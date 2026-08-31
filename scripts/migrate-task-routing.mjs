#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { isMap, parseDocument } from 'yaml';

const LEGACY_FIELDS = ['modelo_recomendado', 'substitutos', 'motivo'];

function usage() {
  return `Usage:
  migrate-task-routing.mjs <task-path> [--to 1|2] [--write]
  l-nexus migrate-task <task-path> [--to 1|2] [--write]

Migrates routing metadata. --to 1 (default) maps legacy recommendation fields
onto the schema 1 contract. --to 2 additionally reshapes a schema 1 task into
the schema 2 slot contract, marking it needs_manual_routing because models and
effort are never invented. The default is a dry-run that prints the migrated
task without modifying the file.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'migrate-task') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  let taskPath = null;
  let write = false;
  let to = 1;
  while (args.length > 0) {
    const value = args.shift();
    if (value === '--write') {
      write = true;
    } else if (value === '--to') {
      const target = args.shift();
      if (target !== '1' && target !== '2') throw new Error('--to: must be 1 or 2');
      to = Number(target);
    } else if (value.startsWith('-')) {
      throw new Error(`unknown option ${value}`);
    } else if (taskPath) {
      throw new Error('expected exactly one task path');
    } else {
      taskPath = value;
    }
  }
  if (!taskPath) throw new Error('task path is required');
  return { taskPath, write, to };
}

function parseFrontMatter(contents, source) {
  const normalized = contents.replace(/^\uFEFF/, '');
  const match = normalized.match(/^---(\r?\n)([\s\S]*?)(\r?\n)---(\r?\n|$)/);
  if (!match) throw new Error(`${source}: expected YAML front matter delimited by ---`);

  const document = parseDocument(match[2], { prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(`${source}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  if (!isMap(document.contents)) {
    throw new Error(`${source}: expected a YAML mapping`);
  }

  return {
    document,
    body: normalized.slice(match[0].length),
    newline: match[1],
    closingNewline: match[4],
    bom: contents.startsWith('\uFEFF') ? '\uFEFF' : '',
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recommendationValues(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim() !== '');
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}

function documentValue(document, key) {
  const node = document.get(key, true);
  return node && typeof node.toJSON === 'function' ? node.toJSON() : node;
}

function migrateLegacyFields(document, source) {
  const hasLegacyFields = LEGACY_FIELDS.some((field) => document.has(field));
  if (!hasLegacyFields || document.has('model_plan')) return false;

  const existingRoutingFields = ['risk', 'model_execution'].filter((field) => document.has(field));
  if (existingRoutingFields.length > 0) {
    throw new Error(
      `${source}: partial routing metadata (${existingRoutingFields.join(', ')}) requires manual migration`,
    );
  }

  const suggestedModels = [
    ...recommendationValues(documentValue(document, 'modelo_recomendado')),
    ...recommendationValues(documentValue(document, 'substitutos')),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const legacyReason = documentValue(document, 'motivo');

  for (const field of LEGACY_FIELDS) document.delete(field);
  if (!document.has('complexity')) document.set('complexity', 'L3');
  document.set('risk', {
    level: 'R3',
    domains: ['legacy-unclassified'],
    rationale: 'Legacy task migrated without a verified risk classification; reclassify before execution.',
  });
  document.set('model_plan', {
    created_by: { agent: 'unknown', provider: 'unknown', model: 'unknown' },
    executor_profile: 'frontier',
    suggested_models: suggestedModels,
    selection_rationale: typeof legacyReason === 'string' && legacyReason.trim() !== ''
      ? legacyReason
      : 'unknown',
    reviewer_profile: 'frontier',
    review_required: true,
    cross_provider_required: true,
  });
  document.set('model_execution', {
    executor: { agent: 'unknown', provider: 'unknown', model: 'unknown', started_at: 'unknown' },
    reviews: [],
  });
  return true;
}

function orchestrationStateFor(status) {
  if (status === 'done') return 'done';
  if (status === 'in_progress') return 'executing';
  if (status === 'blocked') return 'blocked';
  return 'pending';
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

// Reshapes a schema 1 task into the schema 2 contract. Slots are deliberately
// left absent: a model and an effort are routing decisions, and inventing them
// would let a migrated task pass a gate it never actually satisfied.
function migrateToSchema2(document, source) {
  const plan = documentValue(document, 'model_plan');
  if (!isObject(plan)) {
    throw new Error(`${source}: schema 2 migration requires an existing model_plan mapping`);
  }
  if (plan.schema === 2) return false;
  if (plan.schema !== undefined) {
    throw new Error(`${source}: unsupported model_plan.schema ${plan.schema}; expected 1 or 2`);
  }

  const execution = documentValue(document, 'model_execution');
  const executor = isObject(execution) && isObject(execution.executor) ? execution.executor : {};
  const reviews = isObject(execution) && Array.isArray(execution.reviews) ? execution.reviews : [];
  const suggestedModels = Array.isArray(plan.suggested_models) ? plan.suggested_models : [];
  const rationale = stringOrEmpty(plan.selection_rationale);
  const executorProfile = stringOrEmpty(plan.executor_profile);
  const reviewerProfile = stringOrEmpty(plan.reviewer_profile);

  document.set('needs_manual_routing', true);
  if (!document.has('routing')) {
    document.set('routing', {
      work_type: '',
      categories: [],
      technologies: [],
      required_capabilities: [],
    });
  }
  document.set('model_plan', {
    schema: 2,
    created_by: isObject(plan.created_by)
      ? plan.created_by
      : { agent: 'unknown', provider: 'unknown', model: 'unknown' },
    executor: {
      required_profile: executorProfile,
      required_capabilities: [],
    },
    tester: {
      required: false,
      required_profile: executorProfile,
    },
    reviewer: {
      required: plan.review_required === true,
      required_profile: reviewerProfile,
      independent_model: false,
      cross_provider_required: plan.cross_provider_required === true,
    },
    migrated_from: {
      schema: 1,
      suggested_models: suggestedModels,
      selection_rationale: rationale,
    },
  });
  document.set('routing_rationale', {
    executor: rationale,
    tester: '',
    reviewer: '',
    upgrades: '',
  });
  document.set('orchestration', {
    mode: 'manual',
    state: orchestrationStateFor(documentValue(document, 'status')),
    attempts: { executor: 0, reworks: 0, upgrades: 0 },
  });
  document.set('model_execution', {
    orchestrator: { agent: '', provider: '', model: '', effort: '', started_at: '' },
    executor: {
      selection: '',
      agent: stringOrEmpty(executor.agent),
      provider: stringOrEmpty(executor.provider),
      model: stringOrEmpty(executor.model),
      effort: '',
      runner: '',
      started_at: stringOrEmpty(executor.started_at),
      attempts: 0,
    },
    tests: [],
    reviews,
  });
  return true;
}

function serialize(parsed) {
  const frontMatter = parsed.document.toString({ lineWidth: 0 }).trimEnd().replaceAll('\n', parsed.newline);
  return `${parsed.bom}---${parsed.newline}${frontMatter}${parsed.newline}---${parsed.closingNewline}${parsed.body}`;
}

export function migrateTaskContents(contents, source = '<task>', options = {}) {
  const target = options.to ?? 1;
  if (target !== 1 && target !== 2) {
    throw new Error(`${source}: unsupported migration target ${target}; expected 1 or 2`);
  }
  const parsed = parseFrontMatter(contents, source);
  let changed = migrateLegacyFields(parsed.document, source);
  if (target === 2) changed = migrateToSchema2(parsed.document, source) || changed;
  if (!changed) return { changed: false, contents };
  return { changed: true, contents: serialize(parsed) };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const original = readFileSync(options.taskPath, 'utf8');
    const result = migrateTaskContents(original, options.taskPath, { to: options.to });
    if (!result.changed) {
      console.log(`No legacy routing migration needed: ${options.taskPath}`);
      return;
    }
    if (options.write) {
      writeFileSync(options.taskPath, result.contents, 'utf8');
      console.log(`Migrated legacy task routing metadata: ${options.taskPath}`);
      return;
    }
    process.stdout.write(result.contents);
  } catch (error) {
    console.error(`Task routing migration failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
