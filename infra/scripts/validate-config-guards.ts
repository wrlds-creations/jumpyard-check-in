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
  auroraServerless?: {
    maxCapacity?: number;
    minCapacity?: number;
    secondsUntilAutoPause?: number;
  };
  readonly bookingTimeSms: {
    channels?: string[];
    checkinBaseUrl: string;
    confirmedSendApproval: string;
    confirmSend: boolean;
    leadMinutes: number;
    limit: number;
    rateMinutes: number;
    scheduleEnabled: boolean;
    windowEndsAtLead?: boolean;
    windowMinutes: number;
  };
  dataSync?: {
    bookingRetentionDays: number;
    liveApproval: string;
    maxPages: number;
    maxWindowDays: number;
    pageSize: number;
    requestIntervalMs: number;
    scheduleEnabled: boolean;
    venueId: string;
  };
  readonly guestEmail: {
    checkinBaseUrl: string;
    configurationSetName: string;
    fromAddress: string;
    fromDisplayName: string;
    identityDomain: string;
    provider: string;
    replyToAddresses: string[];
  };
  resourcePrefix?: string;
  readonly roller: {
    baseUrl: string;
    environment: string;
  };
  readonly safetyGates: {
    controlledT30EmailApproval?: string;
    emergencyStop: boolean;
    guestMessagingSendsEnabled: boolean;
    liveAddOnSmokeAllowedIdentifiers?: string[];
    liveAddOnSmokeApproval?: string;
    liveAssistedLookupAllowedOperatingDates?: string[];
    liveAssistedLookupApproval?: string;
    liveAssistedLookupVenueId?: string;
    liveLinkedAddOnSettlementAllowedIdentifiers?: string[];
    liveLinkedAddOnSettlementApproval?: string;
    liveLookupSmokeAllowedIdentifiers?: string[];
    liveLookupSmokeApproval?: string;
    livePaymentSmokeApproval?: string;
    livePostPaymentSyncApproval?: string;
    liveRedeemSmokeAllowedIdentifiers?: string[];
    liveRedeemSmokeApproval?: string;
    frontendRedeemRehearsalAllowedSessionIds?: string[];
    frontendRedeemRehearsalApproval?: string;
    fullFlowRehearsalAllowedOperatingDates?: string[];
    fullFlowRehearsalApproval?: string;
    fullFlowRehearsalVenueId?: string;
    rollerBookingDraftWritesEnabled: boolean;
    rollerRedeemWritesEnabled: boolean;
    rollerWebhookProcessingEnabled: boolean;
    staffAuthEnabled: boolean;
  };
  webhookProcessing?: {
    bookingRetentionDays?: number;
    liveApproval?: string;
    recoveryLimit?: number;
    recoveryScheduleEnabled?: boolean;
    requestIntervalMs?: number;
    venueId?: string;
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

const devWithContinuousAurora = cloneConfig(devConfig);
if (!devWithContinuousAurora.auroraServerless) throw new Error('Expected dev Aurora Serverless config.');
devWithContinuousAurora.auroraServerless.minCapacity = 0.5;
delete devWithContinuousAurora.auroraServerless.secondsUntilAutoPause;

const devWithBookingSchedule = cloneConfig(devConfig);
devWithBookingSchedule.bookingTimeSms.scheduleEnabled = true;

const devWithDataSyncSchedule = cloneConfig(devConfig);
if (!devWithDataSyncSchedule.dataSync) throw new Error('Expected dev dataSync config.');
devWithDataSyncSchedule.dataSync.scheduleEnabled = true;

const devWithWebhookRecoverySchedule = cloneConfig(devConfig);
if (!devWithWebhookRecoverySchedule.webhookProcessing) throw new Error('Expected dev webhook processing config.');
devWithWebhookRecoverySchedule.webhookProcessing.recoveryScheduleEnabled = true;

const devWrongCostCenter = cloneConfig(devConfig);
devWrongCostCenter.tags['WRLDS:CostCenter'] = 'unassigned';

const parkTestConfig = readConfig('config/park-test.json');
const parkTestWithAutoPause = cloneConfig(parkTestConfig);
parkTestWithAutoPause.auroraServerless = {
  maxCapacity: 2,
  minCapacity: 0,
  secondsUntilAutoPause: 300,
};
const parkTestMissingPrefix = cloneConfig(parkTestConfig);
delete parkTestMissingPrefix.resourcePrefix;

const parkTestPlaygroundConfig = cloneConfig(parkTestConfig);
parkTestPlaygroundConfig.roller.environment = 'playground';
parkTestPlaygroundConfig.roller.baseUrl = 'https://api.play.roller.app';

const parkTestWrongClassification = cloneConfig(parkTestConfig);
parkTestWrongClassification.tags['WRLDS:DataClassification'] = 'internal';

const parkTestWrongEmailIdentityDomain = cloneConfig(parkTestConfig);
parkTestWrongEmailIdentityDomain.guestEmail.identityDomain = 'wrlds.com';

const parkTestWrongEmailConfigurationSet = cloneConfig(parkTestConfig);
parkTestWrongEmailConfigurationSet.guestEmail.configurationSetName = 'another-configuration-set';

const parkTestWrongEmailFromAddress = cloneConfig(parkTestConfig);
parkTestWrongEmailFromAddress.guestEmail.fromAddress = 'another@jumpyard.se';

const parkTestWrongEmailDisplayName = cloneConfig(parkTestConfig);
parkTestWrongEmailDisplayName.guestEmail.fromDisplayName = 'Another Park';

const parkTestWrongEmailReplyTo = cloneConfig(parkTestConfig);
parkTestWrongEmailReplyTo.guestEmail.replyToAddresses = ['love@wrlds.com'];

const parkTestConfirmedSend = cloneConfig(parkTestConfig);
parkTestConfirmedSend.bookingTimeSms.confirmSend = true;
parkTestConfirmedSend.bookingTimeSms.confirmedSendApproval = 'I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS';

const parkTestControlledT30 = readConfig('config/park-test-full-flow-rehearsal.json');
const parkTestControlledT30WithSms = cloneConfig(parkTestControlledT30);
parkTestControlledT30WithSms.bookingTimeSms.channels = ['sms', 'email'];
const parkTestControlledT30WithoutApproval = cloneConfig(parkTestControlledT30);
delete parkTestControlledT30WithoutApproval.safetyGates.controlledT30EmailApproval;
const parkTestControlledT30WithBroadGuestGate = cloneConfig(parkTestControlledT30);
parkTestControlledT30WithBroadGuestGate.safetyGates.guestMessagingSendsEnabled = true;
const parkTestControlledT30WithEarlyWindow = cloneConfig(parkTestControlledT30);
parkTestControlledT30WithEarlyWindow.bookingTimeSms.windowEndsAtLead = false;

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

const parkTestApprovedPostPaymentSync = cloneConfig(parkTestApprovedPaymentSmoke);
parkTestApprovedPostPaymentSync.safetyGates.livePostPaymentSyncApproval = 'T0169_POST_PAYMENT_SYNC_APPROVED';

const parkTestPostPaymentSyncWithoutPaymentSmoke = cloneConfig(parkTestConfig);
parkTestPostPaymentSyncWithoutPaymentSmoke.safetyGates.emergencyStop = true;
parkTestPostPaymentSyncWithoutPaymentSmoke.safetyGates.livePostPaymentSyncApproval = 'T0169_POST_PAYMENT_SYNC_APPROVED';

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

const parkTestApprovedAssistedLookup = cloneConfig(parkTestConfig);
parkTestApprovedAssistedLookup.safetyGates.emergencyStop = true;
parkTestApprovedAssistedLookup.safetyGates.liveAssistedLookupApproval = 'T0171_ASSISTED_LOOKUP_APPROVED';
parkTestApprovedAssistedLookup.safetyGates.liveAssistedLookupAllowedOperatingDates = ['2026-06-29'];
parkTestApprovedAssistedLookup.safetyGates.liveAssistedLookupVenueId = '50871';

const parkTestAssistedLookupWithoutDates = cloneConfig(parkTestApprovedAssistedLookup);
parkTestAssistedLookupWithoutDates.safetyGates.liveAssistedLookupAllowedOperatingDates = [];

const parkTestAssistedLookupWithoutVenue = cloneConfig(parkTestApprovedAssistedLookup);
delete parkTestAssistedLookupWithoutVenue.safetyGates.liveAssistedLookupVenueId;

const parkTestAssistedLookupDatesWithoutApproval = cloneConfig(parkTestApprovedAssistedLookup);
delete parkTestAssistedLookupDatesWithoutApproval.safetyGates.liveAssistedLookupApproval;
delete parkTestAssistedLookupDatesWithoutApproval.safetyGates.liveAssistedLookupVenueId;

const parkTestAssistedLookupVenueWithoutApproval = cloneConfig(parkTestApprovedAssistedLookup);
delete parkTestAssistedLookupVenueWithoutApproval.safetyGates.liveAssistedLookupApproval;
parkTestAssistedLookupVenueWithoutApproval.safetyGates.liveAssistedLookupAllowedOperatingDates = [];

const parkTestAssistedLookupWithPaymentSmoke = cloneConfig(parkTestApprovedAssistedLookup);
parkTestAssistedLookupWithPaymentSmoke.safetyGates.rollerBookingDraftWritesEnabled = true;
parkTestAssistedLookupWithPaymentSmoke.safetyGates.livePaymentSmokeApproval = 'T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED';

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

const parkTestApprovedFrontendRedeemRehearsal = cloneConfig(parkTestConfig);
parkTestApprovedFrontendRedeemRehearsal.safetyGates.emergencyStop = true;
parkTestApprovedFrontendRedeemRehearsal.safetyGates.staffAuthEnabled = true;
parkTestApprovedFrontendRedeemRehearsal.safetyGates.frontendRedeemRehearsalApproval =
  'T0176_FRONTEND_REDEEM_REHEARSAL_APPROVED';
parkTestApprovedFrontendRedeemRehearsal.safetyGates.frontendRedeemRehearsalAllowedSessionIds = [
  'jycs_mqtimdxf_bb33c94c',
];

const parkTestFrontendRedeemRehearsalWithoutAllowedSession = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
parkTestFrontendRedeemRehearsalWithoutAllowedSession.safetyGates.frontendRedeemRehearsalAllowedSessionIds = [];

const parkTestFrontendRedeemSessionWithoutApproval = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
delete parkTestFrontendRedeemSessionWithoutApproval.safetyGates.frontendRedeemRehearsalApproval;
parkTestFrontendRedeemSessionWithoutApproval.safetyGates.staffAuthEnabled = false;

const parkTestFrontendRedeemRehearsalWithoutStaffAuth = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
parkTestFrontendRedeemRehearsalWithoutStaffAuth.safetyGates.staffAuthEnabled = false;

const parkTestFrontendRedeemRehearsalWithRedeemWrites = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
parkTestFrontendRedeemRehearsalWithRedeemWrites.safetyGates.rollerRedeemWritesEnabled = true;

const parkTestFrontendRedeemRehearsalWithPaymentSmoke = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
parkTestFrontendRedeemRehearsalWithPaymentSmoke.safetyGates.rollerBookingDraftWritesEnabled = true;
parkTestFrontendRedeemRehearsalWithPaymentSmoke.safetyGates.livePaymentSmokeApproval =
  'T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED';

const parkTestFrontendRedeemRehearsalWithLiveRedeem = cloneConfig(parkTestApprovedFrontendRedeemRehearsal);
parkTestFrontendRedeemRehearsalWithLiveRedeem.safetyGates.liveRedeemSmokeApproval =
  'T0166_CONTROLLED_LIVE_REDEEM_SMOKE_APPROVED';
parkTestFrontendRedeemRehearsalWithLiveRedeem.safetyGates.liveRedeemSmokeAllowedIdentifiers = [
  '166490323',
  '166490323-560714728',
];

const parkTestApprovedFullFlowRehearsal = cloneConfig(parkTestConfig);
parkTestApprovedFullFlowRehearsal.safetyGates.emergencyStop = false;
parkTestApprovedFullFlowRehearsal.safetyGates.rollerBookingDraftWritesEnabled = true;
parkTestApprovedFullFlowRehearsal.safetyGates.rollerRedeemWritesEnabled = true;
parkTestApprovedFullFlowRehearsal.safetyGates.staffAuthEnabled = true;
parkTestApprovedFullFlowRehearsal.safetyGates.fullFlowRehearsalApproval =
  'T0176_FULL_FLOW_REHEARSAL_APPROVED';
parkTestApprovedFullFlowRehearsal.safetyGates.fullFlowRehearsalAllowedOperatingDates = [
  '2026-06-29',
  '2026-06-30',
];
parkTestApprovedFullFlowRehearsal.safetyGates.fullFlowRehearsalVenueId = '50871';

const parkTestLiveSyncWithoutApproval = cloneConfig(parkTestApprovedFullFlowRehearsal);
if (!parkTestLiveSyncWithoutApproval.dataSync) throw new Error('Expected park-test dataSync config.');
parkTestLiveSyncWithoutApproval.dataSync.scheduleEnabled = true;
parkTestLiveSyncWithoutApproval.dataSync.liveApproval = '';

const parkTestLiveSyncWrongVenue = cloneConfig(parkTestApprovedFullFlowRehearsal);
if (!parkTestLiveSyncWrongVenue.dataSync) throw new Error('Expected park-test dataSync config.');
parkTestLiveSyncWrongVenue.dataSync.venueId = 'not-nacka';

const parkTestLiveSyncApprovalWhileDisabled = cloneConfig(parkTestConfig);
if (!parkTestLiveSyncApprovalWhileDisabled.dataSync) throw new Error('Expected park-test dataSync config.');
parkTestLiveSyncApprovalWhileDisabled.dataSync.liveApproval = 'T0196_LIVE_BOOKING_INDEX_APPROVED';

const parkTestFullFlowWithoutDates = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithoutDates.safetyGates.fullFlowRehearsalAllowedOperatingDates = [];

const parkTestFullFlowWithoutVenue = cloneConfig(parkTestApprovedFullFlowRehearsal);
delete parkTestFullFlowWithoutVenue.safetyGates.fullFlowRehearsalVenueId;

const parkTestFullFlowDatesWithoutApproval = cloneConfig(parkTestApprovedFullFlowRehearsal);
delete parkTestFullFlowDatesWithoutApproval.safetyGates.fullFlowRehearsalApproval;
parkTestFullFlowDatesWithoutApproval.safetyGates.emergencyStop = true;
parkTestFullFlowDatesWithoutApproval.safetyGates.rollerBookingDraftWritesEnabled = false;
parkTestFullFlowDatesWithoutApproval.safetyGates.rollerRedeemWritesEnabled = false;
parkTestFullFlowDatesWithoutApproval.safetyGates.staffAuthEnabled = false;
delete parkTestFullFlowDatesWithoutApproval.safetyGates.fullFlowRehearsalVenueId;

const parkTestFullFlowVenueWithoutApproval = cloneConfig(parkTestApprovedFullFlowRehearsal);
delete parkTestFullFlowVenueWithoutApproval.safetyGates.fullFlowRehearsalApproval;
parkTestFullFlowVenueWithoutApproval.safetyGates.emergencyStop = true;
parkTestFullFlowVenueWithoutApproval.safetyGates.fullFlowRehearsalAllowedOperatingDates = [];
parkTestFullFlowVenueWithoutApproval.safetyGates.rollerBookingDraftWritesEnabled = false;
parkTestFullFlowVenueWithoutApproval.safetyGates.rollerRedeemWritesEnabled = false;
parkTestFullFlowVenueWithoutApproval.safetyGates.staffAuthEnabled = false;

const parkTestFullFlowWithoutDraftWrites = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithoutDraftWrites.safetyGates.rollerBookingDraftWritesEnabled = false;

const parkTestFullFlowWithoutRedeemWrites = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithoutRedeemWrites.safetyGates.rollerRedeemWritesEnabled = false;

const parkTestFullFlowWithoutStaffAuth = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithoutStaffAuth.safetyGates.staffAuthEnabled = false;

const parkTestFullFlowWithWebhook = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithWebhook.safetyGates.rollerWebhookProcessingEnabled = true;
parkTestFullFlowWithWebhook.webhookProcessing = {
  bookingRetentionDays: 30,
  liveApproval: 'T0197_LIVE_WEBHOOK_PROCESSING_APPROVED',
  recoveryLimit: 10,
  recoveryScheduleEnabled: true,
  requestIntervalMs: 1000,
  venueId: '50871',
};

const parkTestFullFlowWithoutWebhookApproval = cloneConfig(parkTestFullFlowWithWebhook);
if (parkTestFullFlowWithoutWebhookApproval.webhookProcessing) {
  parkTestFullFlowWithoutWebhookApproval.webhookProcessing.liveApproval = '';
}

const parkTestFullFlowWithFrontendRehearsal = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithFrontendRehearsal.safetyGates.frontendRedeemRehearsalApproval =
  'T0176_FRONTEND_REDEEM_REHEARSAL_APPROVED';
parkTestFullFlowWithFrontendRehearsal.safetyGates.frontendRedeemRehearsalAllowedSessionIds = [
  'jycs_mqtimdxf_bb33c94c',
];

const parkTestFullFlowWithPaymentSmoke = cloneConfig(parkTestApprovedFullFlowRehearsal);
parkTestFullFlowWithPaymentSmoke.safetyGates.livePaymentSmokeApproval =
  'T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED';

expectPass('dev Playground config passes', devConfig, 'dev');
expectFail('unsafe dev-to-Live config fails', unsafeDevLiveConfig, /dev config must use Roller Playground/);
expectFail('dev continuous Aurora config fails closed', devWithContinuousAurora, /only valid when minCapacity is 0/);
expectFail('dev booking-time schedule fails closed', devWithBookingSchedule, /bookingTimeSms.scheduleEnabled/);
expectFail('dev data-sync schedule fails closed', devWithDataSyncSchedule, /dataSync.scheduleEnabled/);
expectFail(
  'dev webhook-recovery schedule fails closed',
  devWithWebhookRecoverySchedule,
  /webhookProcessing.recoveryScheduleEnabled/,
);
expectFail(
  'JumpYard config with an unassigned cost center fails closed',
  devWrongCostCenter,
  /WRLDS:CostCenter=JumpYard/,
);
expectPass('reviewed park-test Live config passes', parkTestConfig, 'park-test');
expectFail('park-test auto-pause config fails closed', parkTestWithAutoPause, /must remain continuously available/);
expectFail('park-test missing resourcePrefix fails closed', parkTestMissingPrefix, /resourcePrefix/);
expectFail('park-test Playground config fails closed', parkTestPlaygroundConfig, /park-test config must explicitly use Roller Live/);
expectFail('park-test wrong data classification fails closed', parkTestWrongClassification, /DataClassification/);
expectFail(
  'park-test wrong email identity domain fails closed',
  parkTestWrongEmailIdentityDomain,
  /guestEmail.fromAddress must belong/,
);
expectFail(
  'park-test wrong email configuration set fails closed',
  parkTestWrongEmailConfigurationSet,
  /guestEmail.configurationSetName/,
);
expectFail(
  'park-test wrong email from address fails closed',
  parkTestWrongEmailFromAddress,
  /guestEmail.fromAddress/,
);
expectFail(
  'park-test wrong email display name fails closed',
  parkTestWrongEmailDisplayName,
  /guestEmail.fromDisplayName/,
);
expectFail(
  'park-test wrong email reply-to fails closed',
  parkTestWrongEmailReplyTo,
  /guestEmail.replyToAddresses/,
);
expectFail(
  'park-test confirmed scheduled send without the T0201 gate fails closed',
  parkTestConfirmedSend,
  /controlledT30EmailApproval/,
);
expectPass('approved single-booking park-test T-30 email config passes', parkTestControlledT30, 'park-test');
expectFail(
  'controlled park-test T-30 email rejects SMS',
  parkTestControlledT30WithSms,
  /email channel only/,
);
expectFail(
  'controlled park-test T-30 email requires its explicit approval',
  parkTestControlledT30WithoutApproval,
  /controlledT30EmailApproval/,
);
expectFail(
  'controlled park-test T-30 email cannot open the broad guest gate',
  parkTestControlledT30WithBroadGuestGate,
  /must not open the general guest messaging send gate/,
);
expectFail(
  'controlled park-test T-30 email cannot use the old early window',
  parkTestControlledT30WithEarlyWindow,
  /bounded 25-to-30-minute-before-start window/,
);
expectFail(
  'park-test emergency stop off without scoped approval fails closed',
  parkTestEmergencyStopOff,
  /emergencyStop may be false only with a recognized scoped traffic approval/,
);
expectFail('park-test draft writes enabled fails closed', parkTestDraftWritesOn, /rollerBookingDraftWritesEnabled/);
expectPass('approved park-test Live payment smoke config passes', parkTestApprovedPaymentSmoke, 'park-test');
expectPass(
  'approved park-test payment smoke may explicitly release the emergency stop',
  parkTestApprovedPaymentSmokeEmergencyOff,
  'park-test',
);
expectFail(
  'park-test payment smoke approval without draft writes fails closed',
  parkTestApprovalWithoutDraftWrites,
  /requires safetyGates\.rollerBookingDraftWritesEnabled=true/,
);
expectFail(
  'park-test payment smoke still blocks webhook processing',
  parkTestPaymentSmokeWithWebhook,
  /webhookProcessing\.liveApproval/,
);
expectPass('approved park-test post-payment sync config passes', parkTestApprovedPostPaymentSync, 'park-test');
expectFail(
  'park-test post-payment sync approval without payment smoke fails closed',
  parkTestPostPaymentSyncWithoutPaymentSmoke,
  /post-payment sync approval requires/,
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
expectPass('approved park-test assisted lookup config passes', parkTestApprovedAssistedLookup, 'park-test');
expectFail(
  'park-test assisted lookup approval without operating dates fails closed',
  parkTestAssistedLookupWithoutDates,
  /liveAssistedLookupAllowedOperatingDates/,
);
expectFail(
  'park-test assisted lookup approval without venue id fails closed',
  parkTestAssistedLookupWithoutVenue,
  /liveAssistedLookupVenueId/,
);
expectFail(
  'park-test assisted lookup operating dates without approval fail closed',
  parkTestAssistedLookupDatesWithoutApproval,
  /liveAssistedLookupAllowedOperatingDates must stay empty/,
);
expectFail(
  'park-test assisted lookup venue id without approval fails closed',
  parkTestAssistedLookupVenueWithoutApproval,
  /liveAssistedLookupVenueId must stay empty/,
);
expectFail(
  'park-test assisted lookup cannot combine with payment smoke',
  parkTestAssistedLookupWithPaymentSmoke,
  /must not be combined/,
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
  /webhookProcessing\.liveApproval/,
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
  /webhookProcessing\.liveApproval/,
);
expectPass('approved park-test frontend redeem rehearsal config passes', parkTestApprovedFrontendRedeemRehearsal, 'park-test');
expectFail(
  'park-test frontend redeem rehearsal approval without allowed session fails closed',
  parkTestFrontendRedeemRehearsalWithoutAllowedSession,
  /frontendRedeemRehearsalAllowedSessionIds/,
);
expectFail(
  'park-test frontend redeem rehearsal session allowlist without approval fails closed',
  parkTestFrontendRedeemSessionWithoutApproval,
  /frontendRedeemRehearsalAllowedSessionIds must stay empty/,
);
expectFail(
  'park-test frontend redeem rehearsal approval without staff auth fails closed',
  parkTestFrontendRedeemRehearsalWithoutStaffAuth,
  /staffAuthEnabled=true/,
);
expectFail(
  'park-test frontend redeem rehearsal keeps redeem writes closed',
  parkTestFrontendRedeemRehearsalWithRedeemWrites,
  /rollerRedeemWritesEnabled=false/,
);
expectFail(
  'park-test frontend redeem rehearsal does not combine with payment smoke',
  parkTestFrontendRedeemRehearsalWithPaymentSmoke,
  /must not be combined/,
);
expectFail(
  'park-test frontend redeem rehearsal does not combine with live redeem smoke',
  parkTestFrontendRedeemRehearsalWithLiveRedeem,
  /must not be combined/,
);
expectPass('approved park-test full-flow rehearsal config passes', parkTestApprovedFullFlowRehearsal, 'park-test');
expectFail(
  'park-test Live data sync without exact approval fails closed',
  parkTestLiveSyncWithoutApproval,
  /dataSync.liveApproval/,
);
expectFail(
  'park-test Live data sync wrong venue fails closed',
  parkTestLiveSyncWrongVenue,
  /dataSync.venueId/,
);
expectFail(
  'park-test Live data sync approval cannot remain while disabled',
  parkTestLiveSyncApprovalWhileDisabled,
  /dataSync.liveApproval must be empty/,
);
expectFail(
  'park-test full-flow rehearsal approval without operating dates fails closed',
  parkTestFullFlowWithoutDates,
  /fullFlowRehearsalAllowedOperatingDates/,
);
expectFail(
  'park-test full-flow rehearsal approval without venue id fails closed',
  parkTestFullFlowWithoutVenue,
  /fullFlowRehearsalVenueId/,
);
expectFail(
  'park-test full-flow rehearsal operating dates without approval fail closed',
  parkTestFullFlowDatesWithoutApproval,
  /fullFlowRehearsalAllowedOperatingDates must stay empty/,
);
expectFail(
  'park-test full-flow rehearsal venue id without approval fails closed',
  parkTestFullFlowVenueWithoutApproval,
  /fullFlowRehearsalVenueId must stay empty/,
);
expectFail(
  'park-test full-flow rehearsal approval without draft writes fails closed',
  parkTestFullFlowWithoutDraftWrites,
  /rollerBookingDraftWritesEnabled=true/,
);
expectFail(
  'park-test full-flow rehearsal approval without redeem writes fails closed',
  parkTestFullFlowWithoutRedeemWrites,
  /rollerRedeemWritesEnabled=true/,
);
expectFail(
  'park-test full-flow rehearsal approval without staff auth fails closed',
  parkTestFullFlowWithoutStaffAuth,
  /staffAuthEnabled=true/,
);
expectPass(
  'park-test full-flow rehearsal accepts exact T0197 webhook processing approval',
  parkTestFullFlowWithWebhook,
  'park-test',
);
expectFail(
  'park-test full-flow webhook processing without exact approval fails closed',
  parkTestFullFlowWithoutWebhookApproval,
  /webhookProcessing\.liveApproval/,
);
expectFail(
  'park-test full-flow rehearsal does not combine with frontend-only rehearsal',
  parkTestFullFlowWithFrontendRehearsal,
  /must not be combined/,
);
expectFail(
  'park-test full-flow rehearsal does not combine with payment smoke',
  parkTestFullFlowWithPaymentSmoke,
  /must not be combined/,
);

console.log('Config guard validation passed.');
