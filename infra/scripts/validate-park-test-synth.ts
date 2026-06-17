import { App } from 'aws-cdk-lib';
import * as path from 'path';

import { loadJumpYardCloudConfig } from '../lib/config';
import { JumpYardCloudStack } from '../lib/jumpyard-cloud-stack';

const DEV_PREFIX = 'jumpyard-check-in-dev';
const PARK_TEST_PREFIX = 'jumpyard-check-in-park-test';

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

function validateDevTemplate(dev: SynthResult): void {
  const strings = collectStrings(dev.template);

  expect(dev.stackName === `${DEV_PREFIX}-stack`, `Expected dev stack name ${DEV_PREFIX}-stack.`);
  expectContains(strings, DEV_PREFIX, 'dev');
  expectContains(strings, 'https://api.play.roller.app', 'dev');
  expectContains(strings, 'playground', 'dev');
  expectNotContains(strings, PARK_TEST_PREFIX, 'dev');
  expectNamedResource(dev.template, 'AWS::SSM::Parameter', 'Name', `/${DEV_PREFIX}/roller/env`);
  expectNamedResource(dev.template, 'AWS::SSM::Parameter', 'Name', `/${DEV_PREFIX}/roller/base-url`);

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
  expectNotContains(strings, DEV_PREFIX, 'park-test');

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
  expectNoBookingTimeMessagingSchedule(parkTest.template);
  expect(countResourcesByType(parkTest.template, 'AWS::ApiGatewayV2::Api') === 1, 'Expected one park-test HTTP API.');

  console.log('[pass] park-test synth uses separate names, tags, and Live config');
}

const dev = synthConfig('config/dev.json');
const parkTest = synthConfig('config/park-test.json');

validateDevTemplate(dev);
validateParkTestTemplate(parkTest);

console.log('Park-test synth validation passed.');
