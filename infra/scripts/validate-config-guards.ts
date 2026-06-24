import { App } from 'aws-cdk-lib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadJumpYardCloudConfig } from '../lib/config';

interface TestConfig {
  readonly api: {
    readonly allowedCorsOrigins: string[];
    readonly throttlingBurstLimit: number;
    readonly throttlingRateLimit: number;
  };
  awsAccount: string;
  awsRegion: string;
  readonly bookingTimeSms: {
    checkinBaseUrl: string;
    confirmedSendApproval: string;
    confirmSend: boolean;
    leadMinutes: number;
    limit: number;
    rateMinutes: number;
    scheduleEnabled: boolean;
    windowMinutes: number;
  };
  readonly guestEmail: {
    checkinBaseUrl: string;
    fromAddress: string;
    provider: string;
    replyToAddresses: string[];
  };
  resourcePrefix?: string;
  readonly roller: {
    baseUrl: string;
    environment: string;
  };
  readonly safetyGates: {
    emergencyStop: boolean;
    guestMessagingSendsEnabled: boolean;
    liveLookupSmokeAllowedIdentifiers?: string[];
    liveLookupSmokeApproval?: string;
    livePaymentSmokeApproval?: string;
    rollerBookingDraftWritesEnabled: boolean;
    rollerRedeemWritesEnabled: boolean;
    rollerWebhookProcessingEnabled: boolean;
    staffAuthEnabled: boolean;
  };
  readonly tags: Record<string, string>;
}

function readConfig(relativePath: string): TestConfig {
  const configPath = path.resolve(__dirname, '..', relativePath);
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TestConfig;
}

function cloneConfig(config: TestConfig): TestConfig {
  return JSON.parse(JSON.stringify(config)) as TestConfig;
}

function loadConfig(config: TestConfig): ReturnType<typeof loadJumpYardCloudConfig> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-config-guard-'));
  const configPath = path.join(tempDir, 'config.json');

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return loadJumpYardCloudConfig(new App({ context: { config: configPath } }));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

function expectPass(name: string, config: TestConfig, expectedEnvironment: string): void {
  const loaded = loadConfig(config);
  if (loaded.tags['WRLDS:Environment'] !== expectedEnvironment) {
    throw new Error(`${name}: expected WRLDS:Environment ${expectedEnvironment}.`);
  }

  console.log(`[pass] ${name}`);
}

function expectFail(name: string, config: TestConfig, expectedMessage: RegExp): void {
  try {
    loadConfig(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!expectedMessage.test(message)) {
      throw new Error(`${name}: expected ${expectedMessage}, got "${message}".`);
    }

    console.log(`[pass] ${name}`);
    return;
  }

  throw new Error(`${name}: expected config validation to fail.`);
}

const devConfig = readConfig('config/dev.json');
const unsafeDevLiveConfig = cloneConfig(devConfig);
unsafeDevLiveConfig.roller.environment = 'live';
unsafeDevLiveConfig.roller.baseUrl = 'https://api.roller.app';

const parkTestConfig = readConfig('config/park-test.json');
const parkTestMissingPrefix = cloneConfig(parkTestConfig);
delete parkTestMissingPrefix.resourcePrefix;

const parkTestPlaygroundConfig = cloneConfig(parkTestConfig);
parkTestPlaygroundConfig.roller.environment = 'playground';
parkTestPlaygroundConfig.roller.baseUrl = 'https://api.play.roller.app';

const parkTestWrongClassification = cloneConfig(parkTestConfig);
parkTestWrongClassification.tags['WRLDS:DataClassification'] = 'internal';

const parkTestConfirmedSend = cloneConfig(parkTestConfig);
parkTestConfirmedSend.bookingTimeSms.confirmSend = true;
parkTestConfirmedSend.bookingTimeSms.confirmedSendApproval = 'I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS';

const parkTestEmergencyStopOff = cloneConfig(parkTestConfig);
parkTestEmergencyStopOff.safetyGates.emergencyStop = false;
delete parkTestEmergencyStopOff.safetyGates.livePaymentSmokeApproval;

const parkTestDraftWritesOn = cloneConfig(parkTestConfig);
parkTestDraftWritesOn.safetyGates.emergencyStop = true;
parkTestDraftWritesOn.safetyGates.rollerBookingDraftWritesEnabled = true;
delete parkTestDraftWritesOn.safetyGates.livePaymentSmokeApproval;

const parkTestApprovedPaymentSmoke = cloneConfig(parkTestConfig);
parkTestApprovedPaymentSmoke.safetyGates.emergencyStop = true;
parkTestApprovedPaymentSmoke.safetyGates.rollerBookingDraftWritesEnabled = true;
parkTestApprovedPaymentSmoke.safetyGates.livePaymentSmokeApproval = 'T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED';

const parkTestApprovedPaymentSmokeEmergencyOff = cloneConfig(parkTestApprovedPaymentSmoke);
parkTestApprovedPaymentSmokeEmergencyOff.safetyGates.emergencyStop = false;

const parkTestApprovalWithoutDraftWrites = cloneConfig(parkTestApprovedPaymentSmoke);
parkTestApprovalWithoutDraftWrites.safetyGates.rollerBookingDraftWritesEnabled = false;

const parkTestPaymentSmokeWithWebhook = cloneConfig(parkTestApprovedPaymentSmoke);
parkTestPaymentSmokeWithWebhook.safetyGates.rollerWebhookProcessingEnabled = true;

const parkTestApprovedLookupSmoke = cloneConfig(parkTestConfig);
parkTestApprovedLookupSmoke.safetyGates.emergencyStop = true;
parkTestApprovedLookupSmoke.safetyGates.liveLookupSmokeApproval = 'T0160_LIVE_LOOKUP_SMOKE_APPROVED';
parkTestApprovedLookupSmoke.safetyGates.liveLookupSmokeAllowedIdentifiers = [
  '166447399',
  '68b3bbb4-9a46-4379-96ac-bc7157f2fb3e',
];

const parkTestLookupSmokeWithoutAllowedIdentifiers = cloneConfig(parkTestApprovedLookupSmoke);
parkTestLookupSmokeWithoutAllowedIdentifiers.safetyGates.liveLookupSmokeAllowedIdentifiers = [];

const parkTestAllowedIdentifiersWithoutLookupApproval = cloneConfig(parkTestApprovedLookupSmoke);
delete parkTestAllowedIdentifiersWithoutLookupApproval.safetyGates.liveLookupSmokeApproval;

const parkTestLookupSmokeWithRedeem = cloneConfig(parkTestApprovedLookupSmoke);
parkTestLookupSmokeWithRedeem.safetyGates.rollerRedeemWritesEnabled = true;

expectPass('dev Playground config passes', devConfig, 'dev');
expectFail('unsafe dev-to-Live config fails', unsafeDevLiveConfig, /dev config must use Roller Playground/);
expectPass('reviewed park-test Live config passes', parkTestConfig, 'park-test');
expectFail('park-test missing resourcePrefix fails closed', parkTestMissingPrefix, /resourcePrefix/);
expectFail('park-test Playground config fails closed', parkTestPlaygroundConfig, /park-test config must explicitly use Roller Live/);
expectFail('park-test wrong data classification fails closed', parkTestWrongClassification, /DataClassification/);
expectFail('park-test confirmed scheduled send fails closed', parkTestConfirmedSend, /confirmSend must stay false/);
expectFail('park-test emergency stop off fails closed', parkTestEmergencyStopOff, /emergencyStop must stay true/);
expectFail('park-test draft writes enabled fails closed', parkTestDraftWritesOn, /rollerBookingDraftWritesEnabled/);
expectPass('approved park-test Live payment smoke config passes', parkTestApprovedPaymentSmoke, 'park-test');
expectFail(
  'park-test payment smoke keeps global emergency stop on',
  parkTestApprovedPaymentSmokeEmergencyOff,
  /emergencyStop must stay true/,
);
expectFail(
  'park-test payment smoke approval without draft writes fails closed',
  parkTestApprovalWithoutDraftWrites,
  /requires safetyGates\.rollerBookingDraftWritesEnabled=true/,
);
expectFail(
  'park-test payment smoke still blocks webhook processing',
  parkTestPaymentSmokeWithWebhook,
  /rollerWebhookProcessingEnabled/,
);
expectPass('approved park-test Live lookup smoke config passes', parkTestApprovedLookupSmoke, 'park-test');
expectFail(
  'park-test lookup smoke approval without allowed identifiers fails closed',
  parkTestLookupSmokeWithoutAllowedIdentifiers,
  /liveLookupSmokeAllowedIdentifiers/,
);
expectFail(
  'park-test lookup smoke allowlist without approval fails closed',
  parkTestAllowedIdentifiersWithoutLookupApproval,
  /liveLookupSmokeAllowedIdentifiers must stay empty/,
);
expectFail(
  'park-test lookup smoke still blocks redeem writes',
  parkTestLookupSmokeWithRedeem,
  /rollerRedeemWritesEnabled/,
);

console.log('Config guard validation passed.');
