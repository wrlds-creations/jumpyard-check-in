#!/usr/bin/env node
'use strict';

// GH-335: Park alarms that signal a real operational problem must notify the verified
// recipient alias through one SNS topic, while alarms that also fire during normal
// operation stay dashboard-only so the notification channel remains trustworthy.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const INFRA = path.join(ROOT, 'infra');
const PARK_TEST_PREFIX = 'jumpyard-check-in-park-test';
const DEV_PREFIX = 'jumpyard-check-in-dev';
const RECIPIENT = 'aws-alarm@wrlds.com';
const TOPIC_NAME = `${PARK_TEST_PREFIX}-alarms`;

const ROUTED_ALARMS = [
  'api-5xx',
  'api-high-4xx',
  'api-throttled-requests',
  'booking-index-stale',
  'booking-lambda-errors',
  'booking-lambda-throttles',
  'data-sync-lambda-errors',
  'email-account-bounce-rate',
  'email-account-complaint-rate',
  'email-bounce',
  'email-complaint',
  'email-reject',
  'email-renderingfailure',
  'lookup-lambda-errors',
  'lookup-lambda-throttles',
  'redeem-lambda-errors',
  'redeem-lambda-throttles',
  'roller-api-errors-sustained',
  'roller-ops-dlq-visible',
  'session-lambda-errors',
  'session-lambda-throttles',
  'webhook-dlq-visible',
  'webhook-lambda-errors',
  'webhook-lambda-throttles',
  'webhook-processing-failures',
  'webhook-processor-lambda-errors',
  'webhook-queue-stale',
  'webhook-retry-exhausted',
];

// Expected during normal operation: reserved concurrency of one serializes these workers,
// and single rejected Roller requests (unknown booking code, expected conflicts) are routine.
const DASHBOARD_ONLY_ALARMS = [
  'data-sync-lambda-throttles',
  'roller-api-errors',
  'webhook-processor-lambda-throttles',
];

function synthTemplate(configFile, stackPrefix) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-gh335-synth-'));
  const cdkCli = path.join(INFRA, 'node_modules', 'aws-cdk', 'bin', 'cdk');

  try {
    const result = spawnSync(
      process.execPath,
      [cdkCli, 'synth', '-c', `config=./config/${configFile}`, '--quiet', '--output', outputDirectory],
      {
        cwd: INFRA,
        encoding: 'utf8',
        env: { ...process.env, CDK_DISABLE_VERSION_CHECK: '1' },
      },
    );

    if (result.status !== 0) {
      throw new Error(`GH-335 CDK synth failed for ${configFile}.\n${result.stdout || ''}${result.stderr || ''}`);
    }

    const templatePath = path.join(outputDirectory, `${stackPrefix}-stack.template.json`);
    assert.ok(fs.existsSync(templatePath), `Expected synthesized template for ${configFile}.`);
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}

function resourcesOfType(template, resourceType) {
  return Object.entries(template.Resources).filter(([, resource]) => resource.Type === resourceType);
}

function alarmsByShortName(template, prefix) {
  const alarms = new Map();
  for (const [logicalId, alarm] of resourcesOfType(template, 'AWS::CloudWatch::Alarm')) {
    const name = String(alarm.Properties.AlarmName || '');
    assert.ok(name.startsWith(`${prefix}-`), `Alarm ${logicalId} must use the ${prefix} prefix.`);
    alarms.set(name.slice(prefix.length + 1), alarm.Properties);
  }
  return alarms;
}

function validateParkTest(template, configFile, { bookingIndexAlarm }) {
  // The booking-index freshness alarm only exists while the nightly seed schedule is enabled.
  const routedAlarms = bookingIndexAlarm ? ROUTED_ALARMS : ROUTED_ALARMS.filter((name) => name !== 'booking-index-stale');
  const topics = resourcesOfType(template, 'AWS::SNS::Topic');
  assert.equal(topics.length, 1, `${configFile}: exactly one alarm notification topic is expected.`);
  const [topicLogicalId, topic] = topics[0];
  assert.equal(topic.Properties.TopicName, TOPIC_NAME, `${configFile}: the topic must be named ${TOPIC_NAME}.`);
  assert.equal(topic.Properties.KmsMasterKeyId, undefined, `${configFile}: alarm names carry no secrets; no CMK is expected.`);
  assert.equal(resourcesOfType(template, 'AWS::SNS::TopicPolicy').length, 0, `${configFile}: the default same-account topic policy must remain.`);

  const subscriptions = resourcesOfType(template, 'AWS::SNS::Subscription');
  assert.equal(subscriptions.length, 1, `${configFile}: exactly one confirmed-by-recipient email subscription is expected.`);
  const [, subscription] = subscriptions[0];
  assert.equal(subscription.Properties.Protocol, 'email', `${configFile}: the subscription must use email.`);
  assert.equal(subscription.Properties.Endpoint, RECIPIENT, `${configFile}: the subscription must target ${RECIPIENT}.`);
  assert.deepEqual(subscription.Properties.TopicArn, { Ref: topicLogicalId }, `${configFile}: the subscription must attach to the alarm topic.`);

  const alarms = alarmsByShortName(template, PARK_TEST_PREFIX);
  assert.equal(alarms.size, routedAlarms.length + DASHBOARD_ONLY_ALARMS.length, `${configFile}: unexpected alarm count ${alarms.size}.`);
  assert.deepEqual(
    [...alarms.keys()].sort(),
    [...routedAlarms, ...DASHBOARD_ONLY_ALARMS].sort(),
    `${configFile}: the alarm inventory changed; update the GH-335 routing decision explicitly.`,
  );

  const topicReference = JSON.stringify({ Ref: topicLogicalId });
  for (const name of routedAlarms) {
    const properties = alarms.get(name);
    assert.deepEqual(
      (properties.AlarmActions || []).map((action) => JSON.stringify(action)),
      [topicReference],
      `${configFile}: ${name} must notify the alarm topic when it enters ALARM.`,
    );
    assert.deepEqual(
      (properties.OKActions || []).map((action) => JSON.stringify(action)),
      [topicReference],
      `${configFile}: ${name} must notify the alarm topic when it returns to OK.`,
    );
    assert.equal(properties.InsufficientDataActions, undefined, `${configFile}: ${name} must not notify on missing data.`);
    assert.notEqual(properties.ActionsEnabled, false, `${configFile}: ${name} must keep actions enabled.`);
  }

  for (const name of DASHBOARD_ONLY_ALARMS) {
    const properties = alarms.get(name);
    assert.equal(properties.AlarmActions, undefined, `${configFile}: ${name} fires during normal operation and must stay dashboard-only.`);
    assert.equal(properties.OKActions, undefined, `${configFile}: ${name} must stay dashboard-only.`);
  }

  const sustained = alarms.get('roller-api-errors-sustained');
  assert.equal(sustained.MetricName, 'RollerApiErrorCount');
  assert.equal(sustained.Namespace, 'JumpYard/Cloud');
  assert.equal(sustained.Statistic, 'Sum');
  assert.equal(sustained.Period, 300);
  assert.equal(sustained.EvaluationPeriods, 3, 'The sustained Roller alarm must evaluate three consecutive periods.');
  assert.equal(sustained.DatapointsToAlarm, 3, 'The sustained Roller alarm must require all three periods to fail.');
  assert.equal(sustained.Threshold, 1);
  assert.equal(sustained.ComparisonOperator, 'GreaterThanOrEqualToThreshold');
  assert.equal(sustained.TreatMissingData, 'notBreaching', 'Quiet periods must not count as Roller failures.');
  assert.deepEqual(
    sustained.Dimensions,
    [{ Name: 'Environment', Value: PARK_TEST_PREFIX }],
    'The sustained Roller alarm must watch the park-test environment metric.',
  );

  const raw = alarms.get('roller-api-errors');
  assert.equal(raw.EvaluationPeriods, 1, 'The existing single-period Roller alarm must remain for the dashboard.');

  const outputs = template.Outputs || {};
  assert.ok(outputs.AlarmNotificationsTopicArn, `${configFile}: the topic ARN output is expected for readback.`);

  console.log(`[pass] ${configFile}: ${routedAlarms.length} routed alarms, ${DASHBOARD_ONLY_ALARMS.length} dashboard-only, one email subscription to ${RECIPIENT}`);
}

function validateDev(template) {
  assert.equal(resourcesOfType(template, 'AWS::SNS::Topic').length, 0, 'Hibernated dev must not create an alarm topic.');
  assert.equal(resourcesOfType(template, 'AWS::SNS::Subscription').length, 0, 'Hibernated dev must not subscribe recipients.');
  for (const [logicalId, alarm] of resourcesOfType(template, 'AWS::CloudWatch::Alarm')) {
    assert.equal(alarm.Properties.AlarmActions, undefined, `Dev alarm ${logicalId} must stay unrouted.`);
    assert.equal(alarm.Properties.OKActions, undefined, `Dev alarm ${logicalId} must stay unrouted.`);
  }
  const alarms = alarmsByShortName(template, DEV_PREFIX);
  assert.ok(alarms.has('roller-api-errors-sustained'), 'The sustained Roller alarm is part of the shared observability set.');
  console.log('[pass] dev.json: no notification topic, no routed alarms');
}

function validateConfigContract() {
  const configPath = path.join(INFRA, 'lib', 'config.ts');
  const source = fs.readFileSync(configPath, 'utf8');
  assert.ok(
    source.includes(`PARK_TEST_ALARM_NOTIFICATION_EMAIL = '${RECIPIENT}'`),
    'config.ts must pin the verified park-test alarm recipient alias.',
  );
  assert.ok(
    source.includes('dev alarmNotifications.emailAddresses must remain empty'),
    'config.ts must keep hibernated dev free of alarm recipients.',
  );

  for (const file of ['park-test.json', 'park-test-full-flow-rehearsal.json']) {
    const config = JSON.parse(fs.readFileSync(path.join(INFRA, 'config', file), 'utf8'));
    assert.deepEqual(
      config.alarmNotifications,
      { emailAddresses: [RECIPIENT], okNotifications: true },
      `${file} must route park alarms to ${RECIPIENT} with OK notifications.`,
    );
  }
  console.log('[pass] config contract pins the recipient alias for the release and containment profiles');
}

validateConfigContract();
validateParkTest(synthTemplate('park-test-full-flow-rehearsal.json', PARK_TEST_PREFIX), 'park-test-full-flow-rehearsal.json', {
  bookingIndexAlarm: true,
});
validateParkTest(synthTemplate('park-test.json', PARK_TEST_PREFIX), 'park-test.json', { bookingIndexAlarm: false });
validateDev(synthTemplate('dev.json', DEV_PREFIX));
console.log('GH-335 alarm routing validation passed.');
