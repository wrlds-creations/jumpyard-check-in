const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROUTE_LIMITS } = require('./validate-t0193-capacity');

const ROOT = path.resolve(__dirname, '..');
const INFRA = path.join(ROOT, 'infra');
const STACK_NAME = 'jumpyard-check-in-park-test-stack';
const TEMPLATE_NAME = `${STACK_NAME}.template.json`;

const EXPECTED_ROUTES = [
  ['POST /v1/check-in/lookup', 'NONE', 'lookup', 'guest_public', 'lookup'],
  ['POST /v1/staff/auth/login', 'NONE', 'session', 'staff_auth_entry', 'staff_login'],
  ['POST /v1/staff/auth/session', 'NONE', 'session', 'staff_identity_session', 'staff_login'],
  ['POST /v1/check-in/session-links', 'AWS_IAM', 'session', 'internal_ops', 'internal_session_link'],
  ['POST /v1/check-in/session-links/send-sms', 'AWS_IAM', 'session', 'internal_ops', 'internal_send_sms'],
  ['POST /v1/check-in/session-links/send-email', 'AWS_IAM', 'session', 'internal_ops', 'internal_send_email'],
  ['POST /v1/check-in/session-links/send-due-sms', 'AWS_IAM', 'session', 'internal_ops', 'internal_due_sms'],
  ['POST /v1/check-in/session-links/send-due-messages', 'AWS_IAM', 'session', 'internal_ops', 'internal_due_messages'],
  ['POST /v1/check-in/session-links/resolve', 'NONE', 'session', 'guest_token', 'resolve'],
  ['POST /v1/check-in/sessions', 'NONE', 'session', 'guest_token', 'session_start'],
  ['POST /v1/check-in/sessions/{checkinSessionId}/ready-for-staff', 'NONE', 'session', 'guest_token', 'ready'],
  ['GET /v1/staff/check-in/sessions', 'NONE', 'session', 'staff_protected', 'staff_list'],
  ['GET /v1/staff/check-in/sessions/{checkinSessionId}', 'NONE', 'session', 'staff_protected', 'staff_detail'],
  ['POST /v1/check-in/redeem', 'AWS_IAM', 'redeem', 'legacy_dev_only', 'legacy_redeem'],
  ['POST /v1/staff/check-in/sessions/{checkinSessionId}/redeem', 'NONE', 'redeem', 'staff_protected', 'staff_redeem'],
  ['POST /v1/bookings/quote', 'NONE', 'booking', 'guest_public', 'quote'],
  ['POST /v1/bookings/draft', 'NONE', 'booking', 'guest_write', 'draft'],
  ['POST /v1/bookings/availability', 'NONE', 'booking', 'guest_public', 'availability'],
  ['POST /v1/bookings/{bookingReference}/add-products/quote', 'NONE', 'booking', 'guest_token', 'addon_quote'],
  ['POST /v1/bookings/{bookingReference}/add-products', 'NONE', 'booking', 'guest_write', 'addon_draft'],
  ['POST /v1/roller/webhooks/bookings', 'NONE', 'webhook', 'roller_webhook', 'webhook_bookings'],
  ['POST /v1/roller/webhooks/redemptions', 'NONE', 'webhook', 'roller_webhook', 'webhook_redemptions'],
  ['POST /v1/admin/auth/session', 'JWT', 'session', 'staff_admin_session', 'staff_login'],
  ['GET /v1/admin/staff', 'JWT', 'session', 'staff_admin', 'staff_list'],
  ['POST /v1/admin/staff', 'JWT', 'session', 'staff_admin', 'staff_login'],
  ['PATCH /v1/admin/staff/{staffIdentityId}', 'JWT', 'session', 'staff_admin', 'staff_login'],
].map(([routeKey, authorizationType, handler, trustClass, policyKey]) => ({
  authorizationType,
  burst: ROUTE_LIMITS[policyKey].burst,
  handler,
  rate: ROUTE_LIMITS[policyKey].rate,
  routeKey,
  trustClass,
}));

function synthParkTestTemplate() {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-t0193-synth-'));
  const cdkCli = path.join(INFRA, 'node_modules', 'aws-cdk', 'bin', 'cdk');

  try {
    const result = spawnSync(
      process.execPath,
      [
        cdkCli,
        'synth',
        '-c',
        'config=./config/park-test-full-flow-rehearsal.json',
        '--quiet',
        '--output',
        outputDirectory,
      ],
      {
        cwd: INFRA,
        encoding: 'utf8',
        env: { ...process.env, CDK_DISABLE_VERSION_CHECK: '1' },
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `T0193 CDK synth failed.\n${result.stdout || ''}${result.stderr || ''}`,
      );
    }

    const templatePath = path.join(outputDirectory, TEMPLATE_NAME);
    assert.ok(fs.existsSync(templatePath), `Expected synthesized template ${TEMPLATE_NAME}.`);
    return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } finally {
    fs.rmSync(outputDirectory, { force: true, recursive: true });
  }
}

function resourcesOfType(template, resourceType) {
  return Object.entries(template.Resources).filter(([, resource]) => resource.Type === resourceType);
}

function validateRouteCatalog(template) {
  const routeEntries = resourcesOfType(template, 'AWS::ApiGatewayV2::Route');
  assert.equal(routeEntries.length, EXPECTED_ROUTES.length, 'The HTTP API must synthesize exactly 26 routes.');

  const routesByKey = new Map(
    routeEntries.map(([logicalId, resource]) => [resource.Properties.RouteKey, { logicalId, resource }]),
  );
  assert.equal(routesByKey.size, EXPECTED_ROUTES.length, 'Every synthesized route key must be unique.');

  for (const expected of EXPECTED_ROUTES) {
    const actual = routesByKey.get(expected.routeKey);
    assert.ok(actual, `Missing protected route ${expected.routeKey}.`);
    assert.equal(
      actual.resource.Properties.AuthorizationType,
      expected.authorizationType,
      `${expected.routeKey} must declare its API Gateway authorization type explicitly.`,
    );
    assert.equal(actual.resource.Metadata?.JumpYardHandler, expected.handler);
    assert.equal(actual.resource.Metadata?.JumpYardTrustClass, expected.trustClass);
  }

  assert.deepEqual(
    EXPECTED_ROUTES.filter((route) => route.authorizationType === 'AWS_IAM').map((route) => route.routeKey).sort(),
    [
      'POST /v1/check-in/redeem',
      'POST /v1/check-in/session-links',
      'POST /v1/check-in/session-links/send-due-messages',
      'POST /v1/check-in/session-links/send-due-sms',
      'POST /v1/check-in/session-links/send-email',
      'POST /v1/check-in/session-links/send-sms',
    ].sort(),
    'Only five internal session-link routes and the legacy direct redeem route may use AWS_IAM.',
  );

  const authorizers = resourcesOfType(template, 'AWS::ApiGatewayV2::Authorizer');
  assert.equal(authorizers.length, 1, 'T0194 must add exactly one admin JWT authorizer.');
  const [authorizerLogicalId, authorizer] = authorizers[0];
  assert.equal(authorizer.Properties.AuthorizerType, 'JWT');
  assert.deepEqual(authorizer.Properties.IdentitySource, ['$request.header.Authorization']);

  for (const expected of EXPECTED_ROUTES.filter((route) => route.authorizationType === 'JWT')) {
    const actual = routesByKey.get(expected.routeKey);
    assert.deepEqual(
      actual.resource.Properties.AuthorizerId,
      { Ref: authorizerLogicalId },
      `${expected.routeKey} must use the shared admin JWT authorizer.`,
    );
  }

  return routesByKey;
}

function validateRouteSettings(template, routesByKey) {
  const stageEntries = resourcesOfType(template, 'AWS::ApiGatewayV2::Stage');
  assert.equal(stageEntries.length, 1, 'The stack must keep one HTTP API stage.');
  const [, stage] = stageEntries[0];

  assert.equal(stage.Properties.StageName, '$default');
  assert.equal(stage.Properties.DefaultRouteSettings.ThrottlingRateLimit, ROUTE_LIMITS.OPTIONS.rate);
  assert.equal(stage.Properties.DefaultRouteSettings.ThrottlingBurstLimit, ROUTE_LIMITS.OPTIONS.burst);
  assert.equal(stage.Properties.DefaultRouteSettings.DetailedMetricsEnabled, true);

  const routeSettings = stage.Properties.RouteSettings;
  assert.equal(Object.keys(routeSettings).length, EXPECTED_ROUTES.length);

  for (const expected of EXPECTED_ROUTES) {
    const settings = routeSettings[expected.routeKey];
    assert.ok(settings, `Missing route throttle settings for ${expected.routeKey}.`);
    assert.equal(settings.ThrottlingRateLimit, expected.rate);
    assert.equal(settings.ThrottlingBurstLimit, expected.burst);
    assert.equal(settings.DetailedMetricsEnabled, true);
  }

  const dependencies = new Set(Array.isArray(stage.DependsOn) ? stage.DependsOn : [stage.DependsOn].filter(Boolean));
  for (const { logicalId } of routesByKey.values()) {
    assert.ok(dependencies.has(logicalId), `The default stage must wait for route ${logicalId}.`);
  }
}

function validateApprovedProtectionResources(template) {
  assert.equal(
    Object.keys(template.Resources).length,
    196,
    'The T0193 boundary must remain intact inside the T0197 stack plus the exact T0200 email-readiness delta.',
  );
  assert.equal(resourcesOfType(template, 'AWS::SES::ConfigurationSet').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::SES::ConfigurationSetEventDestination').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::SES::EmailIdentity').length, 1);
  assert.equal(
    resourcesOfType(template, 'AWS::CloudWatch::Alarm').filter(([, alarm]) =>
      String(alarm.Properties.AlarmName || '').startsWith('jumpyard-check-in-park-test-email-'),
    ).length,
    6,
    'T0200 must add exactly six bounded email event and reputation alarms.',
  );
  assert.equal(
    resourcesOfType(template, 'AWS::CloudWatch::Alarm').filter(
      ([, alarm]) => alarm.Properties.AlarmName === 'jumpyard-check-in-park-test-booking-index-stale',
    ).length,
    1,
    'T0196 must add exactly one booking-index freshness alarm.',
  );
  assert.equal(resourcesOfType(template, 'AWS::Cognito::UserPool').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::Cognito::UserPoolClient').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::Cognito::UserPoolDomain').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::Cognito::ManagedLoginBranding').length, 1);
  assert.equal(resourcesOfType(template, 'AWS::ApiGatewayV2::Authorizer').length, 1);
  for (const name of [
    '/jumpyard-check-in-park-test/aurora/runtime/booking',
    '/jumpyard-check-in-park-test/aurora/runtime/data-sync',
    '/jumpyard-check-in-park-test/aurora/runtime/lookup',
    '/jumpyard-check-in-park-test/aurora/runtime/redeem',
    '/jumpyard-check-in-park-test/aurora/runtime/session',
    '/jumpyard-check-in-park-test/aurora/runtime/webhook',
    '/jumpyard-check-in-park-test/aurora/lifecycle',
  ]) {
    assert.equal(
      resourcesOfType(template, 'AWS::SecretsManager::Secret').filter(([, secret]) => secret.Properties.Name === name).length,
      1,
      `T0195 must synthesize exactly one restricted secret ${name}.`,
    );
  }
  for (const functionName of [
    'jumpyard-check-in-park-test-database-runtime-role-provisioner',
    'jumpyard-check-in-park-test-database-runtime-role-provider',
  ]) {
    assert.equal(
      resourcesOfType(template, 'AWS::Lambda::Function').filter(([, fn]) => fn.Properties.FunctionName === functionName).length,
      1,
      `T0195 must synthesize exactly one ${functionName}.`,
    );
  }
  assert.equal(resourcesOfType(template, 'AWS::CloudFormation::CustomResource').length, 1);
  for (const forbiddenType of [
    'AWS::ApiGatewayV2::DomainName',
    'AWS::CloudFront::Distribution',
    'AWS::Cognito::IdentityPool',
    'AWS::WAFv2::WebACL',
  ]) {
    assert.equal(resourcesOfType(template, forbiddenType).length, 0, `${forbiddenType} requires separate approval.`);
  }
}

function main() {
  const template = synthParkTestTemplate();
  const routesByKey = validateRouteCatalog(template);
  validateRouteSettings(template, routesByKey);
  validateApprovedProtectionResources(template);

  console.log('[pass] T0193/T0194 synthesize one explicit protection record for all 26 API routes');
  console.log('[pass] T0193 uses AWS_IAM only for five internal session-link routes and legacy direct redeem');
  console.log('[pass] T0194 overlays one JWT authorizer on exactly four park-test admin routes');
  console.log('[pass] T0193 applies shared-IP-safe aggregate route limits and preserves a 50/150 default envelope');
  console.log('[pass] T0194/T0195 resources and the T0196 freshness alarm are isolated from API protection');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
