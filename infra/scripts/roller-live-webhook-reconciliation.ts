import { createHash, randomUUID } from "crypto";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { GetFunctionConcurrencyCommand, GetFunctionConfigurationCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { ExecuteStatementCommand, RDSDataClient } from "@aws-sdk/client-rds-data";
import { DescribeSecretCommand, GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetQueueAttributesCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";
import { App } from "aws-cdk-lib";
import { loadJumpYardCloudConfig, type JumpYardCloudConfig } from "../lib/config";

const ACCOUNT = "376129878018";
const REGION = "eu-north-1";
const PREFIX = "jumpyard-check-in-park-test";
const LIVE_BASE_URL = "https://api.roller.app";
const LIVE_APPROVAL = "T0197_LIVE_WEBHOOK_PROCESSING_APPROVED";
const VENUE_ID = "50871";
const WEBHOOK_ID = "1465";
const WEBHOOK_ROUTE = "/v1/roller/webhooks/bookings";
const APPLY_ENV = "T0197_WEBHOOK_RECONCILIATION_APPROVAL";
const SMOKE_APPROVAL = "I_APPROVE_T0197_PARK_TEST_SYNTHETIC_WEBHOOK";
const REPLAY_APPROVAL = "I_APPROVE_T0197_PARK_TEST_EVENT_REPLAY";
const DEFAULT_CONFIG = "./config/park-test-full-flow-rehearsal.json";

interface Args {
  readonly apply: boolean;
  readonly booking?: string;
  readonly configPath: string;
  readonly json: boolean;
  readonly profile?: string;
  readonly replayEvent?: string;
  readonly selfTest: boolean;
}

interface Context {
  readonly cloudformation: CloudFormationClient;
  readonly lambda: LambdaClient;
  readonly rds: RDSDataClient;
  readonly secrets: SecretsManagerClient;
  readonly sqs: SQSClient;
  readonly ssm: SSMClient;
  readonly sts: STSClient;
}

interface StackState {
  readonly apiEndpoint: string;
  readonly clusterArn: string;
  readonly processorFunctionName: string;
  readonly queueUrl: string;
  readonly stackName: string;
  readonly stackStatus: string;
}

interface RollerCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface RollerWebhook {
  readonly enabled: boolean | null;
  readonly events: string[];
  readonly id: string | null;
  readonly ticketsIncluded: boolean | null;
  readonly url: string | null;
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let booking: string | undefined;
  let configPath = DEFAULT_CONFIG;
  let json = false;
  let profile: string | undefined;
  let replayEvent: string | undefined;
  let selfTest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--booking") booking = requiredValue(argv, ++index, arg);
    else if (arg === "--config") configPath = requiredValue(argv, ++index, arg);
    else if (arg === "--json") json = true;
    else if (arg === "--profile") profile = requiredValue(argv, ++index, arg);
    else if (arg === "--replay-event") replayEvent = requiredValue(argv, ++index, arg);
    else if (arg === "--self-test") selfTest = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (booking && replayEvent) throw new Error("Choose either --booking or --replay-event, not both.");
  if ((booking || replayEvent) && !apply) throw new Error("Synthetic smoke and replay require --apply.");
  if (apply && !booking && !replayEvent) throw new Error("--apply requires --booking or --replay-event.");
  validateOpaqueIdentifier(booking, "booking identifier");
  validateOpaqueIdentifier(replayEvent, "event id");
  return { apply, booking, configPath, json, profile, replayEvent, selfTest };
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]?.trim();
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function validateOpaqueIdentifier(value: string | undefined, label: string): void {
  if (value === undefined) return;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function readConfig(configPath: string): JumpYardCloudConfig {
  return loadJumpYardCloudConfig(new App({ context: { config: configPath } }));
}

function validateConfig(config: JumpYardCloudConfig): void {
  const errors: string[] = [];
  if (config.awsAccount !== ACCOUNT) errors.push(`AWS account must be ${ACCOUNT}.`);
  if (config.awsRegion !== REGION) errors.push(`AWS region must be ${REGION}.`);
  if (config.resourcePrefix !== PREFIX) errors.push(`Resource prefix must be ${PREFIX}.`);
  if (config.tags["WRLDS:Environment"] !== "park-test") errors.push("Environment must be park-test.");
  if (config.roller.environment !== "live" || config.roller.baseUrl !== LIVE_BASE_URL) {
    errors.push("Roller must be exact Live configuration.");
  }
  if (config.safetyGates.emergencyStop) errors.push("Emergency stop must be open for T0197 processing.");
  if (!config.safetyGates.rollerWebhookProcessingEnabled) errors.push("Webhook processing gate must be enabled.");
  if (config.webhookProcessing.liveApproval !== LIVE_APPROVAL) errors.push("T0197 Live approval is missing.");
  if (config.webhookProcessing.venueId !== VENUE_ID) errors.push(`Venue must be ${VENUE_ID}.`);
  if (config.webhookProcessing.bookingRetentionDays !== 30) errors.push("Retention must be 30 days past plus all future.");
  if (!config.webhookProcessing.recoveryScheduleEnabled) errors.push("Webhook recovery schedule must be enabled.");
  if (config.safetyGates.guestMessagingSendsEnabled) errors.push("Guest messaging must remain disabled.");
  if (errors.length > 0) throw new Error(errors.join(" "));
}

function validateApplyApproval(args: Args): void {
  if (!args.apply) return;
  const expected = args.booking ? SMOKE_APPROVAL : REPLAY_APPROVAL;
  if (process.env[APPLY_ENV] !== expected) {
    throw new Error(`Set ${APPLY_ENV}=${expected} for this exact park-test operation.`);
  }
}

function buildContext(config: JumpYardCloudConfig, profile?: string): Context {
  const credentials = profile ? fromIni({ profile }) : undefined;
  const shared = { credentials, region: config.awsRegion };
  return {
    cloudformation: new CloudFormationClient(shared),
    lambda: new LambdaClient(shared),
    rds: new RDSDataClient(shared),
    secrets: new SecretsManagerClient(shared),
    sqs: new SQSClient(shared),
    ssm: new SSMClient(shared),
    sts: new STSClient(shared),
  };
}

async function readStackState(context: Context, config: JumpYardCloudConfig): Promise<StackState> {
  const stackName = `${config.resourcePrefix}-stack`;
  const response = await context.cloudformation.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = response.Stacks?.[0];
  if (!stack) throw new Error(`Stack ${stackName} was not found.`);
  const outputs = Object.fromEntries(
    (stack.Outputs ?? []).flatMap((output) =>
      output.OutputKey && output.OutputValue ? [[output.OutputKey, output.OutputValue]] : [],
    ),
  );
  const apiEndpoint = outputs.ApiEndpoint;
  const clusterArn = outputs.OperationalDatabaseClusterArn;
  const processorFunctionName = outputs.WebhookProcessorFunctionName;
  const queueUrl = outputs.WebhookQueueUrl;
  if (!apiEndpoint || !clusterArn || !processorFunctionName || !queueUrl) {
    throw new Error("Stack is missing one or more T0197 outputs.");
  }
  return {
    apiEndpoint: apiEndpoint.replace(/\/$/, ""),
    clusterArn,
    processorFunctionName,
    queueUrl,
    stackName,
    stackStatus: stack.StackStatus ?? "unknown",
  };
}

async function readSecret(context: Context, secretId: string): Promise<string> {
  const response = await context.secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) throw new Error(`Secret ${secretId} has no string value.`);
  return response.SecretString;
}

async function readParameter(context: Context, name: string): Promise<string> {
  const response = await context.ssm.send(new GetParameterCommand({ Name: name }));
  const value = response.Parameter?.Value?.trim();
  if (!value) throw new Error(`Parameter ${name} is empty.`);
  return value;
}

function parseCredentials(secret: string): RollerCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new Error("Roller credential secret is not JSON.");
  }
  if (!isRecord(parsed)) throw new Error("Roller credential secret is not an object.");
  const clientId = String(parsed.clientId ?? parsed.client_id ?? "").trim();
  const clientSecret = String(parsed.clientSecret ?? parsed.client_secret ?? "").trim();
  if (!clientId || !clientSecret || clientId === "SET_IN_AWS_ONLY") {
    throw new Error("Roller Live credentials are not configured.");
  }
  return { clientId, clientSecret };
}

async function readRollerWebhook(
  context: Context,
  config: JumpYardCloudConfig,
  expectedUrl: string,
): Promise<{ count: number; match: RollerWebhook }> {
  const [environment, baseUrl, secret] = await Promise.all([
    readParameter(context, `/${config.resourcePrefix}/roller/env`),
    readParameter(context, `/${config.resourcePrefix}/roller/base-url`),
    readSecret(context, `/${config.resourcePrefix}/roller/credentials`),
  ]);
  if (environment !== "live" || baseUrl !== LIVE_BASE_URL) throw new Error("AWS Roller configuration is not exact Live.");
  const credentials = parseCredentials(secret);
  const tokenResponse = await fetch(`${baseUrl}/token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: credentials.clientId, client_secret: credentials.clientSecret }),
  });
  if (!tokenResponse.ok) throw new Error(`Roller auth readback failed with HTTP ${tokenResponse.status}.`);
  const tokenBody = (await tokenResponse.json()) as Record<string, unknown>;
  const accessToken = String(tokenBody.access_token ?? tokenBody.accessToken ?? "").trim();
  const tokenType = String(tokenBody.token_type ?? tokenBody.tokenType ?? "Bearer").trim();
  if (!accessToken) throw new Error("Roller auth readback returned no token.");

  await sleep(1_000);
  const response = await fetch(`${baseUrl}/webhooks`, {
    method: "GET",
    headers: { accept: "application/json", authorization: `${tokenType} ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Roller webhook readback failed with HTTP ${response.status}.`);
  const webhooks = extractWebhooks(await response.json());
  const match = webhooks.find((webhook) => webhook.id === WEBHOOK_ID && webhook.url === expectedUrl);
  if (!match) throw new Error(`Roller webhook ${WEBHOOK_ID} did not match the park-test endpoint.`);
  if (match.enabled !== true || match.ticketsIncluded !== true || !sameSet(match.events, ["Created", "Updated", "Cancelled"])) {
    throw new Error(`Roller webhook ${WEBHOOK_ID} has an unexpected registration shape.`);
  }
  return { count: webhooks.length, match };
}

function extractWebhooks(body: unknown): RollerWebhook[] {
  const root = isRecord(body) ? body : {};
  const records = Array.isArray(body)
    ? body
    : firstArray([root.items, root.webhooks, root.data, root.results]);
  return records.map((record) => {
    const webhook = isRecord(record) ? record : {};
    const configuration = isRecord(webhook.configuration) ? webhook.configuration : {};
    const webhookGroups = isRecord(webhook.webhooks)
      ? webhook.webhooks
      : isRecord(configuration.webhooks)
        ? configuration.webhooks
        : {};
    const booking = isRecord(webhookGroups.booking) ? webhookGroups.booking : {};
    const include = isRecord(booking.include) ? booking.include : {};
    return {
      enabled: booleanOrNull(webhook.enabled ?? configuration.enabled),
      events: collectStrings(booking.events),
      id: stringOrNull(webhook.id ?? webhook.webhookId ?? webhook.uniqueId),
      ticketsIncluded: booleanOrNull(include.tickets),
      url: stringOrNull(webhook.url ?? configuration.url),
    };
  });
}

async function readAwsRuntime(
  context: Context,
  config: JumpYardCloudConfig,
  stack: StackState,
): Promise<Record<string, unknown>> {
  const identity = await context.sts.send(new GetCallerIdentityCommand({}));
  if (identity.Account !== ACCOUNT) throw new Error(`AWS identity is not account ${ACCOUNT}.`);
  const intakeName = `${config.resourcePrefix}-stack-webhook`;
  const [intake, processor, processorConcurrency, queue] = await Promise.all([
    context.lambda.send(new GetFunctionConfigurationCommand({ FunctionName: intakeName })),
    context.lambda.send(new GetFunctionConfigurationCommand({ FunctionName: stack.processorFunctionName })),
    context.lambda.send(new GetFunctionConcurrencyCommand({ FunctionName: stack.processorFunctionName })),
    context.sqs.send(new GetQueueAttributesCommand({
      QueueUrl: stack.queueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "RedrivePolicy"],
    })),
  ]);
  validateFunctionEnvironment(intake.Environment?.Variables, "intake");
  validateFunctionEnvironment(processor.Environment?.Variables, "processor");
  if (processorConcurrency.ReservedConcurrentExecutions !== 1) {
    throw new Error("Webhook processor concurrency is not serialized.");
  }
  if (!queue.Attributes?.RedrivePolicy) throw new Error("Webhook queue has no DLQ redrive policy.");
  return {
    account: identity.Account,
    intakeFunctionState: intake.State ?? "unknown",
    processorConcurrency: processorConcurrency.ReservedConcurrentExecutions,
    processorFunctionState: processor.State ?? "unknown",
    queueInFlight: Number(queue.Attributes.ApproximateNumberOfMessagesNotVisible ?? 0),
    queueVisible: Number(queue.Attributes.ApproximateNumberOfMessages ?? 0),
    region: REGION,
  };
}

function validateFunctionEnvironment(environment: Record<string, string> | undefined, mode: "intake" | "processor"): void {
  const env = environment ?? {};
  if (
    env.ENABLE_ROLLER_WEBHOOK_PROCESSING !== "true" ||
    env.JUMPYARD_ENVIRONMENT !== "park-test" ||
    env.ROLLER_WEBHOOK_LIVE_APPROVAL !== LIVE_APPROVAL ||
    env.ROLLER_WEBHOOK_VENUE_ID !== VENUE_ID ||
    env.WEBHOOK_AUTH_HEADER !== "x-roller-apikey" ||
    env.WEBHOOK_RUNTIME_MODE !== mode
  ) {
    throw new Error(`Webhook ${mode} Lambda environment is outside the T0197 boundary.`);
  }
}

async function performSyntheticSmoke(
  context: Context,
  config: JumpYardCloudConfig,
  stack: StackState,
  booking: string,
): Promise<Record<string, unknown>> {
  const secret = await readSecret(context, `/${config.resourcePrefix}/webhooks/dev-token`);
  const token = parseWebhookToken(secret);
  const eventId = `t0197-smoke-${randomUUID()}`;
  const response = await fetch(`${stack.apiEndpoint}${WEBHOOK_ROUTE}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-roller-apikey": token },
    body: JSON.stringify({ eventId, eventType: "Updated", bookingReference: booking }),
  });
  if (response.status !== 200) throw new Error(`Synthetic webhook intake failed with HTTP ${response.status}.`);
  const body = (await response.json()) as Record<string, unknown>;
  if (body.status !== "accepted" && body.status !== "duplicate_requeued") {
    throw new Error(`Synthetic webhook intake returned safe status ${String(body.status ?? "unknown")}.`);
  }
  const status = await waitForEventStatus(context, config, stack, eventId);
  return {
    eventIdHash: hash(eventId).slice(0, 16),
    intakeStatus: body.status,
    processorStatus: status,
    rawPayloadPrinted: false,
    secretPrinted: false,
  };
}

function parseWebhookToken(secret: string): string {
  try {
    const parsed = JSON.parse(secret) as unknown;
    if (isRecord(parsed)) {
      const value = String(parsed.token ?? parsed.webhookToken ?? "").trim();
      if (value) return value;
    }
  } catch {
    // Existing secret can also be a plain token.
  }
  const value = secret.trim();
  if (!value) throw new Error("Webhook token secret is empty.");
  return value;
}

async function resolveAdminSecretArn(context: Context, config: JumpYardCloudConfig): Promise<string> {
  const response = await context.secrets.send(
    new DescribeSecretCommand({ SecretId: `/${config.resourcePrefix}/aurora/admin` }),
  );
  if (!response.ARN) throw new Error("Aurora admin secret ARN was not found.");
  return response.ARN;
}

async function waitForEventStatus(
  context: Context,
  config: JumpYardCloudConfig,
  stack: StackState,
  eventId: string,
): Promise<string> {
  const secretArn = await resolveAdminSecretArn(context, config);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await context.rds.send(new ExecuteStatementCommand({
      database: "jumpyard_cloud",
      resourceArn: stack.clusterArn,
      secretArn,
      sql: `SELECT status FROM jumpyard.roller_webhook_events WHERE event_id_or_hash = :eventId LIMIT 1`,
      parameters: [{ name: "eventId", value: { stringValue: eventId } }],
    }));
    const status = result.records?.[0]?.[0]?.stringValue;
    if (status === "processed" || status === "ignored_scope") return status;
    if (status === "failed") throw new Error("Synthetic webhook reconciliation reached failed status.");
    await sleep(2_000);
  }
  throw new Error("Synthetic webhook reconciliation did not finish within 60 seconds.");
}

async function performReplay(context: Context, stack: StackState, eventId: string): Promise<Record<string, unknown>> {
  await context.sqs.send(new SendMessageCommand({
    QueueUrl: stack.queueUrl,
    MessageBody: JSON.stringify({
      correlationId: randomUUID(),
      eventId,
      operation: "reconcile_booking_webhook",
    }),
    MessageDeduplicationId: hash(`${eventId}:${randomUUID()}`),
    MessageGroupId: "roller-booking-webhooks",
  }));
  return { eventIdHash: hash(eventId).slice(0, 16), queued: true, secretPrinted: false };
}

function runSelfTest(): void {
  const previous = process.env[APPLY_ENV];
  try {
    const dryRun = parseArgs([]);
    if (dryRun.apply || dryRun.configPath !== DEFAULT_CONFIG) throw new Error("Dry-run defaults are invalid.");
    expectThrow(() => parseArgs(["--booking", "B1"]), "require --apply");
    expectThrow(() => parseArgs(["--apply"]), "requires an operation");
    expectThrow(() => parseArgs(["--apply", "--booking", "B1", "--replay-event", "E1"]), "exclusive operations");
    delete process.env[APPLY_ENV];
    expectThrow(() => validateApplyApproval(parseArgs(["--apply", "--booking", "B1"])), "smoke approval");
    process.env[APPLY_ENV] = SMOKE_APPROVAL;
    validateApplyApproval(parseArgs(["--apply", "--booking", "B1"]));
    process.env[APPLY_ENV] = REPLAY_APPROVAL;
    validateApplyApproval(parseArgs(["--apply", "--replay-event", "E1"]));
    const extracted = extractWebhooks({ items: [{
      id: WEBHOOK_ID,
      enabled: true,
      url: `https://example.test${WEBHOOK_ROUTE}`,
      webhooks: { booking: { events: ["Created", "Updated", "Cancelled"], include: { tickets: true } } },
    }] });
    if (extracted[0]?.id !== WEBHOOK_ID || extracted[0]?.ticketsIncluded !== true) {
      throw new Error("Webhook readback extraction self-test failed.");
    }
    console.log("T0197 webhook reconciliation operator self-test passed.");
  } finally {
    if (previous === undefined) delete process.env[APPLY_ENV];
    else process.env[APPLY_ENV] = previous;
  }
}

function expectThrow(action: () => unknown, label: string): void {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`Expected ${label} to fail closed.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
    return;
  }
  const config = readConfig(args.configPath);
  validateConfig(config);
  validateApplyApproval(args);
  const context = buildContext(config, args.profile);
  const stack = await readStackState(context, config);
  const expectedUrl = `${stack.apiEndpoint}${WEBHOOK_ROUTE}`;
  const [aws, roller] = await Promise.all([
    readAwsRuntime(context, config, stack),
    readRollerWebhook(context, config, expectedUrl),
  ]);
  const operation = args.booking
    ? await performSyntheticSmoke(context, config, stack, args.booking)
    : args.replayEvent
      ? await performReplay(context, stack, args.replayEvent)
      : null;
  const summary = {
    mode: args.apply ? "apply" : "read-only",
    aws: { ...aws, stackName: stack.stackName, stackStatus: stack.stackStatus },
    operation,
    roller: {
      existingWebhookCount: roller.count,
      expectedHeader: "x-roller-apikey",
      webhook: roller.match,
    },
    safety: {
      guestMessagingEnabled: false,
      rawPayloadPrinted: false,
      rollerBusinessWritePerformed: false,
      secretPrinted: false,
    },
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log("T0197 Roller webhook reconciliation preflight passed.");
    console.log(`Mode: ${summary.mode}; stack: ${stack.stackStatus}; queue visible: ${aws.queueVisible}.`);
    console.log(`Roller webhook ${WEBHOOK_ID}: enabled, exact endpoint/events, tickets included.`);
    if (operation) console.log(`Guarded operation: ${JSON.stringify(operation)}.`);
    console.log("Safety: no Roller business write, guest send, raw payload, token, secret, or unmasked PII output.");
  }
}

function firstArray(values: unknown[]): unknown[] {
  return values.find(Array.isArray) as unknown[] ?? [];
}

function collectStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function sameSet(left: string[], right: string[]): boolean {
  const normalize = (value: string) => value.trim().toLowerCase();
  return left.length === right.length && right.every((item) => left.map(normalize).includes(normalize(item)));
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringOrNull(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error: unknown) => {
  console.error(`T0197 webhook reconciliation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
