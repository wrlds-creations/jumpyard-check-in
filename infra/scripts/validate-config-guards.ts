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
    liveAddOnSmokeAllowedIdentifiers?: string[];
    liveAddOnSmokeApproval?: string;
    liveLinkedAddOnSettlementAllowedIdentifiers?: string[];
    liveLinkedAddOnSettlementApproval?: string;
    liveLookupSmokeAllowedIdentifiers?: string[];
    liveLookupSmokeApproval?: string;
    livePaymentSmokeApproval?: string;
    liveRedeemSmokeAllowedIdentifiers?: string[];
    liveRedeemSmokeApproval?: string;
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

const parkTestApprovedAddOnSmoke = cloneConfig(parkTestConfig);
parkTestApprovedAddOnSmoke.safetyGates.emergencyStop = true;
parkTestApprovedAddOnSmoke.safetyGates.rollerBookingDraftWritesEnabled = true;
parkTestApprovedAddOnSmoke.safetyGates.liveAddOnSmokeApproval = 'T0162_EXISTING_BOOKING_ADDON_SMOKE_APPROVED';
parkTestApprovedAddOnSmoke.safetyGates.liveAddOnSmokeAllowedIdentifiers = ['166490323'];

const parkTestAddOnSmokeWithoutAllowedIdentifiers = cloneConfig(parkTestApprovedAddOnSmoke);
parkTestAddOnSmokeWithoutAllowedIdentifiers.safetyGates.liveAddOnSmokeAllowedIdentifiers = [];

const parkTestAllowedAddOnIdentifiersWithoutApproval = cloneConfig(parkTestApprovedAddOnSmoke);
delete parkTestAllowedAddOnIdentifiersWithoutApproval.safetyGates.liveAddOnSmokeApproval;
parkTestAllowedAddOnIdentifiersWithoutApproval.safetyGates.rollerBookingDraftWritesEnabled = false;

const parkTestAddOnSmokeWithoutDraftWrites = cloneConfig(parkTestApprovedAddOnSmoke);
parkTestAddOnSmokeWithoutDraftWrites.safetyGates.rollerBookingDraftWritesEnabled = false;

const parkTestAddOnSmokeWithWebhook = cloneConfig(parkTestApprovedAddOnSmoke);
parkTestAddOnSmokeWithWebhook.safetyGates.rollerWebhookProcessingEnabled = true;

const parkTestApprovedLinkedAddOnSettlement = cloneConfig(parkTestConfig);
parkTestApprovedLinkedAddOnSettlement.safetyGates.emergencyStop = true;
parkTestApprovedLinkedAddOnSettlement.safetyGates.liveLinkedAddOnSettlementApproval =
  'T0165_LINKED_ADDON_SETTLEMENT_RECONCILIATION_APPROVED';
parkTestApprovedLinkedAddOnSettlement.safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers = [
  '166497194',
  '4a092241-6947-436a-97ea-04813a8404aa',
];

const parkTestLinkedAddOnSettlementWithoutAllowedIdentifiers = cloneConfig(parkTestApprovedLinkedAddOnSettlement);
parkTestLinkedAddOnSettlementWithoutAllowedIdentifiers.safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers = [];

const parkTestAllowedSettlementIdentifiersWithoutApproval = cloneConfig(parkTestApprovedLinkedAddOnSettlement);
delete parkTestAllowedSettlementIdentifiersWithoutApproval.safetyGates.liveLinkedAddOnSettlementApproval;

const parkTestLinkedAddOnSettlementWithDraftWrites = cloneConfig(parkTestApprovedLinkedAddOnSettlement);
parkTestLinkedAddOnSettlementWithDraftWrites.safetyGates.rollerBookingDraftWritesEnabled = true;

const parkTestLinkedAddOnSettlementWithRedeem = cloneConfig(parkTestApprovedLinkedAddOnSettlement);
parkTestLinkedAddOnSettlementWithRedeem.safetyGates.rollerRedeemWritesEnabled = true;

const parkTestApprovedRedeemSmoke = cloneConfig(parkTestConfig);
parkTestApprovedRedeemSmoke.safetyGates.emergencyStop = true;
parkTestApprovedRedeemSmoke.safetyGates.liveRedeemSmokeApproval = 'T0166_CONTROLLED_LIVE_REDEEM_SMOKE_APPROVED';
parkTestApprovedRedeemSmoke.safetyGates.liveRedeemSmokeAllowedIdentifiers = [
  '166490323',
  '9ae484b0-d9a9-4dad-b3d5-4ad3b0e25088',
  '166490323-560714728',
];
parkTestApprovedRedeemSmoke.safetyGates.rollerRedeemWritesEnabled = true;
parkTestApprovedRedeemSmoke.safetyGates.staffAuthEnabled = true;

const parkTestRedeemSmokeWithoutAllowedIdentifiers = cloneConfig(parkTestApprovedRedeemSmoke);
parkTestRedeemSmokeWithoutAllowedIdentifiers.safetyGates.liveRedeemSmokeAllowedIdentifiers = [];

const parkTestAllowedRedeemIdentifiersWithoutApproval = cloneConfig(parkTestApprovedRedeemSmoke);
delete parkTestAllowedRedeemIdentifiersWithoutApproval.safetyGates.liveRedeemSmokeApproval;
parkTestAllowedRedeemIdentifiersWithoutApproval.safetyGates.rollerRedeemWritesEnabled = false;
parkTestAllowedRedeemIdentifiersWithoutApproval.safetyGates.staffAuthEnabled = false;

const parkTestRedeemSmokeWithoutRedeemWrites = cloneConfig(parkTestApprovedRedeemSmoke);
parkTestRedeemSmokeWithoutRedeemWrites.safetyGates.rollerRedeemWritesEnabled = false;

const parkTestRedeemSmokeWithoutStaffAuth = cloneConfig(parkTestApprovedRedeemSmoke);
parkTestRedeemSmokeWithoutStaffAuth.safetyGates.staffAuthEnabled = false;

const parkTestRedeemSmokeWithDraftWrites = cloneConfig(parkTestApprovedRedeemSmoke);
parkTestRedeemSmokeWithDraftWrites.safetyGates.rollerBookingDraftWritesEnabled = true;

const parkTestRedeemSmokeWithWebhook = cloneConfig(parkTestApprovedRedeemSmoke);
parkTestRedeemSmokeWithWebhook.safetyGates.rollerWebhookProcessingEnabled = true;

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
expectPass('approved park-test Live add-on smoke config passes', parkTestApprovedAddOnSmoke, 'park-test');
expectFail(
  'park-test add-on smoke approval without allowed identifiers fails closed',
  parkTestAddOnSmokeWithoutAllowedIdentifiers,
  /liveAddOnSmokeAllowedIdentifiers/,
);
expectFail(
  'park-test add-on smoke allowlist without approval fails closed',
  parkTestAllowedAddOnIdentifiersWithoutApproval,
  /liveAddOnSmokeAllowedIdentifiers must stay empty/,
);
expectFail(
  'park-test add-on smoke approval without draft writes fails closed',
  parkTestAddOnSmokeWithoutDraftWrites,
  /requires safetyGates\.rollerBookingDraftWritesEnabled=true/,
);
expectFail(
  'park-test add-on smoke still blocks webhook processing',
  parkTestAddOnSmokeWithWebhook,
  /rollerWebhookProcessingEnabled/,
);
expectPass('approved park-test linked add-on settlement config passes', parkTestApprovedLinkedAddOnSettlement, 'park-test');
expectFail(
  'park-test linked add-on settlement approval without allowed identifiers fails closed',
  parkTestLinkedAddOnSettlementWithoutAllowedIdentifiers,
  /liveLinkedAddOnSettlementAllowedIdentifiers/,
);
expectFail(
  'park-test linked add-on settlement allowlist without approval fails closed',
  parkTestAllowedSettlementIdentifiersWithoutApproval,
  /liveLinkedAddOnSettlementAllowedIdentifiers must stay empty/,
);
expectFail(
  'park-test linked add-on settlement still blocks draft writes',
  parkTestLinkedAddOnSettlementWithDraftWrites,
  /rollerBookingDraftWritesEnabled/,
);
expectFail(
  'park-test linked add-on settlement still blocks redeem writes',
  parkTestLinkedAddOnSettlementWithRedeem,
  /rollerRedeemWritesEnabled/,
);
expectPass('approved park-test Live redeem smoke config passes', parkTestApprovedRedeemSmoke, 'park-test');
expectFail(
  'park-test redeem smoke approval without allowed identifiers fails closed',
  parkTestRedeemSmokeWithoutAllowedIdentifiers,
  /liveRedeemSmokeAllowedIdentifiers/,
);
expectFail(
  'park-test redeem smoke allowlist without approval fails closed',
  parkTestAllowedRedeemIdentifiersWithoutApproval,
  /liveRedeemSmokeAllowedIdentifiers must stay empty/,
);
expectFail(
  'park-test redeem smoke approval without redeem writes fails closed',
  parkTestRedeemSmokeWithoutRedeemWrites,
  /rollerRedeemWritesEnabled=true/,
);
expectFail(
  'park-test redeem smoke approval without staff auth fails closed',
  parkTestRedeemSmokeWithoutStaffAuth,
  /staffAuthEnabled=true/,
);
expectFail(
  'park-test redeem smoke still blocks draft writes',
  parkTestRedeemSmokeWithDraftWrites,
  /rollerBookingDraftWritesEnabled/,
);
expectFail(
  'park-test redeem smoke still blocks webhook processing',
  parkTestRedeemSmokeWithWebhook,
  /rollerWebhookProcessingEnabled/,
);

console.log('Config guard validation passed.');
