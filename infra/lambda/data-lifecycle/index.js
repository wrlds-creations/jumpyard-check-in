'use strict';

// GH-598: the nightly Park lifecycle job. An EventBridge rule starts it after midnight in
// Stockholm. It uses only the dedicated lifecycle database identity, changes only Aurora, and
// never calls ROLLER, Klaviyo or any other provider. Logs and metrics carry counts only.

const { RDSDataClient } = require('@aws-sdk/client-rds-data');
const { DATABASE } = require('./policy');
const { readSettings, runNight } = require('./nightly');

let rds;

function log(entry) {
  console.log(JSON.stringify({ component: 'data-lifecycle', ...entry }));
}

function sanitizeMetricValue(value) {
  return String(value).replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 250) || 'unknown';
}

// Behind means rows are still past their clock after a night outside the approved catch-up.
function nightMetricValues(summary, completed) {
  const behind = summary.mode === 'apply'
    && !summary.catchUp
    && ['budget', 'max_runs', 'no_progress'].includes(summary.stoppedBy)
    && (summary.eligibleRemaining ?? 0) > 0;
  return {
    DataLifecycleNightCompleted: completed ? 1 : 0,
    DataLifecycleBehind: behind ? 1 : 0,
    DataLifecycleRowsChanged: summary.rowsChanged ?? 0,
    DataLifecycleEligibleRemaining: summary.eligibleRemaining ?? 0,
  };
}

function emitNightMetric(summary, completed) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'JumpYard/Cloud',
            Dimensions: [['Environment', 'Handler']],
            Metrics: [
              { Name: 'DataLifecycleNightCompleted', Unit: 'Count' },
              { Name: 'DataLifecycleBehind', Unit: 'Count' },
              { Name: 'DataLifecycleRowsChanged', Unit: 'Count' },
              { Name: 'DataLifecycleEligibleRemaining', Unit: 'Count' },
            ],
          },
        ],
      },
      Environment: sanitizeMetricValue(process.env.RESOURCE_PREFIX || 'unknown'),
      Handler: 'data-lifecycle',
      ...nightMetricValues(summary, completed),
    }),
  );
}

exports.handler = async (_event, lambdaContext) => {
  const settings = readSettings(process.env);
  rds = rds ?? new RDSDataClient({});
  const context = {
    clusterArn: settings.clusterArn,
    clusterIdentifier: settings.clusterIdentifier,
    database: DATABASE,
    environment: settings.environment,
    rds,
    secretArn: settings.secretArn,
  };
  const summary = { mode: settings.mode };
  try {
    Object.assign(summary, await runNight({
      settings,
      context,
      log,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      timeLeftMs: () => lambdaContext.getRemainingTimeInMillis(),
      progress: summary,
    }));
  } catch (error) {
    if (settings.mode !== 'off') emitNightMetric(summary, false);
    log({ event: 'night_failed', ...summary });
    throw error;
  }
  if (settings.mode !== 'off') emitNightMetric(summary, true);
  log({ event: 'night_done', ...summary });
  return summary;
};

exports.nightMetricValues = nightMetricValues;
