#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseDocument } from 'yaml';

const SUPPORTED_SCHEMA_VERSIONS = [1, 2];
const RISK_LEVELS = new Set(['R1', 'R2', 'R3']);
const COMPLEXITY_LEVELS = new Set(['L1', 'L2', 'L3']);
const EFFORT_LEVELS = ['default', 'low', 'high', 'max'];
const ROUTING_SLOTS = ['default', 'alt1', 'alt2', 'upgrade_alt1', 'upgrade_alt2'];
const UPGRADE_SLOTS = ['upgrade_alt1', 'upgrade_alt2'];
const ORCHESTRATION_MODES = new Set(['manual', 'orchestrated']);
const ORCHESTRATION_STATES = new Set([
  'pending', 'executing', 'testing', 'reviewing', 'rework',
  'blocked', 'needs_reclassification', 'done',
]);
const TEST_VERDICTS = new Set(['passed', 'failed', 'blocked']);
const REVIEW_VERDICTS = new Set(['approved', 'rejected', 'blocked']);
const ATTEMPT_BUDGETS = new Map([
  ['executor', 'max_total_execution_attempts'],
  ['reworks', 'max_same_executor_reworks'],
  ['upgrades', 'max_upgrades'],
]);

function usage() {
  return `Usage:
  validate-task-routing.mjs <task-path> [--routing <routing-path>] [--final-commit <sha>]
  l-nexus validate-task <task-path> [--routing <routing-path>] [--final-commit <sha>]
  l-nexus migrate-task <task-path> [--to 1|2] [--write]

Validates task front matter against model-routing.yaml (schema_version 1 or 2).`;
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
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(routing.schema_version)) {
    addError(errors, 'routing.schema_version', `must be one of the supported versions ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`);
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
    if (routing.schema_version === 2 && !['required', 'optional'].includes(routing.project_policy.r2_test_gate)) {
      addError(errors, 'routing.project_policy.r2_test_gate', 'must be required or optional');
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
  if (!isObject(routing.risk_domains)) {
    addError(errors, 'routing.risk_domains', 'must be a mapping');
  } else {
    for (const key of ['generic_r3', 'project']) {
      const domains = routing.risk_domains[key];
      if (!Array.isArray(domains) || domains.some((domain) => typeof domain !== 'string' || domain.trim() === '')) {
        addError(errors, `routing.risk_domains.${key}`, 'must be an array of non-empty strings');
      }
    }
  }
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
    if (typeof route.independent_model !== 'boolean') {
      addError(errors, `routing.routes.${level}.independent_model`, 'must be boolean');
    }
    if (level === 'R1' && route.review !== 'optional') {
      addError(errors, 'routing.routes.R1.review', 'must be optional');
    }
    if (level === 'R2' && route.review !== 'project_policy') {
      addError(errors, 'routing.routes.R2.review', 'must be project_policy');
    }
    if (level === 'R3' && route.review !== 'required') {
      addError(errors, 'routing.routes.R3.review', 'must be required');
    }
    if (['R2', 'R3'].includes(level)) {
      if (typeof route.reviewer_profile !== 'string' || !isObject(routing.profiles) || !routing.profiles[route.reviewer_profile]) {
        addError(errors, `routing.routes.${level}.reviewer_profile`, 'must reference a configured profile');
      }
      if (route.independent_model !== true) {
        addError(errors, `routing.routes.${level}.independent_model`, 'must be true when review can be required');
      }
    }
    if (level === 'R3' && route.cross_provider !== 'project_policy') {
      addError(errors, 'routing.routes.R3.cross_provider', 'must be project_policy');
    }
    if (routing.schema_version !== 2) continue;
    const expectedTestGate = { R1: 'optional', R2: 'project_policy', R3: 'required' }[level];
    if (route.test_gate !== expectedTestGate) {
      addError(errors, `routing.routes.${level}.test_gate`, `must be ${expectedTestGate}`);
    }
    if (['R2', 'R3'].includes(level)
      && (typeof route.tester_profile !== 'string' || !isObject(routing.profiles) || !routing.profiles[route.tester_profile])) {
      addError(errors, `routing.routes.${level}.tester_profile`, 'must reference a configured profile');
    }
  }

  if (routing.schema_version !== 2) return;
  if (!isObject(routing.execution_policy)) {
    addError(errors, 'routing.execution_policy', 'must be a mapping');
    return;
  }
  for (const budget of ATTEMPT_BUDGETS.values()) {
    const value = routing.execution_policy[budget];
    if (!Number.isInteger(value) || value < 0) {
      addError(errors, `routing.execution_policy.${budget}`, 'must be a non-negative integer');
    }
  }
}

function profileRank(routing, profileName) {
  const rank = routing.profiles?.[profileName]?.rank;
  return Number.isInteger(rank) ? rank : null;
}

function catalogKeyHint(routing, value) {
  if (!isObject(routing.models)) return '';
  const match = Object.entries(routing.models)
    .find(([, entry]) => isObject(entry) && entry.model === value);
  return match ? `; did you mean the catalog key ${match[0]}?` : '';
}

// Resolves one `{model, effort}` routing slot against the catalog. Returns the
// effective profile rank so callers can compare slots (upgrade vs default) even
// when the slot already failed the required-profile floor.
function validateRoutingSlot(errors, slot, field, routing, requiredProfile, requiredCapabilities) {
  if (!isObject(slot)) {
    addError(errors, field, 'must be a mapping with model and effort');
    return null;
  }
  const { model: modelKey, effort } = slot;
  if (typeof modelKey !== 'string' || modelKey.trim() === '') {
    addError(errors, `${field}.model`, 'must be a non-empty catalog key from routing.models');
    return null;
  }
  if (!EFFORT_LEVELS.includes(effort)) {
    addError(errors, `${field}.effort`, `must be one of ${EFFORT_LEVELS.join(', ')}`);
    return null;
  }
  const model = routing.models?.[modelKey];
  if (!isObject(model)) {
    addError(errors, `${field}.model`, `must reference a configured routing.models entry (${modelKey})${catalogKeyHint(routing, modelKey)}`);
    return null;
  }
  if (model.status !== 'active') {
    addError(errors, `${field}.model`, `must reference an active routing.models entry (${modelKey})`);
  }
  if (typeof model.last_evaluated !== 'string' || model.last_evaluated.trim() === '') {
    addError(errors, `routing.models.${modelKey}.last_evaluated`, 'is required for a routed model');
  }
  if (typeof model.evidence !== 'string' || model.evidence.trim() === '') {
    addError(errors, `routing.models.${modelKey}.evidence`, 'is required for a routed model');
  }
  for (const capability of requiredCapabilities) {
    if (!Array.isArray(model.capabilities) || !model.capabilities.includes(capability)) {
      addError(errors, `${field}.model`, `${modelKey} does not declare required capability ${capability}`);
    }
  }
  const variantProfile = model.profile_by_variant?.[effort];
  if (typeof variantProfile !== 'string') {
    addError(errors, `routing.models.${modelKey}.profile_by_variant.${effort}`, `is required to route ${field}`);
    return null;
  }
  const rank = profileRank(routing, variantProfile);
  const requiredRank = profileRank(routing, requiredProfile);
  if (rank === null) {
    addError(errors, `routing.models.${modelKey}.profile_by_variant.${effort}`, `must reference a configured profile (${variantProfile})`);
    return null;
  }
  if (requiredRank !== null && rank < requiredRank) {
    addError(errors, field, `${modelKey} at effort ${effort} resolves to profile ${variantProfile}, below required ${requiredProfile}`);
  }
  return rank;
}

// Validates one routed role (executor, tester or reviewer): its required
// profile, its capability list and each of its slots. `requiredSlots` keeps the
// executor contract complete while letting tester/reviewer declare only what the
// project actually plans for.
function validateRoutedRole(errors, plan, roleName, routing, riskLevel, options) {
  const field = `task.model_plan.${roleName}`;
  if (!isObject(plan)) {
    addError(errors, field, 'must be a mapping');
    return null;
  }
  const requiredProfile = plan.required_profile;
  if (typeof requiredProfile !== 'string' || !routing.profiles?.[requiredProfile]) {
    addError(errors, `${field}.required_profile`, 'must reference a configured profile');
  }
  const routeProfile = routing.routes?.[riskLevel]?.[options.routeProfileKey];
  if (typeof routeProfile === 'string' && requiredProfile !== routeProfile) {
    addError(errors, `${field}.required_profile`, `must match routing.routes.${riskLevel}.${options.routeProfileKey} (${routeProfile})`);
  }

  let requiredCapabilities = [];
  if (roleName === 'executor') {
    if (!Array.isArray(plan.required_capabilities)) {
      addError(errors, `${field}.required_capabilities`, 'must be an array');
    } else {
      requiredCapabilities = plan.required_capabilities.filter((value) => typeof value === 'string' && value.trim() !== '');
      const declared = new Set(requiredCapabilities);
      for (const capability of routingCapabilities(options.taskRouting)) {
        if (!declared.has(capability)) {
          addError(errors, `${field}.required_capabilities`, `must include routing.required_capabilities entry ${capability}`);
        }
      }
    }
  }

  const ranks = new Map();
  for (const slot of ROUTING_SLOTS) {
    const value = plan[slot];
    const slotRequired = options.requiredSlots.includes(slot);
    if (value === undefined || value === null) {
      if (slotRequired) addError(errors, `${field}.${slot}`, 'must be a mapping with model and effort');
      continue;
    }
    const rank = validateRoutingSlot(errors, value, `${field}.${slot}`, routing, requiredProfile, requiredCapabilities);
    if (rank !== null) ranks.set(slot, rank);
  }

  const defaultRank = ranks.get('default');
  if (defaultRank !== undefined) {
    for (const slot of UPGRADE_SLOTS) {
      const rank = ranks.get(slot);
      if (rank !== undefined && rank < defaultRank) {
        addError(errors, `${field}.${slot}`, `must not resolve to a weaker profile than ${roleName}.default`);
      }
    }
  }
  return plan;
}

function routingCapabilities(taskRouting) {
  if (!isObject(taskRouting) || !Array.isArray(taskRouting.required_capabilities)) return [];
  return taskRouting.required_capabilities.filter((value) => typeof value === 'string' && value.trim() !== '');
}

function effectiveTestGateRequired(riskLevel, routing) {
  if (riskLevel === 'R3') return true;
  if (riskLevel === 'R2') return routing.project_policy.r2_test_gate === 'required';
  return false;
}

// Checks that a recorded execution honours the slot it claims to have used, so
// the orchestrator cannot substitute a model without the task saying so.
function validateExecutionSlot(errors, record, field, plan, roleName) {
  const selection = record.selection;
  if (!ROUTING_SLOTS.includes(selection)) {
    addError(errors, `${field}.selection`, `must be one of ${ROUTING_SLOTS.join(', ')}`);
    return;
  }
  const slot = isObject(plan) ? plan[selection] : undefined;
  if (!isObject(slot)) {
    addError(errors, `${field}.selection`, `must name a slot declared in task.model_plan.${roleName} (${selection})`);
    return;
  }
  if (record.model !== slot.model) {
    addError(errors, `${field}.model`, `must match task.model_plan.${roleName}.${selection}.model (${slot.model})`);
  }
  if (record.effort !== slot.effort) {
    addError(errors, `${field}.effort`, `must match task.model_plan.${roleName}.${selection}.effort (${slot.effort})`);
  }
}

// A CLI that cannot select reasoning effort must not be credited with it. When
// a model only reaches the required profile above its default variant, the
// effort is load-bearing, so an effort-blind runner is rejected instead of
// silently pretending the effort was applied.
function validateRunnerEffortSupport(errors, record, field, routing, requiredProfile) {
  const runnerName = record.runner;
  if (typeof runnerName !== 'string' || runnerName.trim() === '') return;
  const runner = routing.cli_runners?.[runnerName];
  if (!isObject(runner)) {
    addError(errors, `${field}.runner`, `must reference a configured routing.cli_runners entry (${runnerName})`);
    return;
  }
  // Support is per level, not blanket: a CLI may expose low and high without
  // having any equivalent of max. An unmapped level is unsupported.
  const appliesThisEffort = runner.effort?.supported === true
    && (record.effort === 'default' || isObject(runner.effort.mapping) && runner.effort.mapping[record.effort] !== undefined);
  if (appliesThisEffort) return;
  const model = routing.models?.[record.model];
  const defaultRank = profileRank(routing, model?.profile_by_variant?.default);
  const requiredRank = profileRank(routing, requiredProfile);
  if (defaultRank === null || requiredRank === null || defaultRank >= requiredRank) return;
  addError(errors, `${field}.effort`,
    `runner ${runnerName} does not apply effort ${record.effort}, but ${record.model} only reaches ${requiredProfile} above its default variant`);
}

function validateExecutionIdentityV2(errors, record, field, routing, requiredProfile, { requireKnown = false } = {}) {
  validateIdentity(errors, record, field, { requireKnown });
  if (!isObject(record) || !valueIsKnown(record.model) || !valueIsKnown(record.provider)) return;
  const model = routing.models?.[record.model];
  if (!isObject(model)) {
    addError(errors, `${field}.model`, `must reference a configured routing.models entry (${record.model})${catalogKeyHint(routing, record.model)}`);
    return;
  }
  if (model.provider !== record.provider) {
    addError(errors, `${field}.provider`, `must match routing.models.${record.model}.provider (${model.provider ?? 'missing'})`);
  }
  if (!EFFORT_LEVELS.includes(record.effort)) {
    addError(errors, `${field}.effort`, `must be one of ${EFFORT_LEVELS.join(', ')}`);
    return;
  }
  const variantProfile = model.profile_by_variant?.[record.effort];
  const rank = profileRank(routing, variantProfile);
  const requiredRank = profileRank(routing, requiredProfile);
  if (rank === null) {
    addError(errors, `routing.models.${record.model}.profile_by_variant.${record.effort}`, `is required to record ${field}`);
    return;
  }
  if (requiredRank !== null && rank < requiredRank) {
    addError(errors, field, `${record.model} at effort ${record.effort} resolves to profile ${variantProfile}, below required ${requiredProfile}`);
  }
  validateRunnerEffortSupport(errors, record, field, routing, requiredProfile);
}

function validateTask(task, routing, finalCommit, errors) {
  if (task.needs_manual_routing === true) {
    addError(errors, 'task.needs_manual_routing',
      'routing migrated to schema 2 is incomplete; a human must fill task.routing and every '
      + 'model_plan slot, then remove this flag');
    return;
  }
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
  if (!Array.isArray(task.risk.domains)) {
    addError(errors, 'task.risk.domains', 'must be an array');
  } else {
    const mandatoryR3Domains = new Set([
      ...(routing.risk_domains?.generic_r3 ?? []),
      ...(routing.risk_domains?.project ?? []),
    ]);
    const matchedDomain = task.risk.domains.find((domain) => mandatoryR3Domains.has(domain));
    if (matchedDomain && riskLevel !== 'R3') {
      addError(errors, 'task.risk.level', `must be R3 because domain ${matchedDomain} is configured as mandatory R3`);
    }
  }
  if (['R2', 'R3'].includes(riskLevel) && (typeof task.risk.rationale !== 'string' || task.risk.rationale.trim() === '')) {
    addError(errors, 'task.risk.rationale', 'is required for R2 and R3');
  }

  const planSchema = isObject(task.model_plan) ? task.model_plan.schema : undefined;
  if (planSchema !== undefined && planSchema !== 2) {
    addError(errors, 'task.model_plan.schema', 'must be 2 when present; omit it for legacy schema 1 tasks');
    return;
  }
  if (planSchema === 2) {
    if (routing.schema_version !== 2) {
      addError(errors, 'task.model_plan.schema', 'requires routing schema_version 2 in model-routing.yaml');
      return;
    }
    validateTaskV2(task, routing, riskLevel, finalCommit, errors);
    return;
  }
  validateTaskV1(task, routing, riskLevel, finalCommit, errors);
}

function validateTaskV1(task, routing, riskLevel, finalCommit, errors) {
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
  if (isObject(executor) && (typeof executor.started_at !== 'string' || executor.started_at.trim() === '')) {
    addError(errors, 'task.model_execution.executor.started_at', 'must be a non-empty string');
  }
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
  if (!isObject(executor)) return;

  const route = routing.routes?.[riskLevel];
  if (route?.independent_model) {
    const independentModelReview = approvedFinalReviews.find(({ review }) => review.model !== executor.model);
    if (!independentModelReview) {
      addError(errors, 'task.model_execution.reviews', 'requires an approved review by a different model');
      return;
    }
  }

  if (riskLevel !== 'R3' || !routing.project_policy.r3_cross_provider) return;

  const independentReview = approvedFinalReviews.find(({ review }) => (
    review.model !== executor.model
    && review.provider !== executor.provider
  ));
  if (!independentReview) {
    addError(errors, 'task.model_execution.reviews', 'requires an approved R3 review by a different model and provider');
  }
}

function validateTaskV2(task, routing, riskLevel, finalCommit, errors) {
  const plan = task.model_plan;
  validateIdentity(errors, plan.created_by, 'task.model_plan.created_by');

  if (!isObject(task.routing)) {
    addError(errors, 'task.routing', 'must be a mapping with work_type, categories, technologies and required_capabilities');
  } else {
    if (typeof task.routing.work_type !== 'string' || task.routing.work_type.trim() === '') {
      addError(errors, 'task.routing.work_type', 'must be a non-empty string');
    }
    for (const key of ['categories', 'technologies', 'required_capabilities']) {
      const value = task.routing[key];
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
        addError(errors, `task.routing.${key}`, 'must be an array of non-empty strings');
      }
    }
  }

  if (!isObject(task.routing_rationale) || typeof task.routing_rationale.executor !== 'string'
    || task.routing_rationale.executor.trim() === '') {
    addError(errors, 'task.routing_rationale.executor', 'must explain why the executor routing was chosen');
  }

  const route = isObject(routing.routes?.[riskLevel]) ? routing.routes[riskLevel] : {};
  const reviewRequired = effectiveReviewRequired(riskLevel, routing);
  const testRequired = effectiveTestGateRequired(riskLevel, routing);
  const crossProviderRequired = riskLevel === 'R3' && routing.project_policy.r3_cross_provider === true;

  validateRoutedRole(errors, plan.executor, 'executor', routing, riskLevel, {
    routeProfileKey: 'executor_profile',
    requiredSlots: ROUTING_SLOTS,
    taskRouting: task.routing,
  });
  validateRoutedRole(errors, plan.tester, 'tester', routing, riskLevel, {
    routeProfileKey: 'tester_profile',
    requiredSlots: ['default'],
    taskRouting: task.routing,
  });
  validateRoutedRole(errors, plan.reviewer, 'reviewer', routing, riskLevel, {
    routeProfileKey: 'reviewer_profile',
    requiredSlots: ['default'],
    taskRouting: task.routing,
  });

  if (isObject(plan.tester) && plan.tester.required !== testRequired) {
    addError(errors, 'task.model_plan.tester.required', `must be ${testRequired} for ${riskLevel}`);
  }
  if (isObject(plan.reviewer)) {
    if (plan.reviewer.required !== reviewRequired) {
      addError(errors, 'task.model_plan.reviewer.required', `must be ${reviewRequired} for ${riskLevel}`);
    }
    if (plan.reviewer.independent_model !== (route.independent_model === true)) {
      addError(errors, 'task.model_plan.reviewer.independent_model', `must be ${route.independent_model === true} for ${riskLevel}`);
    }
    if (plan.reviewer.cross_provider_required !== crossProviderRequired) {
      addError(errors, 'task.model_plan.reviewer.cross_provider_required', `must be ${crossProviderRequired} for ${riskLevel}`);
    }
  }

  // A plan that pairs the same model for executing and reviewing can never
  // satisfy the independence gate, so it is rejected at planning time.
  const plannedExecutor = isObject(plan.executor?.default) ? plan.executor.default : null;
  const plannedReviewer = isObject(plan.reviewer?.default) ? plan.reviewer.default : null;
  if (reviewRequired && route.independent_model === true && plannedExecutor && plannedReviewer) {
    if (plannedReviewer.model === plannedExecutor.model) {
      addError(errors, 'task.model_plan.reviewer.default.model', 'must differ from the planned executor model');
    }
    if (crossProviderRequired) {
      const executorProvider = routing.models?.[plannedExecutor.model]?.provider;
      const reviewerProvider = routing.models?.[plannedReviewer.model]?.provider;
      if (executorProvider !== undefined && executorProvider === reviewerProvider) {
        addError(errors, 'task.model_plan.reviewer.default.model', `must use a provider other than ${executorProvider} for ${riskLevel}`);
      }
    }
  }

  if (!isObject(task.orchestration)) {
    addError(errors, 'task.orchestration', 'must be a mapping with mode, state and attempts');
  } else {
    if (!ORCHESTRATION_MODES.has(task.orchestration.mode)) {
      addError(errors, 'task.orchestration.mode', `must be one of ${[...ORCHESTRATION_MODES].join(', ')}`);
    }
    if (!ORCHESTRATION_STATES.has(task.orchestration.state)) {
      addError(errors, 'task.orchestration.state', `must be one of ${[...ORCHESTRATION_STATES].join(', ')}`);
    }
    const attempts = task.orchestration.attempts;
    if (!isObject(attempts)) {
      addError(errors, 'task.orchestration.attempts', 'must be a mapping with executor, reworks and upgrades');
    } else {
      for (const [key, budgetKey] of ATTEMPT_BUDGETS) {
        const value = attempts[key];
        if (!Number.isInteger(value) || value < 0) {
          addError(errors, `task.orchestration.attempts.${key}`, 'must be a non-negative integer');
          continue;
        }
        const budget = routing.execution_policy?.[budgetKey];
        if (Number.isInteger(budget) && value > budget) {
          addError(errors, `task.orchestration.attempts.${key}`, `must not exceed execution_policy.${budgetKey} (${budget})`);
        }
      }
    }
  }

  if (!isObject(task.model_execution)) {
    addError(errors, 'task.model_execution', 'must be a mapping');
    return;
  }
  const orchestrated = task.orchestration?.mode === 'orchestrated';
  if (orchestrated) {
    // The orchestrating runtime is recorded for provenance only. It is never
    // matched against the catalog, so any runtime or model may orchestrate.
    const orchestrator = task.model_execution.orchestrator;
    validateIdentity(errors, orchestrator, 'task.model_execution.orchestrator');
    if (isObject(orchestrator) && (typeof orchestrator.started_at !== 'string' || orchestrator.started_at.trim() === '')) {
      addError(errors, 'task.model_execution.orchestrator.started_at', 'must be a non-empty string');
    }
  }

  const executor = task.model_execution.executor;
  if (!isObject(executor)) {
    addError(errors, 'task.model_execution.executor', 'must be a mapping');
    return;
  }
  validateExecutionIdentityV2(errors, executor, 'task.model_execution.executor', routing, route.executor_profile, {
    requireKnown: riskLevel === 'R3',
  });
  validateExecutionSlot(errors, executor, 'task.model_execution.executor', plan.executor, 'executor');
  if (typeof executor.started_at !== 'string' || executor.started_at.trim() === '') {
    addError(errors, 'task.model_execution.executor.started_at', 'must be a non-empty string');
  }
  if (!Number.isInteger(executor.attempts) || executor.attempts < 0) {
    addError(errors, 'task.model_execution.executor.attempts', 'must be a non-negative integer');
  }
  if (orchestrated && (typeof executor.runner !== 'string' || executor.runner.trim() === '')) {
    addError(errors, 'task.model_execution.executor.runner', 'is required when task.orchestration.mode is orchestrated');
  }

  const tests = task.model_execution.tests;
  let passedFinalTests = 0;
  if (!Array.isArray(tests)) {
    addError(errors, 'task.model_execution.tests', 'must be an array');
  } else {
    tests.forEach((entry, index) => {
      const field = `task.model_execution.tests[${index}]`;
      if (!isObject(entry)) {
        addError(errors, field, 'must be a mapping');
        return;
      }
      validateIdentity(errors, entry, field);
      for (const key of ['commit', 'tested_at']) {
        if (typeof entry[key] !== 'string' || entry[key].trim() === '') {
          addError(errors, `${field}.${key}`, 'must be a non-empty string');
        }
      }
      if (!TEST_VERDICTS.has(entry.verdict)) {
        addError(errors, `${field}.verdict`, `must be one of ${[...TEST_VERDICTS].join(', ')}`);
        return;
      }
      if (entry.verdict !== 'passed' || entry.commit !== finalCommit) return;
      validateExecutionIdentityV2(errors, entry, field, routing, route.tester_profile ?? plan.tester?.required_profile, {
        requireKnown: riskLevel === 'R3',
      });
      validateExecutionSlot(errors, entry, field, plan.tester, 'tester');
      passedFinalTests += 1;
    });
  }
  if (testRequired && passedFinalTests === 0) {
    addError(errors, 'task.model_execution.tests', `requires a passed test run of final commit ${finalCommit}`);
  }

  const reviews = task.model_execution.reviews;
  if (!Array.isArray(reviews)) {
    addError(errors, 'task.model_execution.reviews', 'must be an array');
    return;
  }
  const approvedFinalReviews = [];
  reviews.forEach((review, index) => {
    const field = `task.model_execution.reviews[${index}]`;
    if (!isObject(review)) {
      addError(errors, field, 'must be a mapping');
      return;
    }
    validateIdentity(errors, review, field, { requireKnown: riskLevel === 'R3' && review.verdict === 'approved' });
    for (const key of ['commit', 'reviewed_at']) {
      if (typeof review[key] !== 'string' || review[key].trim() === '') {
        addError(errors, `${field}.${key}`, 'must be a non-empty string');
      }
    }
    if (!REVIEW_VERDICTS.has(review.verdict)) {
      addError(errors, `${field}.verdict`, `must be one of ${[...REVIEW_VERDICTS].join(', ')}`);
      return;
    }
    if (review.verdict !== 'approved') return;
    if (typeof review.findings !== 'string' || review.findings.trim() === '') {
      addError(errors, `${field}.findings`, 'must explicitly summarize findings or state no findings');
    }
    if (review.commit !== finalCommit) return;
    validateExecutionIdentityV2(errors, review, field, routing, route.reviewer_profile ?? plan.reviewer?.required_profile, {
      requireKnown: riskLevel === 'R3',
    });
    validateExecutionSlot(errors, review, field, plan.reviewer, 'reviewer');
    approvedFinalReviews.push(review);
  });

  if (!reviewRequired) return;
  if (approvedFinalReviews.length === 0) {
    addError(errors, 'task.model_execution.reviews', `requires an approved review of final commit ${finalCommit}`);
    return;
  }
  if (route.independent_model === true
    && !approvedFinalReviews.some((review) => review.model !== executor.model)) {
    addError(errors, 'task.model_execution.reviews', 'requires an approved review by a different model');
    return;
  }
  if (crossProviderRequired
    && !approvedFinalReviews.some((review) => review.model !== executor.model && review.provider !== executor.provider)) {
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
