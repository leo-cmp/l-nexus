#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { isMap, parseDocument } from 'yaml';

const LEGACY_FIELDS = ['modelo_recomendado', 'substitutos', 'motivo'];

function usage() {
  return `Usage:
  migrate-task-routing.mjs <task-path> [--write]
  l-nexus migrate-task <task-path> [--write]

Migrates legacy routing metadata. The default is a dry-run that prints the
migrated task without modifying the file.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'migrate-task') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  let taskPath = null;
  let write = false;
  for (const value of args) {
    if (value === '--write') {
      write = true;
    } else if (value.startsWith('-')) {
      throw new Error(`unknown option ${value}`);
    } else if (taskPath) {
      throw new Error('expected exactly one task path');
    } else {
      taskPath = value;
    }
  }
  if (!taskPath) throw new Error('task path is required');
  return { taskPath, write };
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

function recommendationValues(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim() !== '');
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}

function documentValue(document, key) {
  const node = document.get(key, true);
  return node && typeof node.toJSON === 'function' ? node.toJSON() : node;
}

export function migrateTaskContents(contents, source = '<task>') {
  const parsed = parseFrontMatter(contents, source);
  const { document } = parsed;
  const hasLegacyFields = LEGACY_FIELDS.some((field) => document.has(field));
  if (!hasLegacyFields || document.has('model_plan')) {
    return { changed: false, contents };
  }
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

  const frontMatter = document.toString({ lineWidth: 0 }).trimEnd().replaceAll('\n', parsed.newline);
  const migrated = `${parsed.bom}---${parsed.newline}${frontMatter}${parsed.newline}---${parsed.closingNewline}${parsed.body}`;
  return { changed: true, contents: migrated };
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const original = readFileSync(options.taskPath, 'utf8');
    const result = migrateTaskContents(original, options.taskPath);
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
