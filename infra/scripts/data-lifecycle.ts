import assert from "assert/strict";
import { randomUUID } from "crypto";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";

// GH-598: the reviewed policy and apply transaction live in the nightly Lambda's folder, so
// this operator CLI and the scheduled job run the same T0195 statements.
import {
  ACTION_SPECS,
  DATABASE,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_MUTATIONS,
  LIFECYCLE_TABLES,
  MAX_BATCH_SIZE,
  MAX_DATA_API_SQL_BYTES,
  MAX_MUTATIONS_LIMIT,
  POLICY_VERSION,
  affectedEvidence,
  countsQuery,
  makePlan,
  policyDefinitionDigest,
  type LifecycleApplyResult,
  type LifecyclePlan,
} from "../lambda/data-lifecycle/policy";
import {
  applyPlan,
  loadEligibleCounts,
  type LifecycleContext,
} from "../lambda/data-lifecycle/engine";

const MAX_REFERENCE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const APPLY_PHRASE = "I_UNDERSTAND_THIS_DELETES_OR_ANONYMIZES_DATA";
const KILL_SWITCH_RELEASE = "DISABLED_FOR_APPROVED_MAINTENANCE";
const PARK_TEST_ENVIRONMENT = "park-test";
const PARK_TEST_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const APPROVED_LIFECYCLE_SECRET_NAME = `/${PARK_TEST_RESOURCE_PREFIX}/aurora/lifecycle`;
const RESTORE_ENVIRONMENT = "park-test-restore-rehearsal";
const RESTORE_ACCOUNT = "376129878018";
const RESTORE_REGION = "eu-north-1";
const RESTORE_CLUSTER_PATTERN = /^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}-aurora$/;
const RESTORE_RESOURCE_PREFIX_PATTERN = /^jy-park-test-restore-20\d{6}t\d{6}z-[a-z0-9]{6}$/;
const REQUIRED_COMMON_TAGS: Readonly<Record<string, string>> = {
  "WRLDS:Client": "JumpYard",
  "WRLDS:Project": "jumpyard-check-in",
  "WRLDS:Owner": "love",
  "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
  "WRLDS:ManagedBy": "cdk",
  "WRLDS:DataClassification": "confidential",
  "WRLDS:Exportable": "true",
  "WRLDS:CostCenter": "JumpYard",
  "WRLDS:CreatedBy": "love",
};

interface DeployConfig {
  awsAccount: string;
  awsRegion: string;
  environment: string;
  resourcePrefix: string;
}

interface LifecycleArgs {
  apply: boolean;
  batchSize: number;
  clusterArn?: string;
  clusterIdentifier?: string;
  configPath?: string;
  evidenceOut?: string;
  maxMutations: number;
  planDigest?: string;
  profile?: string;
  referenceAt?: string;
  secretId?: string;
  selfTestOnly: boolean;
}

interface ClusterTarget {
  arn: string;
  identifier: string;
  restoreRehearsal: boolean;
}

interface LifecycleEvidenceReceipt {
  action: "lifecycle-apply";
  affectedCountsDigest: string;
  affectedTotal: number;
  aggregateOnly: true;
  clusterArn: string;
  clusterIdentifier: string;
  completedAt: string;
  containsSensitiveData: false;
  environment: "park-test" | "park-test-restore-rehearsal";
  issue: 194;
  planDigest: string;
  policyDefinitionDigest: string;
  policyVersion: "t0195-v1";
  referenceAt: string;
  result: "succeeded";
  runId: string;
  schemaVersion: 1;
}

function positiveInteger(value: string | undefined, name: string, maximum: number): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): LifecycleArgs {
  let apply = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let clusterArn: string | undefined;
  let clusterIdentifier: string | undefined;
  let configPath: string | undefined;
  let evidenceOut: string | undefined;
  let maxMutations = DEFAULT_MAX_MUTATIONS;
  let planDigest: string | undefined;
  let profile: string | undefined;
  let referenceAt: string | undefined;
  let secretId: string | undefined;
  let selfTestOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--batch-size") {
      batchSize = positiveInteger(next, "--batch-size", MAX_BATCH_SIZE);
      index += 1;
    } else if (arg === "--cluster-arn") {
      clusterArn = next;
      index += 1;
    } else if (arg === "--cluster-identifier") {
      clusterIdentifier = next;
      index += 1;
    } else if (arg === "--config") {
      configPath = next;
      index += 1;
    } else if (arg === "--evidence-out") {
      evidenceOut = next;
      index += 1;
    } else if (arg === "--max-mutations") {
      maxMutations = positiveInteger(next, "--max-mutations", MAX_MUTATIONS_LIMIT);
      index += 1;
    } else if (arg === "--plan-digest") {
      planDigest = next;
      index += 1;
    } else if (arg === "--profile") {
      profile = next;
      index += 1;
    } else if (arg === "--reference-at") {
      referenceAt = next;
      index += 1;
    } else if (arg === "--secret-id") {
      secretId = next;
      index += 1;
    } else if (arg === "--self-test") {
      selfTestOnly = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!selfTestOnly && (!configPath || !referenceAt)) {
    throw new Error("--config and --reference-at are required for a lifecycle plan.");
  }
  if (planDigest && !/^[a-f0-9]{64}$/.test(planDigest)) {
    throw new Error("--plan-digest must be a lowercase SHA-256 digest.");
  }
  if (clusterArn && clusterIdentifier) {
    throw new Error("Use only one of --cluster-arn or --cluster-identifier.");
  }
  if (apply && !planDigest) {
    throw new Error("Apply requires --plan-digest from a prior dry-run.");
  }
  if (evidenceOut && !apply) {
    throw new Error("--evidence-out is valid only with --apply.");
  }
  if (apply && !evidenceOut) {
    throw new Error("Lifecycle apply requires --evidence-out for an aggregate post-commit receipt.");
  }

  return {
    apply,
    batchSize,
    clusterArn,
    clusterIdentifier,
    configPath,
    evidenceOut,
    maxMutations,
    planDigest,
    profile,
    referenceAt,
    secretId,
    selfTestOnly,
  };
}

function normalizeReferenceAt(value: string, nowMs = Date.now()): string {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error("--reference-at must include an explicit UTC offset or Z suffix.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("--reference-at is not a valid timestamp.");
  }
  if (parsed.getTime() > nowMs + MAX_REFERENCE_CLOCK_SKEW_MS) {
    throw new Error("--reference-at cannot be more than five minutes in the future.");
  }
  return parsed.toISOString();
}

function readDeployConfig(configPath: string): DeployConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file does not exist: ${resolvedPath}`);
  }
  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as {
    awsAccount?: string;
    awsRegion?: string;
    resourcePrefix?: string;
    tags?: Record<string, string>;
  };
  const environment = parsed.tags?.["WRLDS:Environment"];
  if (
    typeof parsed.awsAccount !== "string"
    || !/^\d{12}$/.test(parsed.awsAccount)
    || typeof parsed.awsRegion !== "string"
    || !/^[a-z0-9-]+$/.test(parsed.awsRegion)
    || typeof parsed.resourcePrefix !== "string"
    || !/^[A-Za-z][A-Za-z0-9-]{0,55}$/.test(parsed.resourcePrefix)
    || typeof environment !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(environment)
  ) {
    throw new Error(
      "Config must include safe awsAccount, awsRegion, resourcePrefix, and WRLDS:Environment values.",
    );
  }
  for (const [key, expected] of Object.entries(REQUIRED_COMMON_TAGS)) {
    if (parsed.tags?.[key] !== expected) {
      throw new Error("Config WRLDS ownership, repository, management, and data tags must match the approved contract.");
    }
  }
  return {
    awsAccount: parsed.awsAccount,
    awsRegion: parsed.awsRegion,
    environment,
    resourcePrefix: parsed.resourcePrefix,
  };
}

function resolveClusterTarget(config: DeployConfig, args: LifecycleArgs): ClusterTarget {
  const hasExplicitTarget = Boolean(args.clusterArn || args.clusterIdentifier);
  if (config.environment !== RESTORE_ENVIRONMENT) {
    if (
      config.environment !== PARK_TEST_ENVIRONMENT
      || config.awsAccount !== RESTORE_ACCOUNT
      || config.awsRegion !== RESTORE_REGION
      || config.resourcePrefix !== PARK_TEST_RESOURCE_PREFIX
    ) {
      throw new Error(
        "Lifecycle runs are allowlisted only for the approved park-test target or isolated restore rehearsal.",
      );
    }
    if (hasExplicitTarget) {
      throw new Error(
        "Explicit lifecycle cluster targets are allowed only for park-test-restore-rehearsal.",
      );
    }
    const identifier = `${config.resourcePrefix}-aurora`;
    return {
      arn: `arn:aws:rds:${config.awsRegion}:${config.awsAccount}:cluster:${identifier}`,
      identifier,
      restoreRehearsal: false,
    };
  }

  if (config.awsAccount !== RESTORE_ACCOUNT || config.awsRegion !== RESTORE_REGION) {
    throw new Error("Restore-rehearsal lifecycle target must use the approved park-test account and region.");
  }
  if (!RESTORE_RESOURCE_PREFIX_PATTERN.test(config.resourcePrefix)) {
    throw new Error("Restore-rehearsal resource prefix does not match the isolated restore naming contract.");
  }
  if (!hasExplicitTarget) {
    throw new Error(
      "Restore-rehearsal lifecycle runs require --cluster-identifier or --cluster-arn; no source fallback is allowed.",
    );
  }

  const arnPrefix = `arn:aws:rds:${RESTORE_REGION}:${RESTORE_ACCOUNT}:cluster:`;
  let identifier = args.clusterIdentifier;
  if (args.clusterArn) {
    if (!args.clusterArn.startsWith(arnPrefix)) {
      throw new Error("Restore-rehearsal cluster ARN does not match the approved account and region.");
    }
    identifier = args.clusterArn.slice(arnPrefix.length);
  }
  if (!identifier || !RESTORE_CLUSTER_PATTERN.test(identifier)) {
    throw new Error("Restore-rehearsal cluster identifier does not match the isolated restore naming contract.");
  }
  if (identifier !== `${config.resourcePrefix}-aurora`) {
    throw new Error("Restore-rehearsal cluster identifier must match the reviewed restore config prefix.");
  }

  return {
    arn: `${arnPrefix}${identifier}`,
    identifier,
    restoreRehearsal: true,
  };
}

function validateEvidencePath(value: string | undefined, environment: string): string | undefined {
  if (!value) return undefined;
  if (environment !== PARK_TEST_ENVIRONMENT && environment !== RESTORE_ENVIRONMENT) {
    throw new Error("Lifecycle evidence receipts are limited to approved park-test targets.");
  }
  if (!path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".json") {
    throw new Error("--evidence-out must be an absolute .json path.");
  }
  const resolved = path.resolve(value);
  if (!existsSync(path.dirname(resolved))) {
    throw new Error("The lifecycle evidence output directory does not exist.");
  }
  if (existsSync(resolved)) {
    throw new Error("Lifecycle evidence output already exists; overwrite is forbidden.");
  }
  return resolved;
}

function createEvidenceReceipt(
  plan: LifecyclePlan,
  result: LifecycleApplyResult,
): LifecycleEvidenceReceipt {
  if (plan.environment !== PARK_TEST_ENVIRONMENT && plan.environment !== RESTORE_ENVIRONMENT) {
    throw new Error("Lifecycle evidence receipt environment is outside the approved allowlist.");
  }
  return {
    schemaVersion: 1,
    issue: 194,
    action: "lifecycle-apply",
    result: "succeeded",
    runId: result.runId,
    planDigest: plan.digest,
    referenceAt: plan.referenceAt,
    clusterArn: plan.clusterArn,
    clusterIdentifier: plan.clusterIdentifier,
    environment: plan.environment,
    policyDefinitionDigest: plan.policyDefinitionDigest,
    policyVersion: POLICY_VERSION,
    completedAt: result.completedAt,
    affectedTotal: result.affectedTotal,
    affectedCountsDigest: result.affectedCountsDigest,
    aggregateOnly: true,
    containsSensitiveData: false,
  };
}

function writeEvidenceReceiptAtomically(
  outputPath: string,
  receipt: LifecycleEvidenceReceipt,
): void {
  if (existsSync(outputPath)) {
    throw new Error("Lifecycle evidence output already exists; overwrite is forbidden.");
  }
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  try {
    linkSync(temporaryPath, outputPath);
  } catch (error) {
    unlinkSync(temporaryPath);
    throw error;
  }
  unlinkSync(temporaryPath);
}

function printPlan(plan: LifecyclePlan, mode: "apply" | "dry-run"): void {
  console.log(
    JSON.stringify(
      {
        actions: plan.actions,
        clusterArn: plan.clusterArn,
        clusterIdentifier: plan.clusterIdentifier,
        environment: plan.environment,
        guard: {
          maxMutations: plan.maxMutations,
          state: plan.plannedTotal <= plan.maxMutations ? "within_limit" : "blocked",
        },
        mode,
        planDigest: plan.digest,
        policyDefinitionDigest: plan.policyDefinitionDigest,
        policyVersion: plan.policyVersion,
        referenceAt: plan.referenceAt,
        totals: {
          eligible: plan.eligibleTotal,
          planned: plan.plannedTotal,
        },
      },
      null,
      2,
    ),
  );
}

function verifyApplyGates(args: LifecycleArgs, config: DeployConfig, plan: LifecyclePlan): void {
  if (process.env.DATA_LIFECYCLE_KILL_SWITCH !== KILL_SWITCH_RELEASE) {
    throw new Error("Lifecycle apply is blocked by the kill switch.");
  }
  if (process.env.DATA_LIFECYCLE_ALLOW_APPLY !== APPLY_PHRASE) {
    throw new Error("Lifecycle apply approval phrase is missing or invalid.");
  }
  if (process.env.DATA_LIFECYCLE_APPLY_ENVIRONMENT !== config.environment) {
    throw new Error("Lifecycle apply environment confirmation does not match the config.");
  }
  if (args.planDigest !== plan.digest) {
    throw new Error("Lifecycle plan changed since dry-run; run dry-run again and review the new digest.");
  }
  if (plan.plannedTotal > plan.maxMutations) {
    throw new Error("Lifecycle plan exceeds --max-mutations; no mutations were attempted.");
  }
}

function isApprovedLifecycleSecretId(value: string): boolean {
  if (value === APPROVED_LIFECYCLE_SECRET_NAME) return true;
  const approvedArnPrefix =
    `arn:aws:secretsmanager:${RESTORE_REGION}:${RESTORE_ACCOUNT}:secret:`
    + `${APPROVED_LIFECYCLE_SECRET_NAME}-`;
  if (!value.startsWith(approvedArnPrefix)) return false;
  return /^[A-Za-z0-9_-]{6}$/.test(value.slice(approvedArnPrefix.length));
}

async function resolveSecretArn(
  config: DeployConfig,
  secretId: string,
  profile?: string,
): Promise<string> {
  const client = new SecretsManagerClient({
    credentials: profile ? fromIni({ profile }) : undefined,
    region: config.awsRegion,
  });
  const response = await client.send(new DescribeSecretCommand({ SecretId: secretId }));
  if (!response.ARN) {
    throw new Error("Could not resolve the lifecycle database secret.");
  }
  if (
    response.Name !== APPROVED_LIFECYCLE_SECRET_NAME
    || !isApprovedLifecycleSecretId(response.ARN)
  ) {
    throw new Error("Lifecycle database secret is not the dedicated approved lifecycle identity.");
  }
  return response.ARN;
}

function elapsedHours(earlier: string, later: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / 3_600_000;
}

function elapsedDays(earlier: string, later: string): number {
  return elapsedHours(earlier, later) / 24;
}

function syntheticSelfTest(): void {
  const now = "2026-07-14T12:00:00.000Z";
  const nowMs = new Date(now).getTime();
  assert.equal(normalizeReferenceAt(now, nowMs), now);
  assert.equal(
    normalizeReferenceAt("2026-07-14T12:04:59.000Z", nowMs),
    "2026-07-14T12:04:59.000Z",
  );
  assert.throws(
    () => normalizeReferenceAt("2026-07-14T12:05:01.000Z", nowMs),
    /more than five minutes in the future/,
  );
  assert.throws(
    () => parseArgs([
      "--config",
      "synthetic.json",
      "--reference-at",
      now,
      "--apply",
      "--plan-digest",
      "a".repeat(64),
    ]),
    /apply requires --evidence-out/,
  );
  const approvedLifecycleSecretArn =
    `arn:aws:secretsmanager:${RESTORE_REGION}:${RESTORE_ACCOUNT}:secret:`
    + `${APPROVED_LIFECYCLE_SECRET_NAME}-Ab12_z`;
  assert.equal(isApprovedLifecycleSecretId(APPROVED_LIFECYCLE_SECRET_NAME), true);
  assert.equal(isApprovedLifecycleSecretId(approvedLifecycleSecretArn), true);
  assert.equal(
    isApprovedLifecycleSecretId(`/${PARK_TEST_RESOURCE_PREFIX}/aurora/runtime/session`),
    false,
  );
  assert.equal(isApprovedLifecycleSecretId(`/${PARK_TEST_RESOURCE_PREFIX}/aurora/admin`), false);
  assert.equal(
    isApprovedLifecycleSecretId(approvedLifecycleSecretArn.replace(RESTORE_ACCOUNT, "000000000000")),
    false,
  );
  const expiredAt25Hours = "2026-07-13T11:00:00.000Z";
  const expiredAt23Hours = "2026-07-13T13:00:00.000Z";
  assert.equal(elapsedHours(expiredAt25Hours, now) >= 24, true);
  assert.equal(elapsedHours(expiredAt23Hours, now) >= 24, false);

  const visit31DaysAgo = "2026-06-13T12:00:00.000Z";
  const visit29DaysAgo = "2026-06-15T12:00:00.000Z";
  assert.equal(elapsedDays(visit31DaysAgo, now) >= 30, true);
  assert.equal(elapsedDays(visit29DaysAgo, now) >= 30, false);

  const audit91DaysAgo = "2026-04-14T12:00:00.000Z";
  const audit89DaysAgo = "2026-04-16T12:00:00.000Z";
  assert.equal(elapsedDays(audit91DaysAgo, now) >= 90, true);
  assert.equal(elapsedDays(audit89DaysAgo, now) >= 90, false);

  const oldBooking = {
    activeSession: false,
    futureChild: false,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const protectedBySession = {
    activeSession: true,
    futureChild: false,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const protectedFuture = {
    activeSession: false,
    futureChild: false,
    futureVisit: true,
    knownVisit: true,
    ageDays: -10,
  };
  const protectedUnknownVisit = {
    activeSession: false,
    futureChild: false,
    futureVisit: false,
    knownVisit: false,
    ageDays: 31,
  };
  const protectedFutureChild = {
    activeSession: false,
    futureChild: true,
    futureVisit: false,
    knownVisit: true,
    ageDays: 31,
  };
  const eligibleBooking = (booking: typeof oldBooking): boolean =>
    booking.knownVisit
    && booking.ageDays >= 30
    && !booking.activeSession
    && !booking.futureChild
    && !booking.futureVisit;
  assert.equal(eligibleBooking(oldBooking), true);
  assert.equal(eligibleBooking(protectedBySession), false);
  assert.equal(eligibleBooking(protectedFuture), false);
  assert.equal(eligibleBooking(protectedUnknownVisit), false);
  assert.equal(eligibleBooking(protectedFutureChild), false);

  const bookingLinkSideCanBeAnonymized = (
    bookingExists: boolean,
    bookingEligible: boolean,
    linkAgeDays: number,
  ): boolean => bookingExists ? bookingEligible : linkAgeDays >= 30;
  assert.equal(bookingLinkSideCanBeAnonymized(true, true, 31), true);
  assert.equal(bookingLinkSideCanBeAnonymized(true, false, 100), false);
  assert.equal(bookingLinkSideCanBeAnonymized(false, false, 29), false);
  assert.equal(bookingLinkSideCanBeAnonymized(false, false, 30), true);

  type SyntheticKind =
    | "audit"
    | "booking"
    | "booking_link"
    | "delivery"
    | "draft"
    | "idempotency"
    | "limiter"
    | "seed_run"
    | "staff_identity"
    | "staff_session"
    | "token";
  interface SyntheticRow {
    active?: boolean;
    ageHours: number;
    anonymized?: boolean;
    errorSummary?: boolean;
    future?: boolean;
    id: string;
    kind: SyntheticKind;
    pii?: boolean;
  }
  const applySyntheticLifecycle = (rows: SyntheticRow[]): SyntheticRow[] =>
    rows
      .filter((row) => {
        if (["token", "idempotency", "staff_session", "limiter"].includes(row.kind)) {
          return row.active === true || row.ageHours < 24;
        }
        if (row.kind === "booking") {
          return row.active === true || row.future === true || row.ageHours < 30 * 24;
        }
        if (row.kind === "booking_link") {
          return row.future === true || row.ageHours < 90 * 24;
        }
        if (["draft", "audit", "delivery", "seed_run"].includes(row.kind)) {
          return row.ageHours < 90 * 24;
        }
        return true;
      })
      .map((row) => {
        if (row.kind === "draft" && row.ageHours >= 30 * 24) {
          return { ...row, anonymized: true, pii: false };
        }
        if (
          ["audit", "booking_link", "delivery", "seed_run"].includes(row.kind)
          && row.ageHours >= 30 * 24
          && row.future !== true
        ) {
          return { ...row, anonymized: true, errorSummary: false, pii: false };
        }
        if (
          row.kind === "staff_identity"
          && row.active === false
          && row.ageHours >= 90 * 24
        ) {
          return { ...row, anonymized: true, pii: false };
        }
        return { ...row };
      });

  const syntheticRows: SyntheticRow[] = [
    { ageHours: 25, id: "expired-token", kind: "token" },
    { ageHours: 23, id: "live-token", kind: "token" },
    { ageHours: 25, id: "expired-idempotency", kind: "idempotency" },
    { active: true, ageHours: 25, id: "live-idempotency", kind: "idempotency" },
    { ageHours: 25, id: "expired-staff-session", kind: "staff_session" },
    { active: true, ageHours: 25, id: "active-staff-session", kind: "staff_session" },
    { ageHours: 25, id: "expired-limiter", kind: "limiter" },
    { active: true, ageHours: 25, id: "blocked-limiter", kind: "limiter" },
    { ageHours: 31 * 24, id: "old-booking", kind: "booking", pii: true },
    { active: true, ageHours: 31 * 24, id: "active-booking", kind: "booking", pii: true },
    { ageHours: 0, future: true, id: "future-booking", kind: "booking", pii: true },
    { ageHours: 31 * 24, id: "old-draft", kind: "draft", pii: true },
    { ageHours: 91 * 24, id: "expired-draft", kind: "draft", pii: true },
    { ageHours: 89 * 24, id: "recent-audit", kind: "audit", pii: true },
    { ageHours: 91 * 24, id: "expired-audit", kind: "audit" },
    { ageHours: 31 * 24, id: "old-booking-link", kind: "booking_link", pii: true },
    {
      ageHours: 100 * 24,
      future: true,
      id: "future-booking-link",
      kind: "booking_link",
      pii: true,
    },
    { ageHours: 31 * 24, errorSummary: true, id: "old-delivery", kind: "delivery" },
    { ageHours: 31 * 24, errorSummary: true, id: "old-seed-run", kind: "seed_run" },
    {
      active: false,
      ageHours: 91 * 24,
      id: "deactivated-staff",
      kind: "staff_identity",
      pii: true,
    },
    {
      active: true,
      ageHours: 91 * 24,
      id: "active-staff",
      kind: "staff_identity",
      pii: true,
    },
  ];
  const firstSyntheticApply = applySyntheticLifecycle(syntheticRows);
  const secondSyntheticApply = applySyntheticLifecycle(firstSyntheticApply);
  const byId = new Map(firstSyntheticApply.map((row) => [row.id, row]));
  for (const removedId of [
    "expired-token",
    "expired-idempotency",
    "expired-staff-session",
    "expired-limiter",
    "old-booking",
    "expired-draft",
    "expired-audit",
  ]) {
    assert.equal(byId.has(removedId), false, `${removedId} should be removed`);
  }
  for (const protectedId of [
    "live-token",
    "live-idempotency",
    "active-staff-session",
    "blocked-limiter",
    "active-booking",
    "future-booking",
    "future-booking-link",
    "recent-audit",
    "active-staff",
  ]) {
    assert.equal(byId.has(protectedId), true, `${protectedId} should survive`);
  }
  assert.equal(byId.get("old-draft")?.pii, false);
  assert.equal(byId.get("old-draft")?.anonymized, true);
  assert.equal(byId.get("deactivated-staff")?.pii, false);
  assert.equal(byId.get("deactivated-staff")?.anonymized, true);
  assert.equal(byId.get("recent-audit")?.pii, false);
  assert.equal(byId.get("recent-audit")?.anonymized, true);
  assert.equal(byId.get("old-booking-link")?.pii, false);
  assert.equal(byId.get("old-booking-link")?.anonymized, true);
  assert.equal(byId.get("future-booking-link")?.pii, true);
  assert.notEqual(byId.get("future-booking-link")?.anonymized, true);
  assert.equal(byId.get("old-delivery")?.errorSummary, false);
  assert.equal(byId.get("old-seed-run")?.errorSummary, false);
  assert.deepEqual(secondSyntheticApply, firstSyntheticApply);

  const counts = new Map(ACTION_SPECS.map(({ name }) => [name, 2]));
  const syntheticClusterArn =
    "arn:aws:rds:eu-north-1:376129878018:cluster:synthetic-cluster";
  const firstPlan = makePlan(
    counts,
    "synthetic-cluster",
    syntheticClusterArn,
    "synthetic",
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  const secondPlan = makePlan(
    counts,
    "synthetic-cluster",
    syntheticClusterArn,
    "synthetic",
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  assert.equal(firstPlan.digest, secondPlan.digest);
  assert.equal(firstPlan.policyDefinitionDigest, policyDefinitionDigest());
  assert.notEqual(
    firstPlan.policyDefinitionDigest,
    policyDefinitionDigest([
      { ...ACTION_SPECS[0], candidateSql: `${ACTION_SPECS[0].candidateSql} AND false` },
      ...ACTION_SPECS.slice(1),
    ]),
  );
  assert.notEqual(
    firstPlan.digest,
    makePlan(
      counts,
      "different-cluster",
      "arn:aws:rds:eu-north-1:376129878018:cluster:different-cluster",
      "synthetic",
      now,
      1,
      MAX_MUTATIONS_LIMIT,
    ).digest,
  );
  assert.notEqual(
    firstPlan.digest,
    makePlan(
      counts,
      "synthetic-cluster",
      "arn:aws:rds:eu-west-1:376129878018:cluster:synthetic-cluster",
      "synthetic",
      now,
      1,
      MAX_MUTATIONS_LIMIT,
    ).digest,
  );
  assert.equal(firstPlan.actions.every((action) => action.planned === 1), true);
  assert.equal(firstPlan.plannedTotal, ACTION_SPECS.length);

  const baseArgs: LifecycleArgs = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    configPath: "synthetic.json",
    maxMutations: DEFAULT_MAX_MUTATIONS,
    referenceAt: now,
    selfTestOnly: false,
  };
  const normalConfig: DeployConfig = {
    awsAccount: RESTORE_ACCOUNT,
    awsRegion: RESTORE_REGION,
    environment: "park-test",
    resourcePrefix: "jumpyard-check-in-park-test",
  };
  const normalTarget = resolveClusterTarget(normalConfig, baseArgs);
  assert.equal(normalTarget.identifier, "jumpyard-check-in-park-test-aurora");
  assert.throws(
    () => resolveClusterTarget(normalConfig, { ...baseArgs, clusterIdentifier: "source-override" }),
    /only for park-test-restore-rehearsal/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, environment: "production" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, awsRegion: "eu-west-1" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, awsAccount: "000000000000" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  assert.throws(
    () => resolveClusterTarget({ ...normalConfig, resourcePrefix: "production" }, baseArgs),
    /allowlisted only for the approved park-test target/,
  );
  const restoreIdentifier = "jy-park-test-restore-20260714t120000z-abc123-aurora";
  const restoreConfig: DeployConfig = {
    ...normalConfig,
    environment: RESTORE_ENVIRONMENT,
    resourcePrefix: restoreIdentifier.slice(0, -"-aurora".length),
  };
  assert.throws(() => resolveClusterTarget(restoreConfig, baseArgs), /no source fallback/);
  assert.throws(
    () => resolveClusterTarget(
      { ...restoreConfig, resourcePrefix: "jumpyard-check-in-park-test" },
      { ...baseArgs, clusterIdentifier: restoreIdentifier },
    ),
    /resource prefix does not match/,
  );
  const restoreTarget = resolveClusterTarget(restoreConfig, {
    ...baseArgs,
    clusterIdentifier: restoreIdentifier,
  });
  assert.equal(restoreTarget.identifier, restoreIdentifier);
  assert.equal(
    restoreTarget.arn,
    `arn:aws:rds:${RESTORE_REGION}:${RESTORE_ACCOUNT}:cluster:${restoreIdentifier}`,
  );
  assert.equal(
    resolveClusterTarget(restoreConfig, {
      ...baseArgs,
      clusterArn: restoreTarget.arn,
    }).identifier,
    restoreIdentifier,
  );
  assert.throws(
    () => resolveClusterTarget(restoreConfig, {
      ...baseArgs,
      clusterArn: `arn:aws:rds:${RESTORE_REGION}:000000000000:cluster:${restoreIdentifier}`,
    }),
    /approved account and region/,
  );
  assert.throws(
    () => resolveClusterTarget(restoreConfig, { ...baseArgs, clusterIdentifier: "production-aurora" }),
    /naming contract/,
  );

  const receiptPlan = makePlan(
    counts,
    restoreIdentifier,
    restoreTarget.arn,
    RESTORE_ENVIRONMENT,
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  const receiptActions = receiptPlan.actions.map((action) => ({ ...action, affected: action.planned }));
  const receiptAffected = affectedEvidence(receiptActions);
  const receiptResult: LifecycleApplyResult = {
    actions: receiptActions,
    affectedCountsDigest: receiptAffected.digest,
    affectedTotal: receiptAffected.total,
    completedAt: now,
    runId: "jylc_synthetic",
  };
  const parkReceiptPlan = makePlan(
    counts,
    normalTarget.identifier,
    normalTarget.arn,
    PARK_TEST_ENVIRONMENT,
    now,
    1,
    MAX_MUTATIONS_LIMIT,
  );
  assert.equal(
    createEvidenceReceipt(parkReceiptPlan, receiptResult).environment,
    PARK_TEST_ENVIRONMENT,
  );
  const receipt = createEvidenceReceipt(receiptPlan, receiptResult);
  assert.deepEqual(receipt, {
    schemaVersion: 1,
    issue: 194,
    action: "lifecycle-apply",
    result: "succeeded",
    runId: receiptResult.runId,
    planDigest: receiptPlan.digest,
    referenceAt: now,
    clusterArn: restoreTarget.arn,
    clusterIdentifier: restoreIdentifier,
    environment: RESTORE_ENVIRONMENT,
    policyDefinitionDigest: receiptPlan.policyDefinitionDigest,
    policyVersion: POLICY_VERSION,
    completedAt: now,
    affectedTotal: receiptAffected.total,
    affectedCountsDigest: receiptAffected.digest,
    aggregateOnly: true,
    containsSensitiveData: false,
  });
  const evidenceDirectory = mkdtempSync(path.join(tmpdir(), "jumpyard-lifecycle-evidence-"));
  const evidencePath = path.join(evidenceDirectory, "receipt.json");
  try {
    assert.equal(validateEvidencePath(evidencePath, PARK_TEST_ENVIRONMENT), evidencePath);
    writeEvidenceReceiptAtomically(evidencePath, receipt);
    assert.deepEqual(JSON.parse(readFileSync(evidencePath, "utf8")), receipt);
    assert.throws(
      () => writeEvidenceReceiptAtomically(evidencePath, receipt),
      /overwrite is forbidden/,
    );
  } finally {
    rmSync(evidenceDirectory, { force: true, recursive: true });
  }

  const names = ACTION_SPECS.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...LIFECYCLE_TABLES].sort(), [...LIFECYCLE_TABLES]);
  assert.equal(new Set(LIFECYCLE_TABLES).size, LIFECYCLE_TABLES.length);
  assert.equal(Buffer.byteLength(countsQuery(), "utf8") <= MAX_DATA_API_SQL_BYTES, true);
  assert.equal(
    ACTION_SPECS.every(
      (action) => Buffer.byteLength(action.mutateSql, "utf8") <= MAX_DATA_API_SQL_BYTES,
    ),
    true,
  );
  assert.equal(names.indexOf("roller_booking_ticket_delete_30d") < names.indexOf("roller_booking_item_delete_30d"), true);
  assert.equal(names.indexOf("roller_booking_item_delete_30d") < names.indexOf("roller_booking_delete_30d"), true);
  assert.match(ACTION_SPECS.find(({ name }) => name === "staff_identity_anonymize_90d")?.mutateSql ?? "", /pin_verifier = NULL/);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  syntheticSelfTest();
  if (args.selfTestOnly) {
    console.log("T0195 lifecycle synthetic self-test passed.");
    return;
  }
  if (!args.configPath || !args.referenceAt) {
    throw new Error("--config and --reference-at are required.");
  }
  const config = readDeployConfig(args.configPath);
  const referenceAt = normalizeReferenceAt(args.referenceAt);
  const clusterTarget = resolveClusterTarget(config, args);
  const evidenceOut = validateEvidencePath(args.evidenceOut, config.environment);
  if (clusterTarget.restoreRehearsal && !args.secretId) {
    throw new Error("Restore-rehearsal lifecycle runs require an explicit --secret-id.");
  }
  if (args.secretId !== undefined && !isApprovedLifecycleSecretId(args.secretId)) {
    throw new Error("Lifecycle runs require the exact dedicated park-test lifecycle secret name or ARN.");
  }
  const secretId = args.secretId ?? APPROVED_LIFECYCLE_SECRET_NAME;
  const secretArn = await resolveSecretArn(config, secretId, args.profile);
  const context: LifecycleContext = {
    clusterArn: clusterTarget.arn,
    clusterIdentifier: clusterTarget.identifier,
    database: DATABASE,
    environment: config.environment,
    rds: new RDSDataClient({
      credentials: args.profile ? fromIni({ profile: args.profile }) : undefined,
      region: config.awsRegion,
    }),
    secretArn,
  };

  if (!args.apply) {
    const counts = await loadEligibleCounts(context, referenceAt);
    const plan = makePlan(
      counts,
      context.clusterIdentifier,
      context.clusterArn,
      context.environment,
      referenceAt,
      args.batchSize,
      args.maxMutations,
    );
    printPlan(plan, "dry-run");
    return;
  }

  const counts = await loadEligibleCounts(context, referenceAt);
  const plan = makePlan(
    counts,
    context.clusterIdentifier,
    context.clusterArn,
    context.environment,
    referenceAt,
    args.batchSize,
    args.maxMutations,
  );
  verifyApplyGates(args, config, plan);
  if (!evidenceOut) {
    throw new Error("Lifecycle apply is blocked without its required aggregate receipt path.");
  }
  const applyResult = await applyPlan(context, plan);
  const receipt = createEvidenceReceipt(plan, applyResult);
  writeEvidenceReceiptAtomically(evidenceOut, receipt);
  printPlan({ ...plan, actions: applyResult.actions }, "apply");
}

function safeOperatorError(error: unknown): string {
  if (
    error instanceof Error
    && error.constructor === Error
    && !("$metadata" in error)
  ) {
    return error.message;
  }
  return "Lifecycle command failed; the upstream diagnostic was suppressed to avoid exposing protected data.";
}

main().catch((error: unknown) => {
  console.error(safeOperatorError(error));
  process.exitCode = 1;
});
