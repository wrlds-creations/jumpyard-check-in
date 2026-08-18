import assert from "assert/strict";
import { createHash, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { ExecuteStatementCommand, RDSDataClient, type SqlParameter } from "@aws-sdk/client-rds-data";
import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

const EXPECTED_ACCOUNT = "376129878018";
const EXPECTED_REGION = "eu-north-1";
const EXPECTED_ENVIRONMENT = "park-test";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const EXPECTED_VENUE_ID = "50871";
const EXPECTED_DOMAIN =
  "https://jumpyard-check-in-park-test-admin-376129878018.auth.eu-north-1.amazoncognito.com";
const EXPECTED_SECRET_NAME = "/jumpyard-check-in-park-test/aurora/admin";
const DEFAULT_CONFIG_PATH = "./config/park-test-full-flow-rehearsal.json";
const DEFAULT_PROFILE = "wrlds-dev";
const DATABASE_NAME = "jumpyard_cloud";
const WRITE_CONFIRMATION = "I_APPROVE_T0194_PARK_TEST_ADMIN_IDENTITY_WRITE";
const ACCOUNT_REPLACEMENT_CONFIRMATION = "I_APPROVE_T0194_PARK_TEST_ADMIN_ACCOUNT_REPLACEMENT";
const ACCOUNT_REPLACEMENT_REASON = "lost_or_compromised_totp";
const STAFF_ID_PATTERN = /^jy_staff_[a-f0-9]{32}$/;
const SUBJECT_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_SUBSTRING_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const ADMIN_ROLE = "staff_admin" as const;
type AdminRole = typeof ADMIN_ROLE;
type CommandName =
  | "preflight"
  | "list-admins"
  | "invite-admin"
  | "disable-admin"
  | "enable-admin"
  | "revoke-admin"
  | "replace-admin-account";

interface Args {
  readonly apply: boolean;
  readonly command: CommandName;
  readonly configPath: string;
  readonly confirm?: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly expectedSubSha256?: string;
  readonly profile: string;
  readonly reason?: string;
  readonly selfTest: boolean;
  readonly adminId?: string;
}

interface StaffIdentityConfig {
  readonly mode?: unknown;
  readonly domainPrefix?: unknown;
  readonly venueId?: unknown;
}

interface DeployConfig {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly resourcePrefix: string;
  readonly staffIdentity: StaffIdentityConfig;
  readonly tags: Record<string, unknown>;
}

interface AwsClients {
  readonly cloudFormation: CloudFormationClient;
  readonly cognito: CognitoIdentityProviderClient;
  readonly rds: RDSDataClient;
  readonly secrets: SecretsManagerClient;
  readonly sts: STSClient;
}

interface RuntimeContext extends AwsClients {
  readonly clusterArn: string;
  readonly config: DeployConfig;
  readonly poolId: string;
  readonly secretArn: string;
  readonly stackName: string;
  readonly stackStatus: string;
}

interface StaffIdentityRow {
  readonly active: boolean;
  readonly displayName: string;
  readonly environment: string;
  readonly identityProvider: string;
  readonly mfaReplacementCandidateSubject: string | null;
  readonly mfaReplacementEmailHash: string | null;
  readonly mfaReplacementPendingAt: string | null;
  readonly mfaReplacementPreviousSubject: string | null;
  readonly mfaReplacementReason: string | null;
  readonly providerSubject: string;
  readonly revokedAt: string | null;
  readonly role: AdminRole;
  readonly staffIdentityId: string;
  readonly tokensValidAfter: string;
  readonly venueId: string;
}

interface SqlStatement {
  readonly parameters: readonly SqlParameter[];
  readonly sql: string;
}

interface CognitoStaffUser {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly enabled: boolean;
  readonly mfaSettings: readonly string[];
  readonly name: string;
  readonly providerSubject: string;
  readonly status: string;
  readonly username: string;
}

class PublicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  let command: CommandName | undefined;
  let configPath = DEFAULT_CONFIG_PATH;
  let confirm: string | undefined;
  let displayName: string | undefined;
  let email: string | undefined;
  let expectedSubSha256: string | undefined;
  let profile = DEFAULT_PROFILE;
  let reason: string | undefined;
  let selfTest = false;
  let adminId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (isPinOption(arg)) {
      throw new PublicError("PIN input is never accepted by the admin Cognito CLI; manage PIN staff in the admin app.");
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--self-test") {
      selfTest = true;
    } else if (arg === "--config") {
      configPath = nextValue(argv, ++index, "--config");
    } else if (arg === "--profile") {
      profile = nextValue(argv, ++index, "--profile");
    } else if (arg === "--confirm") {
      confirm = nextValue(argv, ++index, "--confirm");
    } else if (arg === "--email") {
      email = nextValue(argv, ++index, "--email");
    } else if (arg === "--expected-sub-sha256") {
      expectedSubSha256 = nextValue(argv, ++index, "--expected-sub-sha256");
    } else if (arg === "--display-name") {
      displayName = nextValue(argv, ++index, "--display-name");
    } else if (arg === "--reason") {
      reason = nextValue(argv, ++index, "--reason");
    } else if (arg === "--admin-id") {
      adminId = nextValue(argv, ++index, "--admin-id");
    } else if (!arg.startsWith("-") && isCommandName(arg) && !command) {
      command = arg;
    } else {
      throw new PublicError("Unknown or duplicate command-line argument.");
    }
  }

  if (!command && !selfTest) {
    throw new PublicError(
      "A command is required: preflight, list-admins, invite-admin, disable-admin, enable-admin, revoke-admin, or replace-admin-account.",
    );
  }

  return {
    apply,
    command: command ?? "preflight",
    configPath,
    confirm,
    displayName,
    email,
    expectedSubSha256,
    profile,
    reason,
    selfTest,
    adminId,
  };
}

function isPinOption(value: string): boolean {
  if (!value.startsWith("--")) return false;
  return value
    .slice(2)
    .split("=", 1)[0]
    .toLowerCase()
    .split("-")
    .includes("pin");
}

function nextValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new PublicError(`Missing value for ${option}.`);
  }
  return value;
}

function isCommandName(value: string): value is CommandName {
  return [
    "preflight",
    "list-admins",
    "invite-admin",
    "disable-admin",
    "enable-admin",
    "revoke-admin",
    "replace-admin-account",
  ].includes(value);
}

function isMutatingCommand(command: CommandName): boolean {
  return !["preflight", "list-admins"].includes(command);
}

function validateInvocation(args: Args): void {
  if (args.selfTest) return;

  const mutating = isMutatingCommand(args.command);
  if (!mutating && args.apply) {
    throw new PublicError("--apply is not valid for read-only commands.");
  }
  if (!args.apply && args.confirm) {
    throw new PublicError("--confirm is only valid together with --apply.");
  }
  const requiredConfirmation = args.command === "replace-admin-account"
    ? ACCOUNT_REPLACEMENT_CONFIRMATION
    : WRITE_CONFIRMATION;
  if (args.apply && args.confirm !== requiredConfirmation) {
    throw new PublicError(`Apply requires --confirm ${requiredConfirmation}.`);
  }

  if (args.command === "invite-admin") {
    normalizeEmail(requireValue(args.email, "--email"));
    validateDisplayName(requireValue(args.displayName, "--display-name"));
    if (args.adminId || args.expectedSubSha256 || args.reason) {
      throw new PublicError("invite-admin does not accept admin-id or account-replacement input.");
    }
    return;
  }

  if (args.command === "replace-admin-account") {
    validateStaffId(requireValue(args.adminId, "--admin-id"));
    normalizeEmail(requireValue(args.email, "--email"));
    const expectedSubSha256 = requireValue(args.expectedSubSha256, "--expected-sub-sha256");
    if (!SUBJECT_SHA256_PATTERN.test(expectedSubSha256)) {
      throw new PublicError("--expected-sub-sha256 must be a full SHA-256 fingerprint from the list command.");
    }
    if (args.reason !== ACCOUNT_REPLACEMENT_REASON) {
      throw new PublicError(`replace-admin-account requires --reason ${ACCOUNT_REPLACEMENT_REASON}.`);
    }
    if (args.displayName) {
      throw new PublicError("replace-admin-account does not accept display-name input.");
    }
    return;
  }

  if (["disable-admin", "enable-admin", "revoke-admin"].includes(args.command)) {
    validateStaffId(requireValue(args.adminId, "--admin-id"));
    if (args.email || args.displayName || args.expectedSubSha256 || args.reason) {
      throw new PublicError("This command does not accept email, display-name, or account-replacement input.");
    }
    return;
  }

  if (args.email || args.displayName || args.expectedSubSha256 || args.reason || args.adminId) {
    throw new PublicError("Read-only commands do not accept admin mutation arguments.");
  }
}

function requireValue(value: string | undefined, option: string): string {
  if (!value) throw new PublicError(`Missing required ${option}.`);
  return value;
}

async function afterLocalGuards<T>(args: Args, operation: () => Promise<T>): Promise<T> {
  validateInvocation(args);
  return operation();
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
    throw new PublicError("A valid admin email is required.");
  }
  return normalized;
}

function validateDisplayName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(normalized)) {
    throw new PublicError("Display name must be 1-120 characters without control characters.");
  }
  if (EMAIL_SUBSTRING_PATTERN.test(normalized)) {
    throw new PublicError("Display name must not contain an email address.");
  }
  return normalized;
}

function parseRole(value: string): AdminRole {
  if (value !== ADMIN_ROLE) {
    throw new PublicError("The Cognito CLI may only manage staff_admin identities.");
  }
  return ADMIN_ROLE;
}

function validateStaffId(value: string): string {
  if (!STAFF_ID_PATTERN.test(value)) {
    throw new PublicError("Admin identity id has an invalid format.");
  }
  return value;
}

function readConfig(configPath: string): DeployConfig {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!existsSync(resolved)) throw new PublicError("The selected infrastructure config does not exist.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new PublicError("The selected infrastructure config is not valid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.staffIdentity) || !isRecord(parsed.tags)) {
    throw new PublicError("The selected infrastructure config is missing staff identity metadata.");
  }

  const config: DeployConfig = {
    awsAccount: stringValue(parsed.awsAccount),
    awsRegion: stringValue(parsed.awsRegion),
    resourcePrefix: stringValue(parsed.resourcePrefix),
    staffIdentity: parsed.staffIdentity,
    tags: parsed.tags,
  };
  validateParkTestConfig(config);
  return config;
}

function validateParkTestConfig(config: DeployConfig): void {
  const domainPrefix = EXPECTED_DOMAIN.slice(8).split(".auth.")[0];
  const failures = [
    config.awsAccount === EXPECTED_ACCOUNT,
    config.awsRegion === EXPECTED_REGION,
    config.resourcePrefix === EXPECTED_RESOURCE_PREFIX,
    config.staffIdentity.mode === "pin",
    config.staffIdentity.domainPrefix === domainPrefix,
    config.staffIdentity.venueId === EXPECTED_VENUE_ID,
    config.tags["WRLDS:Client"] === "JumpYard",
    config.tags["WRLDS:Project"] === "jumpyard-check-in",
    config.tags["WRLDS:Environment"] === EXPECTED_ENVIRONMENT,
    config.tags["WRLDS:Owner"] === "love",
    config.tags["WRLDS:Repository"] === "wrlds-creations/jumpyard-check-in",
    config.tags["WRLDS:DataClassification"] === "confidential",
    config.tags["WRLDS:Exportable"] === "true",
    config.tags["WRLDS:CostCenter"] === "JumpYard",
  ];
  if (failures.some((valid) => !valid)) {
    throw new PublicError("Config is not the reviewed T0194 park-test target.");
  }
}

function buildClients(config: DeployConfig, profile: string): AwsClients {
  const credentials = fromIni({ profile });
  const shared = { credentials, region: config.awsRegion };
  return {
    cloudFormation: new CloudFormationClient(shared),
    cognito: new CognitoIdentityProviderClient(shared),
    rds: new RDSDataClient(shared),
    secrets: new SecretsManagerClient(shared),
    sts: new STSClient(shared),
  };
}

async function prepareRuntime(config: DeployConfig, profile: string): Promise<RuntimeContext> {
  const clients = buildClients(config, profile);
  const identity = await safeAws("AWS account preflight", () => clients.sts.send(new GetCallerIdentityCommand({})));
  if (identity.Account !== EXPECTED_ACCOUNT) {
    throw new PublicError("AWS account preflight did not match the reviewed park-test account.");
  }

  const stackName = `${EXPECTED_RESOURCE_PREFIX}-stack`;
  const response = await safeAws("CloudFormation output preflight", () =>
    clients.cloudFormation.send(new DescribeStacksCommand({ StackName: stackName })),
  );
  const stack = response.Stacks?.[0];
  if (!stack || !stack.StackStatus || !/^(CREATE|UPDATE|IMPORT)_COMPLETE$/.test(stack.StackStatus)) {
    throw new PublicError("The reviewed park-test stack is missing or not in a stable complete state.");
  }
  const outputs = Object.fromEntries(
    (stack.Outputs ?? [])
      .filter((output) => output.OutputKey && output.OutputValue)
      .map((output) => [String(output.OutputKey), String(output.OutputValue)]),
  );
  const poolId = outputs.AdminUserPoolId;
  const clientId = outputs.AdminUserPoolClientId;
  const domain = outputs.AdminUserPoolDomain;
  const clusterArn = outputs.OperationalDatabaseClusterArn;
  if (!poolId || !clientId || !domain || !clusterArn) {
    throw new PublicError("The stack is missing one or more reviewed T0194 outputs.");
  }
  if (!poolId.startsWith(`${EXPECTED_REGION}_`) || domain !== EXPECTED_DOMAIN) {
    throw new PublicError("The stack admin identity outputs do not match the reviewed T0194 target.");
  }
  if (!clusterArn.includes(`:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:cluster:`)) {
    throw new PublicError("The database output does not belong to the reviewed account and region.");
  }

  const secret = await safeAws("Aurora secret metadata preflight", () =>
    clients.secrets.send(new DescribeSecretCommand({ SecretId: EXPECTED_SECRET_NAME })),
  );
  if (!secret.ARN || !secret.ARN.includes(`:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:secret:`)) {
    throw new PublicError("The Aurora secret does not belong to the reviewed account and region.");
  }

  const runtime: RuntimeContext = {
    ...clients,
    clusterArn,
    config,
    poolId,
    secretArn: secret.ARN,
    stackName,
    stackStatus: stack.StackStatus,
  };
  const rows = await executeRows(runtime, registryReadyStatement(), "Aurora registry preflight");
  if (rows.length !== 1 || rows[0]?.registry_ready !== true) {
    throw new PublicError("The T0194 Aurora identity registry migration is not ready.");
  }
  return runtime;
}

async function safeAws<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new PublicError(`${label} failed; no AWS response details were printed.`);
  }
}

function stringParameter(name: string, value: string): SqlParameter {
  return { name, value: { stringValue: value } };
}

function registryReadyStatement(): SqlStatement {
  return {
    sql: "SELECT to_regclass('jumpyard.staff_identities') IS NOT NULL AS registry_ready",
    parameters: [],
  };
}

function listStatement(): SqlStatement {
  return {
    sql: `SELECT staff_identity_id, identity_provider, provider_subject, display_name, role,
                 environment, venue_id, active, revoked_at, tokens_valid_after,
                 mfa_replacement_pending_at, mfa_replacement_email_hash,
                 mfa_replacement_previous_subject, mfa_replacement_candidate_subject,
                 mfa_replacement_reason
           FROM jumpyard.staff_identities
           WHERE environment = :environment
             AND venue_id = :venueId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
           ORDER BY display_name, staff_identity_id`,
    parameters: [
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
    ],
  };
}

function selectIdentityStatement(staffIdentityId: string): SqlStatement {
  return {
    sql: `SELECT staff_identity_id, identity_provider, provider_subject, display_name, role,
                 environment, venue_id, active, revoked_at, tokens_valid_after,
                 mfa_replacement_pending_at, mfa_replacement_email_hash,
                 mfa_replacement_previous_subject, mfa_replacement_candidate_subject,
                 mfa_replacement_reason
            FROM jumpyard.staff_identities
           WHERE staff_identity_id = :staffIdentityId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
             AND environment = :environment
             AND venue_id = :venueId`,
    parameters: [
      stringParameter("staffIdentityId", staffIdentityId),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
    ],
  };
}

function inviteInsertStatement(input: {
  readonly displayName: string;
  readonly providerSubject: string;
  readonly staffIdentityId: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO jumpyard.staff_identities (
             staff_identity_id, identity_provider, provider_subject, display_name,
             role, environment, venue_id, active, revoked_at, tokens_valid_after
           ) VALUES (
             :staffIdentityId, 'cognito', :providerSubject, :displayName,
             'staff_admin', :environment, :venueId, true, NULL, now()
           )
           RETURNING staff_identity_id`,
    parameters: [
      stringParameter("staffIdentityId", input.staffIdentityId),
      stringParameter("providerSubject", input.providerSubject),
      stringParameter("displayName", input.displayName),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
    ],
  };
}

function disableStatement(staffIdentityId: string): SqlStatement {
  return updateStatement(
    "active = false, revoked_at = now(), tokens_valid_after = now(), updated_at = now()",
    staffIdentityId,
  );
}

function revokeStatement(staffIdentityId: string): SqlStatement {
  return updateStatement("tokens_valid_after = now(), updated_at = now()", staffIdentityId);
}

function enableStatement(staffIdentityId: string): SqlStatement {
  return updateStatement(
    "active = true, revoked_at = NULL, tokens_valid_after = now(), updated_at = now()",
    staffIdentityId,
  );
}

function beginMfaReplacementStatement(input: {
  readonly emailHash: string;
  readonly expectedProviderSubject: string;
  readonly staffIdentityId: string;
}): SqlStatement {
  return {
    sql: `UPDATE jumpyard.staff_identities
             SET active = false,
                 revoked_at = COALESCE(revoked_at, now()),
                 tokens_valid_after = now(),
                 mfa_replacement_pending_at = now(),
                 mfa_replacement_email_hash = :emailHash,
                 mfa_replacement_previous_subject = :expectedProviderSubject,
                 mfa_replacement_candidate_subject = NULL,
                 mfa_replacement_reason = :reason,
                 updated_at = now()
           WHERE staff_identity_id = :staffIdentityId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
             AND provider_subject = :expectedProviderSubject
             AND environment = :environment
             AND venue_id = :venueId
             AND (
               (active = true AND revoked_at IS NULL)
               OR (active = false AND revoked_at IS NOT NULL)
             )
             AND mfa_replacement_pending_at IS NULL
             AND mfa_replacement_email_hash IS NULL
             AND mfa_replacement_previous_subject IS NULL
             AND mfa_replacement_candidate_subject IS NULL
             AND mfa_replacement_reason IS NULL
           RETURNING staff_identity_id`,
    parameters: [
      stringParameter("emailHash", input.emailHash),
      stringParameter("staffIdentityId", input.staffIdentityId),
      stringParameter("expectedProviderSubject", input.expectedProviderSubject),
      stringParameter("reason", ACCOUNT_REPLACEMENT_REASON),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
    ],
  };
}

function recordMfaReplacementCandidateStatement(input: {
  readonly emailHash: string;
  readonly replacementProviderSubject: string;
  readonly staffIdentityId: string;
}): SqlStatement {
  return {
    sql: `UPDATE jumpyard.staff_identities
             SET mfa_replacement_candidate_subject = :replacementProviderSubject,
                 updated_at = now()
           WHERE staff_identity_id = :staffIdentityId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
             AND provider_subject = mfa_replacement_previous_subject
             AND environment = :environment
             AND venue_id = :venueId
             AND active = false
             AND revoked_at IS NOT NULL
             AND mfa_replacement_pending_at IS NOT NULL
             AND mfa_replacement_email_hash = :emailHash
             AND mfa_replacement_reason = :reason
             AND (
               mfa_replacement_candidate_subject IS NULL
               OR mfa_replacement_candidate_subject = :replacementProviderSubject
             )
           RETURNING staff_identity_id`,
    parameters: [
      stringParameter("replacementProviderSubject", input.replacementProviderSubject),
      stringParameter("staffIdentityId", input.staffIdentityId),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
      stringParameter("emailHash", input.emailHash),
      stringParameter("reason", ACCOUNT_REPLACEMENT_REASON),
    ],
  };
}

function bindMfaReplacementStatement(input: {
  readonly emailHash: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly previousProviderSubject: string;
  readonly replacementProviderSubject: string;
  readonly staffIdentityId: string;
}): SqlStatement {
  const eventPayload = JSON.stringify({
    environment: EXPECTED_ENVIRONMENT,
    newActorId: input.replacementProviderSubject,
    oldActorId: input.previousProviderSubject,
    reason: ACCOUNT_REPLACEMENT_REASON,
    staffIdentityId: input.staffIdentityId,
    venueId: EXPECTED_VENUE_ID,
  });
  return {
    sql: `WITH rebound AS (
            UPDATE jumpyard.staff_identities
               SET provider_subject = :replacementProviderSubject,
                   updated_at = now()
             WHERE staff_identity_id = :staffIdentityId
               AND identity_provider = 'cognito'
               AND role = 'staff_admin'
               AND provider_subject = :previousProviderSubject
               AND environment = :environment
               AND venue_id = :venueId
               AND active = false
               AND revoked_at IS NOT NULL
               AND mfa_replacement_pending_at IS NOT NULL
               AND mfa_replacement_email_hash = :emailHash
               AND mfa_replacement_previous_subject = :previousProviderSubject
               AND mfa_replacement_candidate_subject = :replacementProviderSubject
               AND mfa_replacement_reason = :reason
             RETURNING staff_identity_id
          ), audit AS (
            INSERT INTO jumpyard.event_log (
              event_id, correlation_id, event_type, subject_ref, summary, event_payload
            )
            SELECT
              :eventId,
              :correlationId,
              'staff.identity_account_replaced',
              rebound.staff_identity_id,
              'Admin Cognito account replaced for MFA recovery.',
              CAST(:eventPayload AS jsonb)
            FROM rebound
            RETURNING event_id
          )
          SELECT rebound.staff_identity_id
          FROM rebound
          INNER JOIN audit ON true`,
    parameters: [
      stringParameter("replacementProviderSubject", input.replacementProviderSubject),
      stringParameter("staffIdentityId", input.staffIdentityId),
      stringParameter("previousProviderSubject", input.previousProviderSubject),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
      stringParameter("emailHash", input.emailHash),
      stringParameter("reason", ACCOUNT_REPLACEMENT_REASON),
      stringParameter("eventId", input.eventId),
      stringParameter("correlationId", input.correlationId),
      stringParameter("eventPayload", eventPayload),
    ],
  };
}

function finalizeMfaReplacementStatement(input: {
  readonly emailHash: string;
  readonly previousProviderSubject: string;
  readonly replacementProviderSubject: string;
  readonly staffIdentityId: string;
}): SqlStatement {
  return {
    sql: `UPDATE jumpyard.staff_identities
             SET active = true,
                 revoked_at = NULL,
                 tokens_valid_after = now(),
                 mfa_replacement_pending_at = NULL,
                 mfa_replacement_email_hash = NULL,
                 mfa_replacement_previous_subject = NULL,
                 mfa_replacement_candidate_subject = NULL,
                 mfa_replacement_reason = NULL,
                 updated_at = now()
           WHERE staff_identity_id = :staffIdentityId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
             AND provider_subject = :replacementProviderSubject
             AND environment = :environment
             AND venue_id = :venueId
             AND active = false
             AND revoked_at IS NOT NULL
             AND mfa_replacement_pending_at IS NOT NULL
             AND mfa_replacement_email_hash = :emailHash
             AND mfa_replacement_previous_subject = :previousProviderSubject
             AND mfa_replacement_candidate_subject = :replacementProviderSubject
             AND mfa_replacement_reason = :reason
           RETURNING staff_identity_id`,
    parameters: [
      stringParameter("staffIdentityId", input.staffIdentityId),
      stringParameter("replacementProviderSubject", input.replacementProviderSubject),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
      stringParameter("emailHash", input.emailHash),
      stringParameter("previousProviderSubject", input.previousProviderSubject),
      stringParameter("reason", ACCOUNT_REPLACEMENT_REASON),
    ],
  };
}

function providerSubjectOwnerStatement(providerSubject: string): SqlStatement {
  return {
    // The database uniqueness boundary spans every Cognito identity in an environment,
    // so collision detection must not hide an anomalous non-admin Cognito row.
    sql: `SELECT staff_identity_id
           FROM jumpyard.staff_identities
           WHERE identity_provider = 'cognito'
             AND provider_subject = :providerSubject
             AND environment = :environment`,
    parameters: [
      stringParameter("providerSubject", providerSubject),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
    ],
  };
}

function updateStatement(setClause: string, staffIdentityId: string, extra: readonly SqlParameter[] = []): SqlStatement {
  return {
    sql: `UPDATE jumpyard.staff_identities
             SET ${setClause}
           WHERE staff_identity_id = :staffIdentityId
             AND identity_provider = 'cognito'
             AND role = 'staff_admin'
             AND environment = :environment
             AND venue_id = :venueId
           RETURNING staff_identity_id`,
    parameters: [
      ...extra,
      stringParameter("staffIdentityId", staffIdentityId),
      stringParameter("environment", EXPECTED_ENVIRONMENT),
      stringParameter("venueId", EXPECTED_VENUE_ID),
    ],
  };
}

async function executeRows(
  runtime: Pick<RuntimeContext, "clusterArn" | "rds" | "secretArn">,
  statement: SqlStatement,
  label: string,
): Promise<Record<string, unknown>[]> {
  const response = await safeAws(label, () =>
    runtime.rds.send(
      new ExecuteStatementCommand({
        database: DATABASE_NAME,
        formatRecordsAs: "JSON",
        parameters: [...statement.parameters],
        resourceArn: runtime.clusterArn,
        secretArn: runtime.secretArn,
        sql: statement.sql,
      }),
    ),
  );
  if (!response.formattedRecords) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.formattedRecords);
  } catch {
    throw new PublicError(`${label} returned an unreadable result.`);
  }
  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new PublicError(`${label} returned an unexpected result shape.`);
  }
  return parsed;
}

function deterministicStaffIdentityId(providerSubject: string): string {
  const digest = createHash("sha256")
    .update(`cognito:${EXPECTED_ENVIRONMENT}:${providerSubject}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `jy_staff_${digest}`;
}

function fingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12)}`;
}

function subjectSha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function emailHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toStaffIdentity(row: Record<string, unknown>): StaffIdentityRow {
  const role = parseRole(stringValue(row.role));
  const staffIdentityId = validateStaffId(stringValue(row.staff_identity_id));
  const identityProvider = stringValue(row.identity_provider);
  const providerSubject = stringValue(row.provider_subject);
  const environment = stringValue(row.environment);
  const venueId = stringValue(row.venue_id);
  const mfaReplacementPendingAt = nullableString(row.mfa_replacement_pending_at);
  const mfaReplacementEmailHash = nullableString(row.mfa_replacement_email_hash);
  const mfaReplacementPreviousSubject = nullableString(row.mfa_replacement_previous_subject);
  const mfaReplacementCandidateSubject = nullableString(row.mfa_replacement_candidate_subject);
  const mfaReplacementReason = nullableString(row.mfa_replacement_reason);
  if (identityProvider !== "cognito" || !providerSubject || environment !== EXPECTED_ENVIRONMENT || venueId !== EXPECTED_VENUE_ID) {
    throw new PublicError("The Aurora identity row is outside the reviewed T0194 identity boundary.");
  }
  const hasReplacement = Boolean(mfaReplacementPendingAt);
  const replacementRequiredFieldsMatch =
    Boolean(mfaReplacementEmailHash) === hasReplacement &&
    Boolean(mfaReplacementPreviousSubject) === hasReplacement &&
    Boolean(mfaReplacementReason) === hasReplacement;
  const providerSubjectMatchesReplacement =
    !hasReplacement ||
    providerSubject === mfaReplacementPreviousSubject ||
    (Boolean(mfaReplacementCandidateSubject) && providerSubject === mfaReplacementCandidateSubject);
  if (
    !replacementRequiredFieldsMatch ||
    (mfaReplacementEmailHash && !/^[a-f0-9]{64}$/.test(mfaReplacementEmailHash)) ||
    (hasReplacement && mfaReplacementReason !== ACCOUNT_REPLACEMENT_REASON) ||
    (hasReplacement && (row.active === true || !nullableString(row.revoked_at))) ||
    !providerSubjectMatchesReplacement ||
    (!hasReplacement && Boolean(mfaReplacementCandidateSubject))
  ) {
    throw new PublicError("The Aurora identity has an invalid fail-closed MFA replacement state.");
  }
  return {
    active: row.active === true,
    displayName: stringValue(row.display_name),
    environment,
    identityProvider,
    mfaReplacementCandidateSubject,
    mfaReplacementEmailHash,
    mfaReplacementPendingAt,
    mfaReplacementPreviousSubject,
    mfaReplacementReason,
    providerSubject,
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : stringValue(row.revoked_at),
    role,
    staffIdentityId,
    tokensValidAfter: stringValue(row.tokens_valid_after),
    venueId,
  };
}

function assertNoMfaReplacementPending(identity: StaffIdentityRow): void {
  if (identity.mfaReplacementPendingAt) {
    throw new PublicError(
      `MFA account replacement is pending for ${identity.staffIdentityId}; resume replace-admin-account instead.`,
    );
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : stringValue(value) || null;
}

async function readIdentity(runtime: RuntimeContext, staffIdentityId: string): Promise<StaffIdentityRow> {
  const rows = await executeRows(runtime, selectIdentityStatement(staffIdentityId), "Aurora identity lookup");
  if (rows.length !== 1) throw new PublicError("The requested staff_admin identity was not found in park-test.");
  return toStaffIdentity(rows[0]);
}

async function assertOneUpdated(runtime: RuntimeContext, statement: SqlStatement, label: string): Promise<void> {
  const rows = await executeRows(runtime, statement, label);
  if (rows.length !== 1) throw new PublicError(`${label} did not update exactly one park-test identity.`);
}

async function bestEffort(operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
}

function cognitoAttribute(
  attributes: readonly { readonly Name?: string; readonly Value?: string }[] | undefined,
  name: string,
): string {
  return attributes?.find((attribute) => attribute.Name === name)?.Value ?? "";
}

function mapCognitoStaffUser(input: {
  readonly attributes: readonly { readonly Name?: string; readonly Value?: string }[] | undefined;
  readonly enabled: boolean | undefined;
  readonly mfaSettings: readonly string[] | undefined;
  readonly status: string | undefined;
  readonly username: string | undefined;
}): CognitoStaffUser {
  const email = normalizeEmail(cognitoAttribute(input.attributes, "email"));
  const providerSubject = cognitoAttribute(input.attributes, "sub");
  const username = input.username ?? "";
  if (!providerSubject || !username) {
    throw new PublicError("Cognito returned an incomplete admin identity; reconciliation is required.");
  }
  return {
    email,
    emailVerified: cognitoAttribute(input.attributes, "email_verified") === "true",
    enabled: input.enabled === true,
    mfaSettings: [...(input.mfaSettings ?? [])],
    name: validateDisplayName(cognitoAttribute(input.attributes, "name")),
    providerSubject,
    status: input.status ?? "",
    username,
  };
}

async function readCognitoStaffUser(
  runtime: RuntimeContext,
  username: string,
): Promise<CognitoStaffUser | null> {
  try {
    const response = await runtime.cognito.send(
      new AdminGetUserCommand({ UserPoolId: runtime.poolId, Username: username }),
    );
    return mapCognitoStaffUser({
      attributes: response.UserAttributes,
      enabled: response.Enabled,
      mfaSettings: response.UserMFASettingList,
      status: response.UserStatus,
      username: response.Username,
    });
  } catch (error) {
    if (isRecord(error) && error.name === "UserNotFoundException") return null;
    throw new PublicError("Cognito admin identity lookup failed; no AWS response details were printed.");
  }
}

function assertMatchingReplacementIdentity(
  user: CognitoStaffUser,
  identity: StaffIdentityRow,
  expectedEmail: string,
): void {
  if (
    user.email !== expectedEmail ||
    !user.emailVerified ||
    user.name !== identity.displayName
  ) {
    throw new PublicError("The Cognito account does not match the reviewed admin identity and email input.");
  }
}

async function assertReplacementSubjectUnbound(
  runtime: RuntimeContext,
  providerSubject: string,
  allowedStaffIdentityId?: string,
): Promise<void> {
  const rows = await executeRows(
    runtime,
    providerSubjectOwnerStatement(providerSubject),
    "Aurora replacement subject preflight",
  );
  if (
    rows.length > 1 ||
    (rows.length === 1 && stringValue(rows[0]?.staff_identity_id) !== allowedStaffIdentityId)
  ) {
    throw new PublicError("The replacement Cognito subject is already registered to an admin identity.");
  }
}

async function createReplacementCognitoUser(
  runtime: RuntimeContext,
  email: string,
  displayName: string,
): Promise<CognitoStaffUser> {
  const created = await safeAws("Cognito replacement account creation", () =>
    runtime.cognito.send(
      new AdminCreateUserCommand({
        DesiredDeliveryMediums: ["EMAIL"],
        ForceAliasCreation: false,
        MessageAction: "SUPPRESS",
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: displayName },
        ],
        UserPoolId: runtime.poolId,
        Username: email,
      }),
    ),
  );
  try {
    return mapCognitoStaffUser({
      attributes: created.User?.Attributes,
      enabled: created.User?.Enabled,
      mfaSettings: undefined,
      status: created.User?.UserStatus,
      username: created.User?.Username,
    });
  } catch {
    const username = created.User?.Username ?? email;
    await bestEffort(() =>
      runtime.cognito.send(new AdminDeleteUserCommand({ UserPoolId: runtime.poolId, Username: username })),
    );
    throw new PublicError("Cognito returned an incomplete replacement identity; access remains denied.");
  }
}

async function runInvite(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const email = normalizeEmail(requireValue(args.email, "--email"));
  const displayName = validateDisplayName(requireValue(args.displayName, "--display-name"));
  const role = ADMIN_ROLE;
  if (!args.apply) {
    return dryRunResult(args.command, {
      emailFingerprint: fingerprint(email),
      plannedOrder: ["Cognito invitation", "Aurora identity registry", "delete Cognito user if registry write fails"],
      role,
    });
  }

  const created = await safeAws("Cognito admin invitation", () =>
    runtime.cognito.send(
      new AdminCreateUserCommand({
        DesiredDeliveryMediums: ["EMAIL"],
        ForceAliasCreation: false,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: displayName },
        ],
        UserPoolId: runtime.poolId,
        Username: email,
      }),
    ),
  );
  const providerSubject = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
  const createdUsername = created.User?.Username ?? email;
  if (!providerSubject) {
    const compensated = await bestEffort(() =>
      runtime.cognito.send(new AdminDeleteUserCommand({ UserPoolId: runtime.poolId, Username: createdUsername })),
    );
    throw new PublicError(
      compensated
        ? "Cognito returned no audit subject; the created user was removed."
        : "Cognito returned no audit subject and automatic removal failed; manual reconciliation is required.",
    );
  }

  const staffIdentityId = deterministicStaffIdentityId(providerSubject);
  try {
    await assertOneUpdated(
      runtime,
      inviteInsertStatement({ displayName, providerSubject, staffIdentityId }),
      "Aurora identity registry insert",
    );
  } catch {
    const compensated = await bestEffort(() =>
      runtime.cognito.send(new AdminDeleteUserCommand({ UserPoolId: runtime.poolId, Username: createdUsername })),
    );
    throw new PublicError(
      compensated
        ? "Aurora registration failed; the new Cognito user was removed safely."
        : `Aurora registration failed and Cognito cleanup failed; reconcile ${staffIdentityId} manually.`,
    );
  }
  return appliedResult(args.command, staffIdentityId, role);
}

async function runDisable(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const staffIdentityId = validateStaffId(requireValue(args.adminId, "--admin-id"));
  const identity = await readIdentity(runtime, staffIdentityId);
  assertNoMfaReplacementPending(identity);
  if (!args.apply) {
    return dryRunResult(args.command, {
      adminIdentityId: staffIdentityId,
      plannedOrder: ["Aurora deny and session invalidation", "Cognito global sign-out", "Cognito disable"],
    });
  }
  await assertOneUpdated(runtime, disableStatement(staffIdentityId), "Aurora identity disable");
  const signedOut = await bestEffort(() =>
    runtime.cognito.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: runtime.poolId, Username: identity.providerSubject }),
    ),
  );
  const disabled = await bestEffort(() =>
    runtime.cognito.send(new AdminDisableUserCommand({ UserPoolId: runtime.poolId, Username: identity.providerSubject })),
  );
  if (!signedOut || !disabled) {
    throw new PublicError(
      `Aurora access is denied for ${staffIdentityId}, but one or more Cognito steps need reconciliation.`,
    );
  }
  return appliedResult(args.command, staffIdentityId, identity.role);
}

async function runEnable(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const staffIdentityId = validateStaffId(requireValue(args.adminId, "--admin-id"));
  const identity = await readIdentity(runtime, staffIdentityId);
  if (identity.mfaReplacementPendingAt) {
    if (
      !identity.mfaReplacementCandidateSubject ||
      identity.providerSubject !== identity.mfaReplacementCandidateSubject ||
      !identity.mfaReplacementPreviousSubject ||
      !identity.mfaReplacementEmailHash
    ) {
      throw new PublicError(`Account replacement is not yet bound for ${staffIdentityId}; resume replace-admin-account first.`);
    }
    const replacement = await readCognitoStaffUser(runtime, identity.providerSubject);
    if (
      !replacement ||
      replacement.providerSubject !== identity.providerSubject ||
      replacement.name !== identity.displayName ||
      emailHash(replacement.email) !== identity.mfaReplacementEmailHash
    ) {
      throw new PublicError("The replacement Cognito account does not match the pending Aurora identity.");
    }
    if (replacement.status !== "CONFIRMED" || !replacement.mfaSettings.includes("SOFTWARE_TOKEN_MFA")) {
      throw new PublicError("The replacement account must finish password change and TOTP enrollment before enable.");
    }
    if (!args.apply) {
      return dryRunResult(args.command, {
        plannedOrder: [
          "verify confirmed Cognito account with SOFTWARE_TOKEN_MFA",
          "Cognito enable",
          "Aurora replacement-state clear and access enable",
          "Cognito re-disable if Aurora completion fails",
        ],
        adminIdentityId: staffIdentityId,
        replacementEnrollment: "verified",
      });
    }
    await safeAws("Cognito replacement account enable", () =>
      runtime.cognito.send(
        new AdminEnableUserCommand({ UserPoolId: runtime.poolId, Username: replacement.username }),
      ),
    );
    try {
      await assertOneUpdated(
        runtime,
        finalizeMfaReplacementStatement({
          emailHash: identity.mfaReplacementEmailHash,
          previousProviderSubject: identity.mfaReplacementPreviousSubject,
          replacementProviderSubject: identity.providerSubject,
          staffIdentityId,
        }),
        "Aurora MFA replacement enrollment enable",
      );
    } catch {
      const redisabled = await bestEffort(() =>
        runtime.cognito.send(
          new AdminDisableUserCommand({ UserPoolId: runtime.poolId, Username: replacement.username }),
        ),
      );
      throw new PublicError(
        redisabled
          ? `Aurora replacement enable failed; Cognito was re-disabled for ${staffIdentityId}.`
          : `Aurora replacement enable failed and Cognito re-disable needs reconciliation for ${staffIdentityId}.`,
      );
    }
    return appliedResult(args.command, staffIdentityId, identity.role);
  }
  if (!args.apply) {
    return dryRunResult(args.command, {
      adminIdentityId: staffIdentityId,
      plannedOrder: ["Cognito enable", "Aurora enable and token boundary reset", "re-disable Cognito if Aurora fails"],
    });
  }
  await safeAws("Cognito identity enable", () =>
    runtime.cognito.send(new AdminEnableUserCommand({ UserPoolId: runtime.poolId, Username: identity.providerSubject })),
  );
  try {
    await assertOneUpdated(runtime, enableStatement(staffIdentityId), "Aurora identity enable");
  } catch {
    const compensated = await bestEffort(() =>
      runtime.cognito.send(new AdminDisableUserCommand({ UserPoolId: runtime.poolId, Username: identity.providerSubject })),
    );
    throw new PublicError(
      compensated
        ? `Aurora enable failed; Cognito was re-disabled for ${staffIdentityId}.`
        : `Aurora enable failed and Cognito re-disable failed; reconcile ${staffIdentityId} immediately.`,
    );
  }
  return appliedResult(args.command, staffIdentityId, identity.role);
}

async function runRevoke(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const staffIdentityId = validateStaffId(requireValue(args.adminId, "--admin-id"));
  const identity = await readIdentity(runtime, staffIdentityId);
  assertNoMfaReplacementPending(identity);
  if (!args.apply) {
    return dryRunResult(args.command, {
      adminIdentityId: staffIdentityId,
      plannedOrder: ["Aurora token boundary reset and session invalidation", "Cognito global sign-out"],
    });
  }
  await assertOneUpdated(runtime, revokeStatement(staffIdentityId), "Aurora session revoke");
  const signedOut = await bestEffort(() =>
    runtime.cognito.send(
      new AdminUserGlobalSignOutCommand({ UserPoolId: runtime.poolId, Username: identity.providerSubject }),
    ),
  );
  if (!signedOut) {
    throw new PublicError(
      `Aurora sessions were revoked for ${staffIdentityId}, but Cognito sign-out needs reconciliation.`,
    );
  }
  return appliedResult(args.command, staffIdentityId, identity.role);
}

async function runReplaceAccount(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const staffIdentityId = validateStaffId(requireValue(args.adminId, "--admin-id"));
  const email = normalizeEmail(requireValue(args.email, "--email"));
  const expectedSubSha256 = requireValue(args.expectedSubSha256, "--expected-sub-sha256");
  const replacementEmailHash = emailHash(email);
  const identity = await readIdentity(runtime, staffIdentityId);
  const resuming = Boolean(identity.mfaReplacementPendingAt);
  const previousProviderSubject = resuming
    ? requireValue(identity.mfaReplacementPreviousSubject ?? undefined, "pending previous subject")
    : identity.providerSubject;

  if (subjectSha256(previousProviderSubject) !== expectedSubSha256) {
    throw new PublicError("The expected Cognito subject fingerprint does not match the selected admin identity.");
  }

  if (resuming) {
    if (
      identity.mfaReplacementEmailHash !== replacementEmailHash ||
      identity.mfaReplacementReason !== ACCOUNT_REPLACEMENT_REASON
    ) {
      throw new PublicError("The supplied email does not match the pending MFA replacement.");
    }
  } else {
    if (identity.active === Boolean(identity.revokedAt)) {
      throw new PublicError("The selected admin identity has an inconsistent active/revoked state.");
    }
    const current = await readCognitoStaffUser(runtime, previousProviderSubject);
    if (!current || current.providerSubject !== previousProviderSubject) {
      throw new PublicError("The current Cognito account could not be matched to this admin identity.");
    }
    assertMatchingReplacementIdentity(current, identity, email);
  }

  if (!args.apply) {
    return dryRunResult(args.command, {
      adminIdentityId: staffIdentityId,
      emailFingerprint: fingerprint(email),
      plannedOrder: [
        "Aurora deny, token-floor move, and session invalidation",
        "Cognito old-account sign-out, disable, and deletion",
        "suppressed Cognito replacement creation and durable candidate record",
        "atomic Aurora subject rebind plus old/new actor mapping audit",
        "replacement invitation while Aurora access remains denied",
        "separate enable only after CONFIRMED plus SOFTWARE_TOKEN_MFA",
      ],
      resuming,
      startingFromDisabled: !identity.active,
    });
  }

  if (!resuming) {
    await assertOneUpdated(
      runtime,
      beginMfaReplacementStatement({
        emailHash: replacementEmailHash,
        expectedProviderSubject: previousProviderSubject,
        staffIdentityId,
      }),
      "Aurora MFA replacement deny boundary",
    );
  }

  const oldUser = await readCognitoStaffUser(runtime, previousProviderSubject);
  if (oldUser) {
    if (oldUser.providerSubject !== previousProviderSubject) {
      throw new PublicError("The old Cognito subject changed unexpectedly; access remains denied.");
    }
    assertMatchingReplacementIdentity(oldUser, identity, email);
    await bestEffort(() =>
      runtime.cognito.send(
        new AdminUserGlobalSignOutCommand({ UserPoolId: runtime.poolId, Username: oldUser.username }),
      ),
    );
    await bestEffort(() =>
      runtime.cognito.send(new AdminDisableUserCommand({ UserPoolId: runtime.poolId, Username: oldUser.username })),
    );
    await safeAws("Cognito old MFA account deletion", () =>
      runtime.cognito.send(new AdminDeleteUserCommand({ UserPoolId: runtime.poolId, Username: oldUser.username })),
    );
  }

  let replacement = identity.mfaReplacementCandidateSubject
    ? await readCognitoStaffUser(runtime, identity.mfaReplacementCandidateSubject)
    : await readCognitoStaffUser(runtime, email);
  if (identity.mfaReplacementCandidateSubject && !replacement) {
    throw new PublicError("The durable replacement candidate is missing in Cognito; access remains denied.");
  }
  if (replacement) {
    if (replacement.providerSubject === previousProviderSubject) {
      throw new PublicError("The old Cognito account is still present; access remains denied.");
    }
    assertMatchingReplacementIdentity(replacement, identity, email);
  } else {
    replacement = await createReplacementCognitoUser(runtime, email, identity.displayName);
  }
  await assertReplacementSubjectUnbound(runtime, replacement.providerSubject, staffIdentityId);

  if (!identity.mfaReplacementCandidateSubject) {
    await assertOneUpdated(
      runtime,
      recordMfaReplacementCandidateStatement({
        emailHash: replacementEmailHash,
        replacementProviderSubject: replacement.providerSubject,
        staffIdentityId,
      }),
      "Aurora MFA replacement candidate record",
    );
  }

  const alreadyBound = identity.providerSubject === replacement.providerSubject;
  if (!alreadyBound) {
    const operationId = randomUUID().replace(/-/g, "");
    await assertOneUpdated(
      runtime,
      bindMfaReplacementStatement({
        correlationId: `t0194_admin_account_replacement_${operationId}`,
        emailHash: replacementEmailHash,
        eventId: `evt_t0194_admin_account_replacement_${operationId}`,
        previousProviderSubject,
        replacementProviderSubject: replacement.providerSubject,
        staffIdentityId,
      }),
      "Aurora MFA replacement subject bind and audit",
    );
  }

  const currentReplacement = await readCognitoStaffUser(runtime, replacement.providerSubject);
  if (!currentReplacement) {
    throw new PublicError("The bound replacement account disappeared before invitation; Aurora access remains denied.");
  }
  assertMatchingReplacementIdentity(currentReplacement, identity, email);
  if (currentReplacement.status === "FORCE_CHANGE_PASSWORD") {
    await safeAws("Cognito replacement account enable for enrollment", () =>
      runtime.cognito.send(
        new AdminEnableUserCommand({ UserPoolId: runtime.poolId, Username: currentReplacement.username }),
      ),
    );
    await safeAws("Cognito replacement invitation", () =>
      runtime.cognito.send(
        new AdminCreateUserCommand({
          DesiredDeliveryMediums: ["EMAIL"],
          MessageAction: "RESEND",
          UserPoolId: runtime.poolId,
          Username: currentReplacement.username,
        }),
      ),
    );
  } else if (currentReplacement.status !== "CONFIRMED") {
    throw new PublicError("The replacement account has an unsupported Cognito enrollment status.");
  }

  return {
    ...appliedResult(args.command, staffIdentityId, identity.role),
    access: "denied_pending_enrollment",
    nextCommand: "enable-admin",
  };
}

async function runList(runtime: RuntimeContext): Promise<Record<string, unknown>> {
  const rows = await executeRows(runtime, listStatement(), "Aurora identity list");
  return {
    admins: rows.map((row) => {
      const identity = toStaffIdentity(row);
      return {
        active: identity.active,
        accountReplacementExpectedSubSha256: subjectSha256(
          identity.mfaReplacementPreviousSubject ?? identity.providerSubject,
        ),
        displayName: redactSensitive(identity.displayName),
        mfaReplacementCandidateRecorded: Boolean(identity.mfaReplacementCandidateSubject),
        mfaReplacementPendingAt: identity.mfaReplacementPendingAt,
        providerSubjectFingerprint: fingerprint(identity.providerSubject),
        revokedAt: identity.revokedAt,
        role: identity.role,
        adminIdentityId: identity.staffIdentityId,
        tokensValidAfter: identity.tokensValidAfter,
        venueId: identity.venueId,
      };
    }),
    command: "list-admins",
    mode: "read-only",
    writesPerformed: false,
  };
}

function dryRunResult(command: CommandName, details: Record<string, unknown>): Record<string, unknown> {
  return { command, ...details, mode: "dry-run", writesPerformed: false };
}

function appliedResult(command: CommandName, staffIdentityId: string, role: AdminRole): Record<string, unknown> {
  return { adminIdentityId: staffIdentityId, command, mode: "apply", role, writesPerformed: true };
}

async function dispatch(args: Args, runtime: RuntimeContext): Promise<Record<string, unknown>> {
  if (args.command === "preflight") {
    return {
      account: EXPECTED_ACCOUNT,
      command: args.command,
      databaseRegistry: "ready",
      managedIdentityProvider: "cognito",
      managedRole: ADMIN_ROLE,
      mode: "read-only",
      region: EXPECTED_REGION,
      stackName: runtime.stackName,
      stackStatus: runtime.stackStatus,
      staffIdentityMode: "pin",
      venueId: EXPECTED_VENUE_ID,
      writesPerformed: false,
    };
  }
  if (args.command === "list-admins") return runList(runtime);
  if (args.command === "invite-admin") return runInvite(args, runtime);
  if (args.command === "disable-admin") return runDisable(args, runtime);
  if (args.command === "enable-admin") return runEnable(args, runtime);
  if (args.command === "revoke-admin") return runRevoke(args, runtime);
  return runReplaceAccount(args, runtime);
}

async function runCommand(args: Args): Promise<Record<string, unknown>> {
  return afterLocalGuards(args, async () => {
    const config = readConfig(args.configPath);
    const runtime = await prepareRuntime(config, args.profile);
    return dispatch(args, runtime);
  });
}

function redactSensitive(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}/g, "[redacted-token]");
}

function printResult(value: unknown): void {
  const serialized = JSON.stringify(value, null, 2);
  process.stdout.write(`${redactSensitive(serialized)}\n`);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fakeConfig(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    awsAccount: EXPECTED_ACCOUNT,
    awsRegion: EXPECTED_REGION,
    resourcePrefix: EXPECTED_RESOURCE_PREFIX,
    staffIdentity: {
      domainPrefix: "jumpyard-check-in-park-test-admin-376129878018",
      mode: "pin",
      venueId: EXPECTED_VENUE_ID,
    },
    tags: {
      "WRLDS:Client": "JumpYard",
      "WRLDS:CostCenter": "JumpYard",
      "WRLDS:DataClassification": "confidential",
      "WRLDS:Environment": EXPECTED_ENVIRONMENT,
      "WRLDS:Exportable": "true",
      "WRLDS:Owner": "love",
      "WRLDS:Project": "jumpyard-check-in",
      "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
    },
    ...overrides,
  };
}

async function runSelfTest(): Promise<void> {
  const validInvite = parseArgs([
    "invite-admin",
    "--email",
    "admin@example.com",
    "--display-name",
    "Admin One",
  ]);
  validateInvocation(validInvite);
  assert.equal(validInvite.apply, false);

  const invalidWrite = parseArgs([
    "invite-admin",
    "--email",
    "admin@example.com",
    "--display-name",
    "Admin One",
    "--apply",
    "--confirm",
    "WRONG",
  ]);
  let awsCalls = 0;
  await assert.rejects(
    afterLocalGuards(invalidWrite, async () => {
      awsCalls += 1;
      return undefined;
    }),
    /Apply requires/,
  );
  assert.equal(awsCalls, 0, "write guard must fail before any AWS call");

  const replacementSubject = "99999999-8888-7777-6666-555555555555";
  const replacementArgs = [
    "replace-admin-account",
    "--admin-id",
    `jy_staff_${"b".repeat(32)}`,
    "--email",
    "admin@example.com",
    "--expected-sub-sha256",
    subjectSha256(replacementSubject),
    "--reason",
    ACCOUNT_REPLACEMENT_REASON,
    "--apply",
    "--confirm",
  ];
  const wrongReplacementConfirmation = parseArgs([...replacementArgs, WRITE_CONFIRMATION]);
  await assert.rejects(
    afterLocalGuards(wrongReplacementConfirmation, async () => {
      awsCalls += 1;
      return undefined;
    }),
    new RegExp(ACCOUNT_REPLACEMENT_CONFIRMATION),
  );
  assert.equal(awsCalls, 0, "destructive replacement guard must fail before any AWS call");
  validateInvocation(parseArgs([...replacementArgs, ACCOUNT_REPLACEMENT_CONFIRMATION]));
  assert.throws(
    () =>
      validateInvocation(
        parseArgs([
          "replace-admin-account",
          "--admin-id",
          `jy_staff_${"b".repeat(32)}`,
          "--email",
          "admin@example.com",
          "--expected-sub-sha256",
          "sha256:short",
          "--reason",
          ACCOUNT_REPLACEMENT_REASON,
        ]),
      ),
    /full SHA-256/,
  );

  const approvedWrite = parseArgs([
    "disable-admin",
    "--admin-id",
    `jy_staff_${"a".repeat(32)}`,
    "--apply",
    "--confirm",
    WRITE_CONFIRMATION,
  ]);
  validateInvocation(approvedWrite);
  validateParkTestConfig(fakeConfig());
  assert.throws(() => validateParkTestConfig(fakeConfig({ awsAccount: "000000000000" })), /reviewed T0194/);
  assert.throws(
    () => validateParkTestConfig(fakeConfig({ tags: { ...fakeConfig().tags, "WRLDS:Environment": "prod" } })),
    /reviewed T0194/,
  );
  assert.throws(
    () =>
      validateParkTestConfig(
        fakeConfig({ staffIdentity: { ...fakeConfig().staffIdentity, venueId: "other-venue" } }),
      ),
    /reviewed T0194/,
  );
  assert.throws(
    () =>
      validateParkTestConfig(
        fakeConfig({ staffIdentity: { ...fakeConfig().staffIdentity, mode: "cognito" } }),
      ),
    /reviewed T0194/,
  );
  assert.throws(
    () =>
      validateParkTestConfig(
        fakeConfig({ staffIdentity: { ...fakeConfig().staffIdentity, domainPrefix: "wrong-domain" } }),
      ),
    /reviewed T0194/,
  );
  assert.equal(parseRole(ADMIN_ROLE), ADMIN_ROLE);
  assert.throws(() => parseRole("staff_operator"), /only manage staff_admin/);
  const pinValue = "sensitive-pin-placeholder";
  for (const pinArgs of [
    ["invite-admin", "--pin", pinValue],
    ["invite-admin", `--pin=${pinValue}`],
    ["invite-admin", "--pin-confirmation", pinValue],
    ["invite-admin", "--staff-pin", pinValue],
  ]) {
    assert.throws(
      () => parseArgs(pinArgs),
      (error: unknown) =>
        error instanceof PublicError &&
        /PIN input is never accepted/.test(error.message) &&
        !error.message.includes(pinValue),
    );
  }
  for (const legacyCommand of ["list", "invite", "set-role", "disable", "enable", "revoke", "replace-account"]) {
    assert.throws(() => parseArgs([legacyCommand]), /Unknown or duplicate/);
  }
  assert.throws(
    () => parseArgs(["invite-admin", "--role", "staff_operator"]),
    /Unknown or duplicate/,
  );
  assert.throws(
    () => parseArgs(["disable-admin", "--staff-id", `jy_staff_${"a".repeat(32)}`]),
    /Unknown or duplicate/,
  );
  assert.equal(awsCalls, 0, "PIN and legacy CLI input must fail before any AWS call");
  assert.throws(() => validateDisplayName("staff@example.com"), /must not contain an email/);
  assert.throws(() => validateDisplayName("Love staff@example.com"), /must not contain an email/);
  assert.throws(() => validateDisplayName("Staff\u0000Name"), /control characters/);

  const masked = redactSensitive("invite-admin admin@example.com token eyJabcdefghijklmnopqrstuv.abcdefghijk");
  assert.equal(masked.includes("admin@example.com"), false);
  assert.equal(masked.includes("eyJabcdefghijklmnopqrstuv"), false);
  assert.equal(fingerprint("admin@example.com").includes("admin@example.com"), false);

  const providerSubject = "11111111-2222-3333-4444-555555555555";
  const staffIdentityId = deterministicStaffIdentityId(providerSubject);
  assert.match(staffIdentityId, STAFF_ID_PATTERN);
  assert.equal(staffIdentityId, deterministicStaffIdentityId(providerSubject));
  assert.notEqual(staffIdentityId, deterministicStaffIdentityId(`${providerSubject}-other`));

  const insert = inviteInsertStatement({
    displayName: "Admin One",
    providerSubject,
    staffIdentityId,
  });
  assert.deepEqual(
    insert.parameters.map((parameter) => parameter.name),
    ["staffIdentityId", "providerSubject", "displayName", "environment", "venueId"],
  );
  assert.equal(JSON.stringify(insert.parameters).includes("admin@example.com"), false);
  assert.match(insert.sql, /identity_provider/);
  assert.match(insert.sql, /'staff_admin'/);
  assert.match(listStatement().sql, /role = 'staff_admin'/);
  assert.match(selectIdentityStatement(staffIdentityId).sql, /role = 'staff_admin'/);
  assert.match(disableStatement(staffIdentityId).sql, /active = false/);
  assert.match(disableStatement(staffIdentityId).sql, /role = 'staff_admin'/);
  assert.match(enableStatement(staffIdentityId).sql, /active = true/);
  assert.match(enableStatement(staffIdentityId).sql, /role = 'staff_admin'/);
  assert.doesNotMatch(revokeStatement(staffIdentityId).sql, /active = false/);
  assert.match(revokeStatement(staffIdentityId).sql, /role = 'staff_admin'/);

  const replacementEmailHash = emailHash("admin@example.com");
  const replacementProviderSubject = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const beginReplacement = beginMfaReplacementStatement({
    emailHash: replacementEmailHash,
    expectedProviderSubject: providerSubject,
    staffIdentityId,
  });
  assert.match(beginReplacement.sql, /active = false/);
  assert.match(beginReplacement.sql, /active = false AND revoked_at IS NOT NULL/);
  assert.match(beginReplacement.sql, /revoked_at = COALESCE\(revoked_at, now\(\)\)/);
  assert.match(beginReplacement.sql, /mfa_replacement_previous_subject = :expectedProviderSubject/);
  assert.match(beginReplacement.sql, /tokens_valid_after = now\(\)/);
  assert.match(beginReplacement.sql, /role = 'staff_admin'/);
  const candidateReplacement = recordMfaReplacementCandidateStatement({
    emailHash: replacementEmailHash,
    replacementProviderSubject,
    staffIdentityId,
  });
  assert.match(candidateReplacement.sql, /mfa_replacement_candidate_subject = :replacementProviderSubject/);
  assert.match(candidateReplacement.sql, /role = 'staff_admin'/);
  const bindReplacement = bindMfaReplacementStatement({
    correlationId: "t0194_self_test",
    emailHash: replacementEmailHash,
    eventId: "evt_t0194_self_test",
    previousProviderSubject: providerSubject,
    replacementProviderSubject,
    staffIdentityId,
  });
  assert.match(bindReplacement.sql, /WITH rebound AS/);
  assert.match(bindReplacement.sql, /staff\.identity_account_replaced/);
  assert.match(bindReplacement.sql, /INNER JOIN audit ON true/);
  assert.match(bindReplacement.sql, /provider_subject = :previousProviderSubject/);
  assert.match(bindReplacement.sql, /role = 'staff_admin'/);
  const finalizeReplacement = finalizeMfaReplacementStatement({
    emailHash: replacementEmailHash,
    previousProviderSubject: providerSubject,
    replacementProviderSubject,
    staffIdentityId,
  });
  assert.match(finalizeReplacement.sql, /mfa_replacement_pending_at = NULL/);
  assert.match(finalizeReplacement.sql, /mfa_replacement_candidate_subject = NULL/);
  assert.match(finalizeReplacement.sql, /active = true/);
  assert.match(finalizeReplacement.sql, /role = 'staff_admin'/);
  const replacementSqlParameters = JSON.stringify([
    ...beginReplacement.parameters,
    ...candidateReplacement.parameters,
    ...bindReplacement.parameters,
    ...finalizeReplacement.parameters,
  ]);
  assert.equal(replacementSqlParameters.includes("admin@example.com"), false);
  assert.equal(subjectSha256(providerSubject).length, "sha256:".length + 64);

  const commandSource = readFileSync(__filename, "utf8");
  const replacementFlow = commandSource.slice(
    commandSource.indexOf("async function runReplaceAccount"),
    commandSource.indexOf("async function runList"),
  );
  const replacementMarkers = [
    "beginMfaReplacementStatement({",
    "new AdminDeleteUserCommand",
    "createReplacementCognitoUser",
    "recordMfaReplacementCandidateStatement({",
    "bindMfaReplacementStatement({",
    'MessageAction: "RESEND"',
  ];
  for (let index = 1; index < replacementMarkers.length; index += 1) {
    assert.ok(
      replacementFlow.indexOf(replacementMarkers[index - 1]) < replacementFlow.indexOf(replacementMarkers[index]),
      `replacement flow order must keep ${replacementMarkers[index - 1]} before ${replacementMarkers[index]}`,
    );
  }
  assert.match(commandSource, /MessageAction: "SUPPRESS"/);
  const enableFlow = commandSource.slice(
    commandSource.indexOf("async function runEnable"),
    commandSource.indexOf("async function runRevoke"),
  );
  assert.ok(enableFlow.indexOf('replacement.status !== "CONFIRMED"') >= 0);
  assert.ok(enableFlow.indexOf('replacement.mfaSettings.includes("SOFTWARE_TOKEN_MFA")') >= 0);
  assert.ok(
    enableFlow.indexOf('replacement.mfaSettings.includes("SOFTWARE_TOKEN_MFA")') <
      enableFlow.indexOf("finalizeMfaReplacementStatement({"),
  );

  printResult({
    checks: {
      adminOnlyCognitoLifecycle: "pass",
      accountEnvironmentRoleAndVenue: "pass",
      deterministicOpaqueStaffIdentityId: "pass",
      masking: "pass",
      pinArgumentsRejected: "pass",
      resumableFailClosedTotpReplacement: "pass",
      noAwsCalls: awsCalls === 0,
      sqlParameters: "pass",
      dryRunApplyGuard: "pass",
    },
    mode: "self-test",
    writesPerformed: false,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    await runSelfTest();
    return;
  }
  printResult(await runCommand(args));
}

void main().catch((error: unknown) => {
  const message = error instanceof PublicError ? error.message : "Unexpected failure; no sensitive details were printed.";
  process.stderr.write(`${redactSensitive(message)}\n`);
  process.exitCode = 1;
});
