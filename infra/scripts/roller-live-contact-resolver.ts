import { execFileSync } from "child_process";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { fromIni } from "@aws-sdk/credential-providers";
import { App } from "aws-cdk-lib";
import { loadJumpYardCloudConfig, type JumpYardCloudConfig } from "../lib/config";

const EXPECTED_AWS_ACCOUNT = "376129878018";
const EXPECTED_AWS_REGION = "eu-north-1";
const EXPECTED_BASE_URL = "https://api.roller.app";
const EXPECTED_BOOKING_IDENTIFIER = "166490323";
const EXPECTED_ENV = "live";
const EXPECTED_RESOURCE_PREFIX = "jumpyard-check-in-park-test";
const DEFAULT_CONFIG_PATH = "./config/park-test.json";
const MAX_GUEST_DETAIL_PROBES = 8;

const CONTACT_ID_KEYS = new Set([
  "bookingcustomerid",
  "customerid",
  "guestid",
  "rollercustomerid",
]);

const EMAIL_KEYS = new Set(["customeremail", "email", "emailaddress"]);
const FIRST_NAME_KEYS = new Set(["firstname", "forename", "givenname"]);
const LAST_NAME_KEYS = new Set(["familyname", "lastname", "surname"]);
const PHONE_KEYS = new Set(["contactnumber", "customerphone", "mobile", "mobilephone", "mobilenumber", "phone", "phonenumber"]);

interface Args {
  readonly bookingIdentifier: string;
  readonly configPath: string;
  readonly fallbackSecretName?: string;
  readonly json: boolean;
  readonly profile?: string;
  readonly selfTest: boolean;
}

interface AwsContext {
  readonly secrets: SecretsManagerClient;
  readonly ssm: SSMClient;
}

interface AwsIdentity {
  readonly account: string;
  readonly arn: string;
}

interface ContactEvidence {
  readonly completeForDraft: boolean;
  readonly emailPresent: boolean;
  readonly firstNamePresent: boolean;
  readonly lastNamePresent: boolean;
  readonly path: string;
  readonly phonePresent: boolean;
  readonly source: "booking_detail" | "guest_detail";
}

interface CredentialSource {
  readonly fallbackSecretName: string | null;
  readonly primarySecretName: string;
  readonly usedFallback: boolean;
}

interface GuestCandidate {
  readonly id: string;
  readonly path: string;
}

interface GuestProbeSummary {
  readonly candidatePath: string;
  readonly contactEvidence: readonly ContactEvidence[];
  readonly contactResolved: boolean;
  readonly endpoint: "/guests/{id}";
  readonly status: number;
}

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface RollerConfig {
  readonly baseUrl: string;
  readonly credentialSource: CredentialSource;
  readonly credentials: RollerCredentials;
  readonly env: string;
}

interface RollerCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface RollerReadResult {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

interface RollerToken {
  readonly accessToken: string;
  readonly expiresIn: number | null;
  readonly tokenType?: string;
}

interface GuardSelfTestResult {
  readonly allowedChecked: number;
  readonly rejectedChecked: number;
}

interface ContactResolverSummary {
  readonly aws: {
    readonly account: string;
    readonly arn: string;
    readonly region: string;
  };
  readonly booking: {
    readonly bookingContactEvidence: readonly ContactEvidence[];
    readonly bookingIdentifier: string;
    readonly bookingStatus: number;
    readonly candidateCount: number;
    readonly candidatePaths: readonly string[];
    readonly guestDetail: readonly GuestProbeSummary[];
    readonly resolvedVia: "booking_detail" | "guest_detail" | "none";
  };
  readonly config: {
    readonly resourcePrefix: string;
    readonly rollerBaseUrl: string;
    readonly rollerEnv: string;
    readonly safetyGates: JumpYardCloudConfig["safetyGates"];
  };
  readonly conclusion: {
    readonly contactResolvable: boolean;
    readonly recommendedResolverPath: string | null;
  };
  readonly credentialSource: CredentialSource & {
    readonly secretValuesPrinted: false;
  };
  readonly guardSelfTest: GuardSelfTestResult;
  readonly rollerCalls: readonly {
    readonly endpoint: string;
    readonly method: "AUTH" | "GET";
    readonly ok: boolean;
    readonly status: number;
  }[];
  readonly safety: {
    readonly addOnDraftCreated: false;
    readonly auroraWrites: false;
    readonly awsResourceChanged: false;
    readonly broadGuestDataExport: false;
    readonly fullPiiPrinted: false;
    readonly paymentStarted: false;
    readonly redeemCalled: false;
    readonly smsOrEmailSent: false;
    readonly webhookProcessingEnabled: false;
  };
}

function parseArgs(argv: string[]): Args {
  let bookingIdentifier = EXPECTED_BOOKING_IDENTIFIER;
  let configPath = DEFAULT_CONFIG_PATH;
  let fallbackSecretName = process.env.ROLLER_LIVE_CONTACT_RESOLVER_FALLBACK_SECRET_NAME;
  let json = false;
  let profile: string | undefined;
  let selfTest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--booking") {
      bookingIdentifier = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--config") {
      configPath = requiredNext(argv, index, arg);
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (bookingIdentifier !== EXPECTED_BOOKING_IDENTIFIER) {
    throw new Error(`T0163 is approved only for booking ${EXPECTED_BOOKING_IDENTIFIER}.`);
  }

  return {
    bookingIdentifier,
    configPath,
    fallbackSecretName: fallbackSecretName?.trim() || undefined,
    json,
    profile,
    selfTest,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`Missing value for ${arg}.`);
  return value;
}

function readConfig(configPath: string): JumpYardCloudConfig {
  const app = new App({ context: { config: configPath } });
  return loadJumpYardCloudConfig(app);
}

function validateConfig(config: JumpYardCloudConfig): void {
  const errors: string[] = [];
  if (config.awsAccount !== EXPECTED_AWS_ACCOUNT) errors.push(`awsAccount must be ${EXPECTED_AWS_ACCOUNT}.`);
  if (config.awsRegion !== EXPECTED_AWS_REGION) errors.push(`awsRegion must be ${EXPECTED_AWS_REGION}.`);
  if (config.resourcePrefix !== EXPECTED_RESOURCE_PREFIX) errors.push(`resourcePrefix must be ${EXPECTED_RESOURCE_PREFIX}.`);
  if (config.roller.environment !== EXPECTED_ENV) errors.push(`roller.environment must be ${EXPECTED_ENV}.`);
  if (config.roller.baseUrl !== EXPECTED_BASE_URL) errors.push(`roller.baseUrl must be ${EXPECTED_BASE_URL}.`);
  if (!config.safetyGates.emergencyStop) errors.push("safetyGates.emergencyStop must stay true.");
  if (config.safetyGates.staffAuthEnabled) errors.push("safetyGates.staffAuthEnabled must stay false.");
  if (config.safetyGates.guestMessagingSendsEnabled) errors.push("safetyGates.guestMessagingSendsEnabled must stay false.");
  if (config.safetyGates.rollerWebhookProcessingEnabled) errors.push("safetyGates.rollerWebhookProcessingEnabled must stay false.");
  if (config.safetyGates.rollerBookingDraftWritesEnabled) errors.push("safetyGates.rollerBookingDraftWritesEnabled must stay false.");
  if (config.safetyGates.rollerRedeemWritesEnabled) errors.push("safetyGates.rollerRedeemWritesEnabled must stay false.");
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

function assertReadOnlyRollerRequest(method: string, endpointPath: string): void {
  if (method !== "GET") throw new Error(`Blocked non-read Roller method ${method} ${endpointPath}.`);
  const parsed = new URL(endpointPath, "https://allowlist.local");
  const pathname = parsed.pathname;
  if (pathname === `/bookings/${EXPECTED_BOOKING_IDENTIFIER}`) return;
  if (/^\/guests\/[^/]+$/.test(pathname)) return;
  throw new Error(`Blocked non-T0163 Roller endpoint GET ${pathname}.`);
}

function runGuardSelfTest(): GuardSelfTestResult {
  const allowed = [
    ["GET", `/bookings/${EXPECTED_BOOKING_IDENTIFIER}`],
    ["GET", "/guests/12345"],
  ] as const;
  const rejected = [
    ["GET", "/bookings/166447399"],
    ["GET", "/bookings/draft"],
    ["GET", "/customers/12345"],
    ["GET", "/data/customers"],
    ["GET", "/payments"],
    ["GET", "/products"],
    ["GET", "/redemptions"],
    ["GET", "/webhooks"],
    ["POST", "/bookings/draft/costs"],
    ["POST", "/bookings/draft"],
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

function buildRollerUrl(baseUrl: string, endpointPath: string): URL {
  if (!endpointPath.startsWith("/")) throw new Error("Roller endpoint paths must start with '/'.");
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== "https:") throw new Error("Roller base URL must use https.");
  const basePath = parsedBaseUrl.pathname.replace(/\/$/, "");
  return new URL(`${basePath}${endpointPath}`, parsedBaseUrl.origin);
}

async function buildSummary(args: Args): Promise<ContactResolverSummary> {
  const guardSelfTest = runGuardSelfTest();
  const config = readConfig(args.configPath);
  validateConfig(config);
  const aws = readAwsIdentity(config, args.profile);
  const awsContext = buildAwsContext(config, args.profile);
  const rollerConfig = await readRollerConfigFromAws(config, awsContext, args.fallbackSecretName);
  const auth = await requestRollerAccessToken(rollerConfig);
  const bookingEndpoint = `/bookings/${encodeURIComponent(args.bookingIdentifier)}`;
  const bookingResult = await requestRollerRead(rollerConfig, auth.token, bookingEndpoint);
  const rollerCalls: {
    endpoint: string;
    method: "AUTH" | "GET";
    ok: boolean;
    status: number;
  }[] = [
    { endpoint: "/token", method: "AUTH", ok: true, status: auth.status },
    { endpoint: "/bookings/{identifier}", method: "GET", ok: bookingResult.ok, status: bookingResult.status },
  ];

  const bookingContactEvidence = collectContactEvidence(bookingResult.body, "booking", "booking_detail");
  const candidates = collectGuestCandidates(bookingResult.body).slice(0, MAX_GUEST_DETAIL_PROBES);
  const guestDetail: GuestProbeSummary[] = [];

  for (const candidate of candidates) {
    const result = await requestRollerRead(rollerConfig, auth.token, `/guests/${encodeURIComponent(candidate.id)}`);
    rollerCalls.push({ endpoint: "/guests/{id}", method: "GET", ok: result.ok, status: result.status });
    const contactEvidence = result.ok ? collectContactEvidence(result.body, "guest", "guest_detail") : [];
    guestDetail.push({
      candidatePath: candidate.path,
      contactEvidence,
      contactResolved: contactEvidence.some((item) => item.completeForDraft),
      endpoint: "/guests/{id}",
      status: result.status,
    });
  }

  const directResolved = bookingContactEvidence.find((item) => item.completeForDraft);
  const guestResolved = guestDetail.flatMap((item) => item.contactEvidence).find((item) => item.completeForDraft);
  const resolvedVia = directResolved ? "booking_detail" : guestResolved ? "guest_detail" : "none";
  const recommendedResolverPath = directResolved?.path ?? guestResolved?.path ?? null;

  return {
    aws: {
      account: aws.account,
      arn: aws.arn,
      region: config.awsRegion,
    },
    booking: {
      bookingContactEvidence,
      bookingIdentifier: args.bookingIdentifier,
      bookingStatus: bookingResult.status,
      candidateCount: candidates.length,
      candidatePaths: candidates.map((candidate) => candidate.path),
      guestDetail,
      resolvedVia,
    },
    config: {
      resourcePrefix: config.resourcePrefix,
      rollerBaseUrl: config.roller.baseUrl,
      rollerEnv: config.roller.environment,
      safetyGates: config.safetyGates,
    },
    conclusion: {
      contactResolvable: Boolean(directResolved || guestResolved),
      recommendedResolverPath,
    },
    credentialSource: {
      ...rollerConfig.credentialSource,
      secretValuesPrinted: false,
    },
    guardSelfTest,
    rollerCalls,
    safety: {
      addOnDraftCreated: false,
      auroraWrites: false,
      awsResourceChanged: false,
      broadGuestDataExport: false,
      fullPiiPrinted: false,
      paymentStarted: false,
      redeemCalled: false,
      smsOrEmailSent: false,
      webhookProcessingEnabled: false,
    },
  };
}

function collectGuestCandidates(value: unknown): GuestCandidate[] {
  const candidates: GuestCandidate[] = [];
  collectGuestCandidatesInto(value, "body", candidates, 0);
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.id}:${candidate.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectGuestCandidatesInto(value: unknown, path: string, candidates: GuestCandidate[], depth: number): void {
  if (depth > 10) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectGuestCandidatesInto(item, `${path}[${index}]`, candidates, depth + 1));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    const normalizedKey = normalizeKey(key);
    const candidate = stringOrNull(child);
    if (candidate && CONTACT_ID_KEYS.has(normalizedKey) && /^[A-Za-z0-9-]{3,80}$/.test(candidate)) {
      candidates.push({ id: candidate, path: childPath });
    }
    collectGuestCandidatesInto(child, childPath, candidates, depth + 1);
  }
}

function collectContactEvidence(value: unknown, rootPath: string, source: ContactEvidence["source"]): ContactEvidence[] {
  const evidence: ContactEvidence[] = [];
  collectContactEvidenceInto(value, rootPath, source, evidence, 0);
  return evidence.filter((item, index, items) => items.findIndex((candidate) => candidate.path === item.path) === index);
}

function collectContactEvidenceInto(
  value: unknown,
  path: string,
  source: ContactEvidence["source"],
  evidence: ContactEvidence[],
  depth: number,
): void {
  if (depth > 10) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectContactEvidenceInto(item, `${path}[${index}]`, source, evidence, depth + 1));
    return;
  }
  if (!isRecord(value)) return;

  const summary = summarizeContactRecord(value);
  if (summary.emailPresent || summary.phonePresent || summary.firstNamePresent || summary.lastNamePresent) {
    evidence.push({ path, source, ...summary });
  }

  for (const [key, child] of Object.entries(value)) {
    collectContactEvidenceInto(child, `${path}.${key}`, source, evidence, depth + 1);
  }
}

function summarizeContactRecord(record: JsonRecord): Omit<ContactEvidence, "path" | "source"> {
  const emailPresent = hasKeyValue(record, EMAIL_KEYS);
  const firstNamePresent = hasKeyValue(record, FIRST_NAME_KEYS);
  const lastNamePresent = hasKeyValue(record, LAST_NAME_KEYS);
  const phonePresent = hasKeyValue(record, PHONE_KEYS);
  return {
    completeForDraft: emailPresent && firstNamePresent && lastNamePresent && phonePresent,
    emailPresent,
    firstNamePresent,
    lastNamePresent,
    phonePresent,
  };
}

function hasKeyValue(record: JsonRecord, keys: ReadonlySet<string>): boolean {
  return Object.entries(record).some(([key, value]) => keys.has(normalizeKey(key)) && Boolean(stringOrNull(value)));
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
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

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function printGuardSelfTest(result: GuardSelfTestResult): void {
  console.log("Roller Live contact resolver guard self-test passed.");
  console.log(`Allowed endpoints checked: ${result.allowedChecked}`);
  console.log(`Rejected write/sensitive endpoints checked: ${result.rejectedChecked}`);
}

function printTextSummary(summary: ContactResolverSummary): void {
  console.log("Roller Live contact resolver investigation completed.");
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region}`);
  console.log(`Roller: ${summary.config.rollerEnv} ${summary.config.rollerBaseUrl}`);
  console.log(`Booking: ${summary.booking.bookingIdentifier}, status=${summary.booking.bookingStatus}`);
  console.log(`Booking contact evidence records: ${summary.booking.bookingContactEvidence.length}`);
  for (const item of summary.booking.bookingContactEvidence) {
    console.log(
      `- ${item.path}: first=${item.firstNamePresent}, last=${item.lastNamePresent}, email=${item.emailPresent}, ` +
        `phone=${item.phonePresent}, complete=${item.completeForDraft}`,
    );
  }
  console.log(`Guest/customer id candidate paths: ${summary.booking.candidateCount}`);
  for (const path of summary.booking.candidatePaths) console.log(`- ${path}`);
  console.log(`Guest detail probes: ${summary.booking.guestDetail.length}`);
  for (const probe of summary.booking.guestDetail) {
    console.log(
      `- ${probe.candidatePath}: status=${probe.status}, contactResolved=${probe.contactResolved}, ` +
        `evidenceRecords=${probe.contactEvidence.length}`,
    );
    for (const item of probe.contactEvidence) {
      console.log(
        `  - ${item.path}: first=${item.firstNamePresent}, last=${item.lastNamePresent}, email=${item.emailPresent}, ` +
          `phone=${item.phonePresent}, complete=${item.completeForDraft}`,
      );
    }
  }
  console.log(`Conclusion: contactResolvable=${summary.conclusion.contactResolvable}, resolvedVia=${summary.booking.resolvedVia}`);
  console.log(`Recommended resolver path: ${summary.conclusion.recommendedResolverPath ?? "none"}`);
  console.log("Safety: no AWS/Aurora writes, no drafts/payments/redeem/webhook processing, no SMS/email, no full PII printed.");
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
