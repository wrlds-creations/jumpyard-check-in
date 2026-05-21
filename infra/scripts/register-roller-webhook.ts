import { existsSync, readFileSync } from "fs";
import path from "path";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";

const {
  buildRollerUrl,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require("../../scripts/roller-client") as RollerClientModule;

const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_REGISTERS_PLAYGROUND_WEBHOOK";
const DEFAULT_WEBHOOK_URL =
  "https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings";
const WEBHOOK_ENDPOINT_PATH = "/webhooks";

interface RollerClientModule {
  buildRollerUrl: (baseUrl: string, endpointPath: string) => URL;
  requestRollerAccessToken: (config: RollerConfig) => Promise<RollerToken>;
  validateRollerSmokeConfig: (config: RollerConfig) => RollerValidation;
}

interface RollerConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  env: string;
}

interface RollerToken {
  accessToken: string;
  tokenType?: string;
}

interface RollerValidation {
  errors: string[];
  ok: boolean;
  safeConfig: {
    baseUrl: string;
    env: string;
  };
}

interface DeployConfig {
  awsAccount: string;
  awsRegion: string;
  resourcePrefix: string;
}

interface RegisterArgs {
  apply: boolean;
  configPath: string;
  json: boolean;
  profile?: string;
  webhookUrl: string;
}

interface AwsContext {
  secrets: SecretsManagerClient;
  ssm: SSMClient;
}

interface ExistingWebhookSummary {
  enabled: boolean | null;
  id: string | null;
  url: string | null;
}

interface RegisterSummary {
  apply: boolean;
  baseUrl: string;
  created: boolean;
  existingMatch: ExistingWebhookSummary | null;
  existingWebhookCount: number | null;
  matchedExisting: boolean;
  mode: "dry-run" | "apply";
  registeredWebhookId: string | null;
  rollerEnv: string;
  webhookUrl: string;
}

function parseArgs(argv: string[]): RegisterArgs {
  let apply = false;
  let configPath = "./config/dev.json";
  let json = false;
  let profile: string | undefined;
  let webhookUrl = process.env.JUMPYARD_WEBHOOK_ENDPOINT_URL || DEFAULT_WEBHOOK_URL;

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

    if (arg === "--webhook-url") {
      webhookUrl = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  validateWebhookUrl(webhookUrl);
  return { apply, configPath, json, profile, webhookUrl };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function validateWebhookUrl(webhookUrl: string): void {
  const parsed = new URL(webhookUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use https.");
  }
  if (!parsed.pathname.endsWith("/v1/roller/webhooks/bookings")) {
    throw new Error("Webhook URL must target the JumpYard booking webhook route.");
  }
}

function readDeployConfig(configPath: string): DeployConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file does not exist: ${resolvedPath}`);
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<DeployConfig>;

  if (!parsed.awsAccount || !parsed.awsRegion || !parsed.resourcePrefix) {
    throw new Error("Config must include awsAccount, awsRegion, and resourcePrefix.");
  }

  return {
    awsAccount: parsed.awsAccount,
    awsRegion: parsed.awsRegion,
    resourcePrefix: parsed.resourcePrefix,
  };
}

function buildAwsContext(config: DeployConfig, profile?: string): AwsContext {
  const credentials = profile ? fromIni({ profile }) : undefined;
  return {
    secrets: new SecretsManagerClient({ credentials, region: config.awsRegion }),
    ssm: new SSMClient({ credentials, region: config.awsRegion }),
  };
}

async function readParameter(context: AwsContext, name: string): Promise<string> {
  const response = await context.ssm.send(new GetParameterCommand({ Name: name }));
  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`Missing SSM parameter value for ${name}.`);
  }
  return value.trim();
}

async function readSecretString(context: AwsContext, secretId: string): Promise<string> {
  const response = await context.secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) {
    throw new Error(`Secret ${secretId} has no string value.`);
  }
  return response.SecretString;
}

async function readRollerConfigFromAws(config: DeployConfig, context: AwsContext): Promise<RollerConfig> {
  const [env, baseUrl, secretString] = await Promise.all([
    readParameter(context, `/${config.resourcePrefix}/roller/env`),
    readParameter(context, `/${config.resourcePrefix}/roller/base-url`),
    readSecretString(context, `/${config.resourcePrefix}/roller/credentials`),
  ]);

  const secret = JSON.parse(secretString) as Record<string, unknown>;
  return {
    baseUrl,
    clientId: String(secret.clientId ?? secret.client_id ?? "").trim(),
    clientSecret: String(secret.clientSecret ?? secret.client_secret ?? "").trim(),
    env,
  };
}

async function readWebhookTokenFromAws(config: DeployConfig, context: AwsContext): Promise<string> {
  const secretString = await readSecretString(context, `/${config.resourcePrefix}/webhooks/dev-token`);

  try {
    const parsed = JSON.parse(secretString) as Record<string, unknown>;
    const token = String(parsed.token ?? parsed.webhookToken ?? "").trim();
    if (token) return token;
  } catch {
    const token = secretString.trim();
    if (token) return token;
  }

  throw new Error("Webhook dev token secret is empty.");
}

async function requestRollerJson(
  config: RollerConfig,
  token: RollerToken,
  endpointPath: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method,
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsedBody: unknown = null;
  if (text) {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = { textLength: text.length };
    }
  }

  if (!response.ok) {
    throw new Error(`Roller ${method} ${endpointPath} failed with HTTP ${response.status}: ${safeResponseSummary(parsedBody)}`);
  }

  return parsedBody;
}

function extractWebhooks(body: unknown): ExistingWebhookSummary[] {
  const records = Array.isArray(body)
    ? body
    : isRecord(body)
      ? firstArray([body.items, body.webhooks, body.data])
      : [];

  return records.map((record) => {
    const webhook = isRecord(record) ? record : {};
    const configuration = isRecord(webhook.configuration) ? webhook.configuration : {};
    return {
      enabled: typeof webhook.enabled === "boolean" ? webhook.enabled : booleanOrNull(configuration.enabled),
      id: stringOrNull(webhook.id ?? webhook.webhookId ?? webhook.uniqueId),
      url: stringOrNull(webhook.url ?? configuration.url),
    };
  });
}

function firstArray(values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
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
        events: ["Created", "Updated", "Cancelled"],
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

function safeResponseSummary(body: unknown): string {
  if (!isRecord(body)) return JSON.stringify(body);
  const message = stringOrNull(body.message ?? body.error ?? body.title);
  if (message) return message;
  return `keys=${Object.keys(body).slice(0, 8).join(",")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function validateApplyMode(args: RegisterArgs): void {
  if (!args.apply) return;

  if (process.env.ROLLER_WEBHOOK_REGISTER_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`Set ROLLER_WEBHOOK_REGISTER_ALLOW_WRITE=${WRITE_CONFIRMATION} to register the Playground webhook.`);
  }
}

function printHumanSummary(summary: RegisterSummary): void {
  console.log(summary.created ? "Roller Playground webhook registered." : "Roller Playground webhook registration checked.");
  console.log(`- env: ${summary.rollerEnv}`);
  console.log(`- baseUrl: ${summary.baseUrl}`);
  console.log(`- webhookUrl: ${summary.webhookUrl}`);
  console.log(`- existingWebhookCount: ${summary.existingWebhookCount ?? "unknown"}`);
  console.log(`- matchedExisting: ${summary.matchedExisting}`);
  console.log(`- created: ${summary.created}`);
  console.log(`- apply: ${summary.apply}`);
  if (summary.registeredWebhookId) {
    console.log(`- registeredWebhookId: ${summary.registeredWebhookId}`);
  }
  console.log("- no secrets, webhook tokens, access tokens, raw Roller responses, or raw webhook payloads were printed.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  validateApplyMode(args);

  const deployConfig = readDeployConfig(args.configPath);
  const context = buildAwsContext(deployConfig, args.profile);
  const rollerConfig = await readRollerConfigFromAws(deployConfig, context);
  const validation = validateRollerSmokeConfig(rollerConfig);

  if (!validation.ok) {
    throw new Error(`Roller config rejected: ${validation.errors.join(" ")}`);
  }

  const token = await requestRollerAccessToken(rollerConfig);
  const webhooksBody = await requestRollerJson(rollerConfig, token, WEBHOOK_ENDPOINT_PATH, "GET");
  const existingWebhooks = extractWebhooks(webhooksBody);
  const existingMatch = existingWebhooks.find((webhook) => webhook.url === args.webhookUrl) ?? null;
  let createdWebhookId: string | null = null;
  let created = false;

  if (args.apply && !existingMatch) {
    const webhookToken = await readWebhookTokenFromAws(deployConfig, context);
    const createdBody = await requestRollerJson(
      rollerConfig,
      token,
      WEBHOOK_ENDPOINT_PATH,
      "POST",
      buildCreateWebhookPayload(args.webhookUrl, webhookToken),
    );
    createdWebhookId = safeCreatedWebhookId(createdBody);
    created = true;
  }

  const summary: RegisterSummary = {
    apply: args.apply,
    baseUrl: validation.safeConfig.baseUrl,
    created,
    existingMatch,
    existingWebhookCount: existingWebhooks.length,
    matchedExisting: Boolean(existingMatch),
    mode: args.apply ? "apply" : "dry-run",
    registeredWebhookId: existingMatch?.id ?? createdWebhookId,
    rollerEnv: validation.safeConfig.env,
    webhookUrl: args.webhookUrl,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  printHumanSummary(summary);
}

main().catch((error) => {
  console.error(`Roller webhook registration failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error("No secrets were printed.");
  process.exit(1);
});
