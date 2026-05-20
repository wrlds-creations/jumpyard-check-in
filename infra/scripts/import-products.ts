import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  type Field,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";
import { DescribeSecretCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { fromIni } from "@aws-sdk/credential-providers";

const {
  buildRollerUrl,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require("../../scripts/roller-client") as RollerClientModule;

const DEFAULT_DATABASE = "jumpyard_cloud";
const DEFAULT_PRODUCTS_PATH = "/products";
const DEFAULT_TTL_HOURS = 24;
const IMPORT_SOURCE = "rest_products";
const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_PRODUCTS";

interface RollerClientModule {
  buildRollerUrl: (baseUrl: string, endpointPath: string) => URL;
  loadLocalEnv: (filePath?: string, env?: NodeJS.ProcessEnv) => boolean;
  readRollerConfig: () => RollerConfig;
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

interface ImportArgs {
  apply: boolean;
  configPath: string;
  json: boolean;
  profile?: string;
  productsPath: string;
  ttlHours: number;
  venueId?: string;
}

interface ImportContext {
  clusterArn: string;
  database: string;
  rds: RDSDataClient;
  secretArn: string;
}

interface ProductNode {
  [key: string]: unknown;
}

interface ParentProduct {
  id: string | null;
  name: string | null;
  type: string | null;
}

interface NormalizedProduct {
  barcodeId: string | null;
  cacheKey: string;
  id: string;
  isVariation: boolean;
  name: string | null;
  parentProductId: string | null;
  parentProductName: string | null;
  parentType: string | null;
  priceCents: number | null;
  productHash: string;
  productSubType: string | null;
  productType: string | null;
  summary: Record<string, unknown>;
}

interface ImportSummary {
  apply: boolean;
  bookingItemsMatched: number | null;
  cacheRowsMatched: number | null;
  endpointPath: string;
  productRows: number;
  topLevelProducts: number;
  upserts: number;
  venueId: string;
}

function parseArgs(argv: string[]): ImportArgs {
  let configPath = "./config/dev.json";
  let profile: string | undefined;
  let productsPath = process.env.ROLLER_PRODUCTS_PATH || DEFAULT_PRODUCTS_PATH;
  let ttlHours = parsePositiveInteger(process.env.ROLLER_PRODUCT_CACHE_TTL_HOURS, DEFAULT_TTL_HOURS);
  let venueId = process.env.JUMPYARD_VENUE_ID;
  let apply = false;
  let json = false;

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

    if (arg === "--path") {
      productsPath = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--ttl-hours") {
      ttlHours = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_TTL_HOURS);
      index += 1;
      continue;
    }

    if (arg === "--venue-id") {
      venueId = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!productsPath.startsWith("/")) {
    throw new Error("Product endpoint path must start with '/'.");
  }

  return {
    apply,
    configPath,
    json,
    productsPath,
    profile,
    ttlHours,
    venueId,
  };
}

function requiredNext(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${arg}.`);
  }
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Numeric options must be positive integers.");
  }
  return parsed;
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

async function resolveSecretArn(config: DeployConfig, profile?: string): Promise<string> {
  const client = new SecretsManagerClient({
    credentials: profile ? fromIni({ profile }) : undefined,
    region: config.awsRegion,
  });
  const secretName = `/${config.resourcePrefix}/aurora/admin`;
  const response = await client.send(new DescribeSecretCommand({ SecretId: secretName }));

  if (!response.ARN) {
    throw new Error(`Could not resolve secret ARN for ${secretName}.`);
  }

  return response.ARN;
}

async function requestProducts(config: RollerConfig, token: RollerToken, endpointPath: string): Promise<ProductNode[]> {
  const response = await fetch(buildRollerUrl(config.baseUrl, endpointPath), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
    },
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(`Roller product read failed with HTTP ${response.status}.`);
  }

  const products = extractProductArray(body);
  if (!products) {
    throw new Error("Roller product response was not an array or known product wrapper.");
  }

  return products;
}

function extractProductArray(body: unknown): ProductNode[] | null {
  if (isProductArray(body)) return body;
  if (!isRecord(body)) return null;

  const candidateKeys = ["items", "products", "data", "results"];
  for (const key of candidateKeys) {
    const candidate = body[key];
    if (isProductArray(candidate)) return candidate;
  }

  return null;
}

function flattenProducts(
  products: ProductNode[],
  rollerEnv: string,
  venueId: string,
  parent: ParentProduct | null = null,
): NormalizedProduct[] {
  const flattened: NormalizedProduct[] = [];

  for (const product of products) {
    const id = firstString(product, ["id", "productId", "productID", "variationId"]);
    const name = firstString(product, ["name", "productName", "title"]);
    const productType = firstString(product, ["type", "productType"]);
    const productSubType = firstString(product, ["productSubType", "subType"]);
    const parentProductId = firstString(product, ["parentProductId", "parentId"]) ?? parent?.id ?? null;
    const parentProductName = firstString(product, ["parentProductName", "parentName"]) ?? parent?.name ?? null;
    const parentType = firstString(product, ["parentProductType", "parentType"]) ?? parent?.type ?? null;
    const barcodeId = firstString(product, ["barcodeId", "barcode", "sku"]);
    const priceCents = centsOrNull(firstKnown(product, ["price", "cost"]));
    const currentParent = {
      id: id ?? parent?.id ?? null,
      name: name ?? parent?.name ?? null,
      type: productType ?? parent?.type ?? null,
    };

    if (id) {
      const summary = {
        barcodeId,
        id,
        isVariation: Boolean(parentProductId || parent),
        name,
        parentProductId,
        parentProductName,
        parentType,
        priceCents,
        productSubType,
        productType,
        source: IMPORT_SOURCE,
      };

      flattened.push({
        barcodeId,
        cacheKey: `roller_product:${rollerEnv}:${venueId}:${id}`,
        id,
        isVariation: Boolean(parentProductId || parent),
        name,
        parentProductId,
        parentProductName,
        parentType,
        priceCents,
        productHash: hashJson(summary),
        productSubType,
        productType,
        summary,
      });
    }

    for (const children of childCollections(product)) {
      flattened.push(...flattenProducts(children, rollerEnv, venueId, currentParent));
    }
  }

  return dedupeProducts(flattened);
}

function dedupeProducts(products: NormalizedProduct[]): NormalizedProduct[] {
  const byId = new Map<string, NormalizedProduct>();

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

function isRecord(value: unknown): value is ProductNode {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isProductArray(value: unknown): value is ProductNode[] {
  return Array.isArray(value) && value.every(isRecord);
}

function firstKnown(record: ProductNode, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function firstString(record: ProductNode, keys: string[]): string | null {
  const value = firstKnown(record, keys);
  if (value === null) return null;
  return String(value);
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

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stringParameter(name: string, value: string | null): SqlParameter {
  return value === null
    ? { name, value: { isNull: true } }
    : { name, value: { stringValue: value } };
}

async function executeStatement(
  context: ImportContext,
  sql: string,
  parameters?: SqlParameter[],
  transactionId?: string,
): Promise<{ records: Field[][]; updated: number }> {
  const response = await context.rds.send(
    new ExecuteStatementCommand({
      database: context.database,
      parameters,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
      sql,
      transactionId,
    }),
  );

  return {
    records: response.records ?? [],
    updated: response.numberOfRecordsUpdated ?? 0,
  };
}

async function applyImport(
  context: ImportContext,
  products: NormalizedProduct[],
  rollerEnv: string,
  venueId: string,
  ttlHours: number,
): Promise<{ bookingItemsMatched: number; cacheRowsMatched: number; upserts: number }> {
  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const begin = await context.rds.send(
    new BeginTransactionCommand({
      database: context.database,
      resourceArn: context.clusterArn,
      secretArn: context.secretArn,
    }),
  );
  const transactionId = begin.transactionId;

  if (!transactionId) {
    throw new Error("Could not start Aurora Data API transaction.");
  }

  try {
    for (const product of products) {
      await upsertProduct(context, product, rollerEnv, venueId, fetchedAt, expiresAt, transactionId);
    }

    const enrichment = await enrichBookingItems(context, rollerEnv, venueId, transactionId);

    await context.rds.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );

    const verification = await queryVerification(context, rollerEnv, venueId);

    return {
      bookingItemsMatched: verification.bookingItemsMatched,
      cacheRowsMatched: verification.cacheRowsMatched,
      upserts: products.length + enrichment.updated,
    };
  } catch (error) {
    await context.rds.send(
      new RollbackTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );
    throw error;
  }
}

async function upsertProduct(
  context: ImportContext,
  product: NormalizedProduct,
  rollerEnv: string,
  venueId: string,
  fetchedAt: string,
  expiresAt: string,
  transactionId: string,
): Promise<void> {
  await executeStatement(
    context,
    `INSERT INTO jumpyard.product_catalog_cache (
      cache_key,
      venue_id,
      roller_env,
      fetched_at,
      expires_at,
      product_hash,
      summary
    )
    VALUES (
      :cacheKey,
      :venueId,
      :rollerEnv,
      CAST(:fetchedAt AS timestamptz),
      CAST(:expiresAt AS timestamptz),
      :productHash,
      CAST(:summary AS jsonb)
    )
    ON CONFLICT (cache_key) DO UPDATE SET
      venue_id = EXCLUDED.venue_id,
      roller_env = EXCLUDED.roller_env,
      fetched_at = EXCLUDED.fetched_at,
      expires_at = EXCLUDED.expires_at,
      product_hash = EXCLUDED.product_hash,
      summary = EXCLUDED.summary`,
    [
      stringParameter("cacheKey", product.cacheKey),
      stringParameter("venueId", venueId),
      stringParameter("rollerEnv", rollerEnv),
      stringParameter("fetchedAt", fetchedAt),
      stringParameter("expiresAt", expiresAt),
      stringParameter("productHash", product.productHash),
      stringParameter("summary", JSON.stringify(product.summary)),
    ],
    transactionId,
  );
}

async function enrichBookingItems(
  context: ImportContext,
  rollerEnv: string,
  venueId: string,
  transactionId: string,
): Promise<{ updated: number }> {
  const result = await executeStatement(
    context,
    `UPDATE jumpyard.roller_booking_items AS item
     SET product_name = product.summary ->> 'name',
         parent_product_name = NULLIF(product.summary ->> 'parentProductName', ''),
         parent_product_id = NULLIF(product.summary ->> 'parentProductId', ''),
         updated_at = now()
     FROM jumpyard.product_catalog_cache AS product
     WHERE product.roller_env = :rollerEnv
       AND product.venue_id = :venueId
       AND product.summary ->> 'id' = item.product_id
       AND item.product_id IS NOT NULL`,
    [stringParameter("rollerEnv", rollerEnv), stringParameter("venueId", venueId)],
    transactionId,
  );

  return { updated: result.updated };
}

async function queryVerification(
  context: ImportContext,
  rollerEnv: string,
  venueId: string,
): Promise<{ bookingItemsMatched: number; cacheRowsMatched: number }> {
  const parameters = [stringParameter("rollerEnv", rollerEnv), stringParameter("venueId", venueId)];
  const cacheRows = await executeStatement(
    context,
    `SELECT COUNT(*)
     FROM jumpyard.product_catalog_cache
     WHERE roller_env = :rollerEnv
       AND venue_id = :venueId`,
    parameters,
  );
  const itemRows = await executeStatement(
    context,
    `SELECT COUNT(*)
     FROM jumpyard.roller_booking_items AS item
     JOIN jumpyard.product_catalog_cache AS product
       ON product.summary ->> 'id' = item.product_id
      AND product.roller_env = :rollerEnv
      AND product.venue_id = :venueId
     WHERE item.product_id IS NOT NULL
       AND item.product_name IS NOT NULL`,
    parameters,
  );

  return {
    bookingItemsMatched: fieldToNumber(itemRows.records[0]?.[0]),
    cacheRowsMatched: fieldToNumber(cacheRows.records[0]?.[0]),
  };
}

function fieldToNumber(field: Field | undefined): number {
  if (!field) return 0;
  if (field.longValue !== undefined) return Number(field.longValue);
  if (field.stringValue !== undefined) return Number(field.stringValue);
  return 0;
}

function buildSummary(
  args: ImportArgs,
  deployConfig: DeployConfig,
  products: NormalizedProduct[],
  topLevelProducts: number,
): ImportSummary {
  return {
    apply: args.apply,
    bookingItemsMatched: null,
    cacheRowsMatched: null,
    endpointPath: args.productsPath,
    productRows: products.length,
    topLevelProducts,
    upserts: 0,
    venueId: args.venueId || deployConfig.resourcePrefix,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..", "..");
  loadLocalEnv(path.join(repoRoot, ".env"));

  if (args.apply && process.env.ROLLER_PRODUCT_IMPORT_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`Set ROLLER_PRODUCT_IMPORT_ALLOW_WRITE=${WRITE_CONFIRMATION} to write products into dev Aurora.`);
  }

  const deployConfig = readDeployConfig(args.configPath);
  const rollerConfig = readRollerConfig();
  const rollerValidation = validateRollerSmokeConfig(rollerConfig);

  if (!rollerValidation.ok) {
    throw new Error(`Roller config rejected: ${rollerValidation.errors.join(" ")}`);
  }

  const token = await requestRollerAccessToken(rollerConfig);
  const topLevelProducts = await requestProducts(rollerConfig, token, args.productsPath);
  const venueId = args.venueId || deployConfig.resourcePrefix;
  const products = flattenProducts(topLevelProducts, rollerValidation.safeConfig.env, venueId);
  const summary = buildSummary(args, deployConfig, products, topLevelProducts.length);

  if (args.apply) {
    const secretArn = await resolveSecretArn(deployConfig, args.profile);
    const context: ImportContext = {
      clusterArn: `arn:aws:rds:${deployConfig.awsRegion}:${deployConfig.awsAccount}:cluster:${deployConfig.resourcePrefix}-aurora`,
      database: DEFAULT_DATABASE,
      rds: new RDSDataClient({
        credentials: args.profile ? fromIni({ profile: args.profile }) : undefined,
        region: deployConfig.awsRegion,
      }),
      secretArn,
    };
    const applyResult = await applyImport(context, products, rollerValidation.safeConfig.env, venueId, args.ttlHours);
    summary.bookingItemsMatched = applyResult.bookingItemsMatched;
    summary.cacheRowsMatched = applyResult.cacheRowsMatched;
    summary.upserts = applyResult.upserts;
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(args.apply ? "Roller product Aurora import applied." : "Roller product Aurora import dry-run passed.");
  console.log(`- env: ${rollerValidation.safeConfig.env}`);
  console.log(`- baseUrl: ${rollerValidation.safeConfig.baseUrl}`);
  console.log(`- endpoint: ${summary.endpointPath}`);
  console.log(`- topLevelProducts: ${summary.topLevelProducts}`);
  console.log(`- productRows: ${summary.productRows}`);
  console.log(`- venueId: ${summary.venueId}`);
  console.log(`- ttlHours: ${args.ttlHours}`);
  console.log(`- apply: ${summary.apply}`);
  if (summary.cacheRowsMatched !== null) {
    console.log(`- auroraProductCacheRowsMatched: ${summary.cacheRowsMatched}`);
  }
  if (summary.bookingItemsMatched !== null) {
    console.log(`- auroraBookingItemsWithNamesMatched: ${summary.bookingItemsMatched}`);
  }
  console.log("- no secrets, access tokens, customer names, emails, phone numbers, booking notes, or raw payloads were printed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
