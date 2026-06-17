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
