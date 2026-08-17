#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const SUPPORTED_SCHEMA_VERSION = 1;
const RISK_LEVELS = new Set(['R1', 'R2', 'R3']);
const COMPLEXITY_LEVELS = new Set(['L1', 'L2', 'L3']);

function usage() {
  return `Usage:
  validate-task-routing.mjs <task-path> [--routing <routing-path>] [--final-commit <sha>]
  l-nexus validate-task <task-path> [--routing <routing-path>] [--final-commit <sha>]

Validates task front matter against model-routing.yaml.`;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === 'validate-task') args.shift();
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  const options = { taskPath: null, routingPath: '.ai/model-routing.yaml', finalCommit: null };
  while (args.length > 0) {
    const value = args.shift();
    if (value === '--routing' || value === '--final-commit') {
      const optionValue = args.shift();
      if (!optionValue) throw new Error(`cli.${value}: requires a value`);
      if (value === '--routing') options.routingPath = optionValue;
      else options.finalCommit = optionValue;
      continue;
    }
    if (value.startsWith('-')) throw new Error(`cli: unknown option ${value}`);
    if (options.taskPath) throw new Error('cli: expected exactly one task path');
    options.taskPath = value;
  }
  if (!options.taskPath) throw new Error('cli.taskPath: is required');
  return options;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function parseYaml(text, source) {
  const document = parseDocument(text, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`${source}: invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  const value = document.toJS();
  if (!isObject(value)) throw new Error(`${source}: expected a YAML mapping`);
  return value;
}

function parseTaskFrontMatter(text, source) {
  const normalized = text.replace(/^\uFEFF/, '');
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`${source}: expected YAML front matter delimited by ---`);
  return parseYaml(match[1], `${source} front matter`);
}

function valueIsKnown(value) {
  return typeof value === 'string' && value.trim() !== '' && value.trim().toLowerCase() !== 'unknown';
}

function validateIdentity(errors, value, field, { requireKnown = false } = {}) {
  if (!isObject(value)) {
    addError(errors, field, 'must be a mapping with agent, model, and provider');
    return false;
  }
  for (const key of ['agent', 'model', 'provider']) {
    const identity = value[key];
    if (typeof identity !== 'string' || identity.trim() === '') {
      addError(errors, `${field}.${key}`, 'must be a non-empty string');
    } else if (requireKnown && key !== 'agent' && !valueIsKnown(identity)) {
      addError(errors, `${field}.${key}`, 'must be known and cannot be unknown');
    }
  }
  return true;
}

function validateCatalogModel(errors, identity, field, routing, requiredProfile) {
  if (!isObject(identity) || !valueIsKnown(identity.model) || !valueIsKnown(identity.provider)) return;
  const model = routing.models?.[identity.model];
  if (!isObject(model)) {
    addError(errors, `${field}.model`, `must reference a configured routing.models entry (${identity.model})`);
    return;
  }
  if (model.status !== 'active') addError(errors, `${field}.model`, `must reference an active routing.models entry (${identity.model})`);
  if (model.provider !== identity.provider) addError(errors, `${field}.provider`, `must match routing.models.${identity.model}.provider (${model.provider ?? 'missing'})`);
  if (typeof model.last_evaluated !== 'string' || model.last_evaluated.trim() === '') {
    addError(errors, `routing.models.${identity.model}.last_evaluated`, 'is required for an executing or approving model');
  }
  if (typeof model.evidence !== 'string' || model.evidence.trim() === '') {
    addError(errors, `routing.models.${identity.model}.evidence`, 'is required for an executing or approving model');
  }
  const modelRank = routing.profiles?.[model.profile]?.rank;
  const requiredRank = routing.profiles?.[requiredProfile]?.rank;
  if (typeof modelRank !== 'number' || typeof requiredRank !== 'number' || modelRank < requiredRank) {
    addError(errors, `${field}.model`, `must use a model with profile rank at least ${requiredProfile}`);
  }
}

function effectiveReviewRequired(riskLevel, routing) {
  if (riskLevel === 'R3') return true;
  if (riskLevel === 'R2') return routing.project_policy.r2_review === 'required';
  return false;
}

function validateRouting(routing, errors) {
  if (routing.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    addError(errors, 'routing.schema_version', `must be supported version ${SUPPORTED_SCHEMA_VERSION}`);
  }
  if (!isObject(routing.project_policy)) {
    addError(errors, 'routing.project_policy', 'must be a mapping');
  } else {
    if (!['required', 'optional'].includes(routing.project_policy.r2_review)) {
      addError(errors, 'routing.project_policy.r2_review', 'must be required or optional');
    }
    if (typeof routing.project_policy.r3_cross_provider !== 'boolean') {
      addError(errors, 'routing.project_policy.r3_cross_provider', 'must be boolean');
    }
    if (routing.project_policy.unknown_model_identity !== 'reject_for_r3') {
      addError(errors, 'routing.project_policy.unknown_model_identity', 'must be reject_for_r3');
    }
  }
  if (!isObject(routing.profiles)) addError(errors, 'routing.profiles', 'must be a mapping');
  else {
    for (const [profileName, profile] of Object.entries(routing.profiles)) {
      if (!isObject(profile) || !Number.isInteger(profile.rank) || profile.rank < 1) {
        addError(errors, `routing.profiles.${profileName}.rank`, 'must be a positive integer');
      }
    }
  }
  if (!isObject(routing.models)) addError(errors, 'routing.models', 'must be a mapping');
  if (!isObject(routing.routes)) {
    addError(errors, 'routing.routes', 'must be a mapping');
    return;
  }
  for (const level of RISK_LEVELS) {
    const route = routing.routes[level];
    if (!isObject(route)) {
      addError(errors, `routing.routes.${level}`, 'must be a mapping');
      continue;
    }
    if (typeof route.executor_profile !== 'string' || !isObject(routing.profiles) || !routing.profiles[route.executor_profile]) {
      addError(errors, `routing.routes.${level}.executor_profile`, 'must reference a configured profile');
    }
    if (!['optional', 'required', 'project_policy'].includes(route.review)) {
      addError(errors, `routing.routes.${level}.review`, 'must be optional, required, or project_policy');
    }
  }
}

function validateTask(task, routing, finalCommit, errors) {
  if (!COMPLEXITY_LEVELS.has(task.complexity)) {
    addError(errors, 'task.complexity', 'must be L1, L2, or L3');
  }
  if (!isObject(task.risk)) {
    addError(errors, 'task.risk', 'must be a mapping');
    return;
  }
  const riskLevel = task.risk.level;
  if (!RISK_LEVELS.has(riskLevel)) {
    addError(errors, 'task.risk.level', 'must be R1, R2, or R3');
    return;
  }
  if (!Array.isArray(task.risk.domains)) addError(errors, 'task.risk.domains', 'must be an array');
  if (['R2', 'R3'].includes(riskLevel) && (typeof task.risk.rationale !== 'string' || task.risk.rationale.trim() === '')) {
    addError(errors, 'task.risk.rationale', 'is required for R2 and R3');
  }

  if (!isObject(task.model_plan)) {
    addError(errors, 'task.model_plan', 'must be a mapping');
  } else {
    validateIdentity(errors, task.model_plan.created_by, 'task.model_plan.created_by');
    const route = routing.routes?.[riskLevel];
    if (route && task.model_plan.executor_profile !== route.executor_profile) {
      addError(errors, 'task.model_plan.executor_profile', `must match routing.routes.${riskLevel}.executor_profile (${route.executor_profile})`);
    }
    const reviewRequired = effectiveReviewRequired(riskLevel, routing);
    if (task.model_plan.review_required !== reviewRequired) {
      addError(errors, 'task.model_plan.review_required', `must be ${reviewRequired} for ${riskLevel}`);
    }
    const crossProviderRequired = riskLevel === 'R3' && routing.project_policy.r3_cross_provider;
    if (task.model_plan.cross_provider_required !== crossProviderRequired) {
      addError(errors, 'task.model_plan.cross_provider_required', `must be ${crossProviderRequired} for ${riskLevel}`);
    }
    if (reviewRequired && route?.reviewer_profile && task.model_plan.reviewer_profile !== route.reviewer_profile) {
      addError(errors, 'task.model_plan.reviewer_profile', `must match routing.routes.${riskLevel}.reviewer_profile (${route.reviewer_profile})`);
    }
  }

  if (!isObject(task.model_execution)) {
    addError(errors, 'task.model_execution', 'must be a mapping');
    return;
  }
  const executor = task.model_execution.executor;
  validateIdentity(errors, executor, 'task.model_execution.executor', { requireKnown: riskLevel === 'R3' });
  validateCatalogModel(errors, executor, 'task.model_execution.executor', routing, routing.routes?.[riskLevel]?.executor_profile);
  const reviews = task.model_execution.reviews;
  if (!Array.isArray(reviews)) {
    addError(errors, 'task.model_execution.reviews', 'must be an array');
    return;
  }

  const reviewRequired = effectiveReviewRequired(riskLevel, routing);
  if (!reviewRequired) return;

  const approvedFinalReviews = [];
  reviews.forEach((review, index) => {
    const field = `task.model_execution.reviews[${index}]`;
    if (!isObject(review)) {
      addError(errors, field, 'must be a mapping');
      return;
    }
    validateIdentity(errors, review, field, { requireKnown: riskLevel === 'R3' && review.verdict === 'approved' });
    for (const key of ['commit', 'reviewed_at']) {
      if (typeof review[key] !== 'string' || review[key].trim() === '') addError(errors, `${field}.${key}`, 'must be a non-empty string');
    }
    if (typeof review.verdict !== 'string' || review.verdict.trim() === '') {
      addError(errors, `${field}.verdict`, 'must be a non-empty string');
      return;
    }
    if (review.verdict === 'approved') {
      if (typeof review.findings !== 'string' || review.findings.trim() === '') {
        addError(errors, `${field}.findings`, 'must explicitly summarize findings or state no findings');
      }
      if (review.commit === finalCommit) {
        validateCatalogModel(errors, review, field, routing, routing.routes?.[riskLevel]?.reviewer_profile);
        approvedFinalReviews.push({ review, field });
      }
    }
  });

  if (approvedFinalReviews.length === 0) {
    addError(errors, 'task.model_execution.reviews', `requires an approved review of final commit ${finalCommit}`);
    return;
  }
  if (riskLevel !== 'R3' || !isObject(executor)) return;

  const independentReview = approvedFinalReviews.find(({ review }) => (
    review.model !== executor.model
    && (!routing.project_policy.r3_cross_provider || review.provider !== executor.provider)
  ));
  if (!independentReview) {
    addError(errors, 'task.model_execution.reviews', 'requires an approved R3 review by a different model and provider');
  }
}

function resolveFinalCommit(override) {
  if (override) return override;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('cli.finalCommit: could not resolve Git HEAD; pass --final-commit <sha>');
  }
}

export function validateTaskRouting({ taskPath, routingPath = '.ai/model-routing.yaml', finalCommit }) {
  const errors = [];
  let routing;
  let task;
  try {
    routing = parseYaml(readFileSync(routingPath, 'utf8'), routingPath);
  } catch (error) {
    return { valid: false, errors: [error.message] };
  }
  validateRouting(routing, errors);
  if (errors.length > 0) return { valid: false, errors };
  try {
    task = parseTaskFrontMatter(readFileSync(taskPath, 'utf8'), taskPath);
  } catch (error) {
    return { valid: false, errors: [error.message] };
  }
  let resolvedFinalCommit;
  try {
    resolvedFinalCommit = resolveFinalCommit(finalCommit);
  } catch (error) {
    return { valid: false, errors: [error.message] };
  }
  validateTask(task, routing, resolvedFinalCommit, errors);
  return { valid: errors.length === 0, errors, finalCommit: resolvedFinalCommit };
}

function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv[0] === 'install' || argv[0] === 'install-force') {
      const scriptName = argv[0] === 'install-force' ? 'install-force.sh' : 'install.sh';
      const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), scriptName);
      execFileSync(scriptPath, argv.slice(1), { stdio: 'inherit' });
      return;
    }
    const options = parseArguments(argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = validateTaskRouting(options);
    if (!result.valid) {
      console.error('Task routing validation failed:');
      for (const error of result.errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Task routing validation passed for final commit ${result.finalCommit}.`);
  } catch (error) {
    console.error(`Task routing validation failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
