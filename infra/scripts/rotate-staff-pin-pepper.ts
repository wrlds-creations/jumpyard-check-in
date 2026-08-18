import assert from "assert/strict";
import { createHash, randomBytes, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import {
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  UpdateSecretVersionStageCommand,
} from "@aws-sdk/client-secrets-manager";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

const DATABASE = "jumpyard_cloud";
const DEFAULT_CONFIG_PATH = "./config/park-test.json";
const DEFAULT_PROFILE = "wrlds-dev";
const DEFAULT_MAX_IDENTITIES = 100;
const MAX_IDENTITIES_LIMIT = 5000;
const EXPECTED_ACCOUNT = "376129878018";
const EXPECTED_REGION = "eu-north-1";
const EXPECTED_ENVIRONMENT = "park-test";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const EXPECTED_CLUSTER_ARN =
  `arn:aws:rds:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:cluster:${EXPECTED_RESOURCE_PREFIX}-aurora`;
const APPLY_CONFIRMATION = "I_APPROVE_T0195_PIN_PEPPER_ROTATION_AND_STAFF_REENROLLMENT";
const PEPPER_PURPOSE = "staff-pin-pepper";
const SECRET_CACHE_SETTLE_SECONDS = 31;
const ALLOWED_REASONS = new Set(["credential_exposure", "emergency_response", "security_incident"]);

type CommandName = "plan" | "stage" | "require-reenrollment" | "promote";

interface Args {
  readonly apply: boolean;
  readonly changeId?: string;
  readonly command: CommandName;
  readonly configPath: string;
  readonly confirm?: string;
  readonly maxIdentities: number;
  readonly nextVersion?: number;
  readonly profile: string;
  readonly reason?: string;
  readonly selfTest: boolean;
}

interface DeployConfig {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly resourcePrefix: string;
  readonly staffIdentity: {
    readonly mode?: unknown;
    readonly venueId?: unknown;
  };
  readonly tags: Record<string, unknown>;
}

interface PepperContract {
  readonly pinPepper: string;
  readonly purpose: typeof PEPPER_PURPOSE;
  readonly version: number;
}

interface PepperVersion extends PepperContract {
  readonly versionId: string;
}

interface AwsClients {
  readonly cloudFormation: CloudFormationClient;
  readonly rds: RDSDataClient;
  readonly secrets: SecretsManagerClient;
  readonly sts: STSClient;
}

interface Runtime extends AwsClients {
  readonly adminSecretArn: string;
  readonly clusterArn: string;
  readonly config: DeployConfig;
  readonly environment: string;
  readonly pepperSecretArn: string;
  readonly pepperVersionStages: Record<string, string[] | undefined>;
  readonly stackName: string;
}

interface RotationState {
  readonly activeSessions: number;
  readonly enrolledCurrent: number;
  readonly localIdentities: number;
  readonly reenrollmentCurrent: number;
  readonly unsafeLocalIdentities: number;
}

class PublicError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PublicError";
  }
}

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  let changeId: string | undefined;
  let command: CommandName | undefined;
  let configPath = DEFAULT_CONFIG_PATH;
  let confirm: string | undefined;
  let maxIdentities = DEFAULT_MAX_IDENTITIES;
  let nextVersion: number | undefined;
  let profile = DEFAULT_PROFILE;
  let reason: string | undefined;
  let selfTest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (/^--(?:pin|pepper|secret-value)(?:=|$)/i.test(arg)) {
      throw new PublicError("PINs and secret material are never accepted as command-line input.");
    }
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--self-test") {
      selfTest = true;
    } else if (arg === "--config") {
      configPath = nextValue(argv, ++index, "--config");
    } else if (arg === "--profile") {
      profile = nextValue(argv, ++index, "--profile");
    } else if (arg === "--confirm") {
      confirm = nextValue(argv, ++index, "--confirm");
    } else if (arg === "--next-version") {
      nextVersion = positiveInteger(nextValue(argv, ++index, "--next-version"), "--next-version");
    } else if (arg === "--reason") {
      reason = nextValue(argv, ++index, "--reason");
    } else if (arg === "--change-id") {
      changeId = nextValue(argv, ++index, "--change-id");
    } else if (arg === "--max-identities") {
      maxIdentities = positiveInteger(nextValue(argv, ++index, "--max-identities"), "--max-identities");
    } else if (!arg.startsWith("-") && isCommandName(arg) && !command) {
      command = arg;
    } else {
      throw new PublicError("Unknown or duplicate command-line argument.");
    }
  }

  const resolvedCommand = command ?? "plan";
  if (selfTest && argv.length !== 1) {
    throw new PublicError("--self-test cannot be combined with operational arguments.");
  }
  if (maxIdentities > MAX_IDENTITIES_LIMIT) {
    throw new PublicError(`--max-identities must not exceed ${MAX_IDENTITIES_LIMIT}.`);
  }
  if (resolvedCommand === "plan" && apply) {
    throw new PublicError("The plan command never accepts --apply.");
  }
  if (resolvedCommand !== "plan") {
    if (!nextVersion) throw new PublicError("Rotation actions require --next-version.");
    if (!reason || !ALLOWED_REASONS.has(reason)) {
      throw new PublicError("Rotation actions require an approved security --reason.");
    }
    if (!changeId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/.test(changeId)) {
      throw new PublicError("Rotation actions require a non-PII --change-id using safe characters.");
    }
  }

  return {
    apply,
    changeId,
    command: resolvedCommand,
    configPath,
    confirm,
    maxIdentities,
    nextVersion,
    profile,
    reason,
    selfTest,
  };
}

function nextValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new PublicError(`${option} requires a value.`);
  return value;
}

function positiveInteger(value: string, option: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) throw new PublicError(`${option} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new PublicError(`${option} is outside the safe integer range.`);
  return parsed;
}

function isCommandName(value: string): value is CommandName {
  return value === "plan" || value === "stage" || value === "require-reenrollment" || value === "promote";
}

function loadConfig(configPath: string): DeployConfig {
  const resolved = path.resolve(configPath);
  if (!existsSync(resolved)) throw new PublicError("The selected infrastructure config does not exist.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf8"));
  } catch {
    throw new PublicError("The selected infrastructure config is not valid JSON.");
  }
  if (!isRecord(parsed) || !isRecord(parsed.staffIdentity) || !isRecord(parsed.tags)) {
    throw new PublicError("The selected infrastructure config is missing required identity or tag metadata.");
  }
  const config: DeployConfig = {
    awsAccount: stringValue(parsed.awsAccount),
    awsRegion: stringValue(parsed.awsRegion),
    resourcePrefix: stringValue(parsed.resourcePrefix),
    staffIdentity: parsed.staffIdentity,
    tags: parsed.tags,
  };
  validateConfig(config);
  return config;
}

function validateConfig(config: DeployConfig): void {
  const expectedTags: Record<string, string> = {
    "WRLDS:Client": "JumpYard",
    "WRLDS:Project": "jumpyard-check-in",
    "WRLDS:Environment": EXPECTED_ENVIRONMENT,
    "WRLDS:Owner": "love",
    "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
    "WRLDS:ManagedBy": "cdk",
    "WRLDS:DataClassification": "confidential",
    "WRLDS:Exportable": "true",
    "WRLDS:CostCenter": "JumpYard",
    "WRLDS:CreatedBy": "love",
  };
  if (
    config.awsAccount !== EXPECTED_ACCOUNT ||
    config.awsRegion !== EXPECTED_REGION ||
    config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX ||
    config.staffIdentity.mode !== "pin" ||
    stringValue(config.staffIdentity.venueId) !== "50871" ||
    Object.entries(expectedTags).some(([key, value]) => config.tags[key] !== value)
  ) {
    throw new PublicError("Config does not match the approved park-test identity and WRLDS metadata boundary.");
  }
}

function assertApplyAuthorized(args: Args): void {
  if (!args.apply || args.command === "plan") {
    throw new PublicError("A rotation write requires an explicit action and --apply.");
  }
  if (args.confirm !== APPLY_CONFIRMATION) {
    throw new PublicError(`A rotation write requires --confirm ${APPLY_CONFIRMATION}.`);
  }
}

function printLocalPlan(args: Args, config: DeployConfig): void {
  console.log(JSON.stringify({
    action: args.command,
    awsCalls: false,
    environment: config.tags["WRLDS:Environment"],
    externalWriteCheckpointRequired: true,
    maxIdentities: args.maxIdentities,
    mode: "local-plan",
    nextVersion: args.nextVersion ?? null,
    policy: "security-driven-only",
    sequence: [
      "stage-new-contract-as-AWSPENDING",
      "clear-local-PIN-material-and-revoke-all-staff-sessions-in-one-database-transaction",
      "advance-database-version-fence-then-promote-AWSPENDING-to-AWSCURRENT",
      `wait-${SECRET_CACHE_SETTLE_SECONDS}-seconds-before-admin-reenrollment`,
    ],
  }));
}

function buildClients(config: DeployConfig, profile: string): AwsClients {
  const credentials = fromIni({ profile });
  const shared = { credentials, region: config.awsRegion };
  return {
    cloudFormation: new CloudFormationClient(shared),
    rds: new RDSDataClient(shared),
    secrets: new SecretsManagerClient(shared),
    sts: new STSClient(shared),
  };
}

async function prepareRuntime(config: DeployConfig, profile: string): Promise<Runtime> {
  const clients = buildClients(config, profile);
  const caller = await safeAws("AWS identity preflight", () =>
    clients.sts.send(new GetCallerIdentityCommand({})),
  );
  if (caller.Account !== config.awsAccount) {
    throw new PublicError("AWS identity preflight did not match the approved account.");
  }

  const stackName = `${config.resourcePrefix}-stack`;
  const response = await safeAws("CloudFormation preflight", () =>
    clients.cloudFormation.send(new DescribeStacksCommand({ StackName: stackName })),
  );
  const stack = response.Stacks?.[0];
  if (!stack?.StackStatus || !/^(CREATE|UPDATE|IMPORT)_COMPLETE$/.test(stack.StackStatus)) {
    throw new PublicError("The approved park-test stack is missing or not stable.");
  }
  const stackTags = Object.fromEntries((stack.Tags ?? []).flatMap((tag) =>
    tag.Key && tag.Value ? [[tag.Key, tag.Value]] : [],
  ));
  for (const [key, value] of Object.entries(config.tags)) {
    if (typeof value !== "string" || stackTags[key] !== value) {
      throw new PublicError("CloudFormation stack tags do not match the reviewed WRLDS metadata.");
    }
  }
  const outputs = Object.fromEntries((stack.Outputs ?? []).flatMap((output) =>
    output.OutputKey && output.OutputValue ? [[output.OutputKey, output.OutputValue]] : [],
  ));
  const clusterArn = outputs.OperationalDatabaseClusterArn;
  assertExpectedClusterArn(clusterArn);

  const adminSecret = await safeAws("Aurora administrator secret metadata preflight", () =>
    clients.secrets.send(new DescribeSecretCommand({ SecretId: `/${config.resourcePrefix}/aurora/admin` })),
  );
  const pepperSecret = await safeAws("PIN-pepper secret metadata preflight", () =>
    clients.secrets.send(new DescribeSecretCommand({ SecretId: `/${config.resourcePrefix}/staff/auth` })),
  );
  const secretArnPrefix = `arn:aws:secretsmanager:${config.awsRegion}:${config.awsAccount}:secret:`;
  if (!adminSecret.ARN?.startsWith(secretArnPrefix) || !pepperSecret.ARN?.startsWith(secretArnPrefix)) {
    throw new PublicError("A required secret does not belong to the approved account and region.");
  }
  if (pepperSecret.RotationEnabled === true) {
    throw new PublicError("Scheduled PIN-pepper rotation must remain disabled.");
  }

  const runtime: Runtime = {
    ...clients,
    adminSecretArn: adminSecret.ARN,
    clusterArn,
    config,
    environment: EXPECTED_ENVIRONMENT,
    pepperSecretArn: pepperSecret.ARN,
    pepperVersionStages: pepperSecret.VersionIdsToStages ?? {},
    stackName,
  };
  const ready = await execute(runtime, `SELECT count(*)::bigint
    FROM information_schema.columns
    WHERE table_schema = 'jumpyard'
      AND table_name = 'staff_identities'
      AND column_name IN ('pin_pepper_version', 'pin_reenrollment_required_at')`);
  if (fieldNumber(ready.records?.[0]?.[0]) !== 2) {
    throw new PublicError("Migration 0012 is not applied; rotation remains blocked.");
  }
  const fenceReady = await execute(runtime, `SELECT count(*)::bigint
    FROM information_schema.columns
    WHERE table_schema = 'jumpyard'
      AND table_name = 'staff_pin_pepper_state'
      AND column_name IN ('environment', 'current_version')`);
  if (fieldNumber(fenceReady.records?.[0]?.[0]) !== 2) {
    throw new PublicError("The database PIN-pepper version fence is missing; rotation remains blocked.");
  }
  return runtime;
}

async function safeAws<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new PublicError(`${label} failed; no AWS or secret response details were printed.`);
  }
}

function assertExpectedClusterArn(clusterArn: string | undefined): asserts clusterArn is string {
  if (clusterArn !== EXPECTED_CLUSTER_ARN) {
    throw new PublicError("The stack database output is not the exact approved park-test Aurora cluster.");
  }
}

function versionIdForStage(
  versions: Record<string, string[] | undefined>,
  stage: "AWSCURRENT" | "AWSPENDING",
  required: boolean,
): string | null {
  const matches = Object.entries(versions)
    .filter(([, stages]) => stages?.includes(stage))
    .map(([versionId]) => versionId);
  if (matches.length > 1 || (required && matches.length !== 1)) {
    throw new PublicError(`${stage} secret-stage metadata is missing or ambiguous.`);
  }
  return matches[0] ?? null;
}

async function readPepperVersion(
  runtime: Runtime,
  versionId: string,
  stage: "AWSCURRENT" | "AWSPENDING",
): Promise<PepperVersion> {
  const response = await safeAws(`${stage} PIN-pepper contract read`, () =>
    runtime.secrets.send(new GetSecretValueCommand({
      SecretId: runtime.pepperSecretArn,
      VersionId: versionId,
      VersionStage: stage,
    })),
  );
  if (!response.SecretString || response.VersionId !== versionId) {
    throw new PublicError(`${stage} PIN-pepper contract is incomplete.`);
  }
  return { ...parsePepperContract(response.SecretString), versionId };
}

function parsePepperContract(secretString: string): PepperContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    throw new PublicError("The PIN-pepper secret is not a valid versioned contract.");
  }
  if (!isRecord(parsed)) throw new PublicError("The PIN-pepper secret contract is invalid.");
  const pinPepper = stringValue(parsed.pinPepper);
  const purpose = stringValue(parsed.purpose);
  const version = typeof parsed.version === "number" ? parsed.version : Number.NaN;
  if (
    purpose !== PEPPER_PURPOSE ||
    Buffer.byteLength(pinPepper, "utf8") < 32 ||
    !Number.isSafeInteger(version) ||
    version <= 0
  ) {
    throw new PublicError("The PIN-pepper secret contract is invalid.");
  }
  return { pinPepper, purpose: PEPPER_PURPOSE, version };
}

async function stagePending(args: Args, runtime: Runtime): Promise<Record<string, unknown>> {
  const nextVersion = requiredNextVersion(args);
  const currentId = versionIdForStage(runtime.pepperVersionStages, "AWSCURRENT", true);
  if (!currentId) throw new PublicError("AWSCURRENT PIN-pepper metadata is missing.");
  const current = await readPepperVersion(runtime, currentId, "AWSCURRENT");
  if (nextVersion !== current.version + 1) {
    throw new PublicError("--next-version must be exactly one greater than AWSCURRENT.");
  }

  const existingPendingId = versionIdForStage(runtime.pepperVersionStages, "AWSPENDING", false);
  if (existingPendingId) {
    const pending = await readPepperVersion(runtime, existingPendingId, "AWSPENDING");
    if (pending.version !== nextVersion) {
      throw new PublicError("An unrelated AWSPENDING version already exists; rotation is blocked.");
    }
    return safeResult(args.command, {
      currentVersion: current.version,
      nextVersion,
      status: "already_staged",
      versionIdFingerprint: fingerprint(existingPendingId),
    });
  }

  const contract: PepperContract = {
    pinPepper: randomBytes(48).toString("base64url"),
    purpose: PEPPER_PURPOSE,
    version: nextVersion,
  };
  const response = await safeAws("AWSPENDING PIN-pepper staging", () =>
    runtime.secrets.send(new PutSecretValueCommand({
      ClientRequestToken: randomUUID(),
      SecretId: runtime.pepperSecretArn,
      SecretString: JSON.stringify(contract),
      VersionStages: ["AWSPENDING"],
    })),
  );
  if (!response.VersionId) throw new PublicError("Secrets Manager did not return staged-version evidence.");
  return safeResult(args.command, {
    currentVersion: current.version,
    nextVersion,
    status: "staged",
    versionIdFingerprint: fingerprint(response.VersionId),
  });
}

async function requireReenrollment(args: Args, runtime: Runtime): Promise<Record<string, unknown>> {
  const nextVersion = requiredNextVersion(args);
  const currentId = versionIdForStage(runtime.pepperVersionStages, "AWSCURRENT", true);
  const pendingId = versionIdForStage(runtime.pepperVersionStages, "AWSPENDING", true);
  if (!currentId || !pendingId) throw new PublicError("AWSCURRENT/AWSPENDING metadata is incomplete.");
  const current = await readPepperVersion(runtime, currentId, "AWSCURRENT");
  const pending = await readPepperVersion(runtime, pendingId, "AWSPENDING");
  if (pending.version !== nextVersion || current.version + 1 !== nextVersion) {
    throw new PublicError("The staged/current PIN-pepper versions do not match the approved transition.");
  }

  const begin = await safeAws("Rotation database transaction start", () =>
    runtime.rds.send(new BeginTransactionCommand(databaseInput(runtime))),
  );
  let transactionId = begin.transactionId;
  if (!transactionId) throw new PublicError("Rotation database transaction did not start.");
  try {
    await execute(runtime, promotionLockSql(), [], transactionId);
    const databaseVersion = await loadDatabasePepperVersion(runtime, transactionId);
    if (databaseVersion !== current.version) {
      throw new PublicError("The database PIN-pepper fence does not match AWSCURRENT; no row was changed.");
    }
    const before = await loadRotationState(runtime, current.version, transactionId);
    assertSafeCurrentState(before);
    if (before.enrolledCurrent > args.maxIdentities) {
      throw new PublicError("The locked local identity count exceeds --max-identities; no row was changed.");
    }
    if (before.enrolledCurrent === 0 && before.activeSessions === 0) {
      await safeAws("Rotation database transaction commit", () =>
        runtime.rds.send(new CommitTransactionCommand({
          ...databaseInput(runtime),
          transactionId,
        })),
      );
      transactionId = undefined;
      return safeResult(args.command, {
        affectedLocalIdentities: 0,
        revokedStaffSessions: 0,
        status: "already_requires_reenrollment",
        version: current.version,
      });
    }

    const identities = await execute(
      runtime,
      requireReenrollmentSql(),
      [
        stringParameter("environment", runtime.environment),
        longParameter("currentVersion", current.version),
      ],
      transactionId,
    );
    const affectedLocalIdentities = identities.numberOfRecordsUpdated ?? 0;
    if (
      affectedLocalIdentities !== before.enrolledCurrent
      || affectedLocalIdentities > args.maxIdentities
    ) {
      throw new PublicError("The locked identity mutation count exceeded or differed from the reviewed maximum.");
    }
    const sessions = await execute(
      runtime,
      revokeAllStaffSessionsSql(),
      [stringParameter("environment", runtime.environment)],
      transactionId,
    );
    const after = await loadRotationState(runtime, current.version, transactionId);
    if (after.enrolledCurrent !== 0 || after.unsafeLocalIdentities !== 0 || after.activeSessions !== 0) {
      throw new PublicError("Post-change rotation verification failed; the database transaction was rolled back.");
    }

    const directlyRevokedStaffSessions = sessions.numberOfRecordsUpdated ?? 0;
    const revokedStaffSessions = before.activeSessions;
    if (directlyRevokedStaffSessions > revokedStaffSessions) {
      throw new PublicError("Staff-session revocation evidence was inconsistent; the transaction was rolled back.");
    }
    await execute(
      runtime,
      rotationAuditSql(),
      [
        stringParameter("eventId", `jyevt_${randomUUID().replaceAll("-", "")}`),
        stringParameter("correlationId", fingerprint(requiredChangeId(args))),
        stringParameter("subjectRef", `staff-pin-pepper:${runtime.environment}`),
        stringParameter("eventPayload", JSON.stringify({
          affectedLocalIdentities,
          changeIdFingerprint: fingerprint(requiredChangeId(args)),
          fromVersion: current.version,
          reason: args.reason,
          revokedStaffSessions,
          toVersion: nextVersion,
        })),
      ],
      transactionId,
    );
    await safeAws("Rotation database transaction commit", () =>
      runtime.rds.send(new CommitTransactionCommand({
        ...databaseInput(runtime),
        transactionId,
      })),
    );
    transactionId = undefined;
    return safeResult(args.command, {
      affectedLocalIdentities,
      nextVersion,
      revokedStaffSessions,
      status: "reenrollment_required",
    });
  } catch (error) {
    if (transactionId) {
      try {
        await runtime.rds.send(new RollbackTransactionCommand({
          ...databaseInput(runtime),
          transactionId,
        }));
      } catch {
        // Preserve the original safe error; Aurora closes abandoned transactions.
      }
    }
    throw error;
  }
}

async function promotePending(args: Args, runtime: Runtime): Promise<Record<string, unknown>> {
  const nextVersion = requiredNextVersion(args);
  const currentId = versionIdForStage(runtime.pepperVersionStages, "AWSCURRENT", true);
  if (!currentId) throw new PublicError("AWSCURRENT PIN-pepper metadata is missing.");
  const current = await readPepperVersion(runtime, currentId, "AWSCURRENT");
  const pendingId = versionIdForStage(runtime.pepperVersionStages, "AWSPENDING", false);

  if (current.version === nextVersion) {
    if (pendingId && pendingId !== currentId) {
      throw new PublicError("An unrelated AWSPENDING version exists after promotion; cleanup is blocked.");
    }
    await ensureDatabasePepperFence(runtime, nextVersion - 1, nextVersion);
    if (pendingId === currentId) await removePendingStage(runtime, currentId);
    return safeResult(args.command, {
      nextVersion,
      reEnrollmentReadyAfterSeconds: SECRET_CACHE_SETTLE_SECONDS,
      status: "already_promoted",
    });
  }
  if (current.version + 1 !== nextVersion || !pendingId) {
    throw new PublicError("The current/pending secret stages do not match the approved promotion.");
  }
  const pending = await readPepperVersion(runtime, pendingId, "AWSPENDING");
  if (pending.version !== nextVersion) {
    throw new PublicError("AWSPENDING does not contain the approved next version.");
  }
  await ensureDatabasePepperFence(runtime, current.version, nextVersion);
  await safeAws("AWSPENDING promotion", () => runtime.secrets.send(new UpdateSecretVersionStageCommand({
    MoveToVersionId: pendingId,
    RemoveFromVersionId: currentId,
    SecretId: runtime.pepperSecretArn,
    VersionStage: "AWSCURRENT",
  })));
  await removePendingStage(runtime, pendingId);
  return safeResult(args.command, {
    nextVersion,
    reEnrollmentReadyAfterSeconds: SECRET_CACHE_SETTLE_SECONDS,
    status: "promoted",
    versionIdFingerprint: fingerprint(pendingId),
  });
}

async function ensureDatabasePepperFence(
  runtime: Runtime,
  previousVersion: number,
  nextVersion: number,
): Promise<void> {
  const begin = await safeAws("Promotion database transaction start", () =>
    runtime.rds.send(new BeginTransactionCommand(databaseInput(runtime))),
  );
  let transactionId = begin.transactionId;
  if (!transactionId) throw new PublicError("Promotion database transaction did not start.");
  try {
    await execute(runtime, promotionLockSql(), [], transactionId);
    const readiness = await loadPromotionReadiness(runtime, transactionId);
    if (readiness.unpreparedLocalIdentities !== 0 || readiness.activeSessions !== 0) {
      throw new PublicError("PIN material or staff sessions remain active; promotion is blocked.");
    }
    const databaseVersion = await loadDatabasePepperVersion(runtime, transactionId);
    if (databaseVersion !== previousVersion && databaseVersion !== nextVersion) {
      throw new PublicError("The database PIN-pepper fence is outside the approved transition.");
    }
    if (databaseVersion === previousVersion) {
      const advanced = await execute(
        runtime,
        advanceDatabasePepperFenceSql(),
        [
          stringParameter("environment", runtime.environment),
          longParameter("previousVersion", previousVersion),
          longParameter("nextVersion", nextVersion),
        ],
        transactionId,
      );
      if (fieldNumber(advanced.records?.[0]?.[0]) !== nextVersion) {
        throw new PublicError("The database PIN-pepper fence did not advance atomically.");
      }
    }
    await safeAws("Promotion database transaction commit", () =>
      runtime.rds.send(new CommitTransactionCommand({
        ...databaseInput(runtime),
        transactionId,
      })),
    );
    transactionId = undefined;
  } catch (error) {
    if (transactionId) {
      try {
        await runtime.rds.send(new RollbackTransactionCommand({
          ...databaseInput(runtime),
          transactionId,
        }));
      } catch {
        // Preserve the original safe error; Aurora closes abandoned transactions.
      }
    }
    throw error;
  }
}

async function removePendingStage(runtime: Runtime, versionId: string): Promise<void> {
  await safeAws("AWSPENDING stage cleanup", () => runtime.secrets.send(new UpdateSecretVersionStageCommand({
    RemoveFromVersionId: versionId,
    SecretId: runtime.pepperSecretArn,
    VersionStage: "AWSPENDING",
  })));
}

async function loadRotationState(
  runtime: Runtime,
  currentVersion: number,
  transactionId?: string,
): Promise<RotationState> {
  const response = await execute(
    runtime,
    rotationStateSql(),
    [
      stringParameter("environment", runtime.environment),
      longParameter("currentVersion", currentVersion),
    ],
    transactionId,
  );
  const record = response.records?.[0];
  return {
    activeSessions: fieldNumber(record?.[4]),
    enrolledCurrent: fieldNumber(record?.[1]),
    localIdentities: fieldNumber(record?.[0]),
    reenrollmentCurrent: fieldNumber(record?.[2]),
    unsafeLocalIdentities: fieldNumber(record?.[3]),
  };
}

function assertSafeCurrentState(state: RotationState): void {
  if (state.unsafeLocalIdentities !== 0) {
    throw new PublicError("Local PIN version state is inconsistent; no row was changed.");
  }
  if (state.enrolledCurrent + state.reenrollmentCurrent !== state.localIdentities) {
    throw new PublicError("Local PIN state counts are inconsistent; no row was changed.");
  }
}

async function loadPromotionReadiness(runtime: Runtime, transactionId?: string): Promise<{
  activeSessions: number;
  unpreparedLocalIdentities: number;
}> {
  const response = await execute(
    runtime,
    promotionReadinessSql(),
    [stringParameter("environment", runtime.environment)],
    transactionId,
  );
  const record = response.records?.[0];
  return {
    activeSessions: fieldNumber(record?.[1]),
    unpreparedLocalIdentities: fieldNumber(record?.[0]),
  };
}

async function loadDatabasePepperVersion(runtime: Runtime, transactionId?: string): Promise<number> {
  const response = await execute(
    runtime,
    databasePepperVersionSql(),
    [stringParameter("environment", runtime.environment)],
    transactionId,
  );
  if (response.records?.length !== 1) {
    throw new PublicError("The database PIN-pepper fence is missing or ambiguous.");
  }
  return fieldNumber(response.records[0]?.[0]);
}

function promotionLockSql(): string {
  return `LOCK TABLE jumpyard.staff_pin_pepper_state, jumpyard.staff_identities, jumpyard.staff_auth_sessions
  IN SHARE ROW EXCLUSIVE MODE NOWAIT`;
}

function databasePepperVersionSql(): string {
  return `SELECT current_version
  FROM jumpyard.staff_pin_pepper_state
  WHERE environment = :environment`;
}

function advanceDatabasePepperFenceSql(): string {
  return `UPDATE jumpyard.staff_pin_pepper_state
  SET current_version = :nextVersion,
      updated_at = now()
  WHERE environment = :environment
    AND current_version = :previousVersion
  RETURNING current_version`;
}

function rotationStateSql(): string {
  return `SELECT
    count(*) FILTER (
      WHERE identity_provider = 'local_pin' AND anonymized_at IS NULL
    )::bigint AS local_identities,
    count(*) FILTER (
      WHERE identity_provider = 'local_pin'
        AND anonymized_at IS NULL
        AND pin_pepper_version = :currentVersion
        AND pin_reenrollment_required_at IS NULL
        AND pin_lookup_hash IS NOT NULL
        AND pin_verifier IS NOT NULL
        AND pin_changed_at IS NOT NULL
    )::bigint AS enrolled_current,
    count(*) FILTER (
      WHERE identity_provider = 'local_pin'
        AND anonymized_at IS NULL
        AND pin_pepper_version = :currentVersion
        AND pin_reenrollment_required_at IS NOT NULL
        AND pin_lookup_hash IS NULL
        AND pin_verifier IS NULL
        AND pin_changed_at IS NULL
    )::bigint AS reenrollment_current,
    count(*) FILTER (
      WHERE identity_provider = 'local_pin'
        AND anonymized_at IS NULL
        AND NOT (
          pin_pepper_version = :currentVersion
          AND (
            (
              pin_reenrollment_required_at IS NULL
              AND pin_lookup_hash IS NOT NULL
              AND pin_verifier IS NOT NULL
              AND pin_changed_at IS NOT NULL
            )
            OR (
              pin_reenrollment_required_at IS NOT NULL
              AND pin_lookup_hash IS NULL
              AND pin_verifier IS NULL
              AND pin_changed_at IS NULL
            )
          )
        )
    )::bigint AS unsafe_local_identities,
    (
      SELECT count(*)::bigint
      FROM jumpyard.staff_auth_sessions AS staff_session
      WHERE staff_session.environment = :environment
        AND staff_session.revoked_at IS NULL
    ) AS active_sessions
  FROM jumpyard.staff_identities AS identity
  WHERE identity.environment = :environment`;
}

function requireReenrollmentSql(): string {
  return `UPDATE jumpyard.staff_identities
  SET pin_lookup_hash = NULL,
      pin_verifier = NULL,
      pin_changed_at = NULL,
      pin_reenrollment_required_at = COALESCE(pin_reenrollment_required_at, now()),
      tokens_valid_after = GREATEST(tokens_valid_after, now()),
      updated_at = now()
  WHERE identity_provider = 'local_pin'
    AND environment = :environment
    AND anonymized_at IS NULL
    AND pin_pepper_version = :currentVersion
    AND pin_reenrollment_required_at IS NULL`;
}

function revokeAllStaffSessionsSql(): string {
  return `UPDATE jumpyard.staff_auth_sessions
  SET revoked_at = COALESCE(revoked_at, now()),
      revoke_reason = COALESCE(revoke_reason, 'pin_pepper_rotation'),
      updated_at = now()
  WHERE environment = :environment
    AND revoked_at IS NULL`;
}

function promotionReadinessSql(): string {
  return `SELECT
    count(*) FILTER (
      WHERE identity_provider = 'local_pin'
        AND anonymized_at IS NULL
        AND (
          pin_reenrollment_required_at IS NULL
          OR pin_lookup_hash IS NOT NULL
          OR pin_verifier IS NOT NULL
          OR pin_changed_at IS NOT NULL
        )
    )::bigint AS unprepared_local_identities,
    (
      SELECT count(*)::bigint
      FROM jumpyard.staff_auth_sessions AS staff_session
      WHERE staff_session.environment = :environment
        AND staff_session.revoked_at IS NULL
    ) AS active_sessions
  FROM jumpyard.staff_identities AS identity
  WHERE identity.environment = :environment`;
}

function rotationAuditSql(): string {
  return `INSERT INTO jumpyard.event_log (
    event_id, correlation_id, event_type, subject_ref, summary, event_payload
  ) VALUES (
    :eventId,
    :correlationId,
    'staff.pin_pepper_reenrollment_required',
    :subjectRef,
    'Security-driven PIN-pepper rotation invalidated staff sessions and requires local PIN re-enrollment.',
    CAST(:eventPayload AS jsonb)
  )`;
}

async function execute(
  runtime: Runtime,
  sql: string,
  parameters: SqlParameter[] = [],
  transactionId?: string,
) {
  return safeAws("Aurora Data API operation", () => runtime.rds.send(new ExecuteStatementCommand({
    ...databaseInput(runtime),
    parameters,
    sql,
    transactionId,
  })));
}

function databaseInput(runtime: Runtime) {
  return {
    database: DATABASE,
    resourceArn: runtime.clusterArn,
    secretArn: runtime.adminSecretArn,
  };
}

function stringParameter(name: string, value: string): SqlParameter {
  return { name, value: { stringValue: value } };
}

function longParameter(name: string, value: number): SqlParameter {
  return { name, value: { longValue: value } };
}

function fieldNumber(field: Field | undefined): number {
  const value = field?.longValue ?? (field?.stringValue && /^\d+$/.test(field.stringValue)
    ? Number(field.stringValue)
    : Number.NaN);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PublicError("Aurora did not return the expected aggregate count.");
  }
  return value;
}

function safeResult(action: CommandName, detail: Record<string, unknown>): Record<string, unknown> {
  return {
    action,
    aggregateOnly: true,
    containsPinOrSecretMaterial: false,
    externalWriteCheckpointRequired: true,
    ...detail,
  };
}

function requiredNextVersion(args: Args): number {
  if (!args.nextVersion) throw new PublicError("--next-version is required.");
  return args.nextVersion;
}

function requiredChangeId(args: Args): string {
  if (!args.changeId) throw new PublicError("--change-id is required.");
  return args.changeId;
}

function fingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function runSelfTest(): void {
  const plan = parseArgs([]);
  assert.equal(plan.command, "plan");
  assert.equal(plan.apply, false);
  assert.throws(() => parseArgs(["stage", "--next-version", "2", "--reason", "scheduled", "--change-id", "issue-194"]));
  assert.throws(() => parseArgs(["stage", "--pin", "123456"]));
  const staged = parseArgs([
    "stage",
    "--next-version", "2",
    "--reason", "security_incident",
    "--change-id", "issue-194",
  ]);
  assert.equal(staged.apply, false);
  assert.throws(() => assertApplyAuthorized(staged));
  assert.doesNotThrow(() => assertExpectedClusterArn(EXPECTED_CLUSTER_ARN));
  assert.throws(
    () => assertExpectedClusterArn(
      `arn:aws:rds:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:cluster:wrong-park-test-aurora`,
    ),
    /exact approved park-test Aurora cluster/,
  );
  const applied = parseArgs([
    "stage",
    "--apply",
    "--confirm", APPLY_CONFIRMATION,
    "--next-version", "2",
    "--reason", "security_incident",
    "--change-id", "issue-194",
  ]);
  assert.doesNotThrow(() => assertApplyAuthorized(applied));
  assert.deepEqual(parsePepperContract(JSON.stringify({
    pinPepper: "x".repeat(48),
    purpose: PEPPER_PURPOSE,
    version: 2,
  })), {
    pinPepper: "x".repeat(48),
    purpose: PEPPER_PURPOSE,
    version: 2,
  });
  assert.throws(() => parsePepperContract(JSON.stringify({
    pinPepper: "x".repeat(48),
    purpose: PEPPER_PURPOSE,
  })));
  assert.match(requireReenrollmentSql(), /identity_provider = 'local_pin'/);
  assert.match(requireReenrollmentSql(), /pin_lookup_hash = NULL/);
  assert.match(requireReenrollmentSql(), /pin_verifier = NULL/);
  assert.match(revokeAllStaffSessionsSql(), /WHERE environment = :environment/);
  assert.doesNotMatch(revokeAllStaffSessionsSql(), /identity_provider/);
  assert.match(promotionReadinessSql(), /pin_reenrollment_required_at IS NULL/);
  assert.match(
    promotionLockSql(),
    /LOCK TABLE jumpyard\.staff_pin_pepper_state, jumpyard\.staff_identities, jumpyard\.staff_auth_sessions[\s\S]*SHARE ROW EXCLUSIVE MODE NOWAIT/,
  );
  assert.match(databasePepperVersionSql(), /SELECT current_version[\s\S]*WHERE environment = :environment/);
  assert.match(
    advanceDatabasePepperFenceSql(),
    /SET current_version = :nextVersion[\s\S]*AND current_version = :previousVersion[\s\S]*RETURNING current_version/,
  );
  assert.match(rotationAuditSql(), /staff\.pin_pepper_reenrollment_required/);
  console.log("T0195 PIN-pepper lifecycle CLI self-test passed (no AWS calls).");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }
  const config = loadConfig(args.configPath);
  if (!args.apply) {
    printLocalPlan(args, config);
    return;
  }
  assertApplyAuthorized(args);
  const runtime = await prepareRuntime(config, args.profile);
  const result = args.command === "stage"
    ? await stagePending(args, runtime)
    : args.command === "require-reenrollment"
      ? await requireReenrollment(args, runtime)
      : await promotePending(args, runtime);
  console.log(JSON.stringify(result));
}

void main().catch((error: unknown) => {
  const message = error instanceof PublicError
    ? error.message
    : "PIN-pepper lifecycle command failed safely; no secret value was printed.";
  console.error(message);
  process.exitCode = 1;
});
