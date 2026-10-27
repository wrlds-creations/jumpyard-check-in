'use strict';

// GH-598: one night of the approved T0195 lifecycle policy on Park. Every pass is one bounded T0195
// apply (advisory lock, NOWAIT table locks, recount under the lock, digest match, all-or-nothing
// rollback). The night ends when nothing is eligible, after its budget, or when a pass changes
// nothing. A count above the approved ceiling stops the night before any change.

const policy = require('./policy');
const lifecycleEngine = require('./engine');

const MODES = new Set(['off', 'plan', 'apply']);
const PARK_TEST_ENVIRONMENT = 'park-test';
const CLUSTER_ARN_PATTERN = /^arn:aws:rds:[a-z0-9-]+:\d{12}:cluster:([A-Za-z][A-Za-z0-9-]{0,62})$/;
// Only the dedicated lifecycle identity; a runtime or administrator secret is refused.
const LIFECYCLE_SECRET_ARN_PATTERN = /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:\/[a-z0-9-]+\/aurora\/lifecycle-[A-Za-z0-9]{6}$/;
const RUN_RESERVE_MS = 90_000;
const MAX_RETRIES = 5;
// A concurrent writer, another apply or a moved count rolls the pass back; the next pass replans.
const RETRYABLE_FAILURES = [
  ['lock_unavailable', /could not obtain lock|55P03/i],
  ['apply_lock_held', /Another lifecycle apply holds the database lock/],
  ['plan_changed', /Lifecycle plan changed after the apply lock was acquired/],
  ['serialization', /could not serialize access|40001/i],
  ['deadlock', /deadlock detected|40P01/i],
];

const stockholmDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function boundedInteger(env, name, minimum, maximum, { optional = false } = {}) {
  const raw = env[name];
  if (optional && (raw === undefined || raw === '')) return undefined;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new Error(`${name} must be an integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function readSettings(env) {
  const mode = env.DATA_LIFECYCLE_MODE;
  if (!MODES.has(mode)) throw new Error('DATA_LIFECYCLE_MODE must be off, plan or apply.');
  if (env.DATA_LIFECYCLE_ENVIRONMENT !== PARK_TEST_ENVIRONMENT) {
    throw new Error('The nightly lifecycle is approved for park-test only.');
  }
  const cluster = CLUSTER_ARN_PATTERN.exec(env.DATABASE_CLUSTER_ARN ?? '');
  if (!cluster) throw new Error('DATABASE_CLUSTER_ARN is not an Aurora cluster ARN.');
  if (!LIFECYCLE_SECRET_ARN_PATTERN.test(env.DATABASE_SECRET_ARN ?? '')) {
    throw new Error('DATABASE_SECRET_ARN must be the dedicated lifecycle secret.');
  }
  if (env.DATA_LIFECYCLE_APPROVED_POLICY_DIGEST !== policy.policyDefinitionDigest()) {
    throw new Error('The deployed lifecycle policy is not the approved policy definition.');
  }
  const catchUpUntil = env.DATA_LIFECYCLE_CATCH_UP_UNTIL ?? '';
  if (catchUpUntil !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(catchUpUntil)) {
    throw new Error('DATA_LIFECYCLE_CATCH_UP_UNTIL must be empty or YYYY-MM-DD.');
  }
  const catchUpMaxEligibleTotal = boundedInteger(env, 'DATA_LIFECYCLE_CATCH_UP_MAX_ELIGIBLE_TOTAL', 1, 1_000_000, {
    optional: true,
  });
  if ((catchUpUntil === '') !== (catchUpMaxEligibleTotal === undefined)) {
    throw new Error('A catch-up needs both its ceiling and its last day.');
  }
  return {
    batchSize: boundedInteger(env, 'DATA_LIFECYCLE_BATCH_SIZE', 1, policy.MAX_BATCH_SIZE),
    budgetMs: boundedInteger(env, 'DATA_LIFECYCLE_BUDGET_SECONDS', 60, 840) * 1000,
    catchUpMaxEligibleTotal,
    catchUpUntil,
    clusterArn: env.DATABASE_CLUSTER_ARN,
    clusterIdentifier: cluster[1],
    environment: env.DATA_LIFECYCLE_ENVIRONMENT,
    maxEligibleTotal: boundedInteger(env, 'DATA_LIFECYCLE_MAX_ELIGIBLE_TOTAL', 1, 1_000_000),
    maxMutations: boundedInteger(env, 'DATA_LIFECYCLE_MAX_MUTATIONS', 1, policy.MAX_MUTATIONS_LIMIT),
    maxRuns: boundedInteger(env, 'DATA_LIFECYCLE_MAX_RUNS', 1, 60),
    mode,
    pauseMs: boundedInteger(env, 'DATA_LIFECYCLE_PAUSE_SECONDS', 0, 60) * 1000,
    secretArn: env.DATABASE_SECRET_ARN,
  };
}

// The catch-up ceiling applies through its last Stockholm day; afterwards the normal one.
function ceilingFor(settings, now) {
  const catchUp = settings.catchUpUntil !== '' && stockholmDay.format(now) <= settings.catchUpUntil;
  return { catchUp, ceiling: catchUp ? settings.catchUpMaxEligibleTotal : settings.maxEligibleTotal };
}

// The largest per-action batch whose planned total stays within the run's mutation guard.
function fitBatchSize(counts, batchSize, maxMutations) {
  const planned = (batch) => [...counts.values()].reduce((total, eligible) => total + Math.min(eligible, batch), 0);
  if (planned(batchSize) <= maxMutations) return batchSize;
  let low = 1;
  let high = batchSize;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (planned(middle) <= maxMutations) low = middle;
    else high = middle - 1;
  }
  return low;
}

function eligibleTotal(counts) {
  return [...counts.values()].reduce((total, eligible) => total + eligible, 0);
}

function nonZero(actions, key) {
  return Object.fromEntries(actions.filter((action) => (action[key] ?? 0) > 0).map((action) => [action.action, action[key]]));
}

function retryableReason(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return RETRYABLE_FAILURES.find(([, pattern]) => pattern.test(text))?.[0];
}

// Data API messages can quote key values; only a class and the SQLSTATE leave this module.
function safeFailure(error) {
  const text = String(error?.message ?? '');
  const sqlState = /SQLState: ([0-9A-Z]{5})/.exec(text)?.[1];
  const reason = retryableReason(error) ?? (error?.constructor === Error ? 'lifecycle_guard' : 'database_error');
  return { reason, sqlState };
}

// `progress` is updated in place, so a failed night still reports what its passes committed.
async function runNight({
  settings,
  context,
  engine = lifecycleEngine,
  now = () => new Date(),
  sleep,
  log,
  timeLeftMs,
  progress = {},
}) {
  const summary = Object.assign(progress, {
    catchUp: false,
    ceiling: null,
    eligibleRemaining: null,
    mode: settings.mode,
    retries: 0,
    rowsChanged: 0,
    runs: 0,
    stoppedBy: null,
  });
  if (settings.mode === 'off') {
    summary.stoppedBy = 'off';
    return summary;
  }
  const deadline = now().getTime() + settings.budgetMs;
  Object.assign(summary, ceilingFor(settings, now()));
  const timeLeft = () => Math.min(deadline - now().getTime(), timeLeftMs());

  for (;;) {
    if (summary.runs >= settings.maxRuns) {
      summary.stoppedBy = 'max_runs';
      break;
    }
    if (timeLeft() < RUN_RESERVE_MS) {
      summary.stoppedBy = 'budget';
      break;
    }
    const referenceAt = now().toISOString();
    const counts = await engine.loadEligibleCounts(context, referenceAt);
    summary.eligibleRemaining = eligibleTotal(counts);
    if (summary.eligibleRemaining === 0) {
      summary.stoppedBy = 'done';
      break;
    }
    const aboveCeiling = summary.eligibleRemaining > summary.ceiling;
    if (aboveCeiling && settings.mode === 'apply') {
      log({ event: 'ceiling_exceeded', ceiling: summary.ceiling, eligibleTotal: summary.eligibleRemaining });
      throw new Error('Lifecycle eligible total is above the approved ceiling; nothing was changed.');
    }
    const batchSize = fitBatchSize(counts, settings.batchSize, settings.maxMutations);
    const plan = policy.makePlan(
      counts,
      context.clusterIdentifier,
      context.clusterArn,
      context.environment,
      referenceAt,
      batchSize,
      settings.maxMutations,
    );
    if (settings.mode === 'plan') {
      // Plan mode only reports, so a backlog above the ceiling is information, not an alarm.
      log({
        event: 'plan',
        aboveCeiling,
        ceiling: summary.ceiling,
        eligible: nonZero(plan.actions, 'eligible'),
        eligibleTotal: plan.eligibleTotal,
        plannedTotal: plan.plannedTotal,
        policyDefinitionDigest: plan.policyDefinitionDigest,
        referenceAt,
      });
      summary.stoppedBy = 'plan';
      break;
    }
    let result;
    try {
      result = await engine.applyPlan(context, plan);
    } catch (error) {
      const failure = safeFailure(error);
      if (!retryableReason(error) || summary.retries >= MAX_RETRIES) {
        log({ event: 'failed', ...failure });
        throw new Error(`Lifecycle night failed (${failure.reason}); the open pass was rolled back.`);
      }
      summary.retries += 1;
      log({ event: 'retry', ...failure });
      await sleep(settings.pauseMs);
      continue;
    }
    summary.runs += 1;
    summary.rowsChanged += result.affectedTotal;
    log({
      event: 'run',
      affected: nonZero(result.actions, 'affected'),
      affectedTotal: result.affectedTotal,
      batchSize,
      referenceAt,
      runId: result.runId,
    });
    if (result.affectedTotal === 0) {
      summary.stoppedBy = 'no_progress';
      break;
    }
    await sleep(settings.pauseMs);
  }

  // A night that ran out of passes or time recounts once, so the backlog metric is exact.
  if (['budget', 'max_runs', 'no_progress'].includes(summary.stoppedBy) && timeLeftMs() > 30_000) {
    summary.eligibleRemaining = eligibleTotal(await engine.loadEligibleCounts(context, now().toISOString()));
  }
  return summary;
}

module.exports = {
  ceilingFor,
  fitBatchSize,
  readSettings,
  runNight,
  safeFailure,
};
