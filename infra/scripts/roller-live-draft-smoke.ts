import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
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
const DEFAULT_PARENT_PRODUCT_ID = "1189805";
const DRAFT_QUANTITY = 1;
const WRITE_ENV_VAR = "ROLLER_LIVE_DRAFT_SMOKE_ALLOW_WRITE";
const WRITE_PHRASE = "I_UNDERSTAND_THIS_CREATES_ONE_ROLLER_LIVE_DRAFT_FOR_JUMPYARD_NACKA";

interface Args {
  readonly apply: boolean;
  readonly configPath: string;
  readonly date: string;
  readonly fallbackSecretName?: string;
  readonly json: boolean;
  readonly parentProductId: string;
  readonly profile?: string;
  readonly selfTest: boolean;
  readonly startTime?: string;
}

interface AwsContext {
  readonly secrets: SecretsManagerClient;
  readonly ssm: SSMClient;
}

interface AwsIdentity {
  readonly account: string;
  readonly arn: string;
}

interface CredentialSource {
  readonly fallbackSecretName: string | null;
  readonly primarySecretName: string;
  readonly usedFallback: boolean;
}

interface RollerCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface RollerConfig {
  readonly baseUrl: string;
  readonly credentialSource: CredentialSource;
  readonly credentials: RollerCredentials;
  readonly env: string;
}

interface RollerToken {
  readonly accessToken: string;
  readonly expiresIn: number | null;
  readonly tokenType?: string;
}

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface RollerResult {
  readonly body: unknown;
  readonly endpointPath: string;
  readonly ok: boolean;
  readonly status: number;
}

interface SelectedProduct {
  readonly capacityRemaining: number | null;
  readonly childProductId: string;
  readonly childProductName: string | null;
  readonly onlineSalesOpen: boolean | null;
  readonly parentProductId: string;
  readonly startTime: string;
  readonly unitPrice: number | null;
  readonly unitPriceCents: number | null;
}

interface CostsSummary {
  readonly amountOwing: number | null;
  readonly cardFee: number | null;
  readonly discount: number | null;
  readonly fees: number | null;
  readonly feeTax: number | null;
  readonly subTotal: number | null;
  readonly subTotalTax: number | null;
  readonly tax: number | null;
  readonly taxExclusive: number | null;
  readonly total: number | null;
  readonly totalExcludingFees: number | null;
  readonly totalIgnoringDeposit: number | null;
  readonly transactionFee: number | null;
}

interface JwtSummary {
  readonly expiresAt?: string | null;
  readonly headerKeys?: readonly string[];
  readonly partCount?: number;
  readonly payloadKeys?: readonly string[];
  readonly present: boolean;
}

interface DraftSummary {
  readonly bookingReference: string | null;
  readonly capacityReservationId: string | null;
  readonly costs: CostsSummary;
  readonly endpoint: "/bookings/draft";
  readonly externalId: string;
  readonly itemCount: 1;
  readonly paymentJwtSummary: JwtSummary;
  readonly responseSummary: unknown;
  readonly rollerDraftUniqueId: string | null;
  readonly status: number;
  readonly wroteBooking: true;
}

interface GuardSelfTestResult {
  readonly allowedChecked: number;
  readonly rejectedChecked: number;
  readonly writeConfirmationChecked: boolean;
}

interface DraftSmokeSummary {
  readonly aws: {
    readonly account: string;
    readonly arn: string;
    readonly region: string;
  };
  readonly config: {
    readonly resourcePrefix: string;
    readonly rollerBaseUrl: string;
    readonly rollerEnv: string;
    readonly safetyGates: JumpYardCloudConfig["safetyGates"];
  };
  readonly credentialSource: CredentialSource & {
    readonly secretValuesPrinted: false;
  };
  readonly draft: DraftSummary;
  readonly guardSelfTest: GuardSelfTestResult;
  readonly quote: {
    readonly costs: CostsSummary;
    readonly endpoint: "/bookings/draft/costs";
    readonly externalId: string;
    readonly responseSummary: unknown;
    readonly status: number;
    readonly wroteBooking: false;
  };
  readonly rollerCalls: readonly {
    readonly endpoint: string;
    readonly method: "AUTH" | "GET" | "POST";
    readonly ok: boolean;
    readonly status: number;
  }[];
  readonly safety: {
    readonly auroraWrites: false;
    readonly awsResourceChanged: false;
    readonly bookingDraftCreated: true;
    readonly frontendTraffic: false;
    readonly paymentStarted: false;
    readonly publicApiCall: false;
    readonly redeemCalled: false;
    readonly secretValuesPrinted: false;
    readonly smsOrEmailSent: false;
    readonly webhookProcessingEnabled: false;
  };
  readonly selected: SelectedProduct & {
    readonly bookingDate: string;
    readonly quantity: 1;
  };
  readonly writeGate: {
    readonly applyFlag: true;
    readonly envVar: typeof WRITE_ENV_VAR;
    readonly phraseMatched: true;
  };
}

function parseArgs(argv: string[]): Args {
  let apply = false;
  let configPath = DEFAULT_CONFIG_PATH;
  let date = defaultSmokeDate();
  let fallbackSecretName = process.env.ROLLER_LIVE_DRAFT_FALLBACK_SECRET_NAME;
  let json = false;
  let parentProductId = DEFAULT_PARENT_PRODUCT_ID;
  let profile: string | undefined;
  let selfTest = false;
  let startTime: string | undefined;

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

    if (arg === "--date") {
      date = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--fallback-secret" || arg === "--fallback-credentials-secret") {
      fallbackSecretName = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--parent-product-id") {
      parentProductId = requiredNext(argv, index, arg);
      index += 1;
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

    if (arg === "--start-time") {
      startTime = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must use YYYY-MM-DD.");
  if (!/^\d+$/.test(parentProductId)) throw new Error("--parent-product-id must be a Roller numeric product id.");
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) throw new Error("--start-time must use HH:mm.");

  return {
    apply,
    configPath,
    date,
    fallbackSecretName: fallbackSecretName?.trim() || undefined,
    json,
    parentProductId,
    profile,
    selfTest,
    startTime,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`Missing value for ${arg}.`);
  return value;
}

function defaultSmokeDate(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function readConfig(configPath: string): JumpYardCloudConfig {
  const app = new App({ context: { config: configPath } });
  return loadJumpYardCloudConfig(app);
}

function validateSmokeConfig(config: JumpYardCloudConfig): void {
  const errors: string[] = [];

  if (config.awsAccount !== EXPECTED_AWS_ACCOUNT) errors.push(`awsAccount must be ${EXPECTED_AWS_ACCOUNT}.`);
  if (config.awsRegion !== EXPECTED_AWS_REGION) errors.push(`awsRegion must be ${EXPECTED_AWS_REGION}.`);
  if (config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX) {
    errors.push(`resourcePrefix must be ${EXPECTED_RESOURCE_PREFIX}.`);
  }
  if (config.roller.environment !== EXPECTED_ENV) errors.push(`roller.environment must be ${EXPECTED_ENV}.`);
  if (config.roller.baseUrl !== EXPECTED_BASE_URL) errors.push(`roller.baseUrl must be ${EXPECTED_BASE_URL}.`);
  if (!config.safetyGates.emergencyStop) errors.push("safetyGates.emergencyStop must stay true.");
  if (config.safetyGates.staffAuthEnabled) errors.push("safetyGates.staffAuthEnabled must stay false.");
  if (config.safetyGates.guestMessagingSendsEnabled) {
    errors.push("safetyGates.guestMessagingSendsEnabled must stay false.");
  }
  if (config.safetyGates.rollerWebhookProcessingEnabled) {
    errors.push("safetyGates.rollerWebhookProcessingEnabled must stay false.");
  }
  if (config.safetyGates.rollerBookingDraftWritesEnabled) {
    errors.push("safetyGates.rollerBookingDraftWritesEnabled must stay false for this local T0158 smoke.");
  }
  if (config.safetyGates.rollerRedeemWritesEnabled) {
    errors.push("safetyGates.rollerRedeemWritesEnabled must stay false.");
  }

  if (errors.length > 0) throw new Error(errors.join(" "));
}

function assertWriteConfirmation(args: Pick<Args, "apply">): void {
  if (!args.apply) throw new Error("Refusing to create a Roller Live draft without --apply.");
  if (process.env[WRITE_ENV_VAR] !== WRITE_PHRASE) {
    throw new Error(`Refusing to create a Roller Live draft unless ${WRITE_ENV_VAR} matches the required phrase.`);
  }
}

function readAwsIdentity(config: JumpYardCloudConfig, profile?: string): AwsIdentity {
  const args = ["sts", "get-caller-identity", "--output", "json", "--region", config.awsRegion];
  if (profile) args.push("--profile", profile);

  const raw = execFileSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(raw) as Partial<{ Account: string; Arn: string }>;
  const account = String(parsed.Account ?? "");
  const arn = String(parsed.Arn ?? "");

  if (account !== config.awsAccount) {
    throw new Error(`AWS identity account ${account || "unknown"} does not match expected ${config.awsAccount}.`);
  }

  return { account, arn };
}

function buildAwsContext(config: JumpYardCloudConfig, profile?: string): AwsContext {
  const credentials = profile ? fromIni({ profile }) : undefined;
  return {
    secrets: new SecretsManagerClient({ credentials, region: config.awsRegion }),
    ssm: new SSMClient({ credentials, region: config.awsRegion }),
  };
}

async function readParameter(context: AwsContext, name: string): Promise<string> {
  const response = await context.ssm.send(new GetParameterCommand({ Name: name }));
  const value = response.Parameter?.Value?.trim();
  if (!value) throw new Error(`Missing SSM parameter value for ${name}.`);
  return value;
}

async function readSecretString(context: AwsContext, secretId: string): Promise<string> {
  const response = await context.secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!response.SecretString) throw new Error(`Secret ${secretId} has no string value.`);
  return response.SecretString;
}

async function readRollerConfigFromAws(
  config: JumpYardCloudConfig,
  context: AwsContext,
  fallbackSecretName?: string,
): Promise<RollerConfig> {
  const primarySecretName = `/${config.resourcePrefix}/roller/credentials`;
  const [env, baseUrl, primarySecretString] = await Promise.all([
    readParameter(context, `/${config.resourcePrefix}/roller/env`),
    readParameter(context, `/${config.resourcePrefix}/roller/base-url`),
    readSecretString(context, primarySecretName),
  ]);

  if (env !== config.roller.environment) throw new Error(`AWS Roller env ${env} does not match config.`);
  if (baseUrl !== config.roller.baseUrl) throw new Error(`AWS Roller base URL ${baseUrl} does not match config.`);

  const primaryCredentials = parseCredentials(primarySecretString, primarySecretName);
  if (!isCredentialPlaceholder(primaryCredentials)) {
    return {
      baseUrl,
      credentialSource: { fallbackSecretName: null, primarySecretName, usedFallback: false },
      credentials: primaryCredentials,
      env,
    };
  }

  if (!fallbackSecretName) {
    throw new Error(`Primary park-test Roller credentials secret ${primarySecretName} is placeholder-only.`);
  }

  const fallbackCredentials = parseCredentials(await readSecretString(context, fallbackSecretName), fallbackSecretName);
  if (isCredentialPlaceholder(fallbackCredentials)) {
    throw new Error(`Fallback Roller credentials secret ${fallbackSecretName} is also placeholder-only.`);
  }

  return {
    baseUrl,
    credentialSource: { fallbackSecretName, primarySecretName, usedFallback: true },
    credentials: fallbackCredentials,
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

  if (!isRecord(parsed)) throw new Error(`Secret ${secretName} must be a JSON object.`);

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

function validateLiveRollerConfig(config: RollerConfig): void {
  const errors: string[] = [];
  if (config.env !== EXPECTED_ENV) errors.push(`Roller env must be ${EXPECTED_ENV}.`);
  if (config.baseUrl !== EXPECTED_BASE_URL) errors.push(`Roller base URL must be ${EXPECTED_BASE_URL}.`);
  if (isCredentialPlaceholder(config.credentials)) errors.push("Roller credentials must be real values.");
  if (errors.length > 0) throw new Error(errors.join(" "));
}

async function requestRollerAccessToken(config: RollerConfig): Promise<{ status: number; token: RollerToken }> {
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
  if (!response.ok) throw new Error(`Roller auth failed with HTTP ${status}: ${safeResponseSummary(body)}`);
  if (!isRecord(body)) throw new Error("Roller token response was not a JSON object.");

  const accessToken = String(body.access_token ?? body.accessToken ?? "").trim();
  if (!accessToken) throw new Error("Roller token response did not include an access token.");

  return {
    status,
    token: {
      accessToken,
      expiresIn: numberOrNull(body.expires_in ?? body.expiresIn),
      tokenType: stringOrNull(body.token_type ?? body.tokenType) ?? "Bearer",
    },
  };
}

async function requestRollerGet(config: RollerConfig, token: RollerToken, endpointPath: string): Promise<RollerResult> {
  assertDraftSmokeRollerRequest("GET", endpointPath);

  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
    },
  });

  const body = parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? "");
  return { body, endpointPath, ok: response.ok, status: response.status };
}

async function requestRollerPost(
  config: RollerConfig,
  token: RollerToken,
  endpointPath: "/bookings/draft/costs" | "/bookings/draft",
  payload: JsonRecord,
): Promise<RollerResult> {
  assertDraftSmokeRollerRequest("POST", endpointPath);

  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? "");
  return { body, endpointPath, ok: response.ok, status: response.status };
}

function buildRollerUrl(baseUrl: string, endpointPath: string): URL {
  if (!endpointPath.startsWith("/")) throw new Error("Roller endpoint paths must start with '/'.");
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:") throw new Error("Roller base URL must use https.");
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function assertDraftSmokeRollerRequest(method: string, endpointPath: string): void {
  const parsed = new URL(endpointPath, "https://allowlist.local");
  const pathname = parsed.pathname;
  const allowed =
    (method === "GET" && pathname === "/product-availability") ||
    (method === "POST" && pathname === "/bookings/draft/costs") ||
    (method === "POST" && pathname === "/bookings/draft");

  if (!allowed) throw new Error(`Blocked non-T0158 Roller endpoint ${method} ${pathname}.`);
}

function runGuardSelfTest(): GuardSelfTestResult {
  const allowed = [
    ["GET", "/product-availability?Date=2026-06-29&ProductIds=1189805"],
    ["POST", "/bookings/draft/costs"],
    ["POST", "/bookings/draft"],
  ] as const;
  const rejected = [
    ["GET", "/venues/me"],
    ["GET", "/products"],
    ["GET", "/bookings/123"],
    ["GET", "/customers/123"],
    ["POST", "/bookings/draft/publish"],
    ["POST", "/payments"],
    ["POST", "/redemptions"],
    ["POST", "/webhooks"],
  ] as const;

  for (const [method, path] of allowed) assertDraftSmokeRollerRequest(method, path);

  for (const [method, path] of rejected) {
    let blocked = false;
    try {
      assertDraftSmokeRollerRequest(method, path);
    } catch {
      blocked = true;
    }
    if (!blocked) throw new Error(`Guard self-test failed to block ${method} ${path}.`);
  }

  let writeConfirmationBlocked = false;
  try {
    assertWriteConfirmation({ apply: false });
  } catch {
    writeConfirmationBlocked = true;
  }
  if (!writeConfirmationBlocked) throw new Error("Guard self-test failed to require write confirmation.");

  return { allowedChecked: allowed.length, rejectedChecked: rejected.length, writeConfirmationChecked: true };
}

function selectProductFromAvailability(
  body: unknown,
  parentProductId: string,
  requestedStartTime?: string,
): SelectedProduct {
  const parents = Array.isArray(body) ? body.filter(isRecord) : [];
  const parent = parents.find((candidate) => String(candidate.parentProductId ?? candidate.id ?? "") === parentProductId);
  if (!parent) throw new Error(`Availability response did not contain parent product ${parentProductId}.`);

  const session = chooseSession(parent, requestedStartTime);
  const selectedProduct = selectAvailabilityProduct(parent, session);
  const childProductId = stringOrNull(selectedProduct?.id);
  if (!childProductId || !/^\d+$/.test(childProductId)) {
    throw new Error(`Availability response did not contain a usable child product id for ${parentProductId}.`);
  }

  const unitPrice = numberOrNull(selectedProduct?.cost);
  return {
    capacityRemaining: getSessionCapacityRemaining(session),
    childProductId,
    childProductName: stringOrNull(selectedProduct?.name),
    onlineSalesOpen: booleanOrNull(session?.onlineSalesOpen),
    parentProductId,
    startTime: stringOrNull(session?.startTime) ?? requestedStartTime ?? "",
    unitPrice,
    unitPriceCents: unitPrice === null ? null : Math.round(unitPrice * 100),
  };
}

function chooseSession(parent: JsonRecord, requestedStartTime?: string): JsonRecord {
  const sessions = collectSessions(parent);
  const matching = requestedStartTime
    ? sessions.find((session) => stringOrNull(session.startTime) === requestedStartTime)
    : sessions.find((session) => {
        const capacity = getSessionCapacityRemaining(session);
        return Boolean(session.startTime && session.onlineSalesOpen !== false && (capacity === null || capacity >= DRAFT_QUANTITY));
      });

  if (!matching) {
    throw new Error(
      requestedStartTime
        ? `No available session found for start time ${requestedStartTime}.`
        : "No available online-sales-open session found in availability response.",
    );
  }

  return matching;
}

function collectSessions(parent: JsonRecord): JsonRecord[] {
  const sessions: JsonRecord[] = [];
  collectSessionsInto(parent, sessions);
  return dedupeSessions(sessions);
}

function collectSessionsInto(value: unknown, sessions: JsonRecord[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSessionsInto(item, sessions);
    return;
  }

  if (!isRecord(value)) return;
  if (stringOrNull(value.startTime ?? value.startsAt ?? value.sessionStart)) sessions.push(value);

  for (const key of ["sessions", "availabilities", "items", "data", "results"]) {
    collectSessionsInto(value[key], sessions);
  }
}

function dedupeSessions(sessions: readonly JsonRecord[]): JsonRecord[] {
  const byKey = new Map<string, JsonRecord>();
  for (const session of sessions) {
    const key = `${stringOrNull(session.startTime) ?? "unknown"}:${stringOrNull(session.endTime) ?? ""}`;
    if (!byKey.has(key)) byKey.set(key, session);
  }
  return [...byKey.values()].sort((left, right) =>
    (stringOrNull(left.startTime) ?? "").localeCompare(stringOrNull(right.startTime) ?? ""),
  );
}

function selectAvailabilityProduct(parent: JsonRecord, session: JsonRecord): JsonRecord | null {
  const products = Array.isArray(parent.products) ? parent.products.filter(isRecord) : [];
  if (products.length === 0) return null;

  const allocations = Array.isArray(session.allocations) ? session.allocations.filter(isRecord) : [];
  const allocationProductId = stringOrNull(allocations.find((allocation) => allocation.productId)?.productId);
  const matching = allocationProductId ? products.find((product) => String(product.id) === allocationProductId) : null;
  if (matching) return matching;

  return products.find((product) => product.isSuspended !== true && numberOrNull(product.cost) !== null) ?? products[0] ?? null;
}

function getSessionCapacityRemaining(session: JsonRecord | null): number | null {
  if (!session) return 0;

  const allocations = Array.isArray(session.allocations) ? session.allocations.filter(isRecord) : [];
  const candidates = [
    numberOrNull(session.capacityRemaining),
    numberOrNull(session.ticketCapacityRemaining),
    numberOrNull(session.resourceCapacityRemaining),
    ...allocations.flatMap((allocation) => [
      numberOrNull(allocation.bookableCapacityRemaining),
      numberOrNull(allocation.capacityRemaining),
    ]),
  ].filter((value): value is number => value !== null);

  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

function buildDraftPayload(args: Args, selected: SelectedProduct): JsonRecord {
  const externalId = `JY-LIVE-DRAFT-T0158-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.slice(0, 64);
  return {
    externalId,
    name: "WRLDS park-test T0158 Nacka draft",
    customer: {
      firstName: "WRLDS",
      lastName: "Parktest",
      email: "jumpyard.park-test@example.invalid",
      phone: "+46700000000",
      acceptMarketing: false,
      acceptMarketingSms: false,
    },
    items: [
      {
        productId: Number(selected.childProductId),
        quantity: DRAFT_QUANTITY,
        bookingDate: args.date,
        startTime: selected.startTime,
      },
    ],
    sendConfirmations: false,
    customerPaysFees: false,
    comments: "WRLDS PARK TEST T0158 - DO NOT USE - controlled Live draft smoke; no payment, no redeem.",
  };
}

function normalizeCosts(body: unknown): CostsSummary {
  const costs = extractCostsObject(body);
  return {
    amountOwing: numberOrNull(costs.amountOwing),
    cardFee: numberOrNull(costs.cardFee),
    discount: numberOrNull(costs.discount),
    fees: numberOrNull(costs.fees),
    feeTax: numberOrNull(costs.feeTax),
    subTotal: numberOrNull(costs.subTotal),
    subTotalTax: numberOrNull(costs.subTotalTax),
    tax: numberOrNull(costs.tax),
    taxExclusive: numberOrNull(costs.taxExclusive),
    total: numberOrNull(costs.total),
    totalExcludingFees: numberOrNull(costs.totalExcludingFees),
    totalIgnoringDeposit: numberOrNull(costs.totalIgnoringDeposit),
    transactionFee: numberOrNull(costs.transactionFee),
  };
}

function extractCostsObject(body: unknown): JsonRecord {
  if (isRecord(body) && isRecord(body.costs)) return body.costs;
  if (isRecord(body) && isRecord(body.bookingCosts)) return body.bookingCosts;
  if (isRecord(body) && isRecord(body.booking) && isRecord(body.booking.costs)) return body.booking.costs;
  if (isRecord(body) && isRecord(body.draft) && isRecord(body.draft.costs)) return body.draft.costs;
  if (isRecord(body) && isRecord(body.order) && isRecord(body.order.costs)) return body.order.costs;
  return isRecord(body) ? body : {};
}

function summarizeCostsBody(body: unknown): unknown {
  if (!isRecord(body)) return safeStructuredSummary(body);
  const candidates = [
    ["costs", body.costs],
    ["bookingCosts", body.bookingCosts],
    ["booking.costs", isRecord(body.booking) ? body.booking.costs : null],
    ["draft.costs", isRecord(body.draft) ? body.draft.costs : null],
    ["order.costs", isRecord(body.order) ? body.order.costs : null],
  ];
  return {
    candidateCostPaths: candidates
      .filter(([, value]) => isRecord(value))
      .map(([path]) => path),
    keys: safeObjectKeys(body, 16),
    type: "object",
  };
}

function summarizeDraftBody(body: unknown): unknown {
  if (!isRecord(body)) return safeStructuredSummary(body);
  return {
    candidateCostPaths: ["costs", "bookingCosts", "booking.costs", "draft.costs", "order.costs"].filter((path) => {
      const value = path.split(".").reduce<unknown>((current, key) => (isRecord(current) ? current[key] : null), body);
      return isRecord(value);
    }),
    hasBookingReference: Boolean(extractDraftField(body, ["bookingReference", "reference"])),
    hasPaymentJwt: Boolean(stringOrNull(body.paymentJwt)),
    hasUniqueId: Boolean(extractDraftField(body, ["uniqueId", "id"])),
    keys: safeObjectKeys(body, 16),
    type: "object",
  };
}

function normalizeDraft(body: unknown, externalId: string, status: number): DraftSummary {
  const uniqueId = extractDraftField(body, ["uniqueId", "id", "bookingId"]);
  const bookingReference = extractDraftField(body, ["bookingReference", "reference", "bookingRef"]);
  const capacityReservationId = extractDraftField(body, ["capacityReservationId"]);
  const paymentJwt = isRecord(body) ? stringOrNull(body.paymentJwt) : null;

  return {
    bookingReference,
    capacityReservationId,
    costs: normalizeCosts(body),
    endpoint: "/bookings/draft",
    externalId,
    itemCount: DRAFT_QUANTITY,
    paymentJwtSummary: summarizeJwt(paymentJwt),
    responseSummary: summarizeDraftBody(body),
    rollerDraftUniqueId: uniqueId,
    status,
    wroteBooking: true,
  };
}

function extractDraftField(body: unknown, fieldNames: readonly string[]): string | null {
  const candidates = [
    body,
    isRecord(body) ? body.draft : null,
    isRecord(body) ? body.booking : null,
    isRecord(body) ? body.order : null,
  ];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    for (const fieldName of fieldNames) {
      const value = stringOrNull(candidate[fieldName]);
      if (value) return value;
    }
  }

  return null;
}

function summarizeJwt(jwt: string | null): JwtSummary {
  if (!jwt) return { present: false };

  const parts = jwt.split(".");
  const header = parts.length >= 1 ? parseJwtPart(parts[0]) : null;
  const payload = parts.length >= 2 ? parseJwtPart(parts[1]) : null;
  const expiresAt = isRecord(payload) && payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null;

  return {
    expiresAt,
    headerKeys: isRecord(header) ? Object.keys(header).slice(0, 10) : [],
    partCount: parts.length,
    payloadKeys: isRecord(payload) ? Object.keys(payload).filter((key) => !/token|secret|customer|email|phone/i.test(key)).slice(0, 20) : [],
    present: true,
  };
}

function parseJwtPart(part: string): unknown {
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as unknown;
  } catch {
    return null;
  }
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

function safeStructuredSummary(value: unknown): unknown {
  if (Array.isArray(value)) return { count: value.length, type: "array" };
  if (isRecord(value)) {
    const safeMessage = stringOrNull(value.message ?? value.error ?? value.error_description ?? value.title);
    return {
      code: stringOrNull(value.code ?? value.errorCode ?? value.error_code),
      keys: safeObjectKeys(value, 12),
      message: safeMessage ? truncate(safeMessage, 180) : null,
      type: "object",
    };
  }
  if (value === null) return { type: "null" };
  return { type: typeof value };
}

function safeObjectKeys(value: JsonRecord, limit: number): string[] {
  return Object.keys(value)
    .filter((key) => !/(secret|token|password|email|phone|mobile|jwt|customer)/i.test(key))
    .slice(0, limit);
}

function safeResponseSummary(value: unknown): string {
  return truncate(JSON.stringify(safeStructuredSummary(value)), 280);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

async function buildDraftSmokeSummary(args: Args): Promise<DraftSmokeSummary> {
  const config = readConfig(args.configPath);
  validateSmokeConfig(config);
  const guardSelfTest = runGuardSelfTest();
  assertWriteConfirmation(args);
  const identity = readAwsIdentity(config, args.profile);
  const context = buildAwsContext(config, args.profile);
  const rollerConfig = await readRollerConfigFromAws(config, context, args.fallbackSecretName);
  validateLiveRollerConfig(rollerConfig);

  const rollerCalls: Array<{ endpoint: string; method: "AUTH" | "GET" | "POST"; ok: boolean; status: number }> = [];
  const tokenResult = await requestRollerAccessToken(rollerConfig);
  rollerCalls.push({ endpoint: "/token", method: "AUTH", ok: true, status: tokenResult.status });

  const availabilityEndpoint = `/product-availability?${new URLSearchParams({
    Date: args.date,
    ProductIds: args.parentProductId,
  }).toString()}`;
  const availabilityResult = await requestRollerGet(rollerConfig, tokenResult.token, availabilityEndpoint);
  rollerCalls.push({
    endpoint: "/product-availability",
    method: "GET",
    ok: availabilityResult.ok,
    status: availabilityResult.status,
  });
  if (!availabilityResult.ok) {
    throw new Error(
      `Roller availability failed with HTTP ${availabilityResult.status}: ${safeResponseSummary(availabilityResult.body)}`,
    );
  }

  const selected = selectProductFromAvailability(availabilityResult.body, args.parentProductId, args.startTime);
  const payload = buildDraftPayload(args, selected);
  const externalId = String(payload.externalId);

  const quoteResult = await requestRollerPost(rollerConfig, tokenResult.token, "/bookings/draft/costs", payload);
  rollerCalls.push({ endpoint: "/bookings/draft/costs", method: "POST", ok: quoteResult.ok, status: quoteResult.status });
  if (!quoteResult.ok) {
    throw new Error(`Roller quote failed with HTTP ${quoteResult.status}: ${safeResponseSummary(quoteResult.body)}`);
  }

  const draftResult = await requestRollerPost(rollerConfig, tokenResult.token, "/bookings/draft", payload);
  rollerCalls.push({ endpoint: "/bookings/draft", method: "POST", ok: draftResult.ok, status: draftResult.status });
  if (!draftResult.ok) {
    throw new Error(`Roller draft creation failed with HTTP ${draftResult.status}: ${safeResponseSummary(draftResult.body)}`);
  }

  const draft = normalizeDraft(draftResult.body, externalId, draftResult.status);

  return {
    aws: {
      account: identity.account,
      arn: identity.arn,
      region: config.awsRegion,
    },
    config: {
      resourcePrefix: config.resourcePrefix,
      rollerBaseUrl: config.roller.baseUrl,
      rollerEnv: config.roller.environment,
      safetyGates: config.safetyGates,
    },
    credentialSource: {
      ...rollerConfig.credentialSource,
      secretValuesPrinted: false,
    },
    draft,
    guardSelfTest,
    quote: {
      costs: normalizeCosts(quoteResult.body),
      endpoint: "/bookings/draft/costs",
      externalId,
      responseSummary: summarizeCostsBody(quoteResult.body),
      status: quoteResult.status,
      wroteBooking: false,
    },
    rollerCalls,
    safety: {
      auroraWrites: false,
      awsResourceChanged: false,
      bookingDraftCreated: true,
      frontendTraffic: false,
      paymentStarted: false,
      publicApiCall: false,
      redeemCalled: false,
      secretValuesPrinted: false,
      smsOrEmailSent: false,
      webhookProcessingEnabled: false,
    },
    selected: {
      ...selected,
      bookingDate: args.date,
      quantity: DRAFT_QUANTITY,
    },
    writeGate: {
      applyFlag: true,
      envVar: WRITE_ENV_VAR,
      phraseMatched: true,
    },
  };
}

function printGuardSelfTest(result: GuardSelfTestResult): void {
  console.log("Roller Live draft smoke guard self-test passed.");
  console.log(`Allowed endpoints checked: ${result.allowedChecked}`);
  console.log(`Rejected write/sensitive endpoints checked: ${result.rejectedChecked}`);
  console.log(`Write confirmation checked: ${result.writeConfirmationChecked}`);
}

function printTextSummary(summary: DraftSmokeSummary): void {
  console.log("Roller Live draft smoke passed.");
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region}`);
  console.log(`Roller: ${summary.config.rollerEnv} ${summary.config.rollerBaseUrl}`);
  console.log(
    `Credentials: ${summary.credentialSource.usedFallback ? "fallback" : "park-test"} ` +
      `(primary=${summary.credentialSource.primarySecretName}` +
      `${summary.credentialSource.fallbackSecretName ? `, fallback=${summary.credentialSource.fallbackSecretName}` : ""})`,
  );
  console.log(
    `Selected: parent=${summary.selected.parentProductId}, child=${summary.selected.childProductId}, ` +
      `name=${summary.selected.childProductName ?? "unknown"}, date=${summary.selected.bookingDate}, ` +
      `start=${summary.selected.startTime}, quantity=${summary.selected.quantity}`,
  );
  console.log(
    `Availability: onlineSalesOpen=${summary.selected.onlineSalesOpen ?? "unknown"}, ` +
      `capacityRemaining=${summary.selected.capacityRemaining ?? "unknown"}, ` +
      `unitPrice=${summary.selected.unitPrice ?? "unknown"}`,
  );
  console.log(
    `Quote: HTTP ${summary.quote.status}, total=${summary.quote.costs.total ?? "unknown"}, ` +
      `tax=${summary.quote.costs.tax ?? "unknown"}, fees=${summary.quote.costs.fees ?? "unknown"}, ` +
      `discount=${summary.quote.costs.discount ?? "unknown"}, amountOwing=${summary.quote.costs.amountOwing ?? "unknown"}`,
  );
  console.log(
    `Draft: HTTP ${summary.draft.status}, uniqueId=${summary.draft.rollerDraftUniqueId ?? "unknown"}, ` +
      `bookingReference=${summary.draft.bookingReference ?? "unknown"}, ` +
      `paymentJwtPresent=${summary.draft.paymentJwtSummary.present}`,
  );
  console.log(`Draft response summary: ${JSON.stringify(summary.draft.responseSummary)}`);
  console.log(
    "Safety: local tool only; no public API call, no AWS resource change, no Aurora write, no payment, no redeem, no webhook processing, no frontend traffic, no SMS/email, no secret/JWT values printed.",
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const guardSelfTest = runGuardSelfTest();
    if (args.json) console.log(JSON.stringify({ guardSelfTest }, null, 2));
    else printGuardSelfTest(guardSelfTest);
    return;
  }

  const summary = await buildDraftSmokeSummary(args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printTextSummary(summary);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
