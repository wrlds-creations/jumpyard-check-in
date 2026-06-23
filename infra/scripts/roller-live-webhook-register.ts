import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";
import {
  DescribeSecretCommand,
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";
import { App } from "aws-cdk-lib";
import { loadJumpYardCloudConfig, type JumpYardCloudConfig } from "../lib/config";

const EXPECTED_AWS_ACCOUNT = "376129878018";
const EXPECTED_AWS_REGION = "eu-north-1";
const EXPECTED_BASE_URL = "https://api.roller.app";
const EXPECTED_ENV = "live";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const DEFAULT_CONFIG_PATH = "./config/park-test.json";
const BOOKING_WEBHOOK_ROUTE = "/v1/roller/webhooks/bookings";
const ROLLER_WEBHOOKS_ENDPOINT = "/webhooks";
const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_REGISTERS_LIVE_WEBHOOK_FOR_JUMPYARD_NACKA";
const WRITE_ENV_VAR = "ROLLER_LIVE_WEBHOOK_REGISTER_ALLOW_WRITE";
const WEBHOOK_EVENTS = ["Created", "Updated", "Cancelled"] as const;
const REQUIRED_TAGS: Record<string, string> = {
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

interface Args {
  readonly apply: boolean;
  readonly configPath: string;
  readonly json: boolean;
  readonly profile?: string;
  readonly selfTest: boolean;
  readonly skipIntakeSmoke: boolean;
}

interface AwsContext {
  readonly rds: RDSDataClient;
  readonly secrets: SecretsManagerClient;
  readonly ssm: SSMClient;
}

interface AwsIdentity {
  readonly account: string;
  readonly arn: string;
}

interface AwsStackSummary {
  readonly apiEndpoint: string;
  readonly databaseClusterArn: string;
  readonly stackName: string;
  readonly stackStatus: string;
}

interface RollerCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface RollerConfig {
  readonly baseUrl: string;
  readonly credentials: RollerCredentials;
  readonly env: string;
}

interface RollerToken {
  readonly accessToken: string;
  readonly tokenType: string;
}

interface RollerRequestSummary {
  readonly endpoint: string;
  readonly method: "AUTH" | "GET" | "POST";
  readonly ok: boolean;
  readonly status: number;
}

interface ExistingWebhookSummary {
  readonly enabled: boolean | null;
  readonly events: readonly string[];
  readonly id: string | null;
  readonly ticketsIncluded: boolean | null;
  readonly url: string | null;
}

interface IntakeSmokeSummary {
  readonly auroraRowsAfter: number;
  readonly auroraRowsBefore: number;
  readonly eventId: string;
  readonly expectedNoAuroraInsert: true;
  readonly expectedStatus: "ignored_disabled";
  readonly performed: boolean;
  readonly responseStatus: string | null;
  readonly statusCode: number;
}

interface RegisterSummary {
  readonly apply: boolean;
  readonly aws: {
    readonly account: string;
    readonly arn: string;
    readonly region: string;
    readonly stackName: string;
    readonly stackStatus: string;
  };
  readonly created: boolean;
  readonly existingMatchBefore: ExistingWebhookSummary | null;
  readonly existingWebhookCountBefore: number;
  readonly intakeSmoke: IntakeSmokeSummary | null;
  readonly mode: "dry-run" | "apply";
  readonly registeredWebhookId: string | null;
  readonly roller: {
    readonly baseUrl: string;
    readonly env: string;
    readonly requests: readonly RollerRequestSummary[];
  };
  readonly secrets: {
    readonly rollerCredentialValuesPrinted: false;
    readonly rollerCredentialsSecretName: string;
    readonly webhookTokenSecretName: string;
    readonly webhookTokenValuePrinted: false;
  };
  readonly validation: {
    readonly applyPhraseRequired: true;
    readonly liveWriteGatesClosed: true;
    readonly rawRollerPayloadsPrinted: false;
  };
  readonly webhook: {
    readonly duplicateBehavior: readonly string[];
    readonly events: readonly (typeof WEBHOOK_EVENTS)[number][];
    readonly include: {
      readonly tickets: true;
    };
    readonly rollbackEndpoint: string | null;
    readonly url: string;
  };
}

interface GuardSelfTestResult {
  readonly blockedRollerRequestsChecked: number;
  readonly configChecks: number;
  readonly writeGuardChecked: true;
}

interface StsResponse {
  readonly Account?: string;
  readonly Arn?: string;
}

interface CloudFormationResponse {
  readonly Stacks?: readonly {
    readonly Outputs?: readonly {
      readonly OutputKey?: string;
      readonly OutputValue?: string;
    }[];
    readonly StackStatus?: string;
  }[];
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let configPath = DEFAULT_CONFIG_PATH;
  let json = false;
  let profile: string | undefined;
  let selfTest = false;
  let skipIntakeSmoke = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

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

    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }

    if (arg === "--skip-intake-smoke") {
      skipIntakeSmoke = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apply,
    configPath,
    json,
    profile,
    selfTest,
    skipIntakeSmoke,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function readConfig(configPath: string): JumpYardCloudConfig {
  const app = new App({ context: { config: configPath } });
  return loadJumpYardCloudConfig(app);
}

function validateParkTestConfig(config: JumpYardCloudConfig): void {
  const errors: string[] = [];

  if (config.awsAccount !== EXPECTED_AWS_ACCOUNT) errors.push(`awsAccount must be ${EXPECTED_AWS_ACCOUNT}.`);
  if (config.awsRegion !== EXPECTED_AWS_REGION) errors.push(`awsRegion must be ${EXPECTED_AWS_REGION}.`);
  if (config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX) {
    errors.push(`resourcePrefix must be ${EXPECTED_RESOURCE_PREFIX}.`);
  }
  if (config.roller.environment !== EXPECTED_ENV) errors.push(`roller.environment must be ${EXPECTED_ENV}.`);
  if (config.roller.baseUrl !== EXPECTED_BASE_URL) errors.push(`roller.baseUrl must be ${EXPECTED_BASE_URL}.`);
  if (!config.safetyGates.emergencyStop) errors.push("safetyGates.emergencyStop must stay true.");
  if (config.safetyGates.guestMessagingSendsEnabled) {
    errors.push("safetyGates.guestMessagingSendsEnabled must stay false.");
  }
  if (config.safetyGates.rollerBookingDraftWritesEnabled) {
    errors.push("safetyGates.rollerBookingDraftWritesEnabled must stay false.");
  }
  if (config.safetyGates.rollerRedeemWritesEnabled) {
    errors.push("safetyGates.rollerRedeemWritesEnabled must stay false.");
  }
  if (config.safetyGates.rollerWebhookProcessingEnabled) {
    errors.push("safetyGates.rollerWebhookProcessingEnabled must stay false for T0155 intake smoke.");
  }
  if (config.safetyGates.staffAuthEnabled) errors.push("safetyGates.staffAuthEnabled must stay false.");

  const tags = config.tags as Record<string, string>;
  for (const [tag, expected] of Object.entries(REQUIRED_TAGS)) {
    if (tags[tag] !== expected) {
      errors.push(`${tag} must be ${expected}.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

function validateApplyMode(args: Args): void {
  if (!args.apply) return;

  if (process.env[WRITE_ENV_VAR] !== WRITE_CONFIRMATION) {
    throw new Error(`Set ${WRITE_ENV_VAR}=${WRITE_CONFIRMATION} to register or match the Roller Live webhook.`);
  }
}

function buildAwsContext(config: JumpYardCloudConfig, profile?: string): AwsContext {
  const credentials = profile ? fromIni({ profile }) : undefined;
  return {
    rds: new RDSDataClient({ credentials, region: config.awsRegion }),
    secrets: new SecretsManagerClient({ credentials, region: config.awsRegion }),
    ssm: new SSMClient({ credentials, region: config.awsRegion }),
  };
}

function readAwsIdentity(config: JumpYardCloudConfig, profile?: string): AwsIdentity {
  const parsed = awsJson<StsResponse>(config, profile, ["sts", "get-caller-identity"]);
  const account = String(parsed.Account ?? "");
  const arn = String(parsed.Arn ?? "");

  if (account !== config.awsAccount) {
    throw new Error(`AWS identity account ${account || "unknown"} does not match expected ${config.awsAccount}.`);
  }

  return { account, arn };
}

function readStackSummary(config: JumpYardCloudConfig, profile?: string): AwsStackSummary {
  const stackName = `${config.resourcePrefix}-stack`;
  const parsed = awsJson<CloudFormationResponse>(config, profile, [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
  ]);
  const stack = parsed.Stacks?.[0];
  if (!stack) {
    throw new Error(`CloudFormation stack ${stackName} was not found.`);
  }

  const outputs: Record<string, string> = {};
  for (const output of stack.Outputs ?? []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }

  const apiEndpoint = outputs.ApiEndpoint;
  const databaseClusterArn = outputs.OperationalDatabaseClusterArn;
  if (!apiEndpoint) throw new Error(`CloudFormation stack ${stackName} is missing ApiEndpoint output.`);
  if (!databaseClusterArn) {
    throw new Error(`CloudFormation stack ${stackName} is missing OperationalDatabaseClusterArn output.`);
  }

  validateHttpsUrl(apiEndpoint, "API endpoint");
  return {
    apiEndpoint: stripTrailingSlash(apiEndpoint),
    databaseClusterArn,
    stackName,
    stackStatus: stack.StackStatus ?? "unknown",
  };
}

function awsJson<T>(config: JumpYardCloudConfig, profile: string | undefined, args: readonly string[]): T {
  const cliArgs = [...args, "--region", config.awsRegion, "--output", "json"];
  if (profile) {
    cliArgs.push("--profile", profile);
  }

  const raw = execFileSync("aws", cliArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(raw) as T;
}

async function readParameter(context: AwsContext, name: string): Promise<string> {
  const response = await context.ssm.send(new GetParameterCommand({ Name: name }));
  const value = response.Parameter?.Value?.trim();
  if (!value) {
    throw new Error(`Missing SSM parameter value for ${name}.`);
  }
  return value;
}

async function readSecretString(context: AwsContext, secretId: string): Promise<string> {
  const response = await context.secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretId} has no string value.`);
  }
  return response.SecretString;
}

async function describeSecretArn(context: AwsContext, secretId: string): Promise<string> {
  const response = await context.secrets.send(new DescribeSecretCommand({ SecretId: secretId }));
  if (!response.ARN) {
    throw new Error(`Secret ${secretId} has no ARN.`);
  }
  return response.ARN;
}

async function readRollerConfig(config: JumpYardCloudConfig, context: AwsContext): Promise<RollerConfig> {
  const [env, baseUrl, secretString] = await Promise.all([
    readParameter(context, `/${config.resourcePrefix}/roller/env`),
    readParameter(context, `/${config.resourcePrefix}/roller/base-url`),
    readSecretString(context, `/${config.resourcePrefix}/roller/credentials`),
  ]);

  if (env !== config.roller.environment) throw new Error(`AWS Roller env ${env} does not match config.`);
  if (baseUrl !== config.roller.baseUrl) throw new Error(`AWS Roller base URL ${baseUrl} does not match config.`);

  const credentials = parseCredentials(secretString, `/${config.resourcePrefix}/roller/credentials`);
  if (isCredentialPlaceholder(credentials)) {
    throw new Error("Park-test Roller credentials are placeholder-only.");
  }

  return {
    baseUrl,
    credentials,
    env,
  };
}

function parseCredentials(secretString: string, secretName: string): RollerCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    throw new Error(`Secret ${secretName} must be a JSON object.`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Secret ${secretName} must be a JSON object.`);
  }

  return {
    clientId: String(parsed.clientId ?? parsed.client_id ?? "").trim(),
    clientSecret: String(parsed.clientSecret ?? parsed.client_secret ?? "").trim(),
  };
}

function isCredentialPlaceholder(credentials: RollerCredentials): boolean {
  return isPlaceholderValue(credentials.clientId) || isPlaceholderValue(credentials.clientSecret);
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    trimmed === "SET_IN_AWS_ONLY" ||
    /^SET(_|$)/i.test(trimmed) ||
    /^(TODO|PLACEHOLDER|REPLACE_ME)$/i.test(trimmed)
  );
}

async function readWebhookToken(config: JumpYardCloudConfig, context: AwsContext): Promise<string> {
  const secretName = `/${config.resourcePrefix}/webhooks/dev-token`;
  const secretString = await readSecretString(context, secretName);

  try {
    const parsed = JSON.parse(secretString) as unknown;
    if (isRecord(parsed)) {
      const token = String(parsed.token ?? parsed.webhookToken ?? "").trim();
      if (token) return token;
    }
  } catch {
    const token = secretString.trim();
    if (token) return token;
  }

  throw new Error(`Webhook token secret ${secretName} is empty.`);
}

async function requestRollerAccessToken(config: RollerConfig): Promise<{ request: RollerRequestSummary; token: RollerToken }> {
  assertRollerRequest("POST", "/token");
  const response = await fetch(buildRollerUrl(config.baseUrl, "/token"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.credentials.clientId,
      client_secret: config.credentials.clientSecret,
    }),
  });

  const status = response.status;
  const body = parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? "");
  if (!response.ok) {
    throw new Error(`Roller auth token request failed with HTTP ${status}: ${safeResponseSummary(body)}`);
  }
  if (!isRecord(body)) {
    throw new Error("Roller token response was not a JSON object.");
  }

  const accessToken = String(body.access_token ?? body.accessToken ?? "").trim();
  if (!accessToken) {
    throw new Error("Roller token response did not include an access token.");
  }

  return {
    request: { endpoint: "/token", method: "AUTH", ok: true, status },
    token: {
      accessToken,
      tokenType: stringOrNull(body.token_type ?? body.tokenType) ?? "Bearer",
    },
  };
}

async function requestRollerJson(
  config: RollerConfig,
  token: RollerToken,
  endpointPath: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ body: unknown; request: RollerRequestSummary }> {
  assertRollerRequest(method, endpointPath);
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method,
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType} ${token.accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const status = response.status;
  const parsedBody = parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? "");
  if (!response.ok) {
    throw new Error(`Roller ${method} ${endpointPath} failed with HTTP ${status}: ${safeResponseSummary(parsedBody)}`);
  }

  return {
    body: parsedBody,
    request: { endpoint: endpointPath, method, ok: true, status },
  };
}

function assertRollerRequest(method: string, endpointPath: string): void {
  const parsed = new URL(endpointPath, "https://allowlist.local");
  const pathname = parsed.pathname;
  const allowed =
    (method === "POST" && pathname === "/token") ||
    (method === "GET" && pathname === ROLLER_WEBHOOKS_ENDPOINT) ||
    (method === "POST" && pathname === ROLLER_WEBHOOKS_ENDPOINT);

  if (!allowed) {
    throw new Error(`Blocked non-T0155 Roller request ${method} ${pathname}.`);
  }
}

function extractWebhooks(body: unknown): ExistingWebhookSummary[] {
  const records = Array.isArray(body)
    ? body
    : isRecord(body)
      ? firstArray([body.items, body.webhooks, body.data, body.results])
      : [];

  return records.map((record) => {
    const webhook = isRecord(record) ? record : {};
    const configuration = isRecord(webhook.configuration) ? webhook.configuration : {};
    const webhooks = isRecord(webhook.webhooks) ? webhook.webhooks : isRecord(configuration.webhooks) ? configuration.webhooks : {};
    const booking = isRecord(webhooks.booking) ? webhooks.booking : {};
    const include = isRecord(booking.include) ? booking.include : {};

    return {
      enabled: typeof webhook.enabled === "boolean" ? webhook.enabled : booleanOrNull(configuration.enabled),
      events: collectStrings(booking.events),
      id: stringOrNull(webhook.id ?? webhook.webhookId ?? webhook.uniqueId),
      ticketsIncluded: booleanOrNull(include.tickets),
      url: stringOrNull(webhook.url ?? configuration.url),
    };
  });
}

function validateExistingMatch(match: ExistingWebhookSummary): void {
  if (match.enabled === false) {
    throw new Error(`A disabled Live webhook already uses the target URL. Manual review required before T0155 continues.`);
  }

  if (match.events.length > 0 && !sameStringSet(match.events, WEBHOOK_EVENTS)) {
    throw new Error(`A Live webhook already uses the target URL but has unexpected events. Manual review required.`);
  }

  if (match.ticketsIncluded === false) {
    throw new Error(`A Live webhook already uses the target URL but does not include tickets. Manual review required.`);
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalize = (value: string) => value.trim().toLowerCase();
  const leftSet = new Set(left.map(normalize));
  const rightSet = new Set(right.map(normalize));
  if (leftSet.size !== rightSet.size) return false;
  for (const value of rightSet) {
    if (!leftSet.has(value)) return false;
  }
  return true;
}

function buildCreateWebhookPayload(webhookUrl: string, webhookToken: string): Record<string, unknown> {
  return {
    url: webhookUrl,
    enabled: true,
    authentication: {
      apiKey: webhookToken,
    },
    webhooks: {
      booking: {
        events: [...WEBHOOK_EVENTS],
        include: {
          tickets: true,
        },
      },
    },
  };
}

function safeCreatedWebhookId(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return stringOrNull(body.id ?? body.webhookId ?? body.uniqueId);
}

async function runIntakeSmoke(input: {
  readonly adminSecretArn: string;
  readonly context: AwsContext;
  readonly databaseClusterArn: string;
  readonly webhookToken: string;
  readonly webhookUrl: string;
}): Promise<IntakeSmokeSummary> {
  const eventId = `t0155-smoke-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomUUID()}`;
  const auroraRowsBefore = await countWebhookEventRows(input.context, input.databaseClusterArn, input.adminSecretArn, eventId);

  const response = await fetch(input.webhookUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-correlation-id": eventId,
      "x-roller-apikey": input.webhookToken,
    },
    body: JSON.stringify({
      booking: {
        bookingReference: "T0155-SMOKE",
        uniqueId: "T0155-SMOKE",
      },
      eventType: "Created",
      webhookEventId: eventId,
    }),
  });

  const statusCode = response.status;
  const body = parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? "");
  const responseStatus = isRecord(body) ? stringOrNull(body.status) : null;
  const auroraRowsAfter = await countWebhookEventRows(input.context, input.databaseClusterArn, input.adminSecretArn, eventId);

  if (statusCode !== 200 || responseStatus !== "ignored_disabled") {
    throw new Error(`Webhook intake smoke expected 200 ignored_disabled, got ${statusCode} ${responseStatus ?? "unknown"}.`);
  }
  if (auroraRowsAfter !== auroraRowsBefore) {
    throw new Error(`Webhook intake smoke wrote Aurora rows for ${eventId}; expected no insert while processing is disabled.`);
  }

  return {
    auroraRowsAfter,
    auroraRowsBefore,
    eventId,
    expectedNoAuroraInsert: true,
    expectedStatus: "ignored_disabled",
    performed: true,
    responseStatus,
    statusCode,
  };
}

async function countWebhookEventRows(
  context: AwsContext,
  resourceArn: string,
  secretArn: string,
  eventId: string,
): Promise<number> {
  const response = await context.rds.send(new ExecuteStatementCommand({
    database: "jumpyard_cloud",
    resourceArn,
    secretArn,
    sql: "SELECT COUNT(*)::int AS event_count FROM jumpyard.roller_webhook_events WHERE event_id_or_hash = :eventId",
    parameters: [
      {
        name: "eventId",
        value: { stringValue: eventId },
      },
    ],
  }));

  return response.records?.[0]?.[0]?.longValue ?? 0;
}

async function buildRegisterSummary(args: Args): Promise<RegisterSummary> {
  validateApplyMode(args);
  const config = readConfig(args.configPath);
  validateParkTestConfig(config);
  const identity = readAwsIdentity(config, args.profile);
  const stack = readStackSummary(config, args.profile);
  const context = buildAwsContext(config, args.profile);
  const rollerConfig = await readRollerConfig(config, context);
  const webhookTokenSecretName = `/${config.resourcePrefix}/webhooks/dev-token`;
  const webhookToken = await readWebhookToken(config, context);
  const adminSecretArn = await describeSecretArn(context, `/${config.resourcePrefix}/aurora/admin`);
  const webhookUrl = buildWebhookUrl(stack.apiEndpoint);

  const rollerRequests: RollerRequestSummary[] = [];
  const tokenResult = await requestRollerAccessToken(rollerConfig);
  rollerRequests.push(tokenResult.request);

  const existingBeforeResult = await requestRollerJson(rollerConfig, tokenResult.token, ROLLER_WEBHOOKS_ENDPOINT, "GET");
  rollerRequests.push(existingBeforeResult.request);
  const existingWebhooksBefore = extractWebhooks(existingBeforeResult.body);
  const existingMatchBefore = existingWebhooksBefore.find((webhook) => webhook.url === webhookUrl) ?? null;
  if (existingMatchBefore) {
    validateExistingMatch(existingMatchBefore);
  }

  let createdWebhookId: string | null = null;
  let created = false;

  if (args.apply && !existingMatchBefore) {
    const createResult = await requestRollerJson(
      rollerConfig,
      tokenResult.token,
      ROLLER_WEBHOOKS_ENDPOINT,
      "POST",
      buildCreateWebhookPayload(webhookUrl, webhookToken),
    );
    rollerRequests.push(createResult.request);
    createdWebhookId = safeCreatedWebhookId(createResult.body);
    created = true;
  }

  let registeredWebhookId = existingMatchBefore?.id ?? createdWebhookId;
  if (args.apply) {
    const verifyResult = await requestRollerJson(rollerConfig, tokenResult.token, ROLLER_WEBHOOKS_ENDPOINT, "GET");
    rollerRequests.push(verifyResult.request);
    const verifiedMatch = extractWebhooks(verifyResult.body).find((webhook) => webhook.url === webhookUrl) ?? null;
    if (verifiedMatch) {
      validateExistingMatch(verifiedMatch);
      registeredWebhookId = verifiedMatch.id ?? registeredWebhookId;
    }
  }

  const intakeSmoke =
    args.apply && !args.skipIntakeSmoke
      ? await runIntakeSmoke({
        adminSecretArn,
        context,
        databaseClusterArn: stack.databaseClusterArn,
        webhookToken,
        webhookUrl,
      })
      : null;

  return {
    apply: args.apply,
    aws: {
      account: identity.account,
      arn: identity.arn,
      region: config.awsRegion,
      stackName: stack.stackName,
      stackStatus: stack.stackStatus,
    },
    created,
    existingMatchBefore,
    existingWebhookCountBefore: existingWebhooksBefore.length,
    intakeSmoke,
    mode: args.apply ? "apply" : "dry-run",
    registeredWebhookId,
    roller: {
      baseUrl: rollerConfig.baseUrl,
      env: rollerConfig.env,
      requests: rollerRequests,
    },
    secrets: {
      rollerCredentialValuesPrinted: false,
      rollerCredentialsSecretName: `/${config.resourcePrefix}/roller/credentials`,
      webhookTokenSecretName,
      webhookTokenValuePrinted: false,
    },
    validation: {
      applyPhraseRequired: true,
      liveWriteGatesClosed: true,
      rawRollerPayloadsPrinted: false,
    },
    webhook: {
      duplicateBehavior: [
        "GET /webhooks runs before POST.",
        "An existing matching enabled webhook is reused instead of duplicated.",
        "A disabled or mismatched webhook at the same URL stops the script for manual review.",
      ],
      events: [...WEBHOOK_EVENTS],
      include: {
        tickets: true,
      },
      rollbackEndpoint: registeredWebhookId
        ? `${stripTrailingSlash(rollerConfig.baseUrl)}${ROLLER_WEBHOOKS_ENDPOINT}/${registeredWebhookId}`
        : null,
      url: webhookUrl,
    },
  };
}

function buildWebhookUrl(apiEndpoint: string): string {
  const url = `${stripTrailingSlash(apiEndpoint)}${BOOKING_WEBHOOK_ROUTE}`;
  validateWebhookUrl(url);
  return url;
}

function validateWebhookUrl(webhookUrl: string): void {
  validateHttpsUrl(webhookUrl, "Webhook URL");
  const parsed = new URL(webhookUrl);
  if (!parsed.pathname.endsWith(BOOKING_WEBHOOK_ROUTE)) {
    throw new Error("Webhook URL must target the JumpYard booking webhook route.");
  }
}

function buildRollerUrl(baseUrl: string, endpointPath: string): URL {
  if (!endpointPath.startsWith("/")) {
    throw new Error("Roller endpoint paths must start with '/'.");
  }
  validateHttpsUrl(baseUrl, "Roller base URL");
  const parsedBaseUrl = new URL(baseUrl);
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function validateHttpsUrl(value: string, label: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use https.`);
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseJsonOrTextSummary(text: string, contentType: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();
  if (contentType.includes("application/json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { textLength: text.length, type: "invalid-json" };
    }
  }
  return { textLength: text.length, type: "text" };
}

function safeResponseSummary(body: unknown): string {
  if (!isRecord(body)) return JSON.stringify(body);
  const message = stringOrNull(body.message ?? body.error ?? body.title);
  if (message) return message;
  return `keys=${Object.keys(body).slice(0, 8).join(",")}`;
}

function firstArray(values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function collectStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function assertThrows(description: string, action: () => void): void {
  let threw = false;
  try {
    action();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(`Self-test expected failure for ${description}.`);
  }
}

function runGuardSelfTest(): GuardSelfTestResult {
  assertThrows("apply without write confirmation", () =>
    validateApplyMode({
      apply: true,
      configPath: DEFAULT_CONFIG_PATH,
      json: false,
      selfTest: false,
      skipIntakeSmoke: false,
    }),
  );

  const validConfig = new App({ context: { config: DEFAULT_CONFIG_PATH } });
  const config = loadJumpYardCloudConfig(validConfig);
  validateParkTestConfig(config);

  assertRollerRequest("POST", "/token");
  assertRollerRequest("GET", "/webhooks");
  assertRollerRequest("POST", "/webhooks");
  for (const [method, endpoint] of [
    ["GET", "/bookings/123"],
    ["POST", "/bookings/draft"],
    ["POST", "/redemptions"],
    ["DELETE", "/webhooks/123"],
  ]) {
    assertThrows(`${method} ${endpoint}`, () => assertRollerRequest(method, endpoint));
  }

  return {
    blockedRollerRequestsChecked: 4,
    configChecks: 1,
    writeGuardChecked: true,
  };
}

function printGuardSelfTest(result: GuardSelfTestResult): void {
  console.log("Roller Live webhook registration guard self-test passed.");
  console.log(`Blocked Roller requests checked: ${result.blockedRollerRequestsChecked}`);
  console.log(`Config checks: ${result.configChecks}`);
  console.log(`Write guard checked: ${result.writeGuardChecked}`);
}

function printTextSummary(summary: RegisterSummary): void {
  console.log(summary.created ? "Roller Live webhook registered." : "Roller Live webhook registration checked.");
  console.log(`Mode: ${summary.mode}`);
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region} (${summary.aws.stackName} ${summary.aws.stackStatus})`);
  console.log(`Roller: ${summary.roller.env} ${summary.roller.baseUrl}`);
  console.log(`Webhook endpoint: ${summary.webhook.url}`);
  console.log(`Existing webhook count before: ${summary.existingWebhookCountBefore}`);
  console.log(`Matched existing before: ${Boolean(summary.existingMatchBefore)}`);
  console.log(`Created: ${summary.created}`);
  console.log(`Registered webhook id: ${summary.registeredWebhookId ?? "not available"}`);
  if (summary.intakeSmoke) {
    console.log(
      `Intake smoke: HTTP ${summary.intakeSmoke.statusCode} ${summary.intakeSmoke.responseStatus}; ` +
        `Aurora rows before=${summary.intakeSmoke.auroraRowsBefore}, after=${summary.intakeSmoke.auroraRowsAfter}`,
    );
  }
  console.log("Safety: no secret values, access tokens, raw Roller payloads, or raw webhook payloads printed.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const result = runGuardSelfTest();
    if (args.json) {
      console.log(JSON.stringify({ guardSelfTest: result }, null, 2));
    } else {
      printGuardSelfTest(result);
    }
    return;
  }

  const summary = await buildRegisterSummary(args);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary(summary);
  }
}

main().catch((error: unknown) => {
  console.error(`Roller Live webhook registration failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("No secrets were printed.");
  process.exitCode = 1;
});
