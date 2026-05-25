import { App } from 'aws-cdk-lib';
import * as fs from 'fs';
import * as path from 'path';

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

export interface JumpYardCloudConfig {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly bookingTimeSms: {
    readonly confirmSend: boolean;
    readonly leadMinutes: number;
    readonly limit: number;
    readonly rateMinutes: number;
    readonly scheduleEnabled: boolean;
    readonly windowMinutes: number;
  };
  readonly resourcePrefix: string;
  readonly roller: {
    readonly environment: string;
    readonly baseUrl: string;
  };
  readonly tags: Record<RequiredWrlDsTag, string>;
}

interface RawConfig {
  readonly awsAccount?: unknown;
  readonly awsRegion?: unknown;
  readonly bookingTimeSms?: {
    readonly confirmSend?: unknown;
    readonly leadMinutes?: unknown;
    readonly limit?: unknown;
    readonly rateMinutes?: unknown;
    readonly scheduleEnabled?: unknown;
    readonly windowMinutes?: unknown;
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
  const tags = readRequiredTags(raw.tags);
  const awsAccount = readString(raw.awsAccount, 'awsAccount');
  const awsRegion = readString(raw.awsRegion, 'awsRegion');
  const bookingTimeSms = readBookingTimeSmsConfig(raw.bookingTimeSms);
  const resourcePrefix = readString(raw.resourcePrefix, 'resourcePrefix');
  const rollerEnvironment = readString(raw.roller?.environment, 'roller.environment');
  const rollerBaseUrl = readString(raw.roller?.baseUrl, 'roller.baseUrl');

  if (!/^\d{12}$/.test(awsAccount)) {
    throw new Error('awsAccount must be a 12 digit AWS account id.');
  }

  if (!/^[a-z]{2}-[a-z]+-\d$/.test(awsRegion)) {
    throw new Error('awsRegion must look like an AWS region, for example eu-north-1.');
  }

  if (!/^[a-z0-9-]+$/.test(resourcePrefix)) {
    throw new Error('resourcePrefix must use lowercase letters, numbers, and hyphens only.');
  }

  if (rollerEnvironment !== 'playground') {
    throw new Error('T0004 infra foundation is Playground-only. roller.environment must be playground.');
  }

  if (!/^https:\/\/api\.play\.roller\.app\/?$/.test(rollerBaseUrl)) {
    throw new Error('roller.baseUrl must be the documented Roller Playground API URL.');
  }

  if (tags['WRLDS:ManagedBy'] !== 'cdk') {
    throw new Error('WRLDS:ManagedBy must be cdk for this infrastructure app.');
  }

  return {
    awsAccount,
    awsRegion,
    bookingTimeSms,
    resourcePrefix,
    roller: {
      environment: rollerEnvironment,
      baseUrl: rollerBaseUrl.replace(/\/$/, ''),
    },
    tags,
  };
}

function readBookingTimeSmsConfig(raw: RawConfig['bookingTimeSms']): JumpYardCloudConfig['bookingTimeSms'] {
  return {
    confirmSend: readOptionalBoolean(raw?.confirmSend, false, 'bookingTimeSms.confirmSend'),
    leadMinutes: readOptionalInteger(raw?.leadMinutes, 30, 0, 24 * 60, 'bookingTimeSms.leadMinutes'),
    limit: readOptionalInteger(raw?.limit, 10, 1, 10, 'bookingTimeSms.limit'),
    rateMinutes: readOptionalInteger(raw?.rateMinutes, 5, 1, 60, 'bookingTimeSms.rateMinutes'),
    scheduleEnabled: readOptionalBoolean(raw?.scheduleEnabled, false, 'bookingTimeSms.scheduleEnabled'),
    windowMinutes: readOptionalInteger(raw?.windowMinutes, 10, 1, 180, 'bookingTimeSms.windowMinutes'),
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

function readOptionalBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new Error(`Config field ${fieldName} must be a boolean when supplied.`);
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
