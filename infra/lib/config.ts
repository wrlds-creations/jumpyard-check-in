import { App } from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';

export const BOOKING_TIME_SMS_CONFIRMED_SEND_APPROVAL = 'I_APPROVE_CONFIRMED_SCHEDULED_SMS_SENDS';

export const REQUIRED_WRLDS_TAGS = [
  'WRLDS:Client',
  'WRLDS:Project',
  'WRLDS:Environment',
  'WRLDS:Owner',
  'WRLDS:Repository',
  'WRLDS:ManagedBy',
  'WRLDS:DataClassification',
  'WRLDS:Exportable',
  'WRLDS:CostCenter',
  'WRLDS:CreatedBy',
] as const;

type RequiredWrlDsTag = (typeof REQUIRED_WRLDS_TAGS)[number];

type DeploymentEnvironment = 'dev' | 'park-test';

const ROLLER_PLAYGROUND_BASE_URL = 'https://api.play.roller.app';
const ROLLER_LIVE_BASE_URL = 'https://api.roller.app';
const PARK_TEST_AWS_ACCOUNT = '376129878018';
const PARK_TEST_AWS_REGION = 'eu-north-1';
const PARK_TEST_RESOURCE_PREFIX = 'jumpyard-check-in-park-test';
export const PARK_TEST_LIVE_PAYMENT_SMOKE_APPROVAL = 'T0159_INTERNAL_LIVE_PAYMENT_SMOKE_APPROVED';
export const PARK_TEST_POST_PAYMENT_SYNC_APPROVAL = 'T0169_POST_PAYMENT_SYNC_APPROVED';
export const PARK_TEST_LIVE_LOOKUP_SMOKE_APPROVAL = 'T0160_LIVE_LOOKUP_SMOKE_APPROVED';
export const PARK_TEST_ASSISTED_LOOKUP_APPROVAL = 'T0171_ASSISTED_LOOKUP_APPROVED';
export const PARK_TEST_LIVE_ADD_ON_SMOKE_APPROVAL = 'T0162_EXISTING_BOOKING_ADDON_SMOKE_APPROVED';
export const PARK_TEST_LINKED_ADD_ON_SETTLEMENT_APPROVAL =
  'T0165_LINKED_ADDON_SETTLEMENT_RECONCILIATION_APPROVED';
export const PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL = 'T0166_CONTROLLED_LIVE_REDEEM_SMOKE_APPROVED';
export const PARK_TEST_FRONTEND_REDEEM_REHEARSAL_APPROVAL =
  'T0176_FRONTEND_REDEEM_REHEARSAL_APPROVED';
export const PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL =
  'T0176_FULL_FLOW_REHEARSAL_APPROVED';

export interface JumpYardCloudConfig {
  readonly api: {
    readonly allowedCorsOrigins: readonly string[];
    readonly throttlingBurstLimit: number;
    readonly throttlingRateLimit: number;
  };
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly bookingTimeSms: {
    readonly checkinBaseUrl: string;
    readonly confirmedSendApproval: string;
    readonly confirmSend: boolean;
    readonly leadMinutes: number;
    readonly limit: number;
    readonly rateMinutes: number;
    readonly scheduleEnabled: boolean;
    readonly windowMinutes: number;
  };
  readonly guestEmail: {
    readonly checkinBaseUrl: string;
    readonly fromAddress: string;
    readonly provider: string;
    readonly replyToAddresses: readonly string[];
  };
  readonly resourcePrefix: string;
  readonly roller: {
    readonly environment: string;
    readonly baseUrl: string;
  };
  readonly safetyGates: {
    readonly emergencyStop: boolean;
    readonly guestMessagingSendsEnabled: boolean;
    readonly liveAddOnSmokeAllowedIdentifiers: readonly string[];
    readonly liveAddOnSmokeApproval?: string;
    readonly liveLinkedAddOnSettlementAllowedIdentifiers: readonly string[];
    readonly liveLinkedAddOnSettlementApproval?: string;
    readonly liveAssistedLookupAllowedOperatingDates: readonly string[];
    readonly liveAssistedLookupApproval?: string;
    readonly liveAssistedLookupVenueId?: string;
    readonly liveLookupSmokeAllowedIdentifiers: readonly string[];
    readonly liveLookupSmokeApproval?: string;
    readonly livePaymentSmokeApproval?: string;
    readonly livePostPaymentSyncApproval?: string;
    readonly liveRedeemSmokeAllowedIdentifiers: readonly string[];
    readonly liveRedeemSmokeApproval?: string;
    readonly frontendRedeemRehearsalAllowedSessionIds: readonly string[];
    readonly frontendRedeemRehearsalApproval?: string;
    readonly fullFlowRehearsalAllowedOperatingDates: readonly string[];
    readonly fullFlowRehearsalApproval?: string;
    readonly fullFlowRehearsalVenueId?: string;
    readonly rollerBookingDraftWritesEnabled: boolean;
    readonly rollerRedeemWritesEnabled: boolean;
    readonly rollerWebhookProcessingEnabled: boolean;
    readonly staffAuthEnabled: boolean;
  };
  readonly tags: Record<RequiredWrlDsTag, string>;
}

interface RawConfig {
  readonly api?: {
    readonly allowedCorsOrigins?: unknown;
    readonly throttlingBurstLimit?: unknown;
    readonly throttlingRateLimit?: unknown;
  };
  readonly awsAccount?: unknown;
  readonly awsRegion?: unknown;
  readonly bookingTimeSms?: {
    readonly checkinBaseUrl?: unknown;
    readonly confirmedSendApproval?: unknown;
    readonly confirmSend?: unknown;
    readonly leadMinutes?: unknown;
    readonly limit?: unknown;
    readonly rateMinutes?: unknown;
    readonly scheduleEnabled?: unknown;
    readonly windowMinutes?: unknown;
  };
  readonly guestEmail?: {
    readonly checkinBaseUrl?: unknown;
    readonly fromAddress?: unknown;
    readonly provider?: unknown;
    readonly replyToAddresses?: unknown;
  };
  readonly resourcePrefix?: unknown;
  readonly roller?: {
    readonly environment?: unknown;
    readonly baseUrl?: unknown;
  };
  readonly safetyGates?: {
    readonly emergencyStop?: unknown;
    readonly guestMessagingSendsEnabled?: unknown;
    readonly liveAddOnSmokeAllowedIdentifiers?: unknown;
    readonly liveAddOnSmokeApproval?: unknown;
    readonly liveLinkedAddOnSettlementAllowedIdentifiers?: unknown;
    readonly liveLinkedAddOnSettlementApproval?: unknown;
    readonly liveAssistedLookupAllowedOperatingDates?: unknown;
    readonly liveAssistedLookupApproval?: unknown;
    readonly liveAssistedLookupVenueId?: unknown;
    readonly liveLookupSmokeAllowedIdentifiers?: unknown;
    readonly liveLookupSmokeApproval?: unknown;
    readonly livePaymentSmokeApproval?: unknown;
    readonly livePostPaymentSyncApproval?: unknown;
    readonly liveRedeemSmokeAllowedIdentifiers?: unknown;
    readonly liveRedeemSmokeApproval?: unknown;
    readonly frontendRedeemRehearsalAllowedSessionIds?: unknown;
    readonly frontendRedeemRehearsalApproval?: unknown;
    readonly fullFlowRehearsalAllowedOperatingDates?: unknown;
    readonly fullFlowRehearsalApproval?: unknown;
    readonly fullFlowRehearsalVenueId?: unknown;
    readonly rollerBookingDraftWritesEnabled?: unknown;
    readonly rollerRedeemWritesEnabled?: unknown;
    readonly rollerWebhookProcessingEnabled?: unknown;
    readonly staffAuthEnabled?: unknown;
  };
  readonly tags?: Record<string, unknown>;
}

export function loadJumpYardCloudConfig(app: App): JumpYardCloudConfig {
  const configPath = app.node.tryGetContext('config');
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('Missing CDK context: pass -c config=./config/dev.example.json or a confirmed environment config.');
  }

  const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(absoluteConfigPath)) {
    throw new Error(`JumpYard Cloud config file not found: ${absoluteConfigPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(absoluteConfigPath, 'utf8')) as RawConfig;
  const api = readApiConfig(raw.api);
  const tags = readRequiredTags(raw.tags);
  const awsAccount = readString(raw.awsAccount, 'awsAccount');
  const awsRegion = readString(raw.awsRegion, 'awsRegion');
  const bookingTimeSms = readBookingTimeSmsConfig(raw.bookingTimeSms);
  const guestEmail = readGuestEmailConfig(raw.guestEmail);
  const resourcePrefix = readString(raw.resourcePrefix, 'resourcePrefix');
  const rollerEnvironment = readString(raw.roller?.environment, 'roller.environment');
  const rollerBaseUrl = normalizeBaseUrl(readString(raw.roller?.baseUrl, 'roller.baseUrl'), 'roller.baseUrl');
  const safetyGates = readSafetyGatesConfig(raw.safetyGates);
  const deploymentEnvironment = readDeploymentEnvironment(tags['WRLDS:Environment']);

  if (!/^\d{12}$/.test(awsAccount)) {
    throw new Error('awsAccount must be a 12 digit AWS account id.');
  }

  if (!/^[a-z]{2}-[a-z]+-\d$/.test(awsRegion)) {
    throw new Error('awsRegion must look like an AWS region, for example eu-north-1.');
  }

  if (!/^[a-z0-9-]+$/.test(resourcePrefix)) {
    throw new Error('resourcePrefix must use lowercase letters, numbers, and hyphens only.');
  }

  if (tags['WRLDS:ManagedBy'] !== 'cdk') {
    throw new Error('WRLDS:ManagedBy must be cdk for this infrastructure app.');
  }

  validateEnvironmentContract({
    awsAccount,
    awsRegion,
    bookingTimeSms,
    deploymentEnvironment,
    resourcePrefix,
    rollerBaseUrl,
    rollerEnvironment,
    safetyGates,
    tags,
  });

  return {
    api,
    awsAccount,
    awsRegion,
    bookingTimeSms,
    guestEmail,
    resourcePrefix,
    roller: {
      environment: rollerEnvironment,
      baseUrl: rollerBaseUrl,
    },
    safetyGates,
    tags,
  };
}

interface EnvironmentContractInput {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly bookingTimeSms: JumpYardCloudConfig['bookingTimeSms'];
  readonly deploymentEnvironment: DeploymentEnvironment;
  readonly resourcePrefix: string;
  readonly rollerBaseUrl: string;
  readonly rollerEnvironment: string;
  readonly safetyGates: JumpYardCloudConfig['safetyGates'];
  readonly tags: Record<RequiredWrlDsTag, string>;
}

function validateEnvironmentContract(input: EnvironmentContractInput): void {
  if (input.deploymentEnvironment === 'dev') {
    validateDevRollerContract(input.rollerEnvironment, input.rollerBaseUrl);
    return;
  }

  validateParkTestContract(input);
}

function validateDevRollerContract(rollerEnvironment: string, rollerBaseUrl: string): void {
  if (rollerEnvironment !== 'playground') {
    throw new Error('dev config must use Roller Playground. roller.environment must be playground.');
  }

  if (rollerBaseUrl !== ROLLER_PLAYGROUND_BASE_URL) {
    throw new Error(`dev config must use Roller Playground base URL ${ROLLER_PLAYGROUND_BASE_URL}.`);
  }
}

function validateParkTestContract(input: EnvironmentContractInput): void {
  if (input.awsAccount !== PARK_TEST_AWS_ACCOUNT) {
    throw new Error(`park-test awsAccount must be ${PARK_TEST_AWS_ACCOUNT}.`);
  }

  if (input.awsRegion !== PARK_TEST_AWS_REGION) {
    throw new Error(`park-test awsRegion must be ${PARK_TEST_AWS_REGION}.`);
  }

  if (input.resourcePrefix !== PARK_TEST_RESOURCE_PREFIX) {
    throw new Error(`park-test resourcePrefix must be ${PARK_TEST_RESOURCE_PREFIX}.`);
  }

  if (input.rollerEnvironment !== 'live') {
    throw new Error('park-test config must explicitly use Roller Live. roller.environment must be live.');
  }

  if (input.rollerBaseUrl !== ROLLER_LIVE_BASE_URL) {
    throw new Error(`park-test config must use Roller Live base URL ${ROLLER_LIVE_BASE_URL}.`);
  }

  if (input.tags['WRLDS:Project'] !== 'jumpyard-check-in') {
    throw new Error('park-test WRLDS:Project must be jumpyard-check-in.');
  }

  if (input.tags['WRLDS:Repository'] !== 'wrlds-creations/jumpyard-check-in') {
    throw new Error('park-test WRLDS:Repository must be wrlds-creations/jumpyard-check-in.');
  }

  if (input.tags['WRLDS:DataClassification'] !== 'confidential') {
    throw new Error('park-test WRLDS:DataClassification must be confidential.');
  }

  if (input.bookingTimeSms.confirmSend) {
    throw new Error('park-test bookingTimeSms.confirmSend must stay false until a scoped messaging ticket enables it.');
  }

  const livePaymentSmokeApproved =
    input.safetyGates.livePaymentSmokeApproval === PARK_TEST_LIVE_PAYMENT_SMOKE_APPROVAL;
  const livePostPaymentSyncApproved =
    input.safetyGates.livePostPaymentSyncApproval === PARK_TEST_POST_PAYMENT_SYNC_APPROVAL;
  const liveLookupSmokeApproved =
    input.safetyGates.liveLookupSmokeApproval === PARK_TEST_LIVE_LOOKUP_SMOKE_APPROVAL;
  const liveAssistedLookupApproved =
    input.safetyGates.liveAssistedLookupApproval === PARK_TEST_ASSISTED_LOOKUP_APPROVAL;
  const liveAddOnSmokeApproved =
    input.safetyGates.liveAddOnSmokeApproval === PARK_TEST_LIVE_ADD_ON_SMOKE_APPROVAL;
  const liveLinkedAddOnSettlementApproved =
    input.safetyGates.liveLinkedAddOnSettlementApproval === PARK_TEST_LINKED_ADD_ON_SETTLEMENT_APPROVAL;
  const liveRedeemSmokeApproved =
    input.safetyGates.liveRedeemSmokeApproval === PARK_TEST_LIVE_REDEEM_SMOKE_APPROVAL;
  const frontendRedeemRehearsalApproved =
    input.safetyGates.frontendRedeemRehearsalApproval === PARK_TEST_FRONTEND_REDEEM_REHEARSAL_APPROVAL;
  const fullFlowRehearsalApproved =
    input.safetyGates.fullFlowRehearsalApproval === PARK_TEST_FULL_FLOW_REHEARSAL_APPROVAL;
  const scopedTrafficApproved =
    livePaymentSmokeApproved ||
    livePostPaymentSyncApproved ||
    liveLookupSmokeApproved ||
    liveAssistedLookupApproved ||
    liveAddOnSmokeApproved ||
    liveLinkedAddOnSettlementApproved ||
    liveRedeemSmokeApproved ||
    frontendRedeemRehearsalApproved ||
    fullFlowRehearsalApproved;

  if (!input.safetyGates.emergencyStop && !scopedTrafficApproved) {
    throw new Error(
      'park-test safetyGates.emergencyStop may be false only with a recognized scoped traffic approval.',
    );
  }

  if (
    input.safetyGates.rollerBookingDraftWritesEnabled &&
    !livePaymentSmokeApproved &&
    !liveAddOnSmokeApproved &&
    !fullFlowRehearsalApproved
  ) {
    throw new Error(
      'park-test safetyGates.rollerBookingDraftWritesEnabled must stay false until a scoped ticket enables it.',
    );
  }

  if (
    (livePaymentSmokeApproved || liveAddOnSmokeApproved || fullFlowRehearsalApproved) &&
    !input.safetyGates.rollerBookingDraftWritesEnabled
  ) {
    throw new Error(
      'park-test live write smoke approval requires safetyGates.rollerBookingDraftWritesEnabled=true.',
    );
  }

  if (livePostPaymentSyncApproved && !livePaymentSmokeApproved) {
    throw new Error(
      'park-test post-payment sync approval requires the scoped payment smoke approval in the same reviewed config.',
    );
  }

  if (liveAddOnSmokeApproved && input.safetyGates.liveAddOnSmokeAllowedIdentifiers.length === 0) {
    throw new Error(
      'park-test live add-on smoke approval requires safetyGates.liveAddOnSmokeAllowedIdentifiers.',
    );
  }

  if (!liveAddOnSmokeApproved && input.safetyGates.liveAddOnSmokeAllowedIdentifiers.length > 0) {
    throw new Error(
      'park-test safetyGates.liveAddOnSmokeAllowedIdentifiers must stay empty until a scoped add-on ticket enables it.',
    );
  }

  if (
    liveLinkedAddOnSettlementApproved &&
    input.safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers.length === 0
  ) {
    throw new Error(
      'park-test linked add-on settlement approval requires safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers.',
    );
  }

  if (
    !liveLinkedAddOnSettlementApproved &&
    input.safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers.length > 0
  ) {
    throw new Error(
      'park-test safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers must stay empty until a scoped settlement ticket enables it.',
    );
  }

  if (liveLookupSmokeApproved && input.safetyGates.liveLookupSmokeAllowedIdentifiers.length === 0) {
    throw new Error(
      'park-test live lookup smoke approval requires safetyGates.liveLookupSmokeAllowedIdentifiers.',
    );
  }

  if (!liveLookupSmokeApproved && input.safetyGates.liveLookupSmokeAllowedIdentifiers.length > 0) {
    throw new Error(
      'park-test safetyGates.liveLookupSmokeAllowedIdentifiers must stay empty until a scoped lookup ticket enables it.',
    );
  }

  if (liveAssistedLookupApproved && input.safetyGates.liveAssistedLookupAllowedOperatingDates.length === 0) {
    throw new Error(
      'park-test assisted lookup approval requires safetyGates.liveAssistedLookupAllowedOperatingDates.',
    );
  }

  for (const date of input.safetyGates.liveAssistedLookupAllowedOperatingDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('park-test safetyGates.liveAssistedLookupAllowedOperatingDates must use YYYY-MM-DD dates.');
    }
  }

  if (!liveAssistedLookupApproved && input.safetyGates.liveAssistedLookupAllowedOperatingDates.length > 0) {
    throw new Error(
      'park-test safetyGates.liveAssistedLookupAllowedOperatingDates must stay empty until assisted lookup is approved.',
    );
  }

  if (liveAssistedLookupApproved && !input.safetyGates.liveAssistedLookupVenueId) {
    throw new Error('park-test assisted lookup approval requires safetyGates.liveAssistedLookupVenueId.');
  }

  if (!liveAssistedLookupApproved && input.safetyGates.liveAssistedLookupVenueId) {
    throw new Error(
      'park-test safetyGates.liveAssistedLookupVenueId must stay empty until assisted lookup is approved.',
    );
  }

  if (
    liveAssistedLookupApproved &&
    (livePaymentSmokeApproved ||
      livePostPaymentSyncApproved ||
      liveAddOnSmokeApproved ||
      liveLinkedAddOnSettlementApproved ||
      liveRedeemSmokeApproved ||
      frontendRedeemRehearsalApproved ||
      fullFlowRehearsalApproved)
  ) {
    throw new Error('park-test assisted lookup approval must not be combined with payment, add-on, settlement, or redeem approvals.');
  }

  if (liveRedeemSmokeApproved && input.safetyGates.liveRedeemSmokeAllowedIdentifiers.length === 0) {
    throw new Error(
      'park-test live redeem smoke approval requires safetyGates.liveRedeemSmokeAllowedIdentifiers.',
    );
  }

  if (!liveRedeemSmokeApproved && input.safetyGates.liveRedeemSmokeAllowedIdentifiers.length > 0) {
    throw new Error(
      'park-test safetyGates.liveRedeemSmokeAllowedIdentifiers must stay empty until a scoped redeem ticket enables it.',
    );
  }

  if (
    frontendRedeemRehearsalApproved &&
    input.safetyGates.frontendRedeemRehearsalAllowedSessionIds.length === 0
  ) {
    throw new Error(
      'park-test frontend redeem rehearsal approval requires safetyGates.frontendRedeemRehearsalAllowedSessionIds.',
    );
  }

  if (fullFlowRehearsalApproved && input.safetyGates.fullFlowRehearsalAllowedOperatingDates.length === 0) {
    throw new Error(
      'park-test full-flow rehearsal approval requires safetyGates.fullFlowRehearsalAllowedOperatingDates.',
    );
  }

  for (const date of input.safetyGates.fullFlowRehearsalAllowedOperatingDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('park-test safetyGates.fullFlowRehearsalAllowedOperatingDates must use YYYY-MM-DD dates.');
    }
  }

  if (!fullFlowRehearsalApproved && input.safetyGates.fullFlowRehearsalAllowedOperatingDates.length > 0) {
    throw new Error(
      'park-test safetyGates.fullFlowRehearsalAllowedOperatingDates must stay empty until a scoped full-flow ticket enables it.',
    );
  }

  if (fullFlowRehearsalApproved && !input.safetyGates.fullFlowRehearsalVenueId) {
    throw new Error('park-test full-flow rehearsal approval requires safetyGates.fullFlowRehearsalVenueId.');
  }

  if (!fullFlowRehearsalApproved && input.safetyGates.fullFlowRehearsalVenueId) {
    throw new Error(
      'park-test safetyGates.fullFlowRehearsalVenueId must stay empty until a scoped full-flow ticket enables it.',
    );
  }

  if (fullFlowRehearsalApproved && !input.safetyGates.staffAuthEnabled) {
    throw new Error('park-test full-flow rehearsal approval requires safetyGates.staffAuthEnabled=true.');
  }

  if (fullFlowRehearsalApproved && !input.safetyGates.rollerRedeemWritesEnabled) {
    throw new Error('park-test full-flow rehearsal approval requires safetyGates.rollerRedeemWritesEnabled=true.');
  }

  if (
    fullFlowRehearsalApproved &&
    (livePaymentSmokeApproved ||
      livePostPaymentSyncApproved ||
      liveLookupSmokeApproved ||
      liveAssistedLookupApproved ||
      liveAddOnSmokeApproved ||
      liveLinkedAddOnSettlementApproved ||
      liveRedeemSmokeApproved ||
      frontendRedeemRehearsalApproved)
  ) {
    throw new Error(
      'park-test full-flow rehearsal approval must not be combined with payment, lookup, add-on, settlement, redeem, or frontend-only approvals.',
    );
  }

  if (
    !frontendRedeemRehearsalApproved &&
    input.safetyGates.frontendRedeemRehearsalAllowedSessionIds.length > 0
  ) {
    throw new Error(
      'park-test safetyGates.frontendRedeemRehearsalAllowedSessionIds must stay empty until a scoped frontend rehearsal ticket enables it.',
    );
  }

  if (frontendRedeemRehearsalApproved && !input.safetyGates.staffAuthEnabled) {
    throw new Error(
      'park-test frontend redeem rehearsal approval requires safetyGates.staffAuthEnabled=true.',
    );
  }

  if (frontendRedeemRehearsalApproved && input.safetyGates.rollerRedeemWritesEnabled) {
    throw new Error(
      'park-test frontend redeem rehearsal must keep safetyGates.rollerRedeemWritesEnabled=false.',
    );
  }

  if (
    frontendRedeemRehearsalApproved &&
    (livePaymentSmokeApproved ||
      livePostPaymentSyncApproved ||
      liveLookupSmokeApproved ||
      liveAssistedLookupApproved ||
      liveAddOnSmokeApproved ||
      liveLinkedAddOnSettlementApproved ||
      liveRedeemSmokeApproved ||
      input.safetyGates.rollerBookingDraftWritesEnabled)
  ) {
    throw new Error(
      'park-test frontend redeem rehearsal approval must not be combined with payment, lookup, add-on, settlement, redeem, or draft-write approvals.',
    );
  }

  if (liveRedeemSmokeApproved && !input.safetyGates.rollerRedeemWritesEnabled) {
    throw new Error(
      'park-test live redeem smoke approval requires safetyGates.rollerRedeemWritesEnabled=true.',
    );
  }

  if (liveRedeemSmokeApproved && !input.safetyGates.staffAuthEnabled) {
    throw new Error(
      'park-test live redeem smoke approval requires safetyGates.staffAuthEnabled=true.',
    );
  }

  if (!liveRedeemSmokeApproved && !fullFlowRehearsalApproved && input.safetyGates.rollerRedeemWritesEnabled) {
    throw new Error('park-test safetyGates.rollerRedeemWritesEnabled must stay false until a scoped ticket enables it.');
  }

  if (
    !liveRedeemSmokeApproved &&
    !frontendRedeemRehearsalApproved &&
    !fullFlowRehearsalApproved &&
    input.safetyGates.staffAuthEnabled
  ) {
    throw new Error('park-test safetyGates.staffAuthEnabled must stay false until a scoped ticket enables it.');
  }

  const blockedGates: Array<keyof JumpYardCloudConfig['safetyGates']> = [
    'guestMessagingSendsEnabled',
    'rollerWebhookProcessingEnabled',
  ];
  for (const gate of blockedGates) {
    if (input.safetyGates[gate]) {
      throw new Error(`park-test safetyGates.${gate} must stay false until a scoped ticket enables it.`);
    }
  }
}

function readDeploymentEnvironment(value: string): DeploymentEnvironment {
  if (value === 'dev' || value === 'park-test') {
    return value;
  }

  throw new Error('WRLDS:Environment must be dev or park-test for this infrastructure app.');
}

function normalizeBaseUrl(value: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Config field ${fieldName} must be a valid URL.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Config field ${fieldName} must use https.`);
  }

  if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error(`Config field ${fieldName} must not include a path, query, or hash.`);
  }

  return parsed.origin;
}

function readApiConfig(raw: RawConfig['api']): JumpYardCloudConfig['api'] {
  const allowedCorsOrigins = readCorsOrigins(raw?.allowedCorsOrigins, 'api.allowedCorsOrigins');
  const throttlingBurstLimit = readOptionalInteger(raw?.throttlingBurstLimit, 50, 1, 5000, 'api.throttlingBurstLimit');
  const throttlingRateLimit = readOptionalInteger(raw?.throttlingRateLimit, 25, 1, 10000, 'api.throttlingRateLimit');

  return {
    allowedCorsOrigins,
    throttlingBurstLimit,
    throttlingRateLimit,
  };
}

function readCorsOrigins(value: unknown, fieldName: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Config field ${fieldName} must be a non-empty array of explicit origins.`);
  }

  const origins = value.map((origin, index) => normalizeCorsOrigin(origin, `${fieldName}[${index}]`));
  const uniqueOrigins = Array.from(new Set(origins));

  if (uniqueOrigins.includes('*')) {
    throw new Error(`Config field ${fieldName} must not include wildcard origins.`);
  }

  return uniqueOrigins;
}

function normalizeCorsOrigin(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Config field ${fieldName} must be a non-empty string.`);
  }

  const trimmed = value.trim().replace(/\/$/, '');

  try {
    const parsed = new URL(trimmed);
    const hasPathOrQuery =
      parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0 || trimmed.endsWith('/');

    if (!['http:', 'https:'].includes(parsed.protocol) || hasPathOrQuery) {
      throw new Error('invalid origin');
    }

    return parsed.origin;
  } catch {
    throw new Error(`Config field ${fieldName} must be an explicit http(s) origin without path or wildcard.`);
  }
}

function readBookingTimeSmsConfig(raw: RawConfig['bookingTimeSms']): JumpYardCloudConfig['bookingTimeSms'] {
  const config = {
    checkinBaseUrl: readOptionalString(raw?.checkinBaseUrl, 'http://localhost:3000/', 'bookingTimeSms.checkinBaseUrl'),
    confirmedSendApproval: readOptionalString(
      raw?.confirmedSendApproval,
      '',
      'bookingTimeSms.confirmedSendApproval',
    ),
    confirmSend: readOptionalBoolean(raw?.confirmSend, false, 'bookingTimeSms.confirmSend'),
    leadMinutes: readOptionalInteger(raw?.leadMinutes, 30, 0, 24 * 60, 'bookingTimeSms.leadMinutes'),
    limit: readOptionalInteger(raw?.limit, 10, 1, 10, 'bookingTimeSms.limit'),
    rateMinutes: readOptionalInteger(raw?.rateMinutes, 5, 1, 60, 'bookingTimeSms.rateMinutes'),
    scheduleEnabled: readOptionalBoolean(raw?.scheduleEnabled, false, 'bookingTimeSms.scheduleEnabled'),
    windowMinutes: readOptionalInteger(raw?.windowMinutes, 10, 1, 180, 'bookingTimeSms.windowMinutes'),
  };

  if (!isSafeCheckinBaseUrl(config.checkinBaseUrl)) {
    throw new Error('bookingTimeSms.checkinBaseUrl must be a valid http or https URL.');
  }

  if (config.confirmSend) {
    if (config.confirmedSendApproval !== BOOKING_TIME_SMS_CONFIRMED_SEND_APPROVAL) {
      throw new Error(
        `bookingTimeSms.confirmedSendApproval must equal ${BOOKING_TIME_SMS_CONFIRMED_SEND_APPROVAL} when confirmSend is true.`,
      );
    }

    if (!isPublicHttpsCheckinBaseUrl(config.checkinBaseUrl)) {
      throw new Error('bookingTimeSms.confirmSend=true requires a public https bookingTimeSms.checkinBaseUrl.');
    }
  }

  return config;
}

function readGuestEmailConfig(raw: RawConfig['guestEmail']): JumpYardCloudConfig['guestEmail'] {
  const config = {
    checkinBaseUrl: readOptionalString(raw?.checkinBaseUrl, 'http://localhost:3000/', 'guestEmail.checkinBaseUrl'),
    fromAddress: readOptionalString(raw?.fromAddress, '', 'guestEmail.fromAddress'),
    provider: readOptionalString(raw?.provider, 'aws_ses', 'guestEmail.provider'),
    replyToAddresses: readOptionalStringArray(raw?.replyToAddresses, 'guestEmail.replyToAddresses'),
  };

  if (config.provider !== 'aws_ses') {
    throw new Error('guestEmail.provider must be aws_ses for the T0063 email foundation.');
  }

  if (!isSafeCheckinBaseUrl(config.checkinBaseUrl)) {
    throw new Error('guestEmail.checkinBaseUrl must be a valid http or https URL.');
  }

  if (config.fromAddress && !isEmailLike(config.fromAddress)) {
    throw new Error('guestEmail.fromAddress must be a valid email address when supplied.');
  }

  for (const replyToAddress of config.replyToAddresses) {
    if (!isEmailLike(replyToAddress)) {
      throw new Error('guestEmail.replyToAddresses must contain valid email addresses when supplied.');
    }
  }

  return config;
}

function readSafetyGatesConfig(raw: RawConfig['safetyGates']): JumpYardCloudConfig['safetyGates'] {
  return {
    emergencyStop: readOptionalBoolean(raw?.emergencyStop, false, 'safetyGates.emergencyStop'),
    guestMessagingSendsEnabled: readOptionalBoolean(
      raw?.guestMessagingSendsEnabled,
      false,
      'safetyGates.guestMessagingSendsEnabled',
    ),
    liveAddOnSmokeAllowedIdentifiers: readOptionalStringArray(
      raw?.liveAddOnSmokeAllowedIdentifiers,
      'safetyGates.liveAddOnSmokeAllowedIdentifiers',
    ),
    liveAddOnSmokeApproval: readOptionalString(
      raw?.liveAddOnSmokeApproval,
      '',
      'safetyGates.liveAddOnSmokeApproval',
    ),
    liveLinkedAddOnSettlementAllowedIdentifiers: readOptionalStringArray(
      raw?.liveLinkedAddOnSettlementAllowedIdentifiers,
      'safetyGates.liveLinkedAddOnSettlementAllowedIdentifiers',
    ),
    liveLinkedAddOnSettlementApproval: readOptionalString(
      raw?.liveLinkedAddOnSettlementApproval,
      '',
      'safetyGates.liveLinkedAddOnSettlementApproval',
    ),
    liveAssistedLookupAllowedOperatingDates: readOptionalStringArray(
      raw?.liveAssistedLookupAllowedOperatingDates,
      'safetyGates.liveAssistedLookupAllowedOperatingDates',
    ),
    liveAssistedLookupApproval: readOptionalString(
      raw?.liveAssistedLookupApproval,
      '',
      'safetyGates.liveAssistedLookupApproval',
    ),
    liveAssistedLookupVenueId: readOptionalString(
      raw?.liveAssistedLookupVenueId,
      '',
      'safetyGates.liveAssistedLookupVenueId',
    ),
    liveLookupSmokeAllowedIdentifiers: readOptionalStringArray(
      raw?.liveLookupSmokeAllowedIdentifiers,
      'safetyGates.liveLookupSmokeAllowedIdentifiers',
    ),
    liveLookupSmokeApproval: readOptionalString(
      raw?.liveLookupSmokeApproval,
      '',
      'safetyGates.liveLookupSmokeApproval',
    ),
    livePaymentSmokeApproval: readOptionalString(
      raw?.livePaymentSmokeApproval,
      '',
      'safetyGates.livePaymentSmokeApproval',
    ),
    livePostPaymentSyncApproval: readOptionalString(
      raw?.livePostPaymentSyncApproval,
      '',
      'safetyGates.livePostPaymentSyncApproval',
    ),
    liveRedeemSmokeAllowedIdentifiers: readOptionalStringArray(
      raw?.liveRedeemSmokeAllowedIdentifiers,
      'safetyGates.liveRedeemSmokeAllowedIdentifiers',
    ),
    liveRedeemSmokeApproval: readOptionalString(
      raw?.liveRedeemSmokeApproval,
      '',
      'safetyGates.liveRedeemSmokeApproval',
    ),
    frontendRedeemRehearsalAllowedSessionIds: readOptionalStringArray(
      raw?.frontendRedeemRehearsalAllowedSessionIds,
      'safetyGates.frontendRedeemRehearsalAllowedSessionIds',
    ),
    frontendRedeemRehearsalApproval: readOptionalString(
      raw?.frontendRedeemRehearsalApproval,
      '',
      'safetyGates.frontendRedeemRehearsalApproval',
    ),
    fullFlowRehearsalAllowedOperatingDates: readOptionalStringArray(
      raw?.fullFlowRehearsalAllowedOperatingDates,
      'safetyGates.fullFlowRehearsalAllowedOperatingDates',
    ),
    fullFlowRehearsalApproval: readOptionalString(
      raw?.fullFlowRehearsalApproval,
      '',
      'safetyGates.fullFlowRehearsalApproval',
    ),
    fullFlowRehearsalVenueId: readOptionalString(
      raw?.fullFlowRehearsalVenueId,
      '',
      'safetyGates.fullFlowRehearsalVenueId',
    ),
    rollerBookingDraftWritesEnabled: readOptionalBoolean(
      raw?.rollerBookingDraftWritesEnabled,
      false,
      'safetyGates.rollerBookingDraftWritesEnabled',
    ),
    rollerRedeemWritesEnabled: readOptionalBoolean(
      raw?.rollerRedeemWritesEnabled,
      false,
      'safetyGates.rollerRedeemWritesEnabled',
    ),
    rollerWebhookProcessingEnabled: readOptionalBoolean(
      raw?.rollerWebhookProcessingEnabled,
      false,
      'safetyGates.rollerWebhookProcessingEnabled',
    ),
    staffAuthEnabled: readOptionalBoolean(raw?.staffAuthEnabled, false, 'safetyGates.staffAuthEnabled'),
  };
}

function readRequiredTags(rawTags: Record<string, unknown> | undefined): Record<RequiredWrlDsTag, string> {
  if (!rawTags) {
    throw new Error('Config is missing required WRLDS tags.');
  }

  const tags = {} as Record<RequiredWrlDsTag, string>;
  const missingTags: string[] = [];

  for (const tag of REQUIRED_WRLDS_TAGS) {
    const value = rawTags[tag];
    if (typeof value !== 'string' || value.trim().length === 0) {
      missingTags.push(tag);
    } else {
      tags[tag] = value.trim();
    }
  }

  if (missingTags.length > 0) {
    throw new Error(`Config is missing required WRLDS tags: ${missingTags.join(', ')}`);
  }

  return tags;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Config field ${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(value: unknown, fallback: string, fieldName: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new Error(`Config field ${fieldName} must be a string when supplied.`);
  }

  return value.trim();
}

function readOptionalBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new Error(`Config field ${fieldName} must be a boolean when supplied.`);
}

function readOptionalStringArray(value: unknown, fieldName: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Config field ${fieldName} must be an array of strings when supplied.`);
  }

  return value.map((item, index) => readString(item, `${fieldName}[${index}]`));
}

function readOptionalInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  fieldName: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Config field ${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return value;
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isSafeCheckinBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isPublicHttpsCheckinBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const privateIpv4 =
      /^10\./.test(hostname) ||
      /^127\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname);

    return (
      parsed.protocol === 'https:' &&
      hostname !== 'localhost' &&
      hostname !== '::1' &&
      hostname !== '[::1]' &&
      !hostname.endsWith('.local') &&
      !privateIpv4
    );
  } catch {
    return false;
  }
}
