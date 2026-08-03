import { randomBytes, createHash } from 'crypto';
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';

const AWS_ACCOUNT_ID = '376129878018';
const AWS_REGION = 'eu-north-1';
const APPROVAL = 'T0201_SINGLE_BOOKING_T30_EMAIL_APPROVED';
const APPLY_APPROVAL = 'I_APPROVE_T0201_SINGLE_BOOKING_CONTROL_UPDATE';
const SECRET_ID = '/jumpyard-check-in-park-test/checkin-links/dev-token';
const VENUE_ID = '50871';

interface Arguments {
  readonly apply: boolean;
  readonly approval: string | null;
  readonly disarm: boolean;
  readonly profile: string;
  readonly selfTest: boolean;
}

interface ArmedControl {
  readonly approval: string;
  readonly armingNonce: string;
  readonly bookingIdentifierSha256: string;
  readonly bookingStartAt: string;
  readonly enabled: true;
  readonly recipientEmailSha256: string;
  readonly schemaVersion: 't0201-v1';
  readonly venueId: '50871';
}

function parseArguments(argv: readonly string[]): Arguments {
  const valueAfter = (flag: string): string | null => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  return {
    apply: argv.includes('--apply'),
    approval: valueAfter('--approval'),
    disarm: argv.includes('--disarm'),
    profile: valueAfter('--profile') ?? 'wrlds-dev',
    selfTest: argv.includes('--self-test'),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(value: string | undefined): string {
  const email = String(value ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('T0201_RECIPIENT_EMAIL must contain one valid recipient email address.');
  }
  return email;
}

function normalizeIdentifier(value: string | undefined): string {
  const identifier = String(value ?? '').trim();
  if (!identifier || identifier.length > 256 || /[\r\n]/.test(identifier)) {
    throw new Error('T0201_BOOKING_IDENTIFIER must contain one Roller booking identifier.');
  }
  return identifier;
}

function normalizeBookingStart(value: string | undefined, now = new Date()): string {
  const raw = String(value ?? '').trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    throw new Error('T0201_BOOKING_START_AT must be ISO 8601 with an explicit UTC offset.');
  }
  const timestamp = new Date(raw);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error('T0201_BOOKING_START_AT is not a valid timestamp.');
  }
  const leadMs = timestamp.getTime() - now.getTime();
  if (leadMs < 10 * 60 * 1000 || leadMs > 48 * 60 * 60 * 1000) {
    throw new Error('The controlled booking must start between 10 minutes and 48 hours from now.');
  }
  return timestamp.toISOString();
}

function buildArmedControl(environment: NodeJS.ProcessEnv, now = new Date()): ArmedControl {
  const bookingIdentifier = normalizeIdentifier(environment.T0201_BOOKING_IDENTIFIER);
  const recipientEmail = normalizeEmail(environment.T0201_RECIPIENT_EMAIL);
  return {
    approval: APPROVAL,
    armingNonce: randomBytes(24).toString('base64url'),
    bookingIdentifierSha256: sha256(bookingIdentifier),
    bookingStartAt: normalizeBookingStart(environment.T0201_BOOKING_START_AT, now),
    enabled: true,
    recipientEmailSha256: sha256(recipientEmail),
    schemaVersion: 't0201-v1',
    venueId: VENUE_ID,
  };
}

function buildDisarmedControl() {
  return {
    approval: '',
    armingNonce: randomBytes(24).toString('base64url'),
    bookingIdentifierSha256: '',
    bookingStartAt: '',
    enabled: false,
    recipientEmailSha256: '',
    schemaVersion: 't0201-v1',
    venueId: VENUE_ID,
  } as const;
}

function mergeControl(
  existing: Record<string, unknown>,
  control: ArmedControl | ReturnType<typeof buildDisarmedControl>,
): Record<string, unknown> {
  return { ...existing, t0201Control: control };
}

function runSelfTest(): void {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const first = buildArmedControl(
    {
      T0201_BOOKING_IDENTIFIER: ' booking-123 ',
      T0201_BOOKING_START_AT: '2026-08-03T14:00:00+02:00',
      T0201_RECIPIENT_EMAIL: ' Test.User@Example.com ',
    },
    now,
  );
  if (first.bookingStartAt !== '2026-08-03T12:00:00.000Z') throw new Error('Timestamp normalization failed.');
  if (first.bookingIdentifierSha256 !== sha256('booking-123')) throw new Error('Identifier hashing failed.');
  if (first.recipientEmailSha256 !== sha256('test.user@example.com')) throw new Error('Email normalization failed.');
  if (first.enabled !== true || first.venueId !== VENUE_ID) throw new Error('Control tuple shape failed.');

  const disarmed = buildDisarmedControl();
  if (disarmed.enabled !== false || disarmed.approval !== '') throw new Error('Disarm contract failed.');
  const merged = mergeControl({ purpose: 'checkin-session-link-create', token: 'preserve-me' }, first);
  if (merged.token !== 'preserve-me' || merged.t0201Control !== first) {
    throw new Error('Existing check-in-link secret fields were not preserved.');
  }
  console.log('[pass] T0201 control arming hashes raw inputs locally and emits only the fail-closed secret contract');
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }
  if (args.apply && args.approval !== APPLY_APPROVAL) {
    throw new Error(`--apply requires --approval ${APPLY_APPROVAL}.`);
  }

  const control = args.disarm ? buildDisarmedControl() : buildArmedControl(process.env);
  console.log(
    JSON.stringify({
      action: args.disarm ? 'disarm' : 'arm_one_booking',
      apply: args.apply,
      bookingStartAt: control.bookingStartAt || null,
      rawBookingIdentifierPersisted: false,
      rawRecipientEmailPersisted: false,
      secretId: SECRET_ID,
      venueId: VENUE_ID,
    }),
  );
  if (!args.apply) {
    console.log('Dry-run only. Add the exact --approval phrase and --apply after reviewing this redacted plan.');
    return;
  }

  const credentials = fromIni({ profile: args.profile });
  const sts = new STSClient({ credentials, region: AWS_REGION });
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  if (identity.Account !== AWS_ACCOUNT_ID) {
    throw new Error(`Refusing T0201 control update outside AWS account ${AWS_ACCOUNT_ID}.`);
  }

  const secrets = new SecretsManagerClient({ credentials, region: AWS_REGION });
  const current = await secrets.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID, VersionStage: 'AWSCURRENT' }),
  );
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(current.SecretString || '{}') as Record<string, unknown>;
  } catch {
    throw new Error('The existing check-in-link secret is not a JSON object; refusing to overwrite it.');
  }
  if (!existing || Array.isArray(existing) || typeof existing !== 'object') {
    throw new Error('The existing check-in-link secret has an unexpected shape; refusing to overwrite it.');
  }
  await secrets.send(
    new PutSecretValueCommand({
      SecretId: SECRET_ID,
      SecretString: JSON.stringify(mergeControl(existing, control)),
    }),
  );
  console.log(`[applied] ${args.disarm ? 'Disarmed' : 'Armed one exact booking'} in ${AWS_ACCOUNT_ID}/${AWS_REGION}.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
