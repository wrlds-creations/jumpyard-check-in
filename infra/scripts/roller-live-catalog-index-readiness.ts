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
  /\/data\b/i,
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

interface RequiredEntry {
  readonly key: string;
  readonly parentName: string;
  readonly searchTerms: readonly string[];
}

interface RequiredAddon {
  readonly currentPlaygroundProductId: string | null;
  readonly key: string;
  readonly label: string;
  readonly requiresAvailability: boolean;
  readonly searchTerms: readonly string[];
}

interface ProductReadiness {
  readonly candidates: readonly ProductCandidate[];
  readonly key: string;
  readonly matchStatus: "ready" | "missing" | "ambiguous";
  readonly requiredName: string;
  readonly selected: ProductCandidate | null;
}

interface ProductCandidate {
  readonly id: string;
  readonly isSuspended: boolean | null;
  readonly name: string | null;
  readonly parentProductId: string | null;
  readonly parentProductName: string | null;
  readonly priceCents: number | null;
  readonly productSubType: string | null;
  readonly productType: string | null;
  readonly score: number;
}

interface AvailabilityProbe {
  readonly date: string;
  readonly onlineSalesOpenFalseCount: number;
  readonly onlineSalesOpenTrueCount: number;
  readonly parentProductIds: readonly string[];
  readonly sessionCount: number;
  readonly status: number | null;
}

interface GuardSelfTestResult {
  readonly allowedChecked: number;
  readonly rejectedChecked: number;
}

interface CatalogReadinessSummary {
  readonly aws: {
    readonly account: string;
    readonly arn: string;
    readonly region: string;
  };
  readonly bookingIndexStrategy: {
    readonly auroraStorageForFirstParkTest: string;
    readonly broadGuestDataExportApproved: false;
    readonly recommendation: "rest_on_demand_for_first_park_test";
    readonly reasons: readonly string[];
    readonly revisitTrigger: string;
  };
  readonly catalog: {
    readonly addOns: readonly (ProductReadiness & {
      readonly currentPlaygroundProductId: string | null;
      readonly requiresAvailability: boolean;
    })[];
    readonly entries: readonly ProductReadiness[];
    readonly flattenedProductCount: number;
    readonly requiredAddOnsReady: number;
    readonly requiredEntriesReady: number;
    readonly topLevelProductCount: number | null;
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
  readonly guardSelfTest: GuardSelfTestResult;
  readonly productAvailability: AvailabilityProbe | null;
  readonly rollerCalls: readonly {
    readonly endpoint: string;
    readonly method: "AUTH" | "GET";
    readonly ok: boolean;
    readonly status: number;
  }[];
  readonly safety: {
    readonly auroraWrites: false;
    readonly awsResourceChanged: false;
    readonly bookingReads: false;
    readonly broadGuestDataExport: false;
    readonly draftCreated: false;
    readonly paymentStarted: false;
    readonly publicApiOpened: false;
    readonly redeemCalled: false;
    readonly secretValuesPrinted: false;
    readonly smsOrEmailSent: false;
    readonly webhookProcessingEnabled: false;
  };
  readonly venue: {
    readonly currency: string | null;
    readonly timezone: string | null;
    readonly venueId: string | null;
    readonly venueName: string | null;
  };
}

interface RollerReadResult {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

const REQUIRED_ENTRIES: readonly RequiredEntry[] = [
  { key: "E60", parentName: "Entre 60 min", searchTerms: ["entre 60 min", "entry 60 min", "60 min"] },
  { key: "E90", parentName: "Entre 90 min", searchTerms: ["entre 90 min", "entry 90 min", "90 min"] },
  { key: "E120", parentName: "Entre 120 min", searchTerms: ["entre 120 min", "entry 120 min", "120 min"] },
  { key: "F60", parentName: "Entre 60 min - Familj", searchTerms: ["entre 60 min familj", "family 60 min"] },
  { key: "F90", parentName: "Entre 90 min - Familj", searchTerms: ["entre 90 min familj", "family 90 min"] },
  { key: "F120", parentName: "Entre 120 min - Familj", searchTerms: ["entre 120 min familj", "family 120 min"] },
];

const REQUIRED_ADDONS: readonly RequiredAddon[] = [
  {
    currentPlaygroundProductId: "1765443",
    key: "skyrider",
    label: "SkyRider",
    requiresAvailability: true,
    searchTerms: ["skyrider", "sky rider"],
  },
  {
    currentPlaygroundProductId: "1765445",
    key: "socks",
    label: "JumpSocks",
    requiresAvailability: false,
    searchTerms: ["jumpsocks", "jump socks", "sock", "strump"],
  },
  {
    currentPlaygroundProductId: "1765441",
    key: "lock",
    label: "Padlock",
    requiresAvailability: false,
    searchTerms: ["hanglas", "padlock", "lock"],
  },
  {
    currentPlaygroundProductId: "1765452",
    key: "coffee",
    label: "Coffee",
    requiresAvailability: false,
    searchTerms: ["bryggkaffe", "coffee", "kaffe"],
  },
];

function parseArgs(argv: string[]): Args {
  let availabilityDate = defaultAvailabilityDate();
  let configPath = DEFAULT_CONFIG_PATH;
  let fallbackSecretName = process.env.ROLLER_LIVE_CATALOG_FALLBACK_SECRET_NAME;
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
  if (!value) throw new Error(`Missing value for ${arg}.`);
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

function validateConfig(config: JumpYardCloudConfig): void {
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
  if (errors.length > 0) throw new Error(errors.join(" "));
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

function validateRollerConfig(config: RollerConfig): void {
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

async function requestRollerRead(config: RollerConfig, token: RollerToken, endpointPath: string): Promise<RollerReadResult> {
  assertReadOnlyRollerRequest("GET", endpointPath);
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
    },
  });
  return {
    body: parseJsonOrTextSummary(await response.text(), response.headers.get("content-type") ?? ""),
    ok: response.ok,
    status: response.status,
  };
}

function buildRollerUrl(baseUrl: string, endpointPath: string): URL {
  if (!endpointPath.startsWith("/")) throw new Error("Roller endpoint paths must start with '/'.");
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:") throw new Error("Roller base URL must use https.");
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

function assertReadOnlyRollerRequest(method: string, endpointPath: string): void {
  if (method !== "GET") throw new Error(`Blocked non-read Roller method ${method} ${endpointPath}.`);
  const parsed = new URL(endpointPath, "https://allowlist.local");
  const pathname = parsed.pathname;
  if (!READ_ONLY_ENDPOINTS.has(pathname)) {
    throw new Error(`Blocked non-T0161 Roller endpoint GET ${pathname}.`);
  }
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (marker.test(pathname)) throw new Error(`Blocked sensitive Roller endpoint GET ${pathname}.`);
  }
}

function runGuardSelfTest(): GuardSelfTestResult {
  const allowed = [
    ["GET", "/venues/me"],
    ["GET", "/products"],
    ["GET", "/product-availability?Date=2026-06-29&ProductIds=123"],
  ] as const;
  const rejected = [
    ["GET", "/bookings/123"],
    ["GET", "/data/bookingitems"],
    ["GET", "/customers/123"],
    ["GET", "/guests/123"],
    ["GET", "/tickets"],
    ["POST", "/bookings/draft/costs"],
    ["POST", "/bookings/draft"],
    ["POST", "/payments"],
    ["POST", "/redemptions"],
    ["POST", "/webhooks"],
    ["PUT", "/products"],
  ] as const;

  for (const [method, path] of allowed) assertReadOnlyRollerRequest(method, path);
  for (const [method, path] of rejected) {
    let blocked = false;
    try {
      assertReadOnlyRollerRequest(method, path);
    } catch {
      blocked = true;
    }
    if (!blocked) throw new Error(`Guard self-test failed to block ${method} ${path}.`);
  }
  return { allowedChecked: allowed.length, rejectedChecked: rejected.length };
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

function findEntryReadiness(products: readonly ProductSummary[], required: RequiredEntry): ProductReadiness {
  const candidates = rankCandidates(products, required.searchTerms, true);
  return buildReadiness(required.key, required.parentName, candidates);
}

function findAddonReadiness(
  products: readonly ProductSummary[],
  required: RequiredAddon,
): ProductReadiness & { currentPlaygroundProductId: string | null; requiresAvailability: boolean } {
  const candidates = rankCandidates(products, required.searchTerms, required.requiresAvailability);
  return {
    ...buildReadiness(required.key, required.label, candidates),
    currentPlaygroundProductId: required.currentPlaygroundProductId,
    requiresAvailability: required.requiresAvailability,
  };
}

function rankCandidates(
  products: readonly ProductSummary[],
  searchTerms: readonly string[],
  preferParent: boolean,
): ProductCandidate[] {
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, searchTerms, preferParent) }))
    .filter((item) => item.score > 0)
    .map(({ product, score }) => ({
      id: product.id,
      isSuspended: product.isSuspended,
      name: product.name,
      parentProductId: product.parentProductId,
      parentProductName: product.parentProductName,
      priceCents: product.priceCents,
      productSubType: product.productSubType,
      productType: product.productType,
      score,
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return dedupeCandidates(scored).slice(0, 8);
}

function scoreProduct(product: ProductSummary, searchTerms: readonly string[], preferParent: boolean): number {
  const text = searchableProductText(product);
  let score = 0;
  for (const term of searchTerms.map(normalizeSearchText)) {
    if (text === term) score += 100;
    if (text.includes(term)) score += 35;
    if (normalizeSearchText(product.name ?? "") === term) score += 80;
    if (normalizeSearchText(product.parentProductName ?? "") === term) score += 70;
  }
  if (product.isSuspended === true) score -= 60;
  if (preferParent) {
    if (!product.parentProductId || product.parentProductId === product.id) score += 15;
    if (product.priceCents !== null) score += 8;
  } else {
    if (product.parentProductId && product.parentProductId !== product.id) score += 70;
    if (product.priceCents !== null) score += 40;
    if (!product.parentProductId || product.parentProductId === product.id) score -= 40;
  }
  return score;
}

function buildReadiness(key: string, requiredName: string, candidates: readonly ProductCandidate[]): ProductReadiness {
  const liveCandidates = candidates.filter((candidate) => candidate.isSuspended !== true);
  const selected = liveCandidates[0] ?? null;
  const topScore = liveCandidates[0]?.score ?? 0;
  const secondScore = liveCandidates[1]?.score ?? 0;
  const second = liveCandidates[1] ?? null;
  const sameProductFamily = Boolean(
    selected &&
      second &&
      (selected.parentProductId === second.id ||
        selected.id === second.parentProductId ||
        selected.parentProductId === second.parentProductId),
  );
  const matchStatus = !selected
    ? "missing"
    : secondScore > 0 && topScore - secondScore < 10 && !sameProductFamily
      ? "ambiguous"
      : "ready";
  return { candidates, key, matchStatus, requiredName, selected };
}

function buildAvailabilityEndpoint(date: string, entries: readonly ProductReadiness[], addOns: readonly ProductReadiness[]): string | null {
  const parentIds = new Set<string>();
  for (const item of [...entries, ...addOns]) {
    if (item.matchStatus === "missing") continue;
    const selected = item.selected;
    if (!selected) continue;
    parentIds.add(selected.parentProductId ?? selected.id);
  }
  const ids = [...parentIds].slice(0, 12);
  if (ids.length === 0) return null;
  return `/product-availability?${new URLSearchParams({ Date: date, ProductIds: ids.join(",") }).toString()}`;
}

function summarizeAvailability(result: RollerReadResult | null, date: string, endpoint: string | null): AvailabilityProbe | null {
  if (!endpoint) return null;
  const parentProductIds = new URLSearchParams(endpoint.split("?")[1] ?? "").get("ProductIds")?.split(",") ?? [];
  if (!result) {
    return {
      date,
      onlineSalesOpenFalseCount: 0,
      onlineSalesOpenTrueCount: 0,
      parentProductIds,
      sessionCount: 0,
      status: null,
    };
  }
  const sessions = collectAvailabilitySessions(result.body);
  return {
    date,
    onlineSalesOpenFalseCount: sessions.filter((session) => session.onlineSalesOpen === false).length,
    onlineSalesOpenTrueCount: sessions.filter((session) => session.onlineSalesOpen === true).length,
    parentProductIds,
    sessionCount: sessions.length,
    status: result.status,
  };
}

function collectAvailabilitySessions(value: unknown): { onlineSalesOpen: boolean | null; startTime: string | null }[] {
  const sessions: { onlineSalesOpen: boolean | null; startTime: string | null }[] = [];
  collectAvailabilitySessionsInto(value, sessions);
  return sessions;
}

function collectAvailabilitySessionsInto(
  value: unknown,
  sessions: { onlineSalesOpen: boolean | null; startTime: string | null }[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectAvailabilitySessionsInto(item, sessions);
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

function summarizeVenue(body: unknown): CatalogReadinessSummary["venue"] {
  const venue = isRecord(body) ? body : {};
  return {
    currency: stringOrNull(venue.currency ?? venue.currencyCode),
    timezone: stringOrNull(venue.timezone ?? venue.timeZone),
    venueId: stringOrNull(venue.id ?? venue.venueId ?? venue.uniqueId),
    venueName: stringOrNull(venue.name ?? venue.venueName),
  };
}

async function buildSummary(args: Args): Promise<CatalogReadinessSummary> {
  const config = readConfig(args.configPath);
  validateConfig(config);
  const guardSelfTest = runGuardSelfTest();
  const identity = readAwsIdentity(config, args.profile);
  const context = buildAwsContext(config, args.profile);
  const rollerConfig = await readRollerConfigFromAws(config, context, args.fallbackSecretName);
  validateRollerConfig(rollerConfig);

  const rollerCalls: Array<{ endpoint: string; method: "AUTH" | "GET"; ok: boolean; status: number }> = [];
  const tokenResult = await requestRollerAccessToken(rollerConfig);
  rollerCalls.push({ endpoint: "/token", method: "AUTH", ok: true, status: tokenResult.status });

  const venueResult = await requestRollerRead(rollerConfig, tokenResult.token, "/venues/me");
  rollerCalls.push({ endpoint: "/venues/me", method: "GET", ok: venueResult.ok, status: venueResult.status });
  if (!venueResult.ok) throw new Error(`Roller venue read failed with HTTP ${venueResult.status}.`);

  const productsResult = await requestRollerRead(rollerConfig, tokenResult.token, "/products");
  rollerCalls.push({ endpoint: "/products", method: "GET", ok: productsResult.ok, status: productsResult.status });
  if (!productsResult.ok) throw new Error(`Roller product read failed with HTTP ${productsResult.status}.`);

  const topLevelProducts = extractProductArray(productsResult.body);
  const flattened = topLevelProducts ? flattenProducts(topLevelProducts) : [];
  const entries = REQUIRED_ENTRIES.map((entry) => findEntryReadiness(flattened, entry));
  const addOns = REQUIRED_ADDONS.map((addOn) => findAddonReadiness(flattened, addOn));
  const availabilityEndpoint = buildAvailabilityEndpoint(
    args.availabilityDate,
    entries,
    addOns.filter((addOn) => addOn.requiresAvailability),
  );
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
    aws: {
      account: identity.account,
      arn: identity.arn,
      region: config.awsRegion,
    },
    bookingIndexStrategy: {
      auroraStorageForFirstParkTest:
        "Store only normalized snapshots for bookings that a guest/staff member explicitly looks up by booking reference.",
      broadGuestDataExportApproved: false,
      recommendation: "rest_on_demand_for_first_park_test",
      reasons: [
        "T0160 already proved exact booking-reference lookup through JumpYard Cloud.",
        "The first park test is assisted and limited, so a full same-day guest list is not required to start safely.",
        "Avoiding /data booking export minimizes Live guest-data exposure before broader visitor traffic is approved.",
        "Aurora can cache looked-up bookings and webhooks can be enabled later when the next gate needs fresher operational state.",
      ],
      revisitTrigger:
        "Revisit before unassisted visitor rollout, queue dashboards, staff search by guest identity, or broader same-day operations.",
    },
    catalog: {
      addOns,
      entries,
      flattenedProductCount: flattened.length,
      requiredAddOnsReady: addOns.filter((item) => item.matchStatus === "ready").length,
      requiredEntriesReady: entries.filter((item) => item.matchStatus === "ready").length,
      topLevelProductCount: topLevelProducts ? topLevelProducts.length : null,
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
    guardSelfTest,
    productAvailability: summarizeAvailability(availabilityResult, args.availabilityDate, availabilityEndpoint),
    rollerCalls,
    safety: {
      auroraWrites: false,
      awsResourceChanged: false,
      bookingReads: false,
      broadGuestDataExport: false,
      draftCreated: false,
      paymentStarted: false,
      publicApiOpened: false,
      redeemCalled: false,
      secretValuesPrinted: false,
      smsOrEmailSent: false,
      webhookProcessingEnabled: false,
    },
    venue: summarizeVenue(venueResult.body),
  };
}

function childCollections(product: ProductNode): ProductNode[][] {
  return ["products", "variations", "productVariations", "children"]
    .map((key) => product[key])
    .filter(isProductArray);
}

function dedupeProducts(products: readonly ProductSummary[]): ProductSummary[] {
  const byId = new Map<string, ProductSummary>();
  for (const product of products) byId.set(product.id, product);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function dedupeCandidates(candidates: readonly ProductCandidate[]): ProductCandidate[] {
  const byId = new Map<string, ProductCandidate>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing || candidate.score > existing.score) byId.set(candidate.id, candidate);
  }
  return [...byId.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function searchableProductText(product: ProductSummary): string {
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
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
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
    return {
      keys: Object.keys(value)
        .filter((key) => !/(secret|token|password|email|phone|mobile|jwt|customer)/i.test(key))
        .slice(0, 12),
      type: "object",
    };
  }
  if (value === null) return { type: "null" };
  return { type: typeof value };
}

function safeResponseSummary(value: unknown): string {
  return truncate(JSON.stringify(safeStructuredSummary(value)), 240);
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
    if (value !== undefined && value !== null && value !== "") return value;
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
  console.log("Roller Live catalog/index readiness guard self-test passed.");
  console.log(`Allowed endpoints checked: ${result.allowedChecked}`);
  console.log(`Rejected write/sensitive endpoints checked: ${result.rejectedChecked}`);
}

function formatCandidate(candidate: ProductCandidate | null): string {
  if (!candidate) return "missing";
  return `${candidate.id} ${candidate.name ?? "unnamed"} (parent=${candidate.parentProductId ?? "none"}, priceCents=${
    candidate.priceCents ?? "unknown"
  })`;
}

function printTextSummary(summary: CatalogReadinessSummary): void {
  console.log("Roller Live catalog/index readiness passed.");
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region}`);
  console.log(`Roller: ${summary.config.rollerEnv} ${summary.config.rollerBaseUrl}`);
  console.log(`Venue: ${summary.venue.venueName ?? "unknown"} (${summary.venue.venueId ?? "unknown"})`);
  console.log(
    `Products: topLevel=${summary.catalog.topLevelProductCount ?? "unknown"}, flattened=${summary.catalog.flattenedProductCount}`,
  );
  console.log(`Entries ready: ${summary.catalog.requiredEntriesReady}/${summary.catalog.entries.length}`);
  for (const entry of summary.catalog.entries) {
    console.log(`- ${entry.key} ${entry.matchStatus}: ${formatCandidate(entry.selected)}`);
  }
  console.log(`Add-ons ready: ${summary.catalog.requiredAddOnsReady}/${summary.catalog.addOns.length}`);
  for (const addOn of summary.catalog.addOns) {
    console.log(
      `- ${addOn.key} ${addOn.matchStatus}: ${formatCandidate(addOn.selected)} ` +
        `(playgroundId=${addOn.currentPlaygroundProductId ?? "none"}, availability=${addOn.requiresAvailability})`,
    );
  }
  if (summary.productAvailability) {
    console.log(
      `Availability probe: status=${summary.productAvailability.status ?? "skipped"}, ` +
        `date=${summary.productAvailability.date}, parentIds=${summary.productAvailability.parentProductIds.join(",")}, ` +
        `sessions=${summary.productAvailability.sessionCount}, onlineOpen=${summary.productAvailability.onlineSalesOpenTrueCount}`,
    );
  }
  console.log(`Booking index strategy: ${summary.bookingIndexStrategy.recommendation}`);
  console.log(
    "Safety: no booking reads, no broad guest-data export, no draft/payment/redeem/webhook processing, no Aurora/AWS writes.",
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

  const summary = await buildSummary(args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printTextSummary(summary);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
