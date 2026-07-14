import { createHash, randomBytes } from "crypto";
import { execFileSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import { ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";
import { fromIni } from "@aws-sdk/credential-providers";

const ISSUE_NUMBER = 194;
const DEFAULT_CONFIG_PATH = "./config/park-test.json";
const DEFAULT_DATABASE = "jumpyard_cloud";
const EXPECTED_ACCOUNT = "376129878018";
const EXPECTED_REGION = "eu-north-1";
const EXPECTED_ENVIRONMENT = "park-test";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const EXPECTED_ENGINE = "aurora-postgresql";
const EXPECTED_ENGINE_VERSION = "16.13";
const EXPECTED_BACKUP_RETENTION_DAYS = 7;
const EXPECTED_LIFECYCLE_POLICY_VERSION = "t0195-v1";
const MAX_LIFECYCLE_MUTATIONS = 5000;
const GLOBAL_APPROVAL_ENV = "T0195_EXTERNAL_WRITE_APPROVAL";
const GLOBAL_APPROVAL = "I_APPROVE_T0195_EXTERNAL_AWS_WRITE_CHECKPOINT";
const VERIFY_SECRET_ENV = "T0195_RESTORE_VERIFICATION_SECRET_ARN";
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const ACTION_APPROVALS = {
  cleanup: {
    environmentVariable: "T0195_AURORA_CLEANUP_APPROVAL",
    phrase: "I_APPROVE_DELETING_ISOLATED_PARK_TEST_RESTORE",
  },
  "delete-snapshot": {
    environmentVariable: "T0195_AURORA_SNAPSHOT_DELETE_APPROVAL",
    phrase: "I_APPROVE_DELETING_PARK_TEST_PRECHANGE_SNAPSHOT",
  },
  restore: {
    environmentVariable: "T0195_AURORA_RESTORE_APPROVAL",
    phrase: "I_APPROVE_ISOLATED_PARK_TEST_AURORA_RESTORE",
  },
  snapshot: {
    environmentVariable: "T0195_AURORA_SNAPSHOT_APPROVAL",
    phrase: "I_APPROVE_PARK_TEST_PRECHANGE_SNAPSHOT",
  },
} as const;

const REQUIRED_TAGS: Readonly<Record<string, string>> = {
  "WRLDS:Client": "JumpYard",
  "WRLDS:Project": "jumpyard-check-in",
  "WRLDS:Environment": EXPECTED_ENVIRONMENT,
  "WRLDS:Owner": "love",
  "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
  "WRLDS:ManagedBy": "cdk",
  "WRLDS:DataClassification": "confidential",
  "WRLDS:Exportable": "true",
  "WRLDS:CostCenter": "unassigned",
  "WRLDS:CreatedBy": "love",
};

type Action = "cleanup" | "delete-snapshot" | "plan" | "restore" | "snapshot" | "verify";
type RestoreSource = "latest" | "snapshot" | "time";
type RecoveryStage =
  | "cluster-available"
  | "cleaned"
  | "cleanup-started"
  | "failed"
  | "isolation-created"
  | "planned"
  | "verified"
  | "writer-available";

interface Args {
  readonly action: Action;
  readonly aggregateJson: boolean;
  readonly apply: boolean;
  readonly configPath: string;
  readonly json: boolean;
  readonly lifecycleEvidencePath?: string;
  readonly profile?: string;
  readonly restoreSource: RestoreSource;
  readonly restoreToTime?: string;
  readonly runId?: string;
  readonly selfTest: boolean;
  readonly snapshotIdentifier?: string;
  readonly stateFile?: string;
}

interface DeployConfig {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly resourcePrefix: string;
  readonly safetyGates: {
    readonly emergencyStop: boolean;
    readonly guestMessagingSendsEnabled: boolean;
    readonly rollerBookingDraftWritesEnabled: boolean;
    readonly rollerRedeemWritesEnabled: boolean;
    readonly rollerWebhookProcessingEnabled: boolean;
    readonly staffAuthEnabled: boolean;
  };
  readonly tags: Record<string, string>;
}

interface AwsTag {
  readonly Key?: string;
  readonly Value?: string;
}

interface DbClusterSummary {
  readonly arn: string;
  readonly backupRetentionDays: number;
  readonly copyTagsToSnapshot: boolean;
  readonly databaseName: string;
  readonly dbSubnetGroupName: string;
  readonly deletionProtection: boolean;
  readonly engine: string;
  readonly engineVersion: string;
  readonly earliestRestorableTime: string;
  readonly httpEndpointEnabled: boolean;
  readonly identifier: string;
  readonly kmsKeyId: string;
  readonly latestRestorableTime: string;
  readonly port: number;
  readonly status: string;
  readonly storageEncrypted: boolean;
  readonly vpcId: string;
  readonly vpcSecurityGroupIds: readonly string[];
  readonly writerIdentifier: string;
}

interface RestoreNames {
  readonly clusterIdentifier: string;
  readonly isolationSecurityGroupName: string;
  readonly snapshotIdentifier: string;
  readonly writerIdentifier: string;
}

interface RecoveryState {
  readonly account: string;
  readonly createdAt: string;
  readonly environment: "park-test";
  readonly failureStage?: string;
  readonly issue: 194;
  readonly lifecycleEvidenceDigest?: string;
  readonly lifecycleReapplied: boolean;
  readonly observedRecoverySeconds?: number;
  readonly observedSourceDataAgeSeconds?: number;
  readonly region: string;
  readonly restoreAvailableAt?: string;
  readonly restoreClusterArn?: string;
  readonly restoreClusterIdentifier: string;
  readonly restoreSource: RestoreSource;
  readonly restoreStartedAt: string;
  readonly restoreToTime?: string;
  readonly runId: string;
  readonly schemaVersion: 1;
  readonly snapshotIdentifier?: string;
  readonly sourceClusterIdentifier: string;
  readonly sourceDataTime?: string;
  readonly sourceEngineVersion: string;
  readonly sourceSecurityGroupIds: readonly string[];
  readonly stage: RecoveryStage;
  readonly temporaryIsolationSecurityGroupId?: string;
  readonly temporaryIsolationSecurityGroupName: string;
  readonly trafficEligible: false;
  readonly verifiedAt?: string;
  readonly writerIdentifier: string;
}

interface LifecycleEvidence {
  readonly action?: unknown;
  readonly affectedCountsDigest?: unknown;
  readonly affectedTotal?: unknown;
  readonly aggregateOnly?: unknown;
  readonly clusterArn?: unknown;
  readonly clusterIdentifier?: unknown;
  readonly completedAt?: unknown;
  readonly containsSensitiveData?: unknown;
  readonly environment?: unknown;
  readonly issue?: unknown;
  readonly planDigest?: unknown;
  readonly policyDefinitionDigest?: unknown;
  readonly policyVersion?: unknown;
  readonly referenceAt?: unknown;
  readonly result?: unknown;
  readonly runId?: unknown;
  readonly schemaVersion?: unknown;
}

interface ValidatedLifecycleEvidence {
  readonly affectedCountsDigest: string;
  readonly affectedTotal: number;
  readonly clusterArn: string;
  readonly clusterIdentifier: string;
  readonly completedAt: string;
  readonly digest: string;
  readonly environment: "park-test-restore-rehearsal";
  readonly planDigest: string;
  readonly policyDefinitionDigest: string;
  readonly policyVersion: "t0195-v1";
  readonly referenceAt: string;
  readonly runId: string;
}

interface LifecycleDatabaseRun {
  readonly affectedCountsDigest: string;
  readonly affectedTotal: number;
  readonly clusterArn: string;
  readonly clusterIdentifier: string;
  readonly completedAt: string;
  readonly environment: "park-test-restore-rehearsal";
  readonly planDigest: string;
  readonly policyDefinitionDigest: string;
  readonly policyVersion: "t0195-v1";
  readonly referenceAt: string;
  readonly runId: string;
}

interface TableAggregate {
  readonly aggregateFingerprint: string;
  readonly rowCount: number;
  readonly tableName: string;
}

interface DbClusterApiResponse {
  readonly DBClusters?: readonly DbClusterRecord[];
}

interface DbClusterRecord {
    readonly BackupRetentionPeriod?: number;
    readonly CopyTagsToSnapshot?: boolean;
    readonly DatabaseName?: string;
    readonly DBClusterArn?: string;
    readonly DBClusterIdentifier?: string;
    readonly DBClusterMembers?: readonly {
      readonly DBInstanceIdentifier?: string;
      readonly IsClusterWriter?: boolean;
    }[];
    readonly DBSubnetGroup?: string;
    readonly DeletionProtection?: boolean;
    readonly EarliestRestorableTime?: string;
    readonly EnableHttpEndpoint?: boolean;
    readonly Engine?: string;
    readonly EngineVersion?: string;
    readonly LatestRestorableTime?: string;
    readonly KmsKeyId?: string;
    readonly Port?: number;
    readonly Status?: string;
    readonly StorageEncrypted?: boolean;
    readonly TagList?: readonly AwsTag[];
    readonly VpcSecurityGroups?: readonly { readonly VpcSecurityGroupId?: string }[];
}

interface DbInstanceRecord {
  readonly DBClusterIdentifier?: string;
  readonly DBInstanceArn?: string;
  readonly DBInstanceIdentifier?: string;
  readonly DBInstanceStatus?: string;
  readonly Engine?: string;
  readonly EngineVersion?: string;
  readonly PubliclyAccessible?: boolean;
}

interface DbInstanceApiResponse {
  readonly DBInstances?: readonly DbInstanceRecord[];
}

interface DbSnapshotApiResponse {
  readonly DBClusterSnapshots?: readonly {
    readonly DBClusterIdentifier?: string;
    readonly DBClusterSnapshotArn?: string;
    readonly DBClusterSnapshotIdentifier?: string;
    readonly Engine?: string;
    readonly EngineVersion?: string;
    readonly PercentProgress?: number;
    readonly SnapshotCreateTime?: string;
    readonly Status?: string;
    readonly StorageEncrypted?: boolean;
  }[];
}

interface Ec2SecurityGroupApiResponse {
  readonly SecurityGroups?: readonly {
    readonly GroupId?: string;
    readonly GroupName?: string;
    readonly IpPermissions?: readonly unknown[];
    readonly Tags?: readonly AwsTag[];
    readonly VpcId?: string;
  }[];
}

interface CreateSecurityGroupApiResponse {
  readonly GroupId?: string;
}

interface ListTagsApiResponse {
  readonly TagList?: readonly AwsTag[];
}

interface StsApiResponse {
  readonly Account?: string;
  readonly Arn?: string;
}

function parseArgs(argv: readonly string[]): Args {
  let action: Action = "plan";
  let aggregateJson = false;
  let apply = false;
  let configPath = DEFAULT_CONFIG_PATH;
  let json = false;
  let lifecycleEvidencePath: string | undefined;
  let profile: string | undefined;
  let restoreSource: RestoreSource = "latest";
  let restoreToTime: string | undefined;
  let runId: string | undefined;
  let selfTest = false;
  let snapshotIdentifier: string | undefined;
  let stateFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--action") {
      const value = requiredNext(argv, index, arg);
      if (!["cleanup", "delete-snapshot", "plan", "restore", "snapshot", "verify"].includes(value)) {
        throw new Error(`Unsupported --action ${value}.`);
      }
      action = value as Action;
      index += 1;
      continue;
    }
    if (arg === "--aggregate-json") {
      aggregateJson = true;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--config") {
      configPath = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--lifecycle-evidence") {
      lifecycleEvidencePath = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--restore-source") {
      const value = requiredNext(argv, index, arg);
      if (!["latest", "snapshot", "time"].includes(value)) {
        throw new Error("--restore-source must be latest, snapshot, or time.");
      }
      restoreSource = value as RestoreSource;
      index += 1;
      continue;
    }
    if (arg === "--restore-to-time") {
      restoreToTime = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--run-id") {
      runId = requiredNext(argv, index, arg).toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }
    if (arg === "--snapshot-id") {
      snapshotIdentifier = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--state-file") {
      stateFile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (selfTest && argv.length !== 1) {
    throw new Error("--self-test cannot be combined with other arguments.");
  }
  if ((action === "plan" || action === "verify") && apply) {
    throw new Error(`--apply is not valid for ${action}.`);
  }
  if (!["cleanup", "delete-snapshot", "restore", "snapshot"].includes(action) && !selfTest && action !== "plan" && action !== "verify") {
    throw new Error(`Action ${action} is unsupported.`);
  }
  if (action === "restore" && restoreSource === "snapshot" && !snapshotIdentifier) {
    throw new Error("Snapshot restore requires --snapshot-id.");
  }
  if (action === "restore" && restoreSource !== "snapshot" && snapshotIdentifier) {
    throw new Error("--snapshot-id is valid only with --restore-source snapshot.");
  }
  if (action === "delete-snapshot" && !snapshotIdentifier) {
    throw new Error("Snapshot deletion requires --snapshot-id.");
  }
  if (snapshotIdentifier && !["delete-snapshot", "restore"].includes(action)) {
    throw new Error(`--snapshot-id is not valid for ${action}.`);
  }
  if (action === "restore" && restoreSource === "time" && !restoreToTime) {
    throw new Error("Timed restore requires --restore-to-time.");
  }
  if (restoreSource !== "time" && restoreToTime) {
    throw new Error("--restore-to-time is valid only with --restore-source time.");
  }
  if (lifecycleEvidencePath && action !== "verify") {
    throw new Error("--lifecycle-evidence is valid only for verify.");
  }
  if (aggregateJson && action !== "verify") {
    throw new Error("--aggregate-json is valid only for verify.");
  }
  if (stateFile && !["cleanup", "restore", "verify"].includes(action)) {
    throw new Error(`--state-file is not valid for ${action}.`);
  }

  return {
    action,
    aggregateJson,
    apply,
    configPath,
    json,
    lifecycleEvidencePath,
    profile,
    restoreSource,
    restoreToTime,
    runId,
    selfTest,
    snapshotIdentifier,
    stateFile,
  };
}

function requiredNext(argv: readonly string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`Missing value for ${arg}.`);
  return value;
}

function readConfig(configPath: string): DeployConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  if (!existsSync(resolvedPath)) throw new Error(`Config file does not exist: ${resolvedPath}`);
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<DeployConfig>;
  if (!parsed.awsAccount || !parsed.awsRegion || !parsed.resourcePrefix || !parsed.safetyGates || !parsed.tags) {
    throw new Error("Config must include account, region, prefix, safety gates, and tags.");
  }
  const config: DeployConfig = {
    awsAccount: parsed.awsAccount,
    awsRegion: parsed.awsRegion,
    resourcePrefix: parsed.resourcePrefix,
    safetyGates: parsed.safetyGates,
    tags: parsed.tags,
  };
  validateConfig(config);
  return config;
}

function validateConfig(config: DeployConfig): void {
  const errors: string[] = [];
  if (config.awsAccount !== EXPECTED_ACCOUNT) errors.push(`awsAccount must be ${EXPECTED_ACCOUNT}.`);
  if (config.awsRegion !== EXPECTED_REGION) errors.push(`awsRegion must be ${EXPECTED_REGION}.`);
  if (config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX) {
    errors.push(`resourcePrefix must be ${EXPECTED_RESOURCE_PREFIX}.`);
  }
  const gates = config.safetyGates;
  if (gates.emergencyStop !== true) errors.push("The normal park-test emergency stop must be true.");
  for (const [name, value] of Object.entries(gates)) {
    if (name !== "emergencyStop" && value !== false) errors.push(`${name} must be false.`);
  }
  for (const [key, expected] of Object.entries(REQUIRED_TAGS)) {
    if (config.tags[key] !== expected) errors.push(`${key} must be ${expected}.`);
  }
  if (Object.values(config.tags).some((value) => /prod(?:uction)?/i.test(value))) {
    errors.push("Production tags are forbidden in the park-test recovery tool.");
  }
  if (errors.length > 0) throw new Error(errors.join(" "));
}

function generatedRunId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
  return `${timestamp}-${randomBytes(3).toString("hex")}`;
}

function validateRunId(runId: string, requireFresh = false, now = new Date()): void {
  const match = runId.match(/^(20\d{6})t(\d{6})z-([a-z0-9]{6})$/);
  if (!match) {
    throw new Error("run id must use YYYYMMDDtHHMMSSz- plus six lowercase letters/numbers.");
  }
  const datePart = match[1];
  const timePart = match[2];
  const parsed = new Date(
    `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}T` +
      `${timePart.slice(0, 2)}:${timePart.slice(2, 4)}:${timePart.slice(4, 6)}Z`,
  );
  if (!Number.isFinite(parsed.getTime())) throw new Error("run id contains an invalid UTC timestamp.");
  const canonicalTimestamp = parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
  if (!runId.startsWith(`${canonicalTimestamp}-`)) {
    throw new Error("run id contains a non-existent UTC date or time.");
  }
  if (requireFresh && Math.abs(now.getTime() - parsed.getTime()) > 24 * 60 * 60 * 1000) {
    throw new Error("Mutation run id must be generated within the last 24 hours.");
  }
}

function validateMutationRunId(
  action: keyof typeof ACTION_APPROVALS,
  runId: string,
  now = new Date(),
): void {
  validateRunId(runId, action === "snapshot" || action === "restore", now);
}

function buildNames(runId: string): RestoreNames {
  validateRunId(runId);
  const restorePrefix = `jy-park-test-restore-${runId}`;
  const names: RestoreNames = {
    clusterIdentifier: `${restorePrefix}-aurora`,
    isolationSecurityGroupName: `${restorePrefix}-isolation`,
    snapshotIdentifier: `jy-park-test-prechange-${runId}`,
    writerIdentifier: `${restorePrefix}-writer`,
  };
  for (const [kind, value] of Object.entries(names)) validateAwsName(kind, value);
  return names;
}

function expectedRestoreClusterArn(clusterIdentifier: string): string {
  if (!/^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-aurora$/.test(clusterIdentifier)) {
    throw new Error("Restore cluster identifier cannot be bound to the approved ARN boundary.");
  }
  return `arn:aws:rds:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:cluster:${clusterIdentifier}`;
}

function expectedRestoreWriterArn(writerIdentifier: string): string {
  if (!/^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-writer$/.test(writerIdentifier)) {
    throw new Error("Restore writer identifier cannot be bound to the approved ARN boundary.");
  }
  return `arn:aws:rds:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:db:${writerIdentifier}`;
}

function validateAwsName(kind: string, value: string): void {
  if (value.length > 63 || !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(value) || value.includes("--")) {
    throw new Error(`${kind} is not a safe unique AWS identifier.`);
  }
  if (/prod(?:uction)?/i.test(value)) throw new Error(`${kind} must never target production.`);
}

function resolveExternalStatePath(rawPath: string): string {
  if (!path.isAbsolute(rawPath)) throw new Error("--state-file must be an absolute path outside the repository.");
  const resolved = path.resolve(rawPath);
  const repo = normalizePathForComparison(REPO_ROOT);
  const candidate = normalizePathForComparison(resolved);
  if (candidate === repo || candidate.startsWith(`${repo}${path.sep}`)) {
    throw new Error("Recovery state must stay outside the repository to prevent accidental commits.");
  }
  return resolved;
}

function normalizePathForComparison(value: string): string {
  const normalized = path.resolve(value).replace(/[\\/]+/g, path.sep);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function temporaryTags(runId: string, purpose: "prechange-snapshot" | "restore-rehearsal"): Record<string, string> {
  return {
    ...REQUIRED_TAGS,
    "WRLDS:Issue": String(ISSUE_NUMBER),
    "WRLDS:LifecycleReapplied": "false",
    "WRLDS:Purpose": purpose,
    "WRLDS:RehearsalRunId": runId,
    "WRLDS:TrafficEligible": "false",
  };
}

function buildPlan(config: DeployConfig, runId: string): Record<string, unknown> {
  const names = buildNames(runId);
  return {
    schemaVersion: 1,
    issue: ISSUE_NUMBER,
    mode: "local-plan",
    runId,
    noAwsCallsMade: true,
    noAwsWritesMade: true,
    target: {
      account: config.awsAccount,
      region: config.awsRegion,
      environment: EXPECTED_ENVIRONMENT,
      sourceClusterIdentifier: `${config.resourcePrefix}-aurora`,
      database: DEFAULT_DATABASE,
      tags: temporaryTags(runId, "restore-rehearsal"),
    },
    identifiers: names,
    workflow: [
      "Create an optional pre-change manual snapshot after the external-write checkpoint.",
      "Create an ingress-free temporary security group with the exact rehearsal tags.",
      "Restore an isolated Aurora cluster by PITR or the guarded manual snapshot.",
      "Create one private db.serverless writer; do not modify app routes, Lambda, DNS, or production.",
      "Read back engine, encryption, schema migrations, aggregate-only table counts/fingerprints, timing, and data age.",
      "Reapply lifecycle policy and provide aggregate-only evidence before the rehearsal can be complete.",
      "Delete temporary instance, cluster, and isolation group only through separately approved cleanup.",
    ],
    approvals: {
      global: { environmentVariable: GLOBAL_APPROVAL_ENV, phrase: GLOBAL_APPROVAL },
      actions: ACTION_APPROVALS,
    },
    isolation: {
      applicationAttachmentAllowed: false,
      publicInstanceAllowed: false,
      inboundSecurityGroupRulesAllowed: 0,
      productionAllowed: false,
      trafficEligible: false,
    },
    lifecycleReapply: buildLifecycleManifest(names, runId),
    recoveryStatement:
      "Timing and data-age values are observed rehearsal measurements only; they are not a production RPO or RTO commitment.",
  };
}

function buildLifecycleManifest(names: RestoreNames, runId: string): Record<string, unknown> {
  const common =
    `node node_modules/ts-node/dist/bin.js --prefer-ts-exts scripts/data-lifecycle.ts ` +
    `--config <absolute-external-restore-config.json> ` +
    `--cluster-identifier ${names.clusterIdentifier} ` +
    `--secret-id /${EXPECTED_RESOURCE_PREFIX}/aurora/lifecycle ` +
    `--reference-at <reviewed-ISO-8601-reference-time>`;
  return {
    requiredBeforeRehearsalComplete: true,
    requiredBeforeTraffic: true,
    trafficEnableSupportedByThisTool: false,
    clusterIdentifier: names.clusterIdentifier,
    externalConfigContract: {
      awsAccount: EXPECTED_ACCOUNT,
      awsRegion: EXPECTED_REGION,
      resourcePrefix: `jy-park-test-restore-${runId}`,
      environmentTag: "park-test-restore-rehearsal",
    },
    secretRequirement:
      `Exactly /${EXPECTED_RESOURCE_PREFIX}/aurora/lifecycle or its exact account/region ARN; ` +
      "handler and administrator secrets are forbidden, and no fallback is allowed.",
    dryRunCommandTemplate: common,
    applyCommandTemplate:
      `${common} --apply --plan-digest <reviewed-dry-run-sha256> ` +
      `--evidence-out <absolute-external-lifecycle-evidence.json>`,
    receipt: {
      action: "lifecycle-apply",
      affectedCountsDigest: "sha256",
      affectedTotal: "non-negative aggregate count",
      aggregateOnly: true,
      clusterArn: `arn:aws:rds:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:cluster:${names.clusterIdentifier}`,
      completedAt: "must match the database run finished_at timestamp",
      containsSensitiveData: false,
      environment: "park-test-restore-rehearsal",
      issue: ISSUE_NUMBER,
      planDigest: "reviewed dry-run sha256",
      policyDefinitionDigest: "lowercase sha256 of the applied policy definition",
      policyVersion: EXPECTED_LIFECYCLE_POLICY_VERSION,
      referenceAt: "reviewed ISO-8601 reference time",
      runId: "jylc_<20 lowercase hex characters>",
      schemaVersion: 1,
    },
    verification:
      "The receipt must exactly match the restored database's latest completed jumpyard.data_lifecycle_runs row.",
  };
}

function requireMutationApproval(action: keyof typeof ACTION_APPROVALS, apply: boolean, runId: string): void {
  if (!apply) throw new Error(`${action} is plan-only unless --apply is supplied.`);
  validateMutationRunId(action, runId);
  if (process.env[GLOBAL_APPROVAL_ENV] !== GLOBAL_APPROVAL) {
    throw new Error(`Set ${GLOBAL_APPROVAL_ENV}=${GLOBAL_APPROVAL} after the explicit external-write checkpoint.`);
  }
  const approval = ACTION_APPROVALS[action];
  if (process.env[approval.environmentVariable] !== approval.phrase) {
    throw new Error(`Set ${approval.environmentVariable}=${approval.phrase} for this exact action.`);
  }
}

function awsJson<T>(config: DeployConfig, profile: string | undefined, args: readonly string[]): T {
  const cliArgs = [...args, "--region", config.awsRegion, "--output", "json", "--no-cli-pager"];
  if (profile) cliArgs.push("--profile", profile);
  const raw = execFileSync("aws", cliArgs, {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw) as T;
}

function awsVoid(config: DeployConfig, profile: string | undefined, args: readonly string[]): void {
  const cliArgs = [...args, "--region", config.awsRegion, "--no-cli-pager"];
  if (profile) cliArgs.push("--profile", profile);
  execFileSync("aws", cliArgs, {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

function confirmIdentity(config: DeployConfig, profile?: string): string {
  const identity = awsJson<StsApiResponse>(config, profile, ["sts", "get-caller-identity"]);
  if (identity.Account !== EXPECTED_ACCOUNT) {
    throw new Error(`AWS caller account ${identity.Account ?? "unknown"} is not ${EXPECTED_ACCOUNT}.`);
  }
  if (!identity.Arn) throw new Error("AWS caller identity ARN is missing.");
  return identity.Arn;
}

function inspectSourceCluster(config: DeployConfig, profile?: string): DbClusterSummary {
  const identifier = `${config.resourcePrefix}-aurora`;
  const response = awsJson<DbClusterApiResponse>(config, profile, [
    "rds",
    "describe-db-clusters",
    "--db-cluster-identifier",
    identifier,
  ]);
  const cluster = response.DBClusters?.[0];
  if (!cluster || cluster.DBClusterIdentifier !== identifier || !cluster.DBClusterArn) {
    throw new Error(`Source cluster ${identifier} was not found.`);
  }
  const securityGroupIds = (cluster.VpcSecurityGroups ?? [])
    .map((entry) => entry.VpcSecurityGroupId)
    .filter((value): value is string => Boolean(value));
  if (securityGroupIds.length === 0) throw new Error("Source cluster has no VPC security group.");
  const securityGroups = awsJson<Ec2SecurityGroupApiResponse>(config, profile, [
    "ec2",
    "describe-security-groups",
    "--group-ids",
    ...securityGroupIds,
  ]).SecurityGroups;
  const vpcIds = new Set((securityGroups ?? []).map((group) => group.VpcId).filter(Boolean));
  if (vpcIds.size !== 1) throw new Error("Source security groups do not identify exactly one VPC.");
  const writerIdentifier = cluster.DBClusterMembers?.find((member) => member.IsClusterWriter)?.DBInstanceIdentifier;
  if (!writerIdentifier) throw new Error("Source cluster writer was not found.");
  const summary: DbClusterSummary = {
    arn: cluster.DBClusterArn,
    backupRetentionDays: cluster.BackupRetentionPeriod ?? -1,
    copyTagsToSnapshot: cluster.CopyTagsToSnapshot ?? false,
    databaseName: cluster.DatabaseName ?? DEFAULT_DATABASE,
    dbSubnetGroupName: cluster.DBSubnetGroup ?? "",
    deletionProtection: cluster.DeletionProtection ?? false,
    earliestRestorableTime: cluster.EarliestRestorableTime ?? "",
    engine: cluster.Engine ?? "",
    engineVersion: cluster.EngineVersion ?? "",
    httpEndpointEnabled: cluster.EnableHttpEndpoint ?? false,
    identifier,
    kmsKeyId: cluster.KmsKeyId ?? "",
    latestRestorableTime: cluster.LatestRestorableTime ?? "",
    port: cluster.Port ?? 5432,
    status: cluster.Status ?? "unknown",
    storageEncrypted: cluster.StorageEncrypted ?? false,
    vpcId: String([...vpcIds][0]),
    vpcSecurityGroupIds: securityGroupIds,
    writerIdentifier,
  };
  validateSourceCluster(summary);
  const tags = readRdsTags(config, profile, summary.arn);
  assertTags(tags, REQUIRED_TAGS, "source cluster");
  return summary;
}

function validateSourceCluster(cluster: DbClusterSummary): void {
  const errors: string[] = [];
  if (cluster.status !== "available") errors.push("source cluster must be available");
  if (cluster.engine !== EXPECTED_ENGINE) errors.push(`engine must be ${EXPECTED_ENGINE}`);
  if (cluster.engineVersion !== EXPECTED_ENGINE_VERSION) errors.push(`engine version must be ${EXPECTED_ENGINE_VERSION}`);
  if (!cluster.storageEncrypted) errors.push("source cluster must be encrypted");
  if (!cluster.kmsKeyId) errors.push("source KMS key id is missing");
  if (!cluster.deletionProtection) errors.push("source deletion protection must remain enabled");
  if (!cluster.httpEndpointEnabled) errors.push("source Data API must remain enabled");
  if (cluster.backupRetentionDays !== EXPECTED_BACKUP_RETENTION_DAYS) {
    errors.push(`backup retention must be ${EXPECTED_BACKUP_RETENTION_DAYS} days`);
  }
  if (!cluster.copyTagsToSnapshot) errors.push("snapshot tag copy must be enabled");
  if (!cluster.dbSubnetGroupName) errors.push("source DB subnet group is missing");
  if (!cluster.earliestRestorableTime || !cluster.latestRestorableTime) errors.push("PITR window is unavailable");
  if (errors.length > 0) throw new Error(`Unsafe source cluster: ${errors.join(", ")}.`);
}

function readRdsTags(config: DeployConfig, profile: string | undefined, arn: string): Record<string, string> {
  const response = awsJson<ListTagsApiResponse>(config, profile, [
    "rds",
    "list-tags-for-resource",
    "--resource-name",
    arn,
  ]);
  return tagsToRecord(response.TagList ?? []);
}

function tagsToRecord(tags: readonly AwsTag[]): Record<string, string> {
  return Object.fromEntries(
    tags
      .filter((tag): tag is { Key: string; Value: string } => Boolean(tag.Key) && tag.Value !== undefined)
      .map((tag) => [tag.Key, tag.Value]),
  );
}

function assertTags(actual: Record<string, string>, expected: Readonly<Record<string, string>>, label: string): void {
  const failures = Object.entries(expected)
    .filter(([key, value]) => actual[key] !== value)
    .map(([key, value]) => `${key}=${value}`);
  if (failures.length > 0) throw new Error(`${label} is missing exact tags: ${failures.join(", ")}.`);
}

function tagArgs(tags: Readonly<Record<string, string>>): string[] {
  return ["--tags", ...Object.entries(tags).map(([Key, Value]) => `Key=${Key},Value=${Value}`)];
}

function ensureIdentifiersUnused(config: DeployConfig, profile: string | undefined, names: RestoreNames): void {
  const clusters = awsJson<DbClusterApiResponse>(config, profile, ["rds", "describe-db-clusters"]).DBClusters ?? [];
  if (clusters.some((cluster) => cluster.DBClusterIdentifier === names.clusterIdentifier)) {
    throw new Error(`Restore cluster ${names.clusterIdentifier} already exists.`);
  }
  const instances = awsJson<DbInstanceApiResponse>(config, profile, ["rds", "describe-db-instances"]).DBInstances ?? [];
  if (instances.some((instance) => instance.DBInstanceIdentifier === names.writerIdentifier)) {
    throw new Error(`Restore writer ${names.writerIdentifier} already exists.`);
  }
  const groups = awsJson<Ec2SecurityGroupApiResponse>(config, profile, [
    "ec2",
    "describe-security-groups",
    "--filters",
    `Name=group-name,Values=${names.isolationSecurityGroupName}`,
  ]).SecurityGroups;
  if ((groups ?? []).length > 0) throw new Error(`Isolation group ${names.isolationSecurityGroupName} already exists.`);
}

function snapshotExists(config: DeployConfig, profile: string | undefined, identifier: string): boolean {
  const snapshots = awsJson<DbSnapshotApiResponse>(config, profile, [
    "rds",
    "describe-db-cluster-snapshots",
    "--snapshot-type",
    "manual",
  ]).DBClusterSnapshots;
  return (snapshots ?? []).some((snapshot) => snapshot.DBClusterSnapshotIdentifier === identifier);
}

function createSnapshot(args: Args, config: DeployConfig, runId: string): Record<string, unknown> {
  requireMutationApproval("snapshot", args.apply, runId);
  confirmIdentity(config, args.profile);
  const source = inspectSourceCluster(config, args.profile);
  const names = buildNames(runId);
  if (snapshotExists(config, args.profile, names.snapshotIdentifier)) {
    throw new Error(`Snapshot ${names.snapshotIdentifier} already exists; identifiers are never reused.`);
  }
  const startedAt = new Date().toISOString();
  awsVoid(config, args.profile, [
    "rds",
    "create-db-cluster-snapshot",
    "--db-cluster-identifier",
    source.identifier,
    "--db-cluster-snapshot-identifier",
    names.snapshotIdentifier,
    ...tagArgs(temporaryTags(runId, "prechange-snapshot")),
  ]);
  awsVoid(config, args.profile, [
    "rds",
    "wait",
    "db-cluster-snapshot-available",
    "--db-cluster-snapshot-identifier",
    names.snapshotIdentifier,
  ]);
  const snapshot = inspectSnapshot(config, args.profile, names.snapshotIdentifier, runId);
  return {
    action: "snapshot",
    issue: ISSUE_NUMBER,
    account: config.awsAccount,
    region: config.awsRegion,
    environment: EXPECTED_ENVIRONMENT,
    snapshotIdentifier: names.snapshotIdentifier,
    sourceClusterIdentifier: source.identifier,
    engine: snapshot.engine,
    engineVersion: snapshot.engineVersion,
    encrypted: snapshot.storageEncrypted,
    startedAt,
    availableAt: new Date().toISOString(),
    noSecretValuesPrinted: true,
    productionTouched: false,
    note: "Observed snapshot timing is rehearsal evidence only, not a production RPO/RTO claim.",
  };
}

function inspectSnapshot(
  config: DeployConfig,
  profile: string | undefined,
  identifier: string,
  runId: string,
): {
  readonly arn: string;
  readonly createTime: string;
  readonly engine: string;
  readonly engineVersion: string;
  readonly sourceClusterIdentifier: string;
  readonly storageEncrypted: boolean;
} {
  const snapshot = awsJson<DbSnapshotApiResponse>(config, profile, [
    "rds",
    "describe-db-cluster-snapshots",
    "--db-cluster-snapshot-identifier",
    identifier,
  ]).DBClusterSnapshots?.[0];
  if (!snapshot || !snapshot.DBClusterSnapshotArn) throw new Error(`Snapshot ${identifier} was not found.`);
  if (snapshot.Status !== "available" || snapshot.PercentProgress !== 100) {
    throw new Error(`Snapshot ${identifier} is not fully available.`);
  }
  if (snapshot.DBClusterIdentifier !== EXPECTED_RESOURCE_PREFIX + "-aurora") {
    throw new Error("Snapshot source is not the park-test Aurora cluster.");
  }
  if (snapshot.Engine !== EXPECTED_ENGINE || snapshot.EngineVersion !== EXPECTED_ENGINE_VERSION) {
    throw new Error("Snapshot engine/version does not match the approved source.");
  }
  if (!snapshot.StorageEncrypted) throw new Error("Snapshot must be encrypted.");
  assertTags(
    readRdsTags(config, profile, snapshot.DBClusterSnapshotArn),
    temporaryTags(runId, "prechange-snapshot"),
    "pre-change snapshot",
  );
  return {
    arn: snapshot.DBClusterSnapshotArn,
    createTime: snapshot.SnapshotCreateTime ?? "",
    engine: snapshot.Engine,
    engineVersion: snapshot.EngineVersion,
    sourceClusterIdentifier: snapshot.DBClusterIdentifier,
    storageEncrypted: snapshot.StorageEncrypted,
  };
}

function restoreCluster(args: Args, config: DeployConfig, runId: string): Record<string, unknown> {
  requireMutationApproval("restore", args.apply, runId);
  if (!args.stateFile) throw new Error("Restore requires --state-file outside the repository.");
  const statePath = resolveExternalStatePath(args.stateFile);
  if (existsSync(statePath)) throw new Error("Restore state file already exists; never overwrite a rehearsal record.");
  confirmIdentity(config, args.profile);
  const source = inspectSourceCluster(config, args.profile);
  const names = buildNames(runId);
  ensureIdentifiersUnused(config, args.profile, names);
  const sourceDataTime = validateRestoreSource(args, config, source, runId);
  let state: RecoveryState = {
    account: config.awsAccount,
    createdAt: new Date().toISOString(),
    environment: EXPECTED_ENVIRONMENT,
    issue: ISSUE_NUMBER,
    lifecycleReapplied: false,
    region: config.awsRegion,
    restoreClusterIdentifier: names.clusterIdentifier,
    restoreSource: args.restoreSource,
    restoreStartedAt: new Date().toISOString(),
    restoreToTime: args.restoreToTime,
    runId,
    schemaVersion: 1,
    snapshotIdentifier: args.snapshotIdentifier,
    sourceClusterIdentifier: source.identifier,
    sourceDataTime,
    sourceEngineVersion: source.engineVersion,
    sourceSecurityGroupIds: source.vpcSecurityGroupIds,
    stage: "planned",
    temporaryIsolationSecurityGroupName: names.isolationSecurityGroupName,
    trafficEligible: false,
    writerIdentifier: names.writerIdentifier,
  };
  writeState(statePath, state);

  try {
    const isolationTags = temporaryTags(runId, "restore-rehearsal");
    const groupResponse = awsJson<CreateSecurityGroupApiResponse>(config, args.profile, [
      "ec2",
      "create-security-group",
      "--group-name",
      names.isolationSecurityGroupName,
      "--description",
      `Issue ${ISSUE_NUMBER} isolated Aurora restore rehearsal; no ingress`,
      "--vpc-id",
      source.vpcId,
      "--tag-specifications",
      JSON.stringify([
        {
          ResourceType: "security-group",
          Tags: Object.entries(isolationTags).map(([Key, Value]) => ({ Key, Value })),
        },
      ]),
    ]);
    if (!groupResponse.GroupId) throw new Error("AWS did not return the isolation security group id.");
    state = { ...state, stage: "isolation-created", temporaryIsolationSecurityGroupId: groupResponse.GroupId };
    writeState(statePath, state);

    const commonRestoreArgs = [
      "--db-cluster-identifier",
      names.clusterIdentifier,
      "--db-subnet-group-name",
      source.dbSubnetGroupName,
      "--vpc-security-group-ids",
      groupResponse.GroupId,
      "--port",
      String(source.port),
      "--enable-http-endpoint",
      "--no-deletion-protection",
      "--copy-tags-to-snapshot",
      "--serverless-v2-scaling-configuration",
      "MinCapacity=0.5,MaxCapacity=2.0",
      ...tagArgs(isolationTags),
    ];
    if (args.restoreSource === "snapshot") {
      awsVoid(config, args.profile, [
        "rds",
        "restore-db-cluster-from-snapshot",
        ...commonRestoreArgs,
        "--snapshot-identifier",
        String(args.snapshotIdentifier),
        "--engine",
        EXPECTED_ENGINE,
      ]);
    } else {
      const timeArgs = args.restoreSource === "latest" ? ["--use-latest-restorable-time"] : ["--restore-to-time", String(args.restoreToTime)];
      awsVoid(config, args.profile, [
        "rds",
        "restore-db-cluster-to-point-in-time",
        ...commonRestoreArgs,
        "--source-db-cluster-identifier",
        source.identifier,
        "--restore-type",
        "full-copy",
        ...timeArgs,
      ]);
    }
    awsVoid(config, args.profile, [
      "rds",
      "wait",
      "db-cluster-available",
      "--db-cluster-identifier",
      names.clusterIdentifier,
    ]);
    const restoredCluster = readCluster(config, args.profile, names.clusterIdentifier);
    state = {
      ...state,
      restoreClusterArn: restoredCluster.arn,
      stage: "cluster-available",
    };
    writeState(statePath, state);

    awsVoid(config, args.profile, [
      "rds",
      "create-db-instance",
      "--db-instance-identifier",
      names.writerIdentifier,
      "--db-cluster-identifier",
      names.clusterIdentifier,
      "--db-instance-class",
      "db.serverless",
      "--engine",
      EXPECTED_ENGINE,
      "--no-publicly-accessible",
      ...tagArgs(isolationTags),
    ]);
    awsVoid(config, args.profile, [
      "rds",
      "wait",
      "db-instance-available",
      "--db-instance-identifier",
      names.writerIdentifier,
    ]);
    const restoreAvailableAt = new Date().toISOString();
    const observedRecoverySeconds = secondsBetween(state.restoreStartedAt, restoreAvailableAt);
    const observedSourceDataAgeSeconds = sourceDataTime ? secondsBetween(sourceDataTime, restoreAvailableAt) : undefined;
    state = {
      ...state,
      observedRecoverySeconds,
      observedSourceDataAgeSeconds,
      restoreAvailableAt,
      stage: "writer-available",
    };
    writeState(statePath, state);
    return safeStateSummary(state);
  } catch (error) {
    state = { ...state, failureStage: state.stage, stage: "failed" };
    writeState(statePath, state);
    const reason = error instanceof Error ? error.message : "unknown restore failure";
    throw new Error(
      `Restore failed after stage ${state.failureStage ?? "unknown"}: ${reason}. ` +
        "No automatic deletion ran; use the separately approved cleanup action and the external state file.",
    );
  }
}

function validateRestoreSource(
  args: Args,
  config: DeployConfig,
  source: DbClusterSummary,
  runId: string,
): string | undefined {
  if (args.restoreSource === "snapshot") {
    const expectedSnapshot = buildNames(runId).snapshotIdentifier;
    if (args.snapshotIdentifier !== expectedSnapshot) {
      throw new Error(`Snapshot restore accepts only the guarded identifier ${expectedSnapshot}.`);
    }
    return inspectSnapshot(config, args.profile, expectedSnapshot, runId).createTime;
  }
  if (args.restoreSource === "latest") return source.latestRestorableTime;
  const requested = new Date(String(args.restoreToTime));
  const earliest = new Date(source.earliestRestorableTime);
  const latest = new Date(source.latestRestorableTime);
  if (!Number.isFinite(requested.getTime())) throw new Error("--restore-to-time must be an ISO-8601 timestamp.");
  if (requested < earliest || requested > latest) throw new Error("Requested restore time is outside the live PITR window.");
  return requested.toISOString();
}

function readCluster(config: DeployConfig, profile: string | undefined, identifier: string): DbClusterSummary {
  const cluster = awsJson<DbClusterApiResponse>(config, profile, [
    "rds",
    "describe-db-clusters",
    "--db-cluster-identifier",
    identifier,
  ]).DBClusters?.[0];
  if (!cluster || !cluster.DBClusterArn) throw new Error(`Cluster ${identifier} was not found.`);
  const securityGroupIds = (cluster.VpcSecurityGroups ?? [])
    .map((entry) => entry.VpcSecurityGroupId)
    .filter((value): value is string => Boolean(value));
  return {
    arn: cluster.DBClusterArn,
    backupRetentionDays: cluster.BackupRetentionPeriod ?? -1,
    copyTagsToSnapshot: cluster.CopyTagsToSnapshot ?? false,
    databaseName: cluster.DatabaseName ?? DEFAULT_DATABASE,
    dbSubnetGroupName: cluster.DBSubnetGroup ?? "",
    deletionProtection: cluster.DeletionProtection ?? false,
    earliestRestorableTime: cluster.EarliestRestorableTime ?? "",
    engine: cluster.Engine ?? "",
    engineVersion: cluster.EngineVersion ?? "",
    httpEndpointEnabled: cluster.EnableHttpEndpoint ?? false,
    identifier,
    kmsKeyId: cluster.KmsKeyId ?? "",
    latestRestorableTime: cluster.LatestRestorableTime ?? "",
    port: cluster.Port ?? 5432,
    status: cluster.Status ?? "unknown",
    storageEncrypted: cluster.StorageEncrypted ?? false,
    vpcId: "",
    vpcSecurityGroupIds: securityGroupIds,
    writerIdentifier:
      cluster.DBClusterMembers?.find((member) => member.IsClusterWriter)?.DBInstanceIdentifier ?? "",
  };
}

function writeState(statePath: string, state: RecoveryState): void {
  const directory = path.dirname(statePath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, statePath);
}

function readState(statePath: string): RecoveryState {
  const resolved = resolveExternalStatePath(statePath);
  if (!existsSync(resolved)) throw new Error(`Recovery state file does not exist: ${resolved}`);
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as RecoveryState;
  validateState(parsed);
  return parsed;
}

function validateState(state: RecoveryState): void {
  if (
    state.schemaVersion !== 1 ||
    state.issue !== ISSUE_NUMBER ||
    state.account !== EXPECTED_ACCOUNT ||
    state.region !== EXPECTED_REGION ||
    state.environment !== EXPECTED_ENVIRONMENT ||
    state.sourceClusterIdentifier !== `${EXPECTED_RESOURCE_PREFIX}-aurora` ||
    state.sourceEngineVersion !== EXPECTED_ENGINE_VERSION ||
    state.trafficEligible !== false
  ) {
    throw new Error("Recovery state does not match the approved park-test contract.");
  }
  validateRunId(state.runId);
  const names = buildNames(state.runId);
  if (
    state.restoreClusterIdentifier !== names.clusterIdentifier ||
    state.writerIdentifier !== names.writerIdentifier ||
    state.temporaryIsolationSecurityGroupName !== names.isolationSecurityGroupName
  ) {
    throw new Error("Recovery state identifiers do not match its unique run id.");
  }
}

function safeStateSummary(state: RecoveryState): Record<string, unknown> {
  return {
    action: "restore",
    issue: state.issue,
    account: state.account,
    region: state.region,
    environment: state.environment,
    runId: state.runId,
    stage: state.stage,
    restoreSource: state.restoreSource,
    sourceClusterIdentifier: state.sourceClusterIdentifier,
    restoreClusterIdentifier: state.restoreClusterIdentifier,
    writerIdentifier: state.writerIdentifier,
    isolationSecurityGroupIdPresent: Boolean(state.temporaryIsolationSecurityGroupId),
    privateWriterRequired: true,
    inboundRulesAllowed: 0,
    applicationAttachmentMade: false,
    lifecycleReapplied: state.lifecycleReapplied,
    trafficEligible: false,
    observedRecoverySeconds: state.observedRecoverySeconds,
    observedSourceDataAgeSeconds: state.observedSourceDataAgeSeconds,
    measurementScope: "observed rehearsal only; not a production RPO/RTO commitment",
    noSecretValuesPrinted: true,
  };
}

async function verifyRestore(args: Args, config: DeployConfig): Promise<Record<string, unknown>> {
  if (!args.stateFile) throw new Error("Verify requires --state-file outside the repository.");
  const statePath = resolveExternalStatePath(args.stateFile);
  let state = readState(statePath);
  if (!["writer-available", "verified"].includes(state.stage)) {
    throw new Error(`Restore cannot be verified from stage ${state.stage}.`);
  }
  confirmIdentity(config, args.profile);
  const source = inspectSourceCluster(config, args.profile);
  const restored = readCluster(config, args.profile, state.restoreClusterIdentifier);
  validateRestoredCluster(restored, source, state, config, args.profile);
  validatePrivateWriter(config, args.profile, state);
  validateIsolationGroup(config, args.profile, state);

  const secretArn = process.env[VERIFY_SECRET_ENV];
  if (!secretArn) throw new Error(`Set ${VERIFY_SECRET_ENV} to an approved operator-only Aurora credential ARN.`);
  validateVerificationSecretArn(secretArn);
  if (!state.restoreClusterArn) throw new Error("Recovery state is missing the restored cluster ARN.");
  const exactRestoreClusterArn = expectedRestoreClusterArn(state.restoreClusterIdentifier);
  const lifecycleEvidence = args.lifecycleEvidencePath
    ? validateLifecycleEvidence(
        args.lifecycleEvidencePath,
        state.restoreClusterIdentifier,
        exactRestoreClusterArn,
      )
    : undefined;
  const dbVerification = await verifyDatabase(config, args.profile, exactRestoreClusterArn, secretArn);
  const lifecycle = lifecycleEvidence
    ? corroborateLifecycleEvidence(lifecycleEvidence, dbVerification.latestLifecycleRun)
    : {
        databaseMatch: false,
        digest: undefined,
        policyVersion: undefined,
        reapplied: false,
        runId: undefined,
      };
  const { latestLifecycleRun, tableAggregates, ...databaseSummary } = dbVerification;
  const verifiedAt = new Date().toISOString();
  state = {
    ...state,
    lifecycleEvidenceDigest: lifecycle.digest,
    lifecycleReapplied: lifecycle.reapplied,
    stage: "verified",
    verifiedAt,
  };
  writeState(statePath, state);
  return {
    action: "verify",
    issue: ISSUE_NUMBER,
    account: config.awsAccount,
    region: config.awsRegion,
    environment: EXPECTED_ENVIRONMENT,
    runId: state.runId,
    infrastructure: {
      engine: restored.engine,
      engineVersion: restored.engineVersion,
      encrypted: restored.storageEncrypted,
      httpEndpointEnabled: restored.httpEndpointEnabled,
      privateWriter: true,
      inboundRules: 0,
      applicationAttachmentMade: false,
      exactTags: true,
    },
    database: {
      ...databaseSummary,
      latestCompletedLifecycleRunPresent: Boolean(latestLifecycleRun),
    },
    lifecycle: {
      reapplied: lifecycle.reapplied,
      receiptDatabaseMatch: lifecycle.databaseMatch,
      evidenceDigestPresent: Boolean(lifecycle.digest),
      policyVersion: lifecycle.policyVersion,
      runId: lifecycle.runId,
      requiredBeforeAnyTraffic: true,
    },
    rehearsalComplete:
      lifecycle.reapplied &&
      lifecycle.databaseMatch &&
      dbVerification.migrationSetMatchesRepository,
    trafficEligible: false,
    observedRecoverySeconds: state.observedRecoverySeconds,
    observedSourceDataAgeSeconds: state.observedSourceDataAgeSeconds,
    measurementScope: "observed rehearsal only; not a production RPO/RTO commitment",
    noPiiTokensPinsOrSecretsPrinted: true,
    aggregateJsonIncluded: args.aggregateJson,
    tableAggregates: args.aggregateJson ? tableAggregates : undefined,
  };
}

function validateRestoredCluster(
  restored: DbClusterSummary,
  source: DbClusterSummary,
  state: RecoveryState,
  config: DeployConfig,
  profile?: string,
): void {
  const expectedGroupId = state.temporaryIsolationSecurityGroupId;
  const expectedArn = expectedRestoreClusterArn(state.restoreClusterIdentifier);
  const errors: string[] = [];
  if (restored.identifier === source.identifier) errors.push("restore identifier equals source");
  if (restored.arn !== expectedArn || state.restoreClusterArn !== expectedArn) {
    errors.push("restore cluster ARN is outside the exact account/region/identifier boundary");
  }
  if (restored.status !== "available") errors.push("restore cluster is not available");
  if (restored.engine !== source.engine || restored.engineVersion !== source.engineVersion) errors.push("engine/version mismatch");
  if (!restored.storageEncrypted) errors.push("restore is not encrypted");
  if (!restored.kmsKeyId || restored.kmsKeyId !== source.kmsKeyId) errors.push("restore KMS key differs from source");
  if (!restored.httpEndpointEnabled) errors.push("Data API is not enabled for verification");
  if (restored.deletionProtection) errors.push("temporary restore deletion protection must be false for approved cleanup");
  if (!expectedGroupId || restored.vpcSecurityGroupIds.length !== 1 || restored.vpcSecurityGroupIds[0] !== expectedGroupId) {
    errors.push("restore is not attached only to its isolation group");
  }
  if (restored.vpcSecurityGroupIds.some((id) => state.sourceSecurityGroupIds.includes(id))) {
    errors.push("restore reuses a source/application security group");
  }
  if (errors.length > 0) throw new Error(`Unsafe restored cluster: ${errors.join(", ")}.`);
  assertTags(
    readRdsTags(config, profile, restored.arn),
    temporaryTags(state.runId, "restore-rehearsal"),
    "restored cluster",
  );
}

function validatePrivateWriter(config: DeployConfig, profile: string | undefined, state: RecoveryState): void {
  const instance = awsJson<DbInstanceApiResponse>(config, profile, [
    "rds",
    "describe-db-instances",
    "--db-instance-identifier",
    state.writerIdentifier,
  ]).DBInstances?.[0];
  if (
    !instance ||
    instance.DBClusterIdentifier !== state.restoreClusterIdentifier ||
    instance.DBInstanceStatus !== "available" ||
    instance.Engine !== EXPECTED_ENGINE ||
    instance.EngineVersion !== EXPECTED_ENGINE_VERSION ||
    instance.PubliclyAccessible !== false
  ) {
    throw new Error("Restored writer is missing, public, unavailable, or attached to the wrong cluster.");
  }
}

function validateIsolationGroup(config: DeployConfig, profile: string | undefined, state: RecoveryState): void {
  if (!state.temporaryIsolationSecurityGroupId) throw new Error("Recovery state has no isolation security group id.");
  const group = awsJson<Ec2SecurityGroupApiResponse>(config, profile, [
    "ec2",
    "describe-security-groups",
    "--group-ids",
    state.temporaryIsolationSecurityGroupId,
  ]).SecurityGroups?.[0];
  if (!group || group.GroupName !== state.temporaryIsolationSecurityGroupName) {
    throw new Error("Isolation security group does not match recovery state.");
  }
  if ((group.IpPermissions ?? []).length !== 0) throw new Error("Isolation security group must have zero inbound rules.");
  assertTags(tagsToRecord(group.Tags ?? []), temporaryTags(state.runId, "restore-rehearsal"), "isolation group");
}

function validateVerificationSecretArn(secretArn: string): void {
  const expectedPrefix = `arn:aws:secretsmanager:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:secret:/jumpyard-check-in-park-test/aurora/`;
  if (!secretArn.startsWith(expectedPrefix) || /prod(?:uction)?/i.test(secretArn)) {
    throw new Error("Verification credential ARN is outside the approved park-test Aurora secret path.");
  }
}

async function verifyDatabase(
  config: DeployConfig,
  profile: string | undefined,
  clusterArn: string,
  secretArn: string,
): Promise<{
  readonly aggregateSetDigest: string;
  readonly latestLifecycleRun?: LifecycleDatabaseRun;
  readonly migrationCount: number;
  readonly migrationSetDigest: string;
  readonly migrationSetMatchesRepository: boolean;
  readonly tableAggregates: readonly TableAggregate[];
  readonly tableCount: number;
}> {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const client = new RDSDataClient({ region: config.awsRegion, ...(credentials ? { credentials } : {}) });
  const execute = async (sql: string): Promise<readonly Record<string, unknown>[]> => {
    const response = await client.send(
      new ExecuteStatementCommand({
        database: DEFAULT_DATABASE,
        formatRecordsAs: "JSON",
        resourceArn: clusterArn,
        secretArn,
        sql,
      }),
    );
    if (!response.formattedRecords) throw new Error("Aurora verification query returned no formatted records.");
    const parsed = JSON.parse(response.formattedRecords) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Aurora verification query returned an unexpected shape.");
    return parsed as readonly Record<string, unknown>[];
  };

  const lifecycleRows = await execute(
    `SELECT run_id AS "runId", policy_version AS "policyVersion", ` +
      `environment, cluster_identifier AS "clusterIdentifier", cluster_arn AS "clusterArn", ` +
      `reference_at::text AS "referenceAt", plan_digest AS "planDigest", ` +
      `policy_definition_digest AS "policyDefinitionDigest", ` +
      `finished_at::text AS "completedAt", affected_total AS "affectedTotal", ` +
      `affected_counts_digest AS "affectedCountsDigest" ` +
      `FROM jumpyard.data_lifecycle_runs ` +
      `WHERE status = 'completed' ` +
      `ORDER BY finished_at DESC, run_id DESC LIMIT 1`,
  );
  if (lifecycleRows.length > 1) {
    throw new Error("Latest completed lifecycle-run query returned more than one row.");
  }
  const latestLifecycleRun = lifecycleRows[0]
    ? parseLifecycleDatabaseRun(lifecycleRows[0], clusterArn)
    : undefined;

  const migrationRows = await execute(
    "SELECT version, checksum_sha256 FROM jumpyard.schema_migrations ORDER BY version",
  );
  const appliedMigrations = migrationRows.map((row) => ({
    checksum: String(row.checksum_sha256 ?? ""),
    version: String(row.version ?? ""),
  }));
  if (appliedMigrations.some((row) => !/^\d+$/.test(row.version) || !/^[a-f0-9]{64}$/.test(row.checksum))) {
    throw new Error("Migration readback contains an invalid version/checksum shape.");
  }
  const repositoryMigrations = readRepositoryMigrations();
  const migrationSetMatchesRepository = JSON.stringify(appliedMigrations) === JSON.stringify(repositoryMigrations);
  if (!migrationSetMatchesRepository) throw new Error("Restored migration set does not match repository migrations.");

  const tableRows = await execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'jumpyard' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const tableNames = tableRows.map((row) => String(row.table_name ?? ""));
  if (tableNames.length === 0 || tableNames.some((name) => !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error("Restored jumpyard schema table inventory is empty or unsafe.");
  }
  const tableAggregates: TableAggregate[] = [];
  for (const tableName of tableNames) {
    const rows = await execute(buildAggregateSql(tableName));
    const row = rows[0];
    const rowCount = Number(row?.row_count);
    const aggregateFingerprint = String(row?.aggregate_fingerprint ?? "");
    if (!Number.isSafeInteger(rowCount) || rowCount < 0 || !/^[a-f0-9]{32}$/.test(aggregateFingerprint)) {
      throw new Error(`Aggregate readback failed for ${tableName}.`);
    }
    tableAggregates.push({ aggregateFingerprint, rowCount, tableName });
  }
  const migrationSetDigest = sha256(JSON.stringify(appliedMigrations));
  const aggregateSetDigest = sha256(JSON.stringify(tableAggregates));
  return {
    aggregateSetDigest,
    latestLifecycleRun,
    migrationCount: appliedMigrations.length,
    migrationSetDigest,
    migrationSetMatchesRepository,
    tableAggregates,
    tableCount: tableAggregates.length,
  };
}

function buildAggregateSql(tableName: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(tableName)) throw new Error("Unsafe table name for aggregate verification.");
  return (
    `SELECT COUNT(*)::text AS row_count, ` +
    `md5(COUNT(*)::text || ':' || COALESCE(SUM(hashtextextended(to_jsonb(t)::text, 0)::numeric), 0)::text) ` +
    `AS aggregate_fingerprint FROM jumpyard."${tableName}" AS t`
  );
}

function readRepositoryMigrations(): readonly { readonly checksum: string; readonly version: string }[] {
  const directory = path.resolve(__dirname, "..", "migrations");
  return readdirSync(directory)
    .filter((fileName) => /^\d+_[a-z0-9_]+\.sql$/i.test(fileName))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => {
      const sql = readFileSync(path.join(directory, fileName), "utf8").replace(/\r\n/g, "\n");
      return { checksum: sha256(sql), version: fileName.split("_")[0] ?? "" };
    });
}

function validateLifecycleEvidence(
  evidencePath: string,
  expectedClusterIdentifier: string,
  expectedClusterArn: string,
): ValidatedLifecycleEvidence {
  const resolved = path.resolve(evidencePath);
  if (!existsSync(resolved)) throw new Error(`Lifecycle evidence file does not exist: ${resolved}`);
  const raw = readFileSync(resolved, "utf8");
  const evidence = JSON.parse(raw) as LifecycleEvidence;
  if (
    evidence.schemaVersion !== 1 ||
    evidence.issue !== ISSUE_NUMBER ||
    evidence.action !== "lifecycle-apply" ||
    evidence.result !== "succeeded" ||
    evidence.clusterIdentifier !== expectedClusterIdentifier ||
    evidence.clusterArn !== expectedClusterArn ||
    evidence.environment !== "park-test-restore-rehearsal" ||
    evidence.aggregateOnly !== true ||
    evidence.containsSensitiveData !== false ||
    evidence.policyVersion !== EXPECTED_LIFECYCLE_POLICY_VERSION
  ) {
    throw new Error("Lifecycle evidence does not satisfy the restore-rehearsal contract.");
  }
  const runId = lifecycleString(evidence.runId, /^jylc_[a-f0-9]{20}$/, "receipt run id");
  const planDigest = lifecycleString(evidence.planDigest, /^[a-f0-9]{64}$/, "receipt plan digest");
  const policyDefinitionDigest = lifecycleString(
    evidence.policyDefinitionDigest,
    /^[a-f0-9]{64}$/,
    "receipt policy-definition digest",
  );
  const referenceAt = lifecycleTimestamp(evidence.referenceAt, "receipt reference time");
  const completedAt = lifecycleTimestamp(evidence.completedAt, "receipt completion time");
  const affectedTotal = lifecycleAggregateTotal(evidence.affectedTotal, "receipt affected total");
  const affectedCountsDigest = lifecycleString(
    evidence.affectedCountsDigest,
    /^[a-f0-9]{64}$/,
    "receipt affected-counts digest",
  );
  if (new Date(completedAt) < new Date(referenceAt)) {
    throw new Error("Lifecycle receipt completion precedes its reference time.");
  }
  return {
    affectedCountsDigest,
    affectedTotal,
    clusterArn: expectedClusterArn,
    clusterIdentifier: expectedClusterIdentifier,
    completedAt,
    digest: sha256(raw),
    environment: "park-test-restore-rehearsal",
    planDigest,
    policyDefinitionDigest,
    policyVersion: EXPECTED_LIFECYCLE_POLICY_VERSION,
    referenceAt,
    runId,
  };
}

function parseLifecycleDatabaseRun(
  row: Record<string, unknown>,
  expectedClusterArn: string,
): LifecycleDatabaseRun {
  const runId = lifecycleString(row.runId, /^jylc_[a-f0-9]{20}$/, "database lifecycle run id");
  const planDigest = lifecycleString(row.planDigest, /^[a-f0-9]{64}$/, "database lifecycle plan digest");
  const policyDefinitionDigest = lifecycleString(
    row.policyDefinitionDigest,
    /^[a-f0-9]{64}$/,
    "database lifecycle policy-definition digest",
  );
  const referenceAt = lifecycleTimestamp(row.referenceAt, "database lifecycle reference time");
  const completedAt = lifecycleTimestamp(row.completedAt, "database lifecycle completion time");
  const affectedTotal = lifecycleAggregateTotal(row.affectedTotal, "database lifecycle affected total");
  const affectedCountsDigest = lifecycleString(
    row.affectedCountsDigest,
    /^[a-f0-9]{64}$/,
    "database lifecycle affected-counts digest",
  );
  const clusterIdentifier = lifecycleString(
    row.clusterIdentifier,
    /^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-aurora$/,
    "database lifecycle cluster identifier",
  );
  const clusterArn = lifecycleString(
    row.clusterArn,
    /^arn:aws:rds:eu-north-1:376129878018:cluster:jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-aurora$/,
    "database lifecycle cluster ARN",
  );
  if (
    row.environment !== "park-test-restore-rehearsal" ||
    row.policyVersion !== EXPECTED_LIFECYCLE_POLICY_VERSION ||
    clusterArn !== expectedClusterArn ||
    clusterArn !== expectedRestoreClusterArn(clusterIdentifier) ||
    new Date(completedAt) < new Date(referenceAt)
  ) {
    throw new Error("Latest completed lifecycle database row violates the restore-rehearsal contract.");
  }
  return {
    affectedCountsDigest,
    affectedTotal,
    clusterArn,
    clusterIdentifier,
    completedAt,
    environment: "park-test-restore-rehearsal",
    planDigest,
    policyDefinitionDigest,
    policyVersion: EXPECTED_LIFECYCLE_POLICY_VERSION,
    referenceAt,
    runId,
  };
}

function corroborateLifecycleEvidence(
  evidence: ValidatedLifecycleEvidence,
  databaseRun: LifecycleDatabaseRun | undefined,
): {
  readonly databaseMatch: true;
  readonly digest: string;
  readonly policyVersion: "t0195-v1";
  readonly reapplied: true;
  readonly runId: string;
} {
  if (!databaseRun) {
    throw new Error("Lifecycle receipt has no latest completed database run to corroborate it.");
  }
  const fields: readonly (keyof LifecycleDatabaseRun)[] = [
    "affectedCountsDigest",
    "affectedTotal",
    "clusterArn",
    "clusterIdentifier",
    "completedAt",
    "environment",
    "planDigest",
    "policyDefinitionDigest",
    "policyVersion",
    "referenceAt",
    "runId",
  ];
  const mismatches = fields.filter((field) => evidence[field] !== databaseRun[field]);
  if (mismatches.length > 0) {
    throw new Error(
      `Lifecycle receipt does not match the latest completed database run: ${mismatches.join(", ")}.`,
    );
  }
  return {
    databaseMatch: true,
    digest: evidence.digest,
    policyVersion: evidence.policyVersion,
    reapplied: true,
    runId: evidence.runId,
  };
}

function lifecycleString(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} has an invalid safe-metadata shape.`);
  }
  return value;
}

function lifecycleTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is not a timestamp.`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a timestamp.`);
  return parsed.toISOString();
}

function lifecycleAggregateTotal(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_LIFECYCLE_MUTATIONS) {
    throw new Error(`${label} is outside the guarded aggregate range.`);
  }
  return parsed;
}

function cleanupRestore(args: Args, config: DeployConfig): Record<string, unknown> {
  if (!args.stateFile) throw new Error("Cleanup requires --state-file outside the repository.");
  const statePath = resolveExternalStatePath(args.stateFile);
  let state = readState(statePath);
  requireMutationApproval("cleanup", args.apply, state.runId);
  if (state.stage === "cleaned") throw new Error("Restore rehearsal is already marked cleaned.");
  confirmIdentity(config, args.profile);
  validateCleanupTargets(config, args.profile, state);
  state = { ...state, stage: "cleanup-started" };
  writeState(statePath, state);

  const instances = awsJson<DbInstanceApiResponse>(config, args.profile, ["rds", "describe-db-instances"]).DBInstances ?? [];
  const writer = instances.find((instance) => instance.DBInstanceIdentifier === state.writerIdentifier);
  if (writer) {
    validateCleanupWriter(config, args.profile, state, writer);
    awsVoid(config, args.profile, [
      "rds",
      "delete-db-instance",
      "--db-instance-identifier",
      state.writerIdentifier,
      "--skip-final-snapshot",
      "--delete-automated-backups",
    ]);
    awsVoid(config, args.profile, [
      "rds",
      "wait",
      "db-instance-deleted",
      "--db-instance-identifier",
      state.writerIdentifier,
    ]);
  }
  const clusters = awsJson<DbClusterApiResponse>(config, args.profile, ["rds", "describe-db-clusters"]).DBClusters ?? [];
  if (clusters.some((cluster) => cluster.DBClusterIdentifier === state.restoreClusterIdentifier)) {
    awsVoid(config, args.profile, [
      "rds",
      "delete-db-cluster",
      "--db-cluster-identifier",
      state.restoreClusterIdentifier,
      "--skip-final-snapshot",
    ]);
    awsVoid(config, args.profile, [
      "rds",
      "wait",
      "db-cluster-deleted",
      "--db-cluster-identifier",
      state.restoreClusterIdentifier,
    ]);
  }
  if (state.temporaryIsolationSecurityGroupId) {
    awsVoid(config, args.profile, [
      "ec2",
      "delete-security-group",
      "--group-id",
      state.temporaryIsolationSecurityGroupId,
    ]);
  }
  state = { ...state, stage: "cleaned" };
  writeState(statePath, state);
  return {
    action: "cleanup",
    issue: ISSUE_NUMBER,
    account: config.awsAccount,
    region: config.awsRegion,
    environment: EXPECTED_ENVIRONMENT,
    runId: state.runId,
    stage: state.stage,
    deleted: [state.writerIdentifier, state.restoreClusterIdentifier, state.temporaryIsolationSecurityGroupName],
    sourceClusterDeleted: false,
    snapshotDeleted: false,
    productionTouched: false,
  };
}

function validateCleanupTargets(config: DeployConfig, profile: string | undefined, state: RecoveryState): void {
  const names = buildNames(state.runId);
  if (
    state.restoreClusterIdentifier !== names.clusterIdentifier ||
    state.writerIdentifier !== names.writerIdentifier ||
    state.temporaryIsolationSecurityGroupName !== names.isolationSecurityGroupName ||
    state.restoreClusterIdentifier === state.sourceClusterIdentifier
  ) {
    throw new Error("Cleanup targets are not the unique temporary rehearsal resources.");
  }
  const clusters = awsJson<DbClusterApiResponse>(config, profile, ["rds", "describe-db-clusters"]).DBClusters ?? [];
  const cluster = clusters.find((candidate) => candidate.DBClusterIdentifier === state.restoreClusterIdentifier);
  if (cluster) {
    const clusterArn = cluster.DBClusterArn;
    if (!clusterArn) throw new Error("Cleanup restore cluster ARN is missing.");
    assertCleanupClusterOwnership(
      cluster,
      state,
      readRdsTags(config, profile, clusterArn),
    );
  }
  if (state.temporaryIsolationSecurityGroupId) validateIsolationGroup(config, profile, state);
}

function assertCleanupClusterOwnership(
  cluster: DbClusterRecord,
  state: Pick<
    RecoveryState,
    "restoreClusterIdentifier" | "runId" | "temporaryIsolationSecurityGroupId" | "writerIdentifier"
  >,
  tags: Readonly<Record<string, string>>,
): void {
  const names = buildNames(state.runId);
  const securityGroupIds = (cluster.VpcSecurityGroups ?? []).map((entry) => entry.VpcSecurityGroupId);
  const memberIds = (cluster.DBClusterMembers ?? []).map((member) => member.DBInstanceIdentifier);
  if (
    state.restoreClusterIdentifier !== names.clusterIdentifier ||
    state.writerIdentifier !== names.writerIdentifier ||
    cluster.DBClusterIdentifier !== names.clusterIdentifier ||
    cluster.DBClusterArn !== expectedRestoreClusterArn(names.clusterIdentifier) ||
    cluster.Engine !== EXPECTED_ENGINE ||
    cluster.StorageEncrypted !== true ||
    cluster.DeletionProtection !== false ||
    !state.temporaryIsolationSecurityGroupId ||
    securityGroupIds.length !== 1 ||
    securityGroupIds[0] !== state.temporaryIsolationSecurityGroupId ||
    memberIds.some((memberId) => memberId !== names.writerIdentifier)
  ) {
    throw new Error("Cleanup restore cluster is outside the exact encrypted isolation boundary.");
  }
  assertTags(tags, temporaryTags(state.runId, "restore-rehearsal"), "cleanup restore cluster");
}

function validateCleanupWriter(
  config: DeployConfig,
  profile: string | undefined,
  state: RecoveryState,
  instance: DbInstanceRecord,
): void {
  const cluster = readCluster(config, profile, state.restoreClusterIdentifier);
  const expectedClusterArn = expectedRestoreClusterArn(state.restoreClusterIdentifier);
  if (cluster.arn !== expectedClusterArn) {
    throw new Error("Cleanup writer ownership cannot be corroborated by the exact restore cluster.");
  }
  assertTags(
    readRdsTags(config, profile, cluster.arn),
    temporaryTags(state.runId, "restore-rehearsal"),
    "cleanup restore cluster",
  );

  const instanceArn = instance.DBInstanceArn;
  if (!instanceArn) throw new Error("Cleanup restore writer ARN is missing.");
  assertCleanupWriterOwnership(
    instance,
    state,
    readRdsTags(config, profile, instanceArn),
  );
}

function assertCleanupWriterOwnership(
  instance: DbInstanceRecord,
  state: Pick<RecoveryState, "restoreClusterIdentifier" | "runId" | "writerIdentifier">,
  tags: Readonly<Record<string, string>>,
): void {
  const names = buildNames(state.runId);
  const expectedWriterArn = expectedRestoreWriterArn(names.writerIdentifier);
  if (
    state.restoreClusterIdentifier !== names.clusterIdentifier ||
    state.writerIdentifier !== names.writerIdentifier ||
    instance.DBInstanceIdentifier !== names.writerIdentifier ||
    instance.DBInstanceArn !== expectedWriterArn ||
    instance.DBClusterIdentifier !== names.clusterIdentifier ||
    instance.Engine !== EXPECTED_ENGINE ||
    instance.PubliclyAccessible !== false
  ) {
    throw new Error("Cleanup restore writer is outside the exact private rehearsal ownership boundary.");
  }
  assertTags(tags, temporaryTags(state.runId, "restore-rehearsal"), "cleanup restore writer");
}

function deleteSnapshot(args: Args, config: DeployConfig, runId: string): Record<string, unknown> {
  requireMutationApproval("delete-snapshot", args.apply, runId);
  confirmIdentity(config, args.profile);
  const expectedIdentifier = buildNames(runId).snapshotIdentifier;
  if (args.snapshotIdentifier !== expectedIdentifier) {
    throw new Error(`Snapshot deletion accepts only ${expectedIdentifier}.`);
  }
  inspectSnapshot(config, args.profile, expectedIdentifier, runId);
  awsVoid(config, args.profile, [
    "rds",
    "delete-db-cluster-snapshot",
    "--db-cluster-snapshot-identifier",
    expectedIdentifier,
  ]);
  awsVoid(config, args.profile, [
    "rds",
    "wait",
    "db-cluster-snapshot-deleted",
    "--db-cluster-snapshot-identifier",
    expectedIdentifier,
  ]);
  return {
    action: "delete-snapshot",
    issue: ISSUE_NUMBER,
    account: config.awsAccount,
    region: config.awsRegion,
    environment: EXPECTED_ENVIRONMENT,
    snapshotIdentifier: expectedIdentifier,
    sourceClusterDeleted: false,
    productionTouched: false,
  };
}

function secondsBetween(start: string, end: string): number {
  const difference = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (!Number.isFinite(difference) || difference < 0) throw new Error("Recovery timing timestamps are invalid.");
  return difference;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function printResult(result: Record<string, unknown>, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Aurora recovery rehearsal ${String(result.action ?? result.mode ?? "result")} ready.`);
  console.log(`Target: ${String(result.account ?? EXPECTED_ACCOUNT)} ${String(result.region ?? EXPECTED_REGION)} ${EXPECTED_ENVIRONMENT}`);
  console.log(`Run id: ${String(result.runId ?? "local-plan")}`);
  console.log("Safety: no production target, no app attachment, no public writer, no secret/PII output.");
  console.log("Recovery timing is observed rehearsal evidence only; no production RPO/RTO is claimed.");
}

function assertThrows(description: string, action: () => void): void {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`Self-test expected rejection: ${description}.`);
}

function runSelfTest(): Record<string, unknown> {
  const runId = "20260714t120000z-a1b2c3";
  validateRunId(runId);
  const names = buildNames(runId);
  if (!names.clusterIdentifier.startsWith("jy-park-test-restore-") || names.clusterIdentifier.includes("production")) {
    throw new Error("Self-test restore naming failed.");
  }
  const validConfig: DeployConfig = {
    awsAccount: EXPECTED_ACCOUNT,
    awsRegion: EXPECTED_REGION,
    resourcePrefix: EXPECTED_RESOURCE_PREFIX,
    safetyGates: {
      emergencyStop: true,
      guestMessagingSendsEnabled: false,
      rollerBookingDraftWritesEnabled: false,
      rollerRedeemWritesEnabled: false,
      rollerWebhookProcessingEnabled: false,
      staffAuthEnabled: false,
    },
    tags: { ...REQUIRED_TAGS },
  };
  validateConfig(validConfig);
  assertThrows("production account", () => validateConfig({ ...validConfig, awsAccount: "000000000000" }));
  assertThrows("open message gate", () =>
    validateConfig({
      ...validConfig,
      safetyGates: { ...validConfig.safetyGates, guestMessagingSendsEnabled: true },
    }),
  );
  assertThrows("production tag", () =>
    validateConfig({ ...validConfig, tags: { ...validConfig.tags, "WRLDS:Environment": "production" } }),
  );
  assertThrows("repository state path", () => resolveExternalStatePath(path.join(REPO_ROOT, "recovery.json")));
  assertThrows("relative state path", () => resolveExternalStatePath("recovery.json"));
  assertThrows("snapshot without apply", () => requireMutationApproval("snapshot", false, runId));
  const staleRunId = "20200101t000000z-a1b2c3";
  const mutationReviewTime = new Date("2026-07-14T12:00:00.000Z");
  assertThrows("stale snapshot run id", () => validateMutationRunId("snapshot", staleRunId, mutationReviewTime));
  assertThrows("stale restore run id", () => validateMutationRunId("restore", staleRunId, mutationReviewTime));
  validateMutationRunId("cleanup", staleRunId, mutationReviewTime);
  validateMutationRunId("delete-snapshot", staleRunId, mutationReviewTime);
  const cleanupState = {
    restoreClusterIdentifier: names.clusterIdentifier,
    runId,
    temporaryIsolationSecurityGroupId: "sg-0123456789abcdef0",
    writerIdentifier: names.writerIdentifier,
  };
  const cleanupCluster: DbClusterRecord = {
    DBClusterArn: expectedRestoreClusterArn(names.clusterIdentifier),
    DBClusterIdentifier: names.clusterIdentifier,
    DBClusterMembers: [{ DBInstanceIdentifier: names.writerIdentifier, IsClusterWriter: true }],
    DeletionProtection: false,
    Engine: EXPECTED_ENGINE,
    StorageEncrypted: true,
    VpcSecurityGroups: [{ VpcSecurityGroupId: cleanupState.temporaryIsolationSecurityGroupId }],
  };
  const cleanupWriter: DbInstanceRecord = {
    DBClusterIdentifier: names.clusterIdentifier,
    DBInstanceArn: expectedRestoreWriterArn(names.writerIdentifier),
    DBInstanceIdentifier: names.writerIdentifier,
    Engine: EXPECTED_ENGINE,
    PubliclyAccessible: false,
  };
  const cleanupTags = temporaryTags(runId, "restore-rehearsal");
  assertCleanupClusterOwnership(cleanupCluster, cleanupState, cleanupTags);
  assertThrows("cleanup cluster with the wrong ARN", () =>
    assertCleanupClusterOwnership(
      { ...cleanupCluster, DBClusterArn: cleanupCluster.DBClusterArn?.replace(EXPECTED_ACCOUNT, "000000000000") },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup cluster with the wrong engine", () =>
    assertCleanupClusterOwnership({ ...cleanupCluster, Engine: "aurora-mysql" }, cleanupState, cleanupTags),
  );
  assertThrows("cleanup cluster with another security group", () =>
    assertCleanupClusterOwnership(
      { ...cleanupCluster, VpcSecurityGroups: [{ VpcSecurityGroupId: "sg-fffffffffffffffff" }] },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup cluster with a foreign member", () =>
    assertCleanupClusterOwnership(
      { ...cleanupCluster, DBClusterMembers: [{ DBInstanceIdentifier: `${names.writerIdentifier}-other` }] },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup cluster without exact ownership tags", () =>
    assertCleanupClusterOwnership(
      cleanupCluster,
      cleanupState,
      { ...cleanupTags, "WRLDS:RehearsalRunId": "wrong" },
    ),
  );
  assertCleanupWriterOwnership(cleanupWriter, cleanupState, cleanupTags);
  assertThrows("public cleanup writer", () =>
    assertCleanupWriterOwnership({ ...cleanupWriter, PubliclyAccessible: true }, cleanupState, cleanupTags),
  );
  assertThrows("cleanup writer with the wrong engine", () =>
    assertCleanupWriterOwnership({ ...cleanupWriter, Engine: "postgres" }, cleanupState, cleanupTags),
  );
  assertThrows("cleanup writer with the wrong identifier", () =>
    assertCleanupWriterOwnership(
      { ...cleanupWriter, DBInstanceIdentifier: `${names.writerIdentifier}-other` },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup writer on another cluster", () =>
    assertCleanupWriterOwnership(
      { ...cleanupWriter, DBClusterIdentifier: `${names.clusterIdentifier}-other` },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup writer with wrong account ARN", () =>
    assertCleanupWriterOwnership(
      { ...cleanupWriter, DBInstanceArn: cleanupWriter.DBInstanceArn?.replace(EXPECTED_ACCOUNT, "000000000000") },
      cleanupState,
      cleanupTags,
    ),
  );
  assertThrows("cleanup writer without exact ownership tags", () =>
    assertCleanupWriterOwnership(cleanupWriter, cleanupState, { ...cleanupTags, "WRLDS:RehearsalRunId": "wrong" }),
  );
  const previousGlobal = process.env[GLOBAL_APPROVAL_ENV];
  try {
    delete process.env[GLOBAL_APPROVAL_ENV];
    assertThrows("snapshot without checkpoint", () => requireMutationApproval("snapshot", true, runId));
  } finally {
    if (previousGlobal === undefined) delete process.env[GLOBAL_APPROVAL_ENV];
    else process.env[GLOBAL_APPROVAL_ENV] = previousGlobal;
  }
  assertThrows("unsafe aggregate table name", () => buildAggregateSql("guest_profiles;select"));
  const aggregateSql = buildAggregateSql("guest_profiles");
  if (!aggregateSql.includes("COUNT(*)") || !aggregateSql.includes("aggregate_fingerprint") || aggregateSql.includes("email")) {
    throw new Error("Self-test aggregate-only SQL failed.");
  }
  const lifecycleMetadata: Omit<ValidatedLifecycleEvidence, "digest"> = {
    affectedCountsDigest: "b".repeat(64),
    affectedTotal: 12,
    clusterArn: expectedRestoreClusterArn(names.clusterIdentifier),
    clusterIdentifier: names.clusterIdentifier,
    completedAt: "2026-07-14T12:05:00.000Z",
    environment: "park-test-restore-rehearsal",
    planDigest: "a".repeat(64),
    policyDefinitionDigest: "e".repeat(64),
    policyVersion: EXPECTED_LIFECYCLE_POLICY_VERSION,
    referenceAt: "2026-07-14T12:00:00.000Z",
    runId: "jylc_0123456789abcdefabcd",
  };
  const lifecycleDatabaseRun = parseLifecycleDatabaseRun(
    lifecycleMetadata,
    lifecycleMetadata.clusterArn,
  );
  const corroborated = corroborateLifecycleEvidence(
    { ...lifecycleMetadata, digest: "c".repeat(64) },
    lifecycleDatabaseRun,
  );
  if (!corroborated.databaseMatch || !corroborated.reapplied) {
    throw new Error("Self-test lifecycle receipt/database corroboration failed.");
  }
  assertThrows("lifecycle receipt/database mismatch", () =>
    corroborateLifecycleEvidence(
      { ...lifecycleMetadata, digest: "c".repeat(64) },
      { ...lifecycleDatabaseRun, planDigest: "d".repeat(64) },
    ),
  );
  assertThrows("lifecycle policy-definition receipt/database mismatch", () =>
    corroborateLifecycleEvidence(
      { ...lifecycleMetadata, digest: "c".repeat(64) },
      { ...lifecycleDatabaseRun, policyDefinitionDigest: "f".repeat(64) },
    ),
  );
  const plan = buildPlan(validConfig, runId);
  if (plan.noAwsCallsMade !== true || plan.noAwsWritesMade !== true) throw new Error("Self-test local plan flags failed.");
  return {
    action: "self-test",
    issue: ISSUE_NUMBER,
    approvalsChecked: Object.keys(ACTION_APPROVALS).length + 1,
    exactMetadataChecked: true,
    uniqueNamesChecked: Object.keys(names).length,
    localPlanNoAwsCalls: true,
    isolationChecked: true,
    aggregateOnlySqlChecked: true,
    lifecycleDatabaseCorroborationChecked: true,
    cleanupClusterOwnershipChecked: true,
    cleanupWriterOwnershipChecked: true,
    stateOutsideRepositoryChecked: true,
    staleCleanupRunIdsAllowed: true,
    productionRejected: true,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    printResult(runSelfTest(), true);
    return;
  }
  const config = readConfig(args.configPath);
  if (args.action === "plan") {
    const runId = args.runId ?? generatedRunId();
    printResult(buildPlan(config, runId), args.json);
    return;
  }
  if (args.action === "verify") {
    printResult(await verifyRestore(args, config), args.json);
    return;
  }
  if (args.action === "cleanup") {
    printResult(cleanupRestore(args, config), args.json);
    return;
  }
  const runId = args.runId;
  if (!runId) throw new Error(`${args.action} requires --run-id.`);
  if (args.action === "snapshot") {
    printResult(createSnapshot(args, config, runId), args.json);
    return;
  }
  if (args.action === "restore") {
    printResult(restoreCluster(args, config, runId), args.json);
    return;
  }
  printResult(deleteSnapshot(args, config, runId), args.json);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Aurora recovery rehearsal failure.";
  console.error(message);
  process.exitCode = 1;
});
