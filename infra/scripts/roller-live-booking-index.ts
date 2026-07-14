import assert from "assert";
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";
import { App } from "aws-cdk-lib";
import { loadJumpYardCloudConfig, PARK_TEST_LIVE_DATA_SYNC_APPROVAL, type JumpYardCloudConfig } from "../lib/config";

const APPLY_CONFIRMATION = "I_APPROVE_T0196_PARK_TEST_AURORA_BACKFILL";
const PREFLIGHT_CONFIRMATION = "I_APPROVE_T0196_ROLLER_LIVE_DATA_API_READS";
const EXPECTED_ACCOUNT = "376129878018";
const EXPECTED_REGION = "eu-north-1";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const EXPECTED_VENUE_ID = "50871";
const DEFAULT_CONFIG_PATH = "./config/park-test-full-flow-rehearsal.json";
const ENDPOINTS = ["/data/bookingitems", "/data/tickets", "/data/bookingpayments", "/data/customers"] as const;

interface Args {
  readonly apply: boolean;
  readonly chunkDays: number;
  readonly configPath: string;
  readonly endDate: string;
  readonly json: boolean;
  readonly preflight: boolean;
  readonly profile?: string;
  readonly selfTest: boolean;
  readonly startDate: string;
}

interface Window {
  readonly endDate: string;
  readonly startDate: string;
}

interface AwsContext {
  readonly lambda: LambdaClient;
  readonly secrets: SecretsManagerClient;
  readonly ssm: SSMClient;
}

interface Credentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface SafeEndpointSummary {
  readonly endpoint: string;
  readonly firstPageItemCount: number;
  readonly status: number;
  readonly totalItems: number | null;
  readonly totalPagesAtPageSize100: number | null;
}

function parseArgs(argv: readonly string[]): Args {
  const today = new Date().toISOString().slice(0, 10);
  let apply = false;
  let chunkDays = 7;
  let configPath = DEFAULT_CONFIG_PATH;
  let endDate = addDays(today, 1);
  let json = false;
  let preflight = false;
  let profile: string | undefined;
  let selfTest = false;
  let startDate = addDays(today, -365);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--preflight") preflight = true;
    else if (arg === "--self-test") selfTest = true;
    else if (arg === "--json") json = true;
    else if (["--chunk-days", "--config", "--end-date", "--profile", "--start-date"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      index += 1;
      if (arg === "--chunk-days") chunkDays = Number(value);
      if (arg === "--config") configPath = value;
      if (arg === "--end-date") endDate = value;
      if (arg === "--profile") profile = value;
      if (arg === "--start-date") startDate = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && preflight) throw new Error("--apply and --preflight are separate actions.");
  validateWindow(startDate, endDate, 366);
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > 31) {
    throw new Error("--chunk-days must be an integer from 1 through 31.");
  }
  return { apply, chunkDays, configPath, endDate, json, preflight, profile, selfTest, startDate };
}

function validateWindow(startDate: string, endDate: string, maxDays: number): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate <= startDate) {
    throw new Error("Backfill dates must be an increasing YYYY-MM-DD window.");
  }
  if (differenceDays(startDate, endDate) > maxDays) {
    throw new Error(`Backfill window cannot exceed ${maxDays} days.`);
  }
}

function buildWindows(startDate: string, endDate: string, chunkDays: number): readonly Window[] {
  const windows: Window[] = [];
  let cursor = startDate;
  while (cursor < endDate) {
    const next = addDays(cursor, chunkDays);
    const windowEnd = next < endDate ? next : endDate;
    windows.push({ startDate: cursor, endDate: windowEnd });
    cursor = windowEnd;
  }
  return windows;
}

function readConfig(configPath: string): JumpYardCloudConfig {
  return loadJumpYardCloudConfig(new App({ context: { config: configPath } }));
}

function validateConfig(config: JumpYardCloudConfig): void {
  const expectedTags: Record<string, string> = {
    "WRLDS:Client": "JumpYard",
    "WRLDS:Project": "jumpyard-check-in",
    "WRLDS:Environment": "park-test",
    "WRLDS:Owner": "love",
    "WRLDS:Repository": "wrlds-creations/jumpyard-check-in",
    "WRLDS:ManagedBy": "cdk",
    "WRLDS:DataClassification": "confidential",
    "WRLDS:Exportable": "true",
    "WRLDS:CostCenter": "unassigned",
    "WRLDS:CreatedBy": "love",
  };
  const errors: string[] = [];
  if (config.awsAccount !== EXPECTED_ACCOUNT) errors.push(`awsAccount must be ${EXPECTED_ACCOUNT}.`);
  if (config.awsRegion !== EXPECTED_REGION) errors.push(`awsRegion must be ${EXPECTED_REGION}.`);
  if (config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX) errors.push("resourcePrefix mismatch.");
  if (config.roller.environment !== "live" || config.roller.baseUrl !== "https://api.roller.app") {
    errors.push("Roller must be the exact Live endpoint.");
  }
  if (!config.dataSync.scheduleEnabled) errors.push("dataSync.scheduleEnabled must be true.");
  if (config.dataSync.liveApproval !== PARK_TEST_LIVE_DATA_SYNC_APPROVAL) errors.push("T0196 approval mismatch.");
  if (config.dataSync.venueId !== EXPECTED_VENUE_ID) errors.push("dataSync venue must be Nacka 50871.");
  if (config.dataSync.requestIntervalMs < 1000) errors.push("Roller pacing must be at least one second.");
  if (config.safetyGates.rollerWebhookProcessingEnabled || config.safetyGates.guestMessagingSendsEnabled) {
    errors.push("Webhook processing and guest sends must remain disabled.");
  }
  for (const [key, value] of Object.entries(expectedTags)) {
    if (config.tags[key as keyof typeof config.tags] !== value) errors.push(`${key} mismatch.`);
  }
  if (errors.length > 0) throw new Error(errors.join(" "));
}

function buildAwsContext(config: JumpYardCloudConfig, profile?: string): AwsContext {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const shared = { credentials, region: config.awsRegion };
  return {
    lambda: new LambdaClient(shared),
    secrets: new SecretsManagerClient(shared),
    ssm: new SSMClient(shared),
  };
}

async function assertAwsIdentity(config: JumpYardCloudConfig, profile?: string): Promise<void> {
  const { execFileSync } = await import("child_process");
  const args = ["sts", "get-caller-identity", "--region", config.awsRegion, "--output", "json"];
  if (profile) args.push("--profile", profile);
  const identity = JSON.parse(execFileSync("aws", args, { encoding: "utf8" })) as { Account?: string };
  if (identity.Account !== EXPECTED_ACCOUNT) throw new Error(`AWS account must be ${EXPECTED_ACCOUNT}.`);
}

async function readCredentials(config: JumpYardCloudConfig, context: AwsContext): Promise<Credentials> {
  const prefix = `/${config.resourcePrefix}/roller`;
  const [environment, baseUrl, secret] = await Promise.all([
    context.ssm.send(new GetParameterCommand({ Name: `${prefix}/env` })),
    context.ssm.send(new GetParameterCommand({ Name: `${prefix}/base-url` })),
    context.secrets.send(new GetSecretValueCommand({ SecretId: `${prefix}/credentials` })),
  ]);
  if (environment.Parameter?.Value !== "live" || baseUrl.Parameter?.Value !== "https://api.roller.app") {
    throw new Error("AWS Roller environment/base URL does not match the approved Live boundary.");
  }
  const parsed = JSON.parse(secret.SecretString || "{}") as Partial<Credentials>;
  if (!parsed.clientId || !parsed.clientSecret) throw new Error("Roller credentials are unavailable.");
  return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
}

async function runPreflight(config: JumpYardCloudConfig, context: AwsContext, args: Args): Promise<readonly SafeEndpointSummary[]> {
  if (process.env.T0196_DATA_API_PREFLIGHT_APPROVAL !== PREFLIGHT_CONFIRMATION) {
    throw new Error(`Preflight requires T0196_DATA_API_PREFLIGHT_APPROVAL=${PREFLIGHT_CONFIRMATION}.`);
  }
  if (differenceDays(args.startDate, args.endDate) !== 1) {
    throw new Error("Roller Live Data API preflight requires exactly one modified-date day.");
  }
  const credentials = await readCredentials(config, context);
  let lastRequest = 0;
  const request = async (url: string, init: RequestInit): Promise<Response> => {
    const wait = 1000 - (Date.now() - lastRequest);
    if (lastRequest > 0 && wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return fetch(url, init);
  };
  const tokenResponse = await request(`${config.roller.baseUrl}/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: credentials.clientId, client_secret: credentials.clientSecret }),
  });
  const tokenBody = (await tokenResponse.json()) as { access_token?: string; accessToken?: string; token_type?: string };
  const accessToken = tokenBody.access_token || tokenBody.accessToken;
  if (!tokenResponse.ok || !accessToken) throw new Error(`Roller auth failed with HTTP ${tokenResponse.status}.`);

  const summaries: SafeEndpointSummary[] = [];
  for (const endpoint of ENDPOINTS) {
    const url = new URL(endpoint, config.roller.baseUrl);
    url.searchParams.set("startDate", args.startDate);
    url.searchParams.set("endDate", args.endDate);
    url.searchParams.set("pageNumber", "1");
    url.searchParams.set("pageSize", String(config.dataSync.pageSize));
    const response = await request(url.toString(), {
      method: "GET",
      headers: { accept: "application/json", authorization: `${tokenBody.token_type || "Bearer"} ${accessToken}` },
    });
    const body = (await response.json()) as { items?: unknown[]; totalItems?: number; totalPages?: number };
    if (!response.ok || !Array.isArray(body.items)) {
      throw new Error(`${endpoint} preflight failed with HTTP ${response.status}: ${safeProviderError(body)}`);
    }
    const totalItems = Number.isFinite(body.totalItems) ? Number(body.totalItems) : null;
    summaries.push({
      endpoint,
      firstPageItemCount: body.items.length,
      status: response.status,
      totalItems,
      totalPagesAtPageSize100: totalItems === null ? null : Math.ceil(totalItems / config.dataSync.pageSize),
    });
  }
  return summaries;
}

function safeProviderError(body: unknown): string {
  if (!body || typeof body !== "object") return "provider returned no structured error";
  const record = body as Record<string, unknown>;
  for (const key of ["errorCode", "code", "title", "message", "error", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.replace(/[^A-Za-z0-9 _.,:;()\/-]/g, "_").slice(0, 240);
    }
  }
  return `provider error keys: ${Object.keys(record).sort().join(",").slice(0, 180)}`;
}

async function assertFunctionBoundary(config: JumpYardCloudConfig, context: AwsContext): Promise<string> {
  const functionName = `${config.resourcePrefix}-stack-data-sync`;
  const response = await context.lambda.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
  const environment = response.Environment?.Variables || {};
  if (
    response.State !== "Active" ||
    response.LastUpdateStatus !== "Successful" ||
    environment.ENABLE_ROLLER_LIVE_DATA_SYNC !== "true" ||
    environment.ROLLER_DATA_SYNC_LIVE_APPROVAL !== PARK_TEST_LIVE_DATA_SYNC_APPROVAL ||
    environment.ROLLER_DATA_SYNC_VENUE_ID !== EXPECTED_VENUE_ID
  ) throw new Error("Deployed data-sync Lambda does not match the approved T0196 boundary.");
  return functionName;
}

async function runBackfill(config: JumpYardCloudConfig, context: AwsContext, windows: readonly Window[]): Promise<unknown> {
  if (process.env.T0196_BACKFILL_APPROVAL !== APPLY_CONFIRMATION) {
    throw new Error(`Apply requires T0196_BACKFILL_APPROVAL=${APPLY_CONFIRMATION}.`);
  }
  const functionName = await assertFunctionBoundary(config, context);
  const summary = {
    firstWindow: windows[0] || null,
    lastWindow: windows.at(-1) || null,
    sourceCounts: {} as Record<string, number>,
    totalDurationMs: 0,
    upserts: {} as Record<string, number>,
    windowsCompleted: 0,
    windowsPlanned: windows.length,
  };
  for (const window of windows) {
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify({
        source: "t0196.backfill",
        approval: PARK_TEST_LIVE_DATA_SYNC_APPROVAL,
        startDate: window.startDate,
        endDate: window.endDate,
        skipProducts: true,
      })),
    });
    const response = await context.lambda.send(command);
    const payload = response.Payload
      ? JSON.parse(Buffer.from(response.Payload).toString("utf8")) as Record<string, unknown>
      : null;
    if (response.FunctionError) throw new Error(`Backfill window ${window.startDate}/${window.endDate} failed.`);
    if (!payload || payload.status !== "succeeded") {
      throw new Error(`Backfill window ${window.startDate}/${window.endDate} returned no success receipt.`);
    }
    summary.windowsCompleted += 1;
    summary.totalDurationMs += numericValue(payload.durationMs);
    addNumericCounts(summary.sourceCounts, payload.sourceCounts);
    addNumericCounts(summary.upserts, payload.upserts);
  }
  return summary;
}

function addNumericCounts(target: Record<string, number>, value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) target[key] = (target[key] || 0) + entry;
  }
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function runSelfTest(): void {
  const windows = buildWindows("2025-07-14", "2026-07-15", 7);
  assert.equal(windows.length, 53);
  assert.deepEqual(windows[0], { startDate: "2025-07-14", endDate: "2025-07-21" });
  assert.deepEqual(windows.at(-1), { startDate: "2026-07-13", endDate: "2026-07-15" });
  assert.throws(() => validateWindow("2025-07-13", "2026-07-15", 366));
  assert.throws(() => parseArgs(["--apply", "--preflight"]));
  console.log(JSON.stringify({ mode: "self-test", awsCalls: false, rollerCalls: false, writesPerformed: false, checks: 5 }));
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return runSelfTest();
  const config = readConfig(args.configPath);
  validateConfig(config);
  const windows = buildWindows(args.startDate, args.endDate, args.chunkDays);
  const plan = {
    mode: args.apply ? "apply" : args.preflight ? "preflight" : "plan",
    account: config.awsAccount,
    region: config.awsRegion,
    environment: config.tags["WRLDS:Environment"],
    venueId: config.dataSync.venueId,
    startDate: args.startDate,
    endDate: args.endDate,
    chunkDays: args.chunkDays,
    windowCount: windows.length,
    rollerWritesAllowed: false,
    guestMessagesAllowed: false,
  };
  if (!args.apply && !args.preflight) {
    console.log(JSON.stringify({ ...plan, windows }, null, args.json ? 2 : 0));
    return;
  }
  await assertAwsIdentity(config, args.profile);
  const context = buildAwsContext(config, args.profile);
  const result = args.preflight
    ? await runPreflight(config, context, args)
    : await runBackfill(config, context, windows);
  console.log(JSON.stringify({ ...plan, result }, null, args.json ? 2 : 0));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
