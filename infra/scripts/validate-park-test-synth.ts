import { App } from 'aws-cdk-lib';
import * as path from 'path';

import { loadJumpYardCloudConfig } from '../lib/config';
import { JumpYardCloudStack } from '../lib/jumpyard-cloud-stack';

const DEV_PREFIX = 'jumpyard-check-in-dev';
const PARK_TEST_PREFIX = 'jumpyard-check-in-park-test';
const PARK_TEST_KIOSK_ORIGIN = 'https://jumpyard-check-in-kiosk.pages.dev';

interface SynthResult {
  readonly stackName: string;
  readonly template: CloudFormationTemplate;
}

interface CloudFormationTemplate {
  readonly Resources?: Record<string, CloudFormationResource>;
  readonly Outputs?: Record<string, unknown>;
}

interface CloudFormationResource {
  readonly Type?: string;
  readonly Properties?: Record<string, unknown>;
}

function synthConfig(relativeConfigPath: string): SynthResult {
  const configPath = path.resolve(__dirname, '..', relativeConfigPath);
  const app = new App({
    context: {
      config: configPath,
    },
    outdir: path.join(process.cwd(), 'cdk.out', `validate-${path.basename(relativeConfigPath, '.json')}`),
  });
  const config = loadJumpYardCloudConfig(app);
  const stack = new JumpYardCloudStack(app, `${config.resourcePrefix}-stack`, {
    config,
    env: {
      account: config.awsAccount,
      region: config.awsRegion,
    },
  });
  const assembly = app.synth();
  const stackArtifact = assembly.stacks.find((artifact) => artifact.stackName === stack.stackName);

  if (!stackArtifact) {
    throw new Error(`Could not find synthesized stack artifact for ${stack.stackName}.`);
  }

  return {
    stackName: stack.stackName,
    template: stackArtifact.template as CloudFormationTemplate,
  };
}

function collectStrings(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') {
    result.push(value);
    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, result);
    return result;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, result);
    }
  }

  return result;
}

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectContains(strings: readonly string[], expected: string, context: string): void {
  expect(strings.some((value) => value.includes(expected)), `${context}: expected synthesized template to include ${expected}.`);
}

function expectNotContains(strings: readonly string[], blocked: string, context: string): void {
  expect(
    !strings.some((value) => value.includes(blocked)),
    `${context}: synthesized template must not include ${blocked}.`,
  );
}

function getResources(template: CloudFormationTemplate): Record<string, CloudFormationResource> {
  return template.Resources ?? {};
}

function findResourceByTypeAndProperty(
  template: CloudFormationTemplate,
  type: string,
  propertyName: string,
  expectedValue: string,
): CloudFormationResource | undefined {
  return Object.values(getResources(template)).find((resource) => {
    if (resource.Type !== type) return false;
    const value = resource.Properties?.[propertyName];
    return typeof value === 'string' && value === expectedValue;
  });
}

function countResourcesByType(template: CloudFormationTemplate, type: string): number {
  return Object.values(getResources(template)).filter((resource) => resource.Type === type).length;
}

function expectNamedResource(
  template: CloudFormationTemplate,
  type: string,
  propertyName: string,
  expectedValue: string,
): void {
  expect(
    Boolean(findResourceByTypeAndProperty(template, type, propertyName, expectedValue)),
    `Expected ${type} with ${propertyName}=${expectedValue}.`,
  );
}

function expectEventRuleState(template: CloudFormationTemplate, ruleName: string, expectedState: string): void {
  const rule = findResourceByTypeAndProperty(template, 'AWS::Events::Rule', 'Name', ruleName);
  expect(Boolean(rule), `Expected EventBridge rule ${ruleName}.`);
  expect(
    rule?.Properties?.State === expectedState,
    `Expected EventBridge rule ${ruleName} state ${expectedState}, got ${JSON.stringify(rule?.Properties?.State)}.`,
  );
}

function expectNoBookingTimeMessagingSchedule(template: CloudFormationTemplate): void {
  const eventRules = Object.values(getResources(template)).filter(
    (resource) => resource.Type === 'AWS::Events::Rule',
  );
  const hasBookingTimeRule = eventRules.some((resource) => {
    const ruleName = resource.Properties?.Name;
    return typeof ruleName === 'string' && ruleName.includes('booking-time-sms-schedule');
  });

  expect(!hasBookingTimeRule, 'park-test synth must keep booking-time guest messaging schedule disabled.');
}

function getLambdaEnvironment(template: CloudFormationTemplate, functionName: string): Record<string, unknown> {
  const lambdaResource = Object.values(getResources(template)).find((resource) => {
    return resource.Type === 'AWS::Lambda::Function' && resource.Properties?.FunctionName === functionName;
  });

  expect(Boolean(lambdaResource), `Expected Lambda function ${functionName}.`);
  const environment = lambdaResource?.Properties?.Environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new Error(`Expected Lambda ${functionName} to have environment variables.`);
  }

  const variables = (environment as Record<string, unknown>).Variables;
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error(`Expected Lambda ${functionName} to have environment variables.`);
  }

  return variables as Record<string, unknown>;
}

function expectLambdaEnvironment(
  template: CloudFormationTemplate,
  functionName: string,
  expectedValues: Record<string, string>,
): void {
  const variables = getLambdaEnvironment(template, functionName);

  for (const [name, expectedValue] of Object.entries(expectedValues)) {
    expect(
      variables[name] === expectedValue,
      `Expected ${functionName} environment ${name}=${expectedValue}, got ${JSON.stringify(variables[name])}.`,
    );
  }
}

function validateDevTemplate(dev: SynthResult): void {
  const strings = collectStrings(dev.template);

  expect(dev.stackName === `${DEV_PREFIX}-stack`, `Expected dev stack name ${DEV_PREFIX}-stack.`);
  expectContains(strings, DEV_PREFIX, 'dev');
  expectContains(strings, 'https://api.play.roller.app', 'dev');
  expectContains(strings, 'playground', 'dev');
  expectContains(strings, `${DEV_PREFIX}-sns-sms-delivery-status`, 'dev');
  expectNotContains(strings, PARK_TEST_PREFIX, 'dev');
  expectNamedResource(dev.template, 'AWS::SSM::Parameter', 'Name', `/${DEV_PREFIX}/roller/env`);
  expectNamedResource(dev.template, 'AWS::SSM::Parameter', 'Name', `/${DEV_PREFIX}/roller/base-url`);
  expectEventRuleState(dev.template, `${DEV_PREFIX}-data-api-daily-sync`, 'ENABLED');
  expectLambdaEnvironment(dev.template, `${DEV_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    ENABLE_T0171_ASSISTED_LOOKUP: 'false',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: '',
    T0171_ASSISTED_LOOKUP_VENUE_ID: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
  });
  expectLambdaEnvironment(dev.template, `${DEV_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
  });
  expectLambdaEnvironment(dev.template, `${DEV_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(dev.template, `${DEV_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'true',
    ENABLE_STAFF_AUTH: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(dev.template, `${DEV_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'dev',
  });

  console.log('[pass] dev synth keeps Playground resource names');
}

function validateParkTestTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test');
  expectContains(strings, 'https://api.roller.app', 'park-test');
  expectContains(strings, 'live', 'park-test');
  expectContains(strings, 'WRLDS:Environment', 'park-test');
  expectContains(strings, 'park-test', 'park-test');
  expectContains(strings, 'WRLDS:DataClassification', 'park-test');
  expectContains(strings, 'confidential', 'park-test');
  expectContains(strings, PARK_TEST_KIOSK_ORIGIN, 'park-test existing kiosk interface contract');
  expectNotContains(strings, DEV_PREFIX, 'park-test');
  expectNotContains(strings, `${PARK_TEST_PREFIX}-sns-sms-delivery-status`, 'park-test');

  const expectedNames = [
    `/${PARK_TEST_PREFIX}/roller/credentials`,
    `/${PARK_TEST_PREFIX}/roller/env`,
    `/${PARK_TEST_PREFIX}/roller/base-url`,
    `/${PARK_TEST_PREFIX}/webhooks/dev-token`,
    `/${PARK_TEST_PREFIX}/redeem/dev-token`,
    `/${PARK_TEST_PREFIX}/staff/auth`,
    `/${PARK_TEST_PREFIX}/checkin-links/dev-token`,
    `/${PARK_TEST_PREFIX}/aurora/admin`,
    `${PARK_TEST_PREFIX}-raw-376129878018-eu-north-1`,
    `${PARK_TEST_PREFIX}-aurora`,
    `${PARK_TEST_PREFIX}-aurora-writer`,
    `${PARK_TEST_PREFIX}-aurora-subnets`,
    `${PARK_TEST_PREFIX}-roller-ops`,
    `${PARK_TEST_PREFIX}-roller-ops-dlq`,
    `${PARK_TEST_PREFIX}-events`,
    `${PARK_TEST_PREFIX}-api`,
    `/aws/apigateway/${PARK_TEST_PREFIX}-api-access`,
    `${PARK_TEST_PREFIX}-data-api-daily-sync`,
    `${PARK_TEST_PREFIX}-ops`,
    `${PARK_TEST_PREFIX}-api-5xx`,
    `${PARK_TEST_PREFIX}-lookup-lambda-errors`,
  ];

  for (const expectedName of expectedNames) {
    expectContains(strings, expectedName, 'park-test');
  }

  expectNamedResource(parkTest.template, 'AWS::SSM::Parameter', 'Name', `/${PARK_TEST_PREFIX}/roller/env`);
  expectNamedResource(parkTest.template, 'AWS::SSM::Parameter', 'Name', `/${PARK_TEST_PREFIX}/roller/base-url`);
  expectNamedResource(parkTest.template, 'AWS::RDS::DBCluster', 'DBClusterIdentifier', `${PARK_TEST_PREFIX}-aurora`);
  expectNamedResource(parkTest.template, 'AWS::RDS::DBInstance', 'DBInstanceIdentifier', `${PARK_TEST_PREFIX}-aurora-writer`);
  expectNamedResource(parkTest.template, 'AWS::Events::Rule', 'Name', `${PARK_TEST_PREFIX}-data-api-daily-sync`);
  expectEventRuleState(parkTest.template, `${PARK_TEST_PREFIX}-data-api-daily-sync`, 'DISABLED');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expect(countResourcesByType(parkTest.template, 'AWS::ApiGatewayV2::Api') === 1, 'Expected one park-test HTTP API.');
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    ENABLE_T0171_ASSISTED_LOOKUP: 'false',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: '',
    T0171_ASSISTED_LOOKUP_VENUE_ID: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'true',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'true',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'true',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'false',
    JUMPYARD_EMERGENCY_STOP: 'true',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'true',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test synth uses separate names, tags, and Live config');
}

function validateParkTestPaymentSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test payment smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test payment smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test payment smoke');
  expectContains(strings, 'live', 'park-test payment smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'true',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test Live payment smoke synth opens only booking draft writes');
}

function validateParkTestPaymentSyncSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test payment sync smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test payment sync smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test payment sync smoke');
  expectContains(strings, 'live', 'park-test payment sync smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'true',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'true',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test Live payment sync smoke opens only payment writes and draft-backed lookup');
}

function validateParkTestLookupSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test lookup smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test lookup smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test lookup smoke');
  expectContains(strings, 'live', 'park-test lookup smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'true',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '166447399,68b3bbb4-9a46-4379-96ac-bc7157f2fb3e',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test Live lookup smoke synth opens only controlled lookup');
}

function validateParkTestAssistedLookupTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test assisted lookup stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test assisted lookup');
  expectContains(strings, 'https://api.roller.app', 'park-test assisted lookup');
  expectContains(strings, 'live', 'park-test assisted lookup');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    ENABLE_T0171_ASSISTED_LOOKUP: 'true',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES:
      '2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05',
    T0171_ASSISTED_LOOKUP_VENUE_ID: '50871',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test assisted lookup synth opens only Nacka/date-scoped lookup');
}

function validateParkTestAddOnSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test add-on smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test add-on smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test add-on smoke');
  expectContains(strings, 'live', 'park-test add-on smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'true',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '166490323',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'true',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '166490323',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test Live add-on smoke synth opens only controlled lookup and add-on draft writes');
}

function validateParkTestAddOnSettlementSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test add-on settlement smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test add-on settlement smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test add-on settlement smoke');
  expectContains(strings, 'live', 'park-test add-on settlement smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'true',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS:
      '166497194,4a092241-6947-436a-97ea-04813a8404aa',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test linked add-on settlement synth opens only controlled lookup reconciliation');
}

function validateParkTestRedeemSmokeTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test redeem smoke stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test redeem smoke');
  expectContains(strings, 'https://api.roller.app', 'park-test redeem smoke');
  expectContains(strings, 'live', 'park-test redeem smoke');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'true',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS:
      '166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088,166490323-560714728',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS:
      '166490323,9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088,166490323-560714728',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test Live redeem smoke synth opens only controlled lookup, staff auth, and redeem');
}

function validateParkTestFrontendRedeemRehearsalTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test frontend redeem rehearsal stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test frontend redeem rehearsal');
  expectContains(strings, 'https://api.roller.app', 'park-test frontend redeem rehearsal');
  expectContains(strings, 'live', 'park-test frontend redeem rehearsal');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'false',
    ENABLE_T0171_ASSISTED_LOOKUP: 'false',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: '',
    T0171_ASSISTED_LOOKUP_VENUE_ID: '',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'false',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'false',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'false',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'false',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS: 'jycs_mqtimdxf_bb33c94c',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test frontend redeem rehearsal synth opens staff auth only for an allowlisted session');
}

function validateParkTestFullFlowRehearsalTemplate(parkTest: SynthResult): void {
  const strings = collectStrings(parkTest.template);
  const approvedDates =
    '2026-06-29,2026-06-30,2026-07-01,2026-07-02,2026-07-03,2026-07-04,2026-07-05,2026-07-06,2026-07-07,2026-07-08,2026-07-09,2026-07-10,2026-07-11,2026-07-12,2026-07-13,2026-07-14,2026-07-15,2026-07-16,2026-07-17,2026-07-18,2026-07-19,2026-07-20,2026-07-21,2026-07-22,2026-07-23,2026-07-24,2026-07-25,2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30,2026-07-31,2026-08-01,2026-08-02,2026-08-03,2026-08-04,2026-08-05,2026-08-06,2026-08-07,2026-08-08,2026-08-09,2026-08-10,2026-08-11,2026-08-12,2026-08-13,2026-08-14,2026-08-15,2026-08-16,2026-08-17,2026-08-18,2026-08-19,2026-08-20,2026-08-21,2026-08-22,2026-08-23,2026-08-24,2026-08-25,2026-08-26,2026-08-27,2026-08-28,2026-08-29,2026-08-30,2026-08-31,2026-09-01,2026-09-02,2026-09-03,2026-09-04,2026-09-05,2026-09-06,2026-09-07,2026-09-08,2026-09-09,2026-09-10,2026-09-11,2026-09-12,2026-09-13,2026-09-14,2026-09-15,2026-09-16,2026-09-17,2026-09-18,2026-09-19,2026-09-20,2026-09-21,2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-26,2026-09-27,2026-09-28,2026-09-29,2026-09-30';

  expect(
    parkTest.stackName === `${PARK_TEST_PREFIX}-stack`,
    `Expected park-test full-flow rehearsal stack name ${PARK_TEST_PREFIX}-stack.`,
  );
  expectContains(strings, PARK_TEST_PREFIX, 'park-test full-flow rehearsal');
  expectContains(strings, 'https://api.roller.app', 'park-test full-flow rehearsal');
  expectContains(strings, 'live', 'park-test full-flow rehearsal');
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-lookup`, {
    ENABLE_T0160_LIVE_LOOKUP_SMOKE: 'false',
    ENABLE_T0165_LINKED_ADDON_SETTLEMENT: 'false',
    ENABLE_T0169_POST_PAYMENT_SYNC: 'true',
    ENABLE_T0171_ASSISTED_LOOKUP: 'true',
    T0171_ASSISTED_LOOKUP_ALLOWED_OPERATING_DATES: approvedDates,
    T0171_ASSISTED_LOOKUP_VENUE_ID: '50871',
    T0165_LINKED_ADDON_SETTLEMENT_ALLOWED_IDENTIFIERS: '',
    T0160_LIVE_LOOKUP_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-booking`, {
    ENABLE_ROLLER_BOOKING_DRAFT_WRITES: 'true',
    ENABLE_T0159_LIVE_PAYMENT_SMOKE_DRAFT_WRITES: 'true',
    ENABLE_T0162_LIVE_ADDON_SMOKE: 'true',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: approvedDates,
    T0176_FULL_FLOW_VENUE_ID: '50871',
    T0162_LIVE_ADDON_SMOKE_ALLOWED_IDENTIFIERS: '',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-redeem`, {
    ENABLE_ROLLER_REDEEM_WRITES: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    T0176_FULL_FLOW_ALLOWED_OPERATING_DATES: approvedDates,
    T0176_FULL_FLOW_VENUE_ID: '50871',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-session`, {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_STAFF_AUTH: 'true',
    ENABLE_T0166_LIVE_REDEEM_SMOKE: 'false',
    ENABLE_T0176_FRONTEND_REDEEM_REHEARSAL: 'false',
    ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0166_LIVE_REDEEM_SMOKE_ALLOWED_IDENTIFIERS: '',
    T0176_FRONTEND_REDEEM_REHEARSAL_ALLOWED_SESSION_IDS: '',
  });
  expectLambdaEnvironment(parkTest.template, `${PARK_TEST_PREFIX}-stack-webhook`, {
    ENABLE_ROLLER_WEBHOOK_PROCESSING: 'false',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
  });

  console.log('[pass] park-test full-flow rehearsal synth opens Nacka/date-scoped payment, lookup, add-on, staff auth, and redeem');
}

const dev = synthConfig('config/dev.json');
const parkTest = synthConfig('config/park-test.json');
const parkTestAddOnSmoke = synthConfig('config/park-test-live-addon-smoke.json');
const parkTestAddOnSettlementSmoke = synthConfig('config/park-test-live-addon-settlement-smoke.json');
const parkTestAssistedLookup = synthConfig('config/park-test-assisted-lookup.json');
const parkTestLookupSmoke = synthConfig('config/park-test-live-lookup-smoke.json');
const parkTestPaymentSmoke = synthConfig('config/park-test-live-payment-smoke.json');
const parkTestPaymentSyncSmoke = synthConfig('config/park-test-live-payment-sync-smoke.json');
const parkTestRedeemSmoke = synthConfig('config/park-test-live-redeem-smoke.json');
const parkTestFrontendRedeemRehearsal = synthConfig('config/park-test-frontend-redeem-rehearsal.json');
const parkTestFullFlowRehearsal = synthConfig('config/park-test-full-flow-rehearsal.json');

validateDevTemplate(dev);
validateParkTestTemplate(parkTest);
validateParkTestLookupSmokeTemplate(parkTestLookupSmoke);
validateParkTestAssistedLookupTemplate(parkTestAssistedLookup);
validateParkTestAddOnSmokeTemplate(parkTestAddOnSmoke);
validateParkTestAddOnSettlementSmokeTemplate(parkTestAddOnSettlementSmoke);
validateParkTestPaymentSmokeTemplate(parkTestPaymentSmoke);
validateParkTestPaymentSyncSmokeTemplate(parkTestPaymentSyncSmoke);
validateParkTestRedeemSmokeTemplate(parkTestRedeemSmoke);
validateParkTestFrontendRedeemRehearsalTemplate(parkTestFrontendRedeemRehearsal);
validateParkTestFullFlowRehearsalTemplate(parkTestFullFlowRehearsal);

console.log('Park-test synth validation passed.');
