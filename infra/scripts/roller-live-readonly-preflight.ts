import { execFileSync } from "child_process";
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
const READ_ONLY_ENDPOINTS = new Set(["/venues/me", "/products", "/product-availability"]);
const FORBIDDEN_PATH_MARKERS = [
  /\/bookings\b/i,
  /\/bookings\/draft\b/i,
  /\/redemptions?\b/i,
  /\/webhooks?\b/i,
  /\/payments?\b/i,
  /\/customers?\b/i,
  /\/guests?\b/i,
  /\/tickets?\b/i,
];

interface Args {
  readonly availabilityDate: string;
  readonly configPath: string;
  readonly fallbackSecretName?: string;
  readonly json: boolean;
  readonly profile?: string;
  readonly selfTest: boolean;
  readonly skipAvailability: boolean;
}

interface AwsContext {
  readonly secrets: SecretsManagerClient;
  readonly ssm: SSMClient;
}

interface AwsIdentity {
  readonly account: string;
  readonly arn: string;
}

interface RollerCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface CredentialSource {
  readonly fallbackSecretName: string | null;
  readonly primarySecretName: string;
  readonly usedFallback: boolean;
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

interface RollerReadResult {
  readonly body: unknown;
  readonly contentType: string;
  readonly endpointPath: string;
  readonly ok: boolean;
  readonly status: number;
}

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface ProductNode {
  readonly [key: string]: unknown;
}

interface ProductSummary {
  readonly durationMinutes: number | null;
  readonly id: string;
  readonly isSuspended: boolean | null;
  readonly name: string | null;
  readonly parentProductId: string | null;
  readonly parentProductName: string | null;
  readonly priceCents: number | null;
  readonly productSubType: string | null;
  readonly productType: string | null;
}

interface ProductsSummary {
  readonly candidate60MinuteEntries: readonly ProductSummary[];
  readonly flattenedProductCount: number;
  readonly responseSummary: unknown;
  readonly status: number;
  readonly topLevelProductCount: number | null;
}

interface VenueSummary {
  readonly currency: string | null;
  readonly paymentSettings: {
    readonly available: boolean;
    readonly hasApiUrl: boolean;
    readonly hasConfigurationId: boolean;
    readonly hasIntegrationId: boolean;
  };
  readonly responseSummary: unknown;
  readonly status: number;
  readonly timezone: string | null;
  readonly venueId: string | null;
  readonly venueName: string | null;
}

interface AvailabilitySummary {
  readonly date: string;
  readonly firstStartTimes: readonly string[];
  readonly onlineSalesOpenFalseCount: number;
  readonly onlineSalesOpenTrueCount: number;
  readonly productIds: readonly string[];
  readonly responseSummary: unknown;
  readonly sessionCount: number;
  readonly status: number | null;
  readonly topLevelProductCount: number | null;
}

interface GuardSelfTestResult {
  readonly allowedChecked: number;
  readonly rejectedChecked: number;
}

interface PreflightSummary {
  readonly allowlist: readonly string[];
  readonly availability: AvailabilitySummary | null;
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
    readonly tags: JumpYardCloudConfig["tags"];
  };
  readonly credentialSource: CredentialSource & {
    readonly secretValuesPrinted: false;
  };
  readonly guardSelfTest: GuardSelfTestResult;
  readonly nextGate: string;
  readonly products: ProductsSummary;
  readonly rollerCalls: readonly {
    readonly endpoint: string;
    readonly method: "AUTH" | "GET";
    readonly ok: boolean;
    readonly status: number;
  }[];
  readonly venue: VenueSummary;
}

function parseArgs(argv: string[]): Args {
  let availabilityDate = defaultAvailabilityDate();
  let configPath = DEFAULT_CONFIG_PATH;
  let fallbackSecretName = process.env.ROLLER_LIVE_PREFLIGHT_FALLBACK_SECRET_NAME;
  let json = false;
  let profile: string | undefined;
  let selfTest = false;
  let skipAvailability = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--config") {
      configPath = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--date") {
      availabilityDate = requiredNext(argv, index, arg);
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

    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--self-test") {
      selfTest = true;
      continue;
    }

    if (arg === "--skip-availability") {
      skipAvailability = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(availabilityDate)) {
    throw new Error("--date must use YYYY-MM-DD.");
  }

  return {
    availabilityDate,
    configPath,
    fallbackSecretName: fallbackSecretName?.trim() || undefined,
    json,
    profile,
    selfTest,
    skipAvailability,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function defaultAvailabilityDate(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function readConfig(configPath: string): JumpYardCloudConfig {
  const app = new App({ context: { config: configPath } });
  return loadJumpYardCloudConfig(app);
}

function validatePreflightConfig(config: JumpYardCloudConfig): void {
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
    errors.push("safetyGates.rollerBookingDraftWritesEnabled must stay false.");
  }
  if (config.safetyGates.rollerRedeemWritesEnabled) {
    errors.push("safetyGates.rollerRedeemWritesEnabled must stay false.");
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

function readAwsIdentity(config: JumpYardCloudConfig, profile?: string): AwsIdentity {
  const args = ["sts", "get-caller-identity", "--output", "json", "--region", config.awsRegion];
  if (profile) {
    args.push("--profile", profile);
  }

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

  if (env !== config.roller.environment) {
    throw new Error(`AWS Roller env ${env} does not match config ${config.roller.environment}.`);
  }
  if (baseUrl !== config.roller.baseUrl) {
    throw new Error(`AWS Roller base URL ${baseUrl} does not match config ${config.roller.baseUrl}.`);
  }

  const primaryCredentials = parseCredentials(primarySecretString, primarySecretName);
  const primaryIsPlaceholder = isCredentialPlaceholder(primaryCredentials);

  if (!primaryIsPlaceholder) {
    return {
      baseUrl,
      credentialSource: {
        fallbackSecretName: null,
        primarySecretName,
        usedFallback: false,
      },
      credentials: primaryCredentials,
      env,
    };
  }

  if (!fallbackSecretName) {
    throw new Error(
      `Primary park-test Roller credentials secret ${primarySecretName} is placeholder-only. ` +
        "Pass --fallback-secret with an explicitly approved read-only credential source.",
    );
  }

  const fallbackCredentials = parseCredentials(await readSecretString(context, fallbackSecretName), fallbackSecretName);
  if (isCredentialPlaceholder(fallbackCredentials)) {
    throw new Error(`Fallback Roller credentials secret ${fallbackSecretName} is also placeholder-only.`);
  }

  return {
    baseUrl,
    credentialSource: {
      fallbackSecretName,
      primarySecretName,
      usedFallback: true,
    },
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

function validateLiveRollerConfig(config: RollerConfig): void {
  const errors: string[] = [];

  if (config.env !== EXPECTED_ENV) errors.push(`Roller env must be ${EXPECTED_ENV}.`);
  if (config.baseUrl !== EXPECTED_BASE_URL) errors.push(`Roller base URL must be ${EXPECTED_BASE_URL}.`);
  if (isCredentialPlaceholder(config.credentials)) errors.push("Roller credentials must be real values.");

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
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
  const text = await response.text();
  const body = parseJsonOrTextSummary(text, response.headers.get("content-type") ?? "");

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
    status,
    token: {
      accessToken,
      expiresIn: numberOrNull(body.expires_in ?? body.expiresIn),
      tokenType: stringOrNull(body.token_type ?? body.tokenType) ?? "Bearer",
    },
  };
}

async function requestRollerRead(config: RollerConfig, token: RollerToken, endpointPath: string): Promise<RollerReadResult> {
  assertReadOnlyRollerRequest("GET", endpointPath);

  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  return {
    body: parseJsonOrTextSummary(text, contentType),
    contentType,
    endpointPath,
    ok: response.ok,
    status: response.status,
  };
}

function buildRollerUrl(baseUrl: string, endpointPath: string): URL {
  if (!endpointPath.startsWith("/")) {
    throw new Error("Roller endpoint paths must start with '/'.");
  }

  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("Roller base URL must use https.");
  }

  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function assertReadOnlyRollerRequest(method: string, endpointPath: string): void {
  if (method !== "GET") {
    throw new Error(`Blocked non-read Roller method ${method} ${endpointPath}.`);
  }

  const parsed = new URL(endpointPath, "https://allowlist.local");
  const pathname = parsed.pathname;

  if (!READ_ONLY_ENDPOINTS.has(pathname)) {
    throw new Error(`Blocked non-allowlisted Roller endpoint GET ${pathname}.`);
  }

  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (marker.test(pathname)) {
      throw new Error(`Blocked sensitive Roller endpoint GET ${pathname}.`);
    }
  }
}

function runGuardSelfTest(): GuardSelfTestResult {
  const allowed = [
    ["GET", "/venues/me"],
    ["GET", "/products"],
    ["GET", "/product-availability?Date=2026-06-29&ProductIds=123"],
  ] as const;
  const rejected = [
    ["POST", "/bookings/draft"],
    ["POST", "/bookings/draft/costs"],
    ["POST", "/webhooks"],
    ["POST", "/redemptions"],
    ["GET", "/bookings/ABC123"],
    ["GET", "/guests/123"],
    ["PUT", "/products"],
  ] as const;

  for (const [method, path] of allowed) {
    assertReadOnlyRollerRequest(method, path);
  }

  for (const [method, path] of rejected) {
    let blocked = false;
    try {
      assertReadOnlyRollerRequest(method, path);
    } catch {
      blocked = true;
    }

    if (!blocked) {
      throw new Error(`Guard self-test failed to block ${method} ${path}.`);
    }
  }

  return {
    allowedChecked: allowed.length,
    rejectedChecked: rejected.length,
  };
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

function summarizeVenue(result: RollerReadResult): VenueSummary {
  const venue = isRecord(result.body) ? result.body : {};
  const paymentSettings = isRecord(venue.paymentSettings) ? venue.paymentSettings : {};
  const apiUrl = stringOrNull(paymentSettings.apiUrl);
  const configurationId = stringOrNull(paymentSettings.configurationId);
  const integrationId = stringOrNull(paymentSettings.integrationId);

  return {
    currency: stringOrNull(venue.currency ?? venue.currencyCode),
    paymentSettings: {
      available: Boolean(apiUrl && configurationId && integrationId),
      hasApiUrl: Boolean(apiUrl),
      hasConfigurationId: Boolean(configurationId),
      hasIntegrationId: Boolean(integrationId),
    },
    responseSummary: safeStructuredSummary(result.body),
    status: result.status,
    timezone: stringOrNull(venue.timezone ?? venue.timeZone),
    venueId: stringOrNull(venue.id ?? venue.venueId ?? venue.uniqueId),
    venueName: stringOrNull(venue.name ?? venue.venueName),
  };
}

function summarizeProducts(result: RollerReadResult): ProductsSummary {
  const topLevelProducts = extractProductArray(result.body);
  const flattened = topLevelProducts ? flattenProducts(topLevelProducts) : [];
  const candidate60MinuteEntries = find60MinuteEntryCandidates(flattened).slice(0, 12);

  return {
    candidate60MinuteEntries,
    flattenedProductCount: flattened.length,
    responseSummary: safeStructuredSummary(result.body),
    status: result.status,
    topLevelProductCount: topLevelProducts ? topLevelProducts.length : null,
  };
}

function summarizeAvailability(
  result: RollerReadResult | null,
  date: string,
  productIds: readonly string[],
): AvailabilitySummary {
  if (!result) {
    return {
      date,
      firstStartTimes: [],
      onlineSalesOpenFalseCount: 0,
      onlineSalesOpenTrueCount: 0,
      productIds,
      responseSummary: { reason: "no 60-minute entry candidate product ids were found" },
      sessionCount: 0,
      status: null,
      topLevelProductCount: null,
    };
  }

  const sessions = collectAvailabilitySessions(result.body);
  const startTimes = Array.from(new Set(sessions.map((session) => session.startTime).filter(isNonEmptyString))).slice(0, 12);

  return {
    date,
    firstStartTimes: startTimes,
    onlineSalesOpenFalseCount: sessions.filter((session) => session.onlineSalesOpen === false).length,
    onlineSalesOpenTrueCount: sessions.filter((session) => session.onlineSalesOpen === true).length,
    productIds,
    responseSummary: safeStructuredSummary(result.body),
    sessionCount: sessions.length,
    status: result.status,
    topLevelProductCount: extractProductArray(result.body)?.length ?? null,
  };
}

function extractProductArray(body: unknown): ProductNode[] | null {
  if (isProductArray(body)) return body;
  if (!isRecord(body)) return null;

  for (const key of ["items", "products", "data", "results"]) {
    const candidate = body[key];
    if (isProductArray(candidate)) return candidate;
  }

  return null;
}

function flattenProducts(products: readonly ProductNode[], parent: ProductSummary | null = null): ProductSummary[] {
  const flattened: ProductSummary[] = [];

  for (const product of products) {
    const id = firstString(product, ["id", "productId", "productID", "variationId"]);
    const name = firstString(product, ["name", "productName", "title"]);
    const productType = firstString(product, ["type", "productType"]);
    const productSubType = firstString(product, ["productSubType", "subType"]);
    const parentProductId = firstString(product, ["parentProductId", "parentId"]) ?? parent?.id ?? null;
    const parentProductName = firstString(product, ["parentProductName", "parentName"]) ?? parent?.name ?? null;
    const durationMinutes = firstNumber(product, ["durationMinutes", "durationInMinutes", "duration", "minutes"]);
    const priceCents = centsOrNull(firstKnown(product, ["price", "cost", "unitPrice"]));
    const isSuspended = booleanOrNull(firstKnown(product, ["isSuspended", "suspended"]));

    const currentParent: ProductSummary = {
      durationMinutes,
      id: id ?? parent?.id ?? "unknown",
      isSuspended,
      name: name ?? parent?.name ?? null,
      parentProductId,
      parentProductName,
      priceCents,
      productSubType,
      productType,
    };

    if (id) {
      flattened.push({
        durationMinutes,
        id,
        isSuspended,
        name,
        parentProductId,
        parentProductName,
        priceCents,
        productSubType,
        productType,
      });
    }

    for (const children of childCollections(product)) {
      flattened.push(...flattenProducts(children, currentParent));
    }
  }

  return dedupeProducts(flattened);
}

function find60MinuteEntryCandidates(products: readonly ProductSummary[]): ProductSummary[] {
  const direct = products
    .filter((product) => isLikely60MinuteEntry(product))
    .sort((left, right) => score60MinuteEntryCandidate(right) - score60MinuteEntryCandidate(left));
  if (direct.length > 0) return direct;

  return products.filter((product) => {
    const text = productSearchText(product);
    return product.durationMinutes === 60 || /\b60\s*(m|min|minute|minutes|minuter)\b/i.test(text);
  }).sort((left, right) => score60MinuteEntryCandidate(right) - score60MinuteEntryCandidate(left));
}

function isLikely60MinuteEntry(product: ProductSummary): boolean {
  if (product.isSuspended === true) return false;

  const text = productSearchText(product);
  const has60Minutes = product.durationMinutes === 60 || /\b60\s*(m|min|minute|minutes|minuter)\b/i.test(text);
  const looksLikeEntry = /(entry|admission|jump|jumping|hopptid|hoppa|entre|entree|trampoline)/i.test(text);

  return has60Minutes && looksLikeEntry;
}

function score60MinuteEntryCandidate(product: ProductSummary): number {
  const text = productSearchText(product);
  let score = 0;

  if (product.durationMinutes === 60) score += 20;
  if (/\b60\s*(m|min|minute|minutes|minuter)?\b/i.test(text)) score += 10;
  if (/(entry|admission|entre|entree)/i.test(text)) score += 40;
  if (/(jump|jumping|hopptid|hoppa|trampoline)/i.test(text)) score += 8;
  if (/^entre 60 min\b/i.test(text)) score += 60;
  if (/(familj|family)/i.test(text)) score -= 10;
  if (/(school|skola|skolgrupp|foreningsgrupp|konferens|trampolin|extra|kamp|cup)/i.test(text)) score -= 20;

  return score;
}

function productSearchText(product: ProductSummary): string {
  return normalizeSearchText([
    product.name,
    product.parentProductName,
    product.productType,
    product.productSubType,
    product.id,
    product.parentProductId,
  ]
    .filter(isNonEmptyString)
    .join(" "));
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dedupeProducts(products: readonly ProductSummary[]): ProductSummary[] {
  const byId = new Map<string, ProductSummary>();
  for (const product of products) {
    byId.set(product.id, product);
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function childCollections(product: ProductNode): ProductNode[][] {
  return ["products", "variations", "productVariations", "children"]
    .map((key) => product[key])
    .filter(isProductArray);
}

function availabilityProductIds(products: ProductsSummary): string[] {
  const ids = products.candidate60MinuteEntries
    .map((product) => product.parentProductId ?? product.id)
    .filter(isNonEmptyString);
  return Array.from(new Set(ids)).slice(0, 5);
}

interface AvailabilitySessionSummary {
  readonly onlineSalesOpen: boolean | null;
  readonly startTime: string | null;
}

function collectAvailabilitySessions(value: unknown): AvailabilitySessionSummary[] {
  const sessions: AvailabilitySessionSummary[] = [];
  collectAvailabilitySessionsInto(value, sessions);
  return sessions;
}

function collectAvailabilitySessionsInto(value: unknown, sessions: AvailabilitySessionSummary[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAvailabilitySessionsInto(item, sessions);
    }
    return;
  }

  if (!isRecord(value)) return;

  const startTime = stringOrNull(value.startTime ?? value.startsAt ?? value.sessionStart);
  if (startTime) {
    sessions.push({
      onlineSalesOpen: booleanOrNull(value.onlineSalesOpen),
      startTime,
    });
  }

  for (const key of ["sessions", "availabilities", "products", "items", "data", "results"]) {
    collectAvailabilitySessionsInto(value[key], sessions);
  }
}

function safeStructuredSummary(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { count: value.length, type: "array" };
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter((key) => !/(secret|token|password|email|phone|mobile|jwt|customer)/i.test(key))
      .slice(0, 12);
    const safeMessage = stringOrNull(value.message ?? value.error ?? value.error_description ?? value.title);
    return {
      code: stringOrNull(value.code ?? value.errorCode ?? value.error_code),
      keys,
      message: safeMessage ? truncate(safeMessage, 160) : null,
      type: "object",
    };
  }

  if (value === null) return { type: "null" };
  return { type: typeof value };
}

function safeResponseSummary(value: unknown): string {
  const summary = safeStructuredSummary(value);
  return truncate(JSON.stringify(summary), 240);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProductArray(value: unknown): value is ProductNode[] {
  return Array.isArray(value) && value.every(isRecord);
}

function firstKnown(record: JsonRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function firstString(record: JsonRecord, keys: readonly string[]): string | null {
  return stringOrNull(firstKnown(record, keys));
}

function firstNumber(record: JsonRecord, keys: readonly string[]): number | null {
  return numberOrNull(firstKnown(record, keys));
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

function centsOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100);
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function printGuardSelfTest(result: GuardSelfTestResult): void {
  console.log("Roller Live read-only guard self-test passed.");
  console.log(`Allowed endpoints checked: ${result.allowedChecked}`);
  console.log(`Rejected write/sensitive endpoints checked: ${result.rejectedChecked}`);
}

function printTextSummary(summary: PreflightSummary): void {
  console.log("Roller Live read-only preflight passed.");
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region}`);
  console.log(`Roller: ${summary.config.rollerEnv} ${summary.config.rollerBaseUrl}`);
  console.log(
    `Credentials: ${summary.credentialSource.usedFallback ? "fallback" : "park-test"} ` +
      `(primary=${summary.credentialSource.primarySecretName}` +
      `${summary.credentialSource.fallbackSecretName ? `, fallback=${summary.credentialSource.fallbackSecretName}` : ""})`,
  );
  console.log(
    `Venue: ${summary.venue.venueName ?? "unknown"} ` +
      `(id=${summary.venue.venueId ?? "unknown"}, status=${summary.venue.status})`,
  );
  console.log(
    `Payment settings: apiUrl=${summary.venue.paymentSettings.hasApiUrl}, ` +
      `configurationId=${summary.venue.paymentSettings.hasConfigurationId}, ` +
      `integrationId=${summary.venue.paymentSettings.hasIntegrationId}`,
  );
  console.log(
    `Products: topLevel=${summary.products.topLevelProductCount ?? "unknown"}, ` +
      `flattened=${summary.products.flattenedProductCount}, ` +
      `60minCandidates=${summary.products.candidate60MinuteEntries.length}`,
  );
  for (const product of summary.products.candidate60MinuteEntries.slice(0, 5)) {
    console.log(
      `- candidate ${product.id}: ${product.name ?? "unnamed"} ` +
        `(parent=${product.parentProductId ?? "none"}, priceCents=${product.priceCents ?? "unknown"})`,
    );
  }
  if (summary.availability) {
    console.log(
      `Availability: status=${summary.availability.status ?? "skipped"}, ` +
        `date=${summary.availability.date}, sessions=${summary.availability.sessionCount}, ` +
        `firstTimes=${summary.availability.firstStartTimes.join(",") || "none"}`,
    );
  }
  console.log(`Next gate: ${summary.nextGate}`);
}

async function buildPreflightSummary(args: Args): Promise<PreflightSummary> {
  const config = readConfig(args.configPath);
  validatePreflightConfig(config);
  const guardSelfTest = runGuardSelfTest();
  const identity = readAwsIdentity(config, args.profile);
  const context = buildAwsContext(config, args.profile);
  const rollerConfig = await readRollerConfigFromAws(config, context, args.fallbackSecretName);
  validateLiveRollerConfig(rollerConfig);

  const rollerCalls: Array<{ endpoint: string; method: "AUTH" | "GET"; ok: boolean; status: number }> = [];
  const tokenResult = await requestRollerAccessToken(rollerConfig);
  rollerCalls.push({ endpoint: "/token", method: "AUTH", ok: true, status: tokenResult.status });

  const venueResult = await requestRollerRead(rollerConfig, tokenResult.token, "/venues/me");
  rollerCalls.push({ endpoint: "/venues/me", method: "GET", ok: venueResult.ok, status: venueResult.status });

  const productsResult = await requestRollerRead(rollerConfig, tokenResult.token, "/products");
  rollerCalls.push({ endpoint: "/products", method: "GET", ok: productsResult.ok, status: productsResult.status });

  const products = summarizeProducts(productsResult);
  const productIds = availabilityProductIds(products);
  const availabilityEndpoint =
    productIds.length > 0
      ? `/product-availability?${new URLSearchParams({ Date: args.availabilityDate, ProductIds: productIds.join(",") }).toString()}`
      : null;
  const availabilityResult =
    availabilityEndpoint && !args.skipAvailability
      ? await requestRollerRead(rollerConfig, tokenResult.token, availabilityEndpoint)
      : null;

  if (availabilityEndpoint && availabilityResult) {
    rollerCalls.push({
      endpoint: "/product-availability",
      method: "GET",
      ok: availabilityResult.ok,
      status: availabilityResult.status,
    });
  }

  return {
    allowlist: [...READ_ONLY_ENDPOINTS],
    availability: summarizeAvailability(availabilityResult, args.availabilityDate, productIds),
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
      tags: config.tags,
    },
    credentialSource: {
      ...rollerConfig.credentialSource,
      secretValuesPrinted: false,
    },
    guardSelfTest,
    nextGate: "T0154 webhook dry-run or T0157 quote/cost smoke; no quote, draft, payment, webhook, redeem, frontend, SMS, or email was enabled by T0153.",
    products,
    rollerCalls,
    venue: summarizeVenue(venueResult),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.selfTest) {
    const guardSelfTest = runGuardSelfTest();
    if (args.json) {
      console.log(JSON.stringify({ guardSelfTest }, null, 2));
    } else {
      printGuardSelfTest(guardSelfTest);
    }
    return;
  }

  const summary = await buildPreflightSummary(args);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary(summary);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Roller Live read-only preflight failed: ${message}`);
  process.exitCode = 1;
});
