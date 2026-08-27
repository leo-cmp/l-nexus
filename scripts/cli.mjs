#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const commands = new Map([
  ['install', {
    executable: path.join(scriptDirectory, 'install.sh'),
    prefix: [],
  }],
  ['update', {
    executable: path.join(scriptDirectory, 'update.sh'),
    prefix: [],
  }],
  ['validate-task', {
    executable: process.execPath,
    prefix: [path.join(scriptDirectory, 'validate-task-routing.mjs')],
  }],
  ['migrate-task', {
    executable: process.execPath,
    prefix: [path.join(scriptDirectory, 'migrate-task-routing.mjs')],
  }],
]);

function usage() {
  return `Usage: l-nexus <command> [options]

Commands:
  install [target]
  update [target]
  validate-task <task-path> [--routing <path>] [--final-commit <sha>]
  migrate-task <task-path> [--write]`;
}

const [command, ...args] = process.argv.slice(2);

if (!command || command === '--help' || command === '-h') {
  console.log(usage());
  process.exit(0);
}

const target = commands.get(command);
if (!target) {
  console.error(`Unknown command: ${command}\n\n${usage()}`);
  process.exit(1);
}

const result = spawnSync(target.executable, [...target.prefix, ...args], {
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to run ${command}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
