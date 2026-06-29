import { execFileSync } from "child_process";
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
  readonly configPath: string;
  readonly json: boolean;
  readonly profile?: string;
  readonly selfTest: boolean;
}

interface AwsIdentity {
  readonly account: string;
  readonly arn: string;
}

interface AwsStackSummary {
  readonly apiEndpoint: string;
  readonly stackName: string;
  readonly stackStatus: string;
}

interface SecretMetadata {
  readonly arnPresent: boolean;
  readonly exists: boolean;
  readonly lastChangedDate: string | null;
  readonly name: string;
}

interface SsmParameterSummary {
  readonly name: string;
  readonly value: string;
}

interface ConfigValidationTarget {
  readonly awsAccount: string;
  readonly awsRegion: string;
  readonly resourcePrefix: string;
  readonly roller: {
    readonly baseUrl: string;
    readonly environment: string;
  };
  readonly safetyGates: JumpYardCloudConfig["safetyGates"];
  readonly tags: Record<string, string>;
}

interface DryRunSummary {
  readonly aws: {
    readonly account: string;
    readonly arn: string;
    readonly region: string;
    readonly stackName: string;
    readonly stackStatus: string;
  };
  readonly config: {
    readonly resourcePrefix: string;
    readonly rollerBaseUrl: string;
    readonly rollerEnv: string;
    readonly safetyGates: JumpYardCloudConfig["safetyGates"];
    readonly tags: Record<string, string>;
  };
  readonly deployedParameters: {
    readonly rollerBaseUrl: SsmParameterSummary;
    readonly rollerEnv: SsmParameterSummary;
  };
  readonly dryRunOnly: true;
  readonly mode: "dry-run";
  readonly noAwsWritesMade: true;
  readonly noRollerRequestsMade: true;
  readonly secrets: {
    readonly rollerCredentialsSecretName: string;
    readonly rollerCredentialValuesPrinted: false;
    readonly webhookTokenSecret: SecretMetadata & {
      readonly valuePrinted: false;
    };
  };
  readonly validation: {
    readonly applyModeRejected: true;
    readonly expectedAwsMetadataConfirmed: true;
    readonly liveWriteGatesClosed: true;
  };
  readonly webhook: {
    readonly duplicateBehavior: readonly string[];
    readonly expectedDeliveryHeaders: readonly {
      readonly name: string;
      readonly valuePrinted: false;
      readonly valueSource: string;
    }[];
    readonly events: readonly (typeof WEBHOOK_EVENTS)[number][];
    readonly include: {
      readonly tickets: true;
    };
    readonly registrationRequest: {
      readonly auth: string;
      readonly method: "POST";
      readonly payloadPreview: Record<string, unknown>;
      readonly url: string;
    };
    readonly rollback: {
      readonly commandTemplate: string;
      readonly endpointTemplate: string;
      readonly requiresRecordedWebhookId: true;
    };
    readonly route: "POST /v1/roller/webhooks/bookings";
    readonly url: string;
  };
  readonly nextGate: string;
}

interface GuardSelfTestResult {
  readonly rejectedArgsChecked: number;
  readonly rollbackTemplateChecked: true;
  readonly safetyGateChecks: number;
  readonly webhookUrlChecks: number;
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

interface DescribeSecretResponse {
  readonly ARN?: string;
  readonly LastChangedDate?: string;
  readonly Name?: string;
}

interface GetParameterResponse {
  readonly Parameter?: {
    readonly Name?: string;
    readonly Value?: string;
  };
}

function parseArgs(argv: string[]): Args {
  let configPath = DEFAULT_CONFIG_PATH;
  let json = false;
  let profile: string | undefined;
  let selfTest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply" || arg === "--register" || arg === "--delete" || arg === "--webhook-id") {
      throw new Error(`${arg} is not available in T0154 dry-run mode.`);
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { configPath, json, profile, selfTest };
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

function validateParkTestConfig(config: ConfigValidationTarget): void {
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
    errors.push("safetyGates.rollerWebhookProcessingEnabled must stay false.");
  }
  if (config.safetyGates.staffAuthEnabled) errors.push("safetyGates.staffAuthEnabled must stay false.");

  for (const [tag, expected] of Object.entries(REQUIRED_TAGS)) {
    if (config.tags[tag] !== expected) {
      errors.push(`${tag} must be ${expected}.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
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
  if (!apiEndpoint) {
    throw new Error(`CloudFormation stack ${stackName} is missing ApiEndpoint output.`);
  }

  validateBaseEndpoint(apiEndpoint);
  return {
    apiEndpoint: stripTrailingSlash(apiEndpoint),
    stackName,
    stackStatus: stack.StackStatus ?? "unknown",
  };
}

function readSsmParameter(config: JumpYardCloudConfig, profile: string | undefined, name: string): SsmParameterSummary {
  const parsed = awsJson<GetParameterResponse>(config, profile, ["ssm", "get-parameter", "--name", name]);
  const value = parsed.Parameter?.Value?.trim();
  if (!value) {
    throw new Error(`SSM parameter ${name} has no value.`);
  }
  return {
    name,
    value,
  };
}

function describeSecret(config: JumpYardCloudConfig, profile: string | undefined, name: string): SecretMetadata {
  const parsed = awsJson<DescribeSecretResponse>(config, profile, [
    "secretsmanager",
    "describe-secret",
    "--secret-id",
    name,
  ]);
  return {
    arnPresent: Boolean(parsed.ARN),
    exists: parsed.Name === name,
    lastChangedDate: parsed.LastChangedDate ?? null,
    name,
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

function validateBaseEndpoint(endpoint: string): void {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") {
    throw new Error("Webhook endpoint must use https.");
  }
}

function validateWebhookUrl(webhookUrl: string): void {
  validateBaseEndpoint(webhookUrl);
  const parsed = new URL(webhookUrl);
  if (!parsed.pathname.endsWith(BOOKING_WEBHOOK_ROUTE)) {
    throw new Error("Webhook URL must target the JumpYard booking webhook route.");
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildWebhookUrl(apiEndpoint: string): string {
  const url = `${stripTrailingSlash(apiEndpoint)}${BOOKING_WEBHOOK_ROUTE}`;
  validateWebhookUrl(url);
  return url;
}

function buildRegistrationPayloadPreview(webhookUrl: string, webhookTokenSecretName: string): Record<string, unknown> {
  return {
    url: webhookUrl,
    enabled: true,
    authentication: {
      apiKey: `<value from Secrets Manager ${webhookTokenSecretName}>`,
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

function buildRollbackCommand(baseUrl: string): string {
  const endpoint = `${stripTrailingSlash(baseUrl)}${ROLLER_WEBHOOKS_ENDPOINT}/<recorded-live-webhook-id>`;
  return [
    "curl --fail --request DELETE",
    `"${endpoint}"`,
    '--header "Authorization: Bearer <roller-access-token-from-t0155-auth-step>"',
    '--header "Accept: application/json"',
  ].join(" ");
}

function buildDryRunSummary(args: Args): DryRunSummary {
  const config = readConfig(args.configPath);
  validateParkTestConfig(config);
  const identity = readAwsIdentity(config, args.profile);
  const stack = readStackSummary(config, args.profile);
  const rollerEnvParameter = readSsmParameter(config, args.profile, `/${config.resourcePrefix}/roller/env`);
  const rollerBaseUrlParameter = readSsmParameter(config, args.profile, `/${config.resourcePrefix}/roller/base-url`);

  if (rollerEnvParameter.value !== config.roller.environment) {
    throw new Error(`AWS Roller env ${rollerEnvParameter.value} does not match config ${config.roller.environment}.`);
  }
  if (rollerBaseUrlParameter.value !== config.roller.baseUrl) {
    throw new Error(
      `AWS Roller base URL ${rollerBaseUrlParameter.value} does not match config ${config.roller.baseUrl}.`,
    );
  }

  const webhookTokenSecretName = `/${config.resourcePrefix}/webhooks/dev-token`;
  const webhookTokenSecret = describeSecret(config, args.profile, webhookTokenSecretName);
  if (!webhookTokenSecret.exists) {
    throw new Error(`Webhook token secret ${webhookTokenSecretName} was not found.`);
  }

  const webhookUrl = buildWebhookUrl(stack.apiEndpoint);
  const rollerWebhookRegistrationUrl = `${stripTrailingSlash(config.roller.baseUrl)}${ROLLER_WEBHOOKS_ENDPOINT}`;
  const endpointTemplate = `${rollerWebhookRegistrationUrl}/<recorded-live-webhook-id>`;

  return {
    aws: {
      account: identity.account,
      arn: identity.arn,
      region: config.awsRegion,
      stackName: stack.stackName,
      stackStatus: stack.stackStatus,
    },
    config: {
      resourcePrefix: config.resourcePrefix,
      rollerBaseUrl: config.roller.baseUrl,
      rollerEnv: config.roller.environment,
      safetyGates: config.safetyGates,
      tags: config.tags,
    },
    deployedParameters: {
      rollerBaseUrl: rollerBaseUrlParameter,
      rollerEnv: rollerEnvParameter,
    },
    dryRunOnly: true,
    mode: "dry-run",
    noAwsWritesMade: true,
    noRollerRequestsMade: true,
    secrets: {
      rollerCredentialsSecretName: `/${config.resourcePrefix}/roller/credentials`,
      rollerCredentialValuesPrinted: false,
      webhookTokenSecret: {
        ...webhookTokenSecret,
        valuePrinted: false,
      },
    },
    validation: {
      applyModeRejected: true,
      expectedAwsMetadataConfirmed: true,
      liveWriteGatesClosed: true,
    },
    webhook: {
      duplicateBehavior: [
        "T0155 must GET Roller Live webhooks before POST and match this exact URL.",
        "If an enabled webhook already matches this URL and event shape, T0155 should record the existing id and skip POST.",
        "If a disabled or mismatched webhook uses this URL, T0155 must stop for manual review instead of creating a duplicate.",
      ],
      expectedDeliveryHeaders: [
        {
          name: "x-roller-apikey",
          valuePrinted: false,
          valueSource: webhookTokenSecretName,
        },
      ],
      events: [...WEBHOOK_EVENTS],
      include: {
        tickets: true,
      },
      registrationRequest: {
        auth: `Bearer access token from /${config.resourcePrefix}/roller/credentials (not printed)`,
        method: "POST",
        payloadPreview: buildRegistrationPayloadPreview(webhookUrl, webhookTokenSecretName),
        url: rollerWebhookRegistrationUrl,
      },
      rollback: {
        commandTemplate: buildRollbackCommand(config.roller.baseUrl),
        endpointTemplate,
        requiresRecordedWebhookId: true,
      },
      route: "POST /v1/roller/webhooks/bookings",
      url: webhookUrl,
    },
    nextGate:
      "T0155 can register or match the Roller Live webhook only after explicit approval; T0154 made no Roller requests and no AWS writes.",
  };
}

function printTextSummary(summary: DryRunSummary): void {
  console.log("Roller Live webhook dry-run plan ready.");
  console.log(`Mode: ${summary.mode}`);
  console.log(`AWS: ${summary.aws.account} ${summary.aws.region} (${summary.aws.stackName} ${summary.aws.stackStatus})`);
  console.log(`Roller: ${summary.config.rollerEnv} ${summary.config.rollerBaseUrl}`);
  console.log(`Webhook endpoint: ${summary.webhook.url}`);
  console.log(`Register request: ${summary.webhook.registrationRequest.method} ${summary.webhook.registrationRequest.url}`);
  console.log(`Delivery auth header: ${summary.webhook.expectedDeliveryHeaders[0].name}`);
  console.log(`Header value source: ${summary.webhook.expectedDeliveryHeaders[0].valueSource}`);
  console.log(`Events: ${summary.webhook.events.join(", ")}; include tickets=${summary.webhook.include.tickets}`);
  console.log(`Rollback endpoint template: ${summary.webhook.rollback.endpointTemplate}`);
  console.log(`Rollback command template: ${summary.webhook.rollback.commandTemplate}`);
  console.log("Duplicate behavior:");
  for (const line of summary.webhook.duplicateBehavior) {
    console.log(`- ${line}`);
  }
  console.log("Safety: no Roller requests, no AWS writes, no secret values printed.");
  console.log(`Next gate: ${summary.nextGate}`);
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

function buildValidSelfTestConfig(): ConfigValidationTarget {
  return {
    awsAccount: EXPECTED_AWS_ACCOUNT,
    awsRegion: EXPECTED_AWS_REGION,
    resourcePrefix: EXPECTED_RESOURCE_PREFIX,
    roller: {
      baseUrl: EXPECTED_BASE_URL,
      environment: EXPECTED_ENV,
    },
    safetyGates: {
      emergencyStop: true,
      guestMessagingSendsEnabled: false,
      liveAddOnSmokeAllowedIdentifiers: [],
      liveAssistedLookupAllowedOperatingDates: [],
      liveLinkedAddOnSettlementAllowedIdentifiers: [],
      liveLookupSmokeAllowedIdentifiers: [],
      liveRedeemSmokeAllowedIdentifiers: [],
      frontendRedeemRehearsalAllowedSessionIds: [],
      fullFlowRehearsalAllowedOperatingDates: [],
      rollerBookingDraftWritesEnabled: false,
      rollerRedeemWritesEnabled: false,
      rollerWebhookProcessingEnabled: false,
      staffAuthEnabled: false,
    },
    tags: REQUIRED_TAGS,
  };
}

function runGuardSelfTest(): GuardSelfTestResult {
  const rejectedArgs = ["--apply", "--register", "--delete", "--webhook-id"];
  for (const arg of rejectedArgs) {
    assertThrows(arg, () => parseArgs([arg]));
  }

  validateWebhookUrl("https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings");
  assertThrows("non-https webhook url", () =>
    validateWebhookUrl("http://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings"),
  );
  assertThrows("wrong webhook route", () =>
    validateWebhookUrl("https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/redemptions"),
  );

  const validConfig = buildValidSelfTestConfig();
  validateParkTestConfig(validConfig);
  assertThrows("webhook processing enabled", () =>
    validateParkTestConfig({
      ...validConfig,
      safetyGates: {
        ...validConfig.safetyGates,
        rollerWebhookProcessingEnabled: true,
      },
    }),
  );
  assertThrows("wrong environment tag", () =>
    validateParkTestConfig({
      ...validConfig,
      tags: {
        ...validConfig.tags,
        "WRLDS:Environment": "dev",
      },
    }),
  );

  const rollbackCommand = buildRollbackCommand(EXPECTED_BASE_URL);
  if (!rollbackCommand.includes("/webhooks/<recorded-live-webhook-id>")) {
    throw new Error("Self-test rollback command is missing the recorded webhook id placeholder.");
  }

  return {
    rejectedArgsChecked: rejectedArgs.length,
    rollbackTemplateChecked: true,
    safetyGateChecks: 3,
    webhookUrlChecks: 3,
  };
}

function printGuardSelfTest(result: GuardSelfTestResult): void {
  console.log("Roller Live webhook dry-run guard self-test passed.");
  console.log(`Rejected write args checked: ${result.rejectedArgsChecked}`);
  console.log(`Webhook URL checks: ${result.webhookUrlChecks}`);
  console.log(`Safety gate checks: ${result.safetyGateChecks}`);
  console.log(`Rollback template checked: ${result.rollbackTemplateChecked}`);
}

function main(): void {
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

  const summary = buildDryRunSummary(args);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printTextSummary(summary);
  }
}

main();
