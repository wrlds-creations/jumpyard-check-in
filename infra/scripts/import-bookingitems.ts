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
const DEFAULT_DATA_API_PATH = "/data/bookingitems";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;
const IMPORT_SOURCE = "data_api_bookingitems";
const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_BOOKINGITEMS";

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
  endDate: string;
  json: boolean;
  maxPages: number;
  pageSize: number;
  profile?: string;
  startDate: string;
  venueId?: string;
}

interface ImportContext {
  clusterArn: string;
  database: string;
  rds: RDSDataClient;
  secretArn: string;
}

interface DataApiPage {
  pageNumber: number;
  records: BookingItemRecord[];
  totalItems: number | null;
  totalPages: number | null;
}

interface BookingItemRecord {
  barcodeId?: unknown;
  bookingCompanyId?: unknown;
  bookingCreatedDate?: unknown;
  bookingCustomerId?: unknown;
  bookingDate?: unknown;
  bookingEndDate?: unknown;
  bookingFeeAmount?: unknown;
  bookingItemId?: unknown;
  bookingLocation?: unknown;
  bookingModifiedDate?: unknown;
  bookingReference?: unknown;
  bookingStatus?: unknown;
  bookingTotal?: unknown;
  bookingUniqueId?: unknown;
  cost?: unknown;
  createdDate?: unknown;
  deviceId?: unknown;
  discountAmount?: unknown;
  groupSize?: unknown;
  meta?: unknown;
  modifiers?: unknown;
  productId?: unknown;
  quantity?: unknown;
  sessionEnd?: unknown;
  sessionStart?: unknown;
}

interface BookingAggregate {
  bookingDate: string | null;
  bookingReference: string;
  bookingStatus: string | null;
  customerId: string | null;
  endTime: string | null;
  itemCount: number;
  latestModifiedAt: string | null;
  location: string | null;
  payloadHash: string;
  rollerUniqueId: string;
  startTime: string | null;
  totalCents: number | null;
}

interface NormalizedItem {
  bookingDate: string | null;
  bookingItemId: string | null;
  bookingItemKey: string;
  endTime: string | null;
  itemSummary: Record<string, unknown>;
  productId: string | null;
  quantity: number;
  rollerUniqueId: string;
  startTime: string | null;
}

interface NormalizedImport {
  bookings: BookingAggregate[];
  items: NormalizedItem[];
  skippedRecords: number;
}

interface ImportSummary {
  apply: boolean;
  recordsRead: number;
  runId: string;
  skippedRecords: number;
  sourceWindow: {
    endDate: string;
    startDate: string;
  };
  upserts: {
    bookingItems: number;
    bookings: number;
  };
  venueId: string;
}

function parseArgs(argv: string[]): ImportArgs {
  let configPath = "./config/dev.json";
  let profile: string | undefined;
  let startDate = process.env.ROLLER_DATA_START_DATE || toIsoDate(new Date());
  let endDate = process.env.ROLLER_DATA_END_DATE || "";
  let pageSize = parsePositiveInteger(process.env.ROLLER_DATA_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  let maxPages = parsePositiveInteger(process.env.ROLLER_DATA_MAX_PAGES, DEFAULT_MAX_PAGES);
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

    if (arg === "--end-date") {
      endDate = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--max-pages") {
      maxPages = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_MAX_PAGES);
      index += 1;
      continue;
    }

    if (arg === "--page-size") {
      pageSize = parsePositiveInteger(requiredNext(argv, index, arg), DEFAULT_PAGE_SIZE);
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      profile = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--start-date") {
      startDate = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--venue-id") {
      venueId = requiredNext(argv, index, arg);
      index += 1;
      continue;
    }

    if (isIsoDate(arg) && isIsoDate(argv[index + 1] ?? "")) {
      startDate = arg;
      endDate = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  endDate = endDate || addDays(startDate, 1);
  validateDateWindow(startDate, endDate);

  return {
    apply,
    configPath,
    endDate,
    json,
    maxPages,
    pageSize,
    profile,
    startDate,
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
    throw new Error("Page controls must be positive integers.");
  }
  return parsed;
}

function validateDateWindow(startDate: string, endDate: string): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new Error("Import dates must be YYYY-MM-DD.");
  }

  if (endDate <= startDate) {
    throw new Error("End date must be after start date.");
  }
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

async function fetchBookingItems(
  config: RollerConfig,
  token: RollerToken,
  args: ImportArgs,
): Promise<{ pages: DataApiPage[]; records: BookingItemRecord[] }> {
  const pages: DataApiPage[] = [];
  let pageNumber = 1;

  while (pageNumber <= args.maxPages) {
    const page = await requestBookingItemsPage(config, token, args, pageNumber);
    pages.push(page);

    if (page.totalPages !== null && pageNumber >= page.totalPages) break;
    if (page.records.length < args.pageSize) break;

    pageNumber += 1;
  }

  return {
    pages,
    records: pages.flatMap((page) => page.records),
  };
}

async function requestBookingItemsPage(
  config: RollerConfig,
  token: RollerToken,
  args: ImportArgs,
  pageNumber: number,
): Promise<DataApiPage> {
  const url = buildRollerUrl(config.baseUrl, DEFAULT_DATA_API_PATH);
  url.searchParams.set("startDate", args.startDate);
  url.searchParams.set("endDate", args.endDate);
  url.searchParams.set("pageNumber", String(pageNumber));
  url.searchParams.set("pageSize", String(args.pageSize));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `${token.tokenType || "Bearer"} ${token.accessToken}`,
    },
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(`Roller Data API bookingitems request failed with HTTP ${response.status}.`);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Roller Data API bookingitems response must be a JSON object.");
  }

  const objectBody = body as Record<string, unknown>;
  const items = objectBody.items;

  if (!Array.isArray(items)) {
    throw new Error('Roller Data API bookingitems response did not include an "items" array.');
  }

  return {
    pageNumber,
    records: items as BookingItemRecord[],
    totalItems: numberOrNull(objectBody.totalItems),
    totalPages: numberOrNull(objectBody.totalPages),
  };
}

function normalizeRecords(records: BookingItemRecord[]): NormalizedImport {
  const bookingGroups = new Map<string, BookingItemRecord[]>();
  const items: NormalizedItem[] = [];
  let skippedRecords = 0;

  for (const record of records) {
    const rollerUniqueId = stringOrNull(record.bookingUniqueId);
    const bookingReference = stringOrNull(record.bookingReference);

    if (!rollerUniqueId || !bookingReference) {
      skippedRecords += 1;
      continue;
    }

    const group = bookingGroups.get(rollerUniqueId) ?? [];
    group.push(record);
    bookingGroups.set(rollerUniqueId, group);
    items.push(normalizeItem(record, rollerUniqueId));
  }

  return {
    bookings: [...bookingGroups.entries()].map(([rollerUniqueId, group]) => normalizeBooking(rollerUniqueId, group)),
    items,
    skippedRecords,
  };
}

function normalizeBooking(rollerUniqueId: string, records: BookingItemRecord[]): BookingAggregate {
  const first = records[0];

  if (!first) {
    throw new Error("Cannot normalize empty booking group.");
  }

  const bookingDates = records.map((record) => stringOrNull(record.bookingDate)).filter(isDefined);
  const startTimes = records.map((record) => timeOrNull(record.sessionStart)).filter(isDefined);
  const endTimes = records.map((record) => timeOrNull(record.sessionEnd)).filter(isDefined);
  const modifiedDates = records.map((record) => timestampOrNull(record.bookingModifiedDate)).filter(isDefined).sort();
  const bookingReference = stringOrNull(first.bookingReference);

  if (!bookingReference) {
    throw new Error(`Booking ${rollerUniqueId} is missing bookingReference.`);
  }

  const safeSummary = {
    bookingCompanyId: stringOrNull(first.bookingCompanyId),
    bookingCreatedDate: timestampOrNull(first.bookingCreatedDate),
    bookingCustomerId: stringOrNull(first.bookingCustomerId),
    bookingEndDate: dateOrNull(first.bookingEndDate),
    bookingFeeAmountCents: centsOrNull(first.bookingFeeAmount),
    bookingLocation: stringOrNull(first.bookingLocation),
    itemCount: records.length,
    source: IMPORT_SOURCE,
  };

  return {
    bookingDate: minOrNull(bookingDates),
    bookingReference,
    bookingStatus: stringOrNull(first.bookingStatus),
    customerId: stringOrNull(first.bookingCustomerId),
    endTime: maxOrNull(endTimes),
    itemCount: records.length,
    latestModifiedAt: modifiedDates[modifiedDates.length - 1] ?? null,
    location: stringOrNull(first.bookingLocation),
    payloadHash: hashJson(safeSummary),
    rollerUniqueId,
    startTime: minOrNull(startTimes),
    totalCents: centsOrNull(first.bookingTotal),
  };
}

function normalizeItem(record: BookingItemRecord, rollerUniqueId: string): NormalizedItem {
  const bookingItemId = stringOrNull(record.bookingItemId);
  const productId = stringOrNull(record.productId);
  const bookingDate = dateOrNull(record.bookingDate);
  const startTime = timeOrNull(record.sessionStart);
  const endTime = timeOrNull(record.sessionEnd);
  const quantity = positiveInteger(record.quantity) ?? 1;
  const keySource = bookingItemId || `${rollerUniqueId}:${productId ?? "unknown"}:${bookingDate ?? ""}:${startTime ?? ""}`;
  const itemSummary = {
    barcodeId: stringOrNull(record.barcodeId),
    bookingEndDate: dateOrNull(record.bookingEndDate),
    costCents: centsOrNull(record.cost),
    createdDate: timestampOrNull(record.createdDate),
    deviceId: stringOrNull(record.deviceId),
    discountAmountCents: centsOrNull(record.discountAmount),
    groupSize: positiveInteger(record.groupSize),
    modifierCount: Array.isArray(record.modifiers) ? record.modifiers.length : 0,
    source: IMPORT_SOURCE,
  };

  return {
    bookingDate,
    bookingItemId,
    bookingItemKey: `bookingitem:${hashString(keySource)}`,
    endTime,
    itemSummary,
    productId,
    quantity,
    rollerUniqueId,
    startTime,
  };
}

function stringOrNull(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function centsOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100);
}

function dateOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const date = text.slice(0, 10);
  return isIsoDate(date) ? date : null;
}

function timeOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function timestampOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function minOrNull(values: string[]): string | null {
  return values.length > 0 ? [...values].sort()[0] ?? null : null;
}

function maxOrNull(values: string[]): string | null {
  return values.length > 0 ? [...values].sort()[values.length - 1] ?? null : null;
}

function hashJson(value: unknown): string {
  return hashString(JSON.stringify(value));
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stringParameter(name: string, value: string | null): SqlParameter {
  return value === null
    ? { name, value: { isNull: true } }
    : { name, value: { stringValue: value } };
}

function intParameter(name: string, value: number | null): SqlParameter {
  return value === null
    ? { name, value: { isNull: true } }
    : { name, value: { longValue: value } };
}

async function executeStatement(
  context: ImportContext,
  sql: string,
  parameters?: SqlParameter[],
  transactionId?: string,
): Promise<Field[][]> {
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

  return response.records ?? [];
}

async function insertRun(context: ImportContext, summary: ImportSummary, rollerEnv: string): Promise<void> {
  await executeStatement(
    context,
    `INSERT INTO jumpyard.booking_seed_runs (
      run_id, roller_env, venue_id, date_range_start, date_range_end, status, source_counts, upsert_counts
    )
    VALUES (
      :runId,
      :rollerEnv,
      :venueId,
      CAST(:dateRangeStart AS date),
      CAST(:dateRangeEnd AS date),
      'running',
      CAST(:sourceCounts AS jsonb),
      '{}'::jsonb
    )`,
    [
      stringParameter("runId", summary.runId),
      stringParameter("rollerEnv", rollerEnv),
      stringParameter("venueId", summary.venueId),
      stringParameter("dateRangeStart", summary.sourceWindow.startDate),
      stringParameter("dateRangeEnd", summary.sourceWindow.endDate),
      stringParameter(
        "sourceCounts",
        JSON.stringify({
          bookingitems_records: summary.recordsRead,
          skipped_records: summary.skippedRecords,
        }),
      ),
    ],
  );
}

async function finishRun(
  context: ImportContext,
  runId: string,
  status: "succeeded" | "failed",
  upsertCounts: Record<string, number>,
  errorSummary: string | null = null,
): Promise<void> {
  await executeStatement(
    context,
    `UPDATE jumpyard.booking_seed_runs
     SET status = :status,
         upsert_counts = CAST(:upsertCounts AS jsonb),
         error_summary = :errorSummary,
         finished_at = now()
     WHERE run_id = :runId`,
    [
      stringParameter("runId", runId),
      stringParameter("status", status),
      stringParameter("upsertCounts", JSON.stringify(upsertCounts)),
      stringParameter("errorSummary", errorSummary),
    ],
  );
}

async function applyImport(
  context: ImportContext,
  normalized: NormalizedImport,
  summary: ImportSummary,
  rollerEnv: string,
): Promise<void> {
  await insertRun(context, summary, rollerEnv);
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
    for (const booking of normalized.bookings) {
      await upsertBooking(context, booking, rollerEnv, summary.venueId, transactionId);
    }

    for (const item of normalized.items) {
      await upsertBookingItem(context, item, transactionId);
    }

    await context.rds.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );

    await finishRun(context, summary.runId, "succeeded", {
      booking_items_upserted: summary.upserts.bookingItems,
      bookings_upserted: summary.upserts.bookings,
      skipped_records: summary.skippedRecords,
    });
  } catch (error) {
    await context.rds.send(
      new RollbackTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );

    await finishRun(
      context,
      summary.runId,
      "failed",
      {
        booking_items_upserted: 0,
        bookings_upserted: 0,
        skipped_records: summary.skippedRecords,
      },
      error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    );
    throw error;
  }
}

async function upsertBooking(
  context: ImportContext,
  booking: BookingAggregate,
  rollerEnv: string,
  venueId: string,
  transactionId: string,
): Promise<void> {
  await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_bookings (
      roller_unique_id,
      booking_reference,
      roller_env,
      venue_id,
      booking_status,
      payment_status,
      total_cents,
      booking_date,
      start_time,
      end_time,
      source_last_updated_by,
      source_last_updated_at,
      roller_modified_at,
      last_seen_from_roller_at,
      freshness_status,
      is_tombstoned,
      payload_hash,
      normalized_summary
    )
    VALUES (
      :rollerUniqueId,
      :bookingReference,
      :rollerEnv,
      :venueId,
      :bookingStatus,
      :paymentStatus,
      :totalCents,
      CAST(:bookingDate AS date),
      CAST(:startTime AS time),
      CAST(:endTime AS time),
      '${IMPORT_SOURCE}',
      now(),
      CAST(:rollerModifiedAt AS timestamptz),
      now(),
      'fresh',
      :isTombstoned,
      :payloadHash,
      CAST(:normalizedSummary AS jsonb)
    )
    ON CONFLICT (roller_unique_id) DO UPDATE SET
      booking_reference = EXCLUDED.booking_reference,
      roller_env = EXCLUDED.roller_env,
      venue_id = EXCLUDED.venue_id,
      booking_status = EXCLUDED.booking_status,
      payment_status = EXCLUDED.payment_status,
      total_cents = EXCLUDED.total_cents,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      source_last_updated_by = EXCLUDED.source_last_updated_by,
      source_last_updated_at = now(),
      roller_modified_at = EXCLUDED.roller_modified_at,
      last_seen_from_roller_at = now(),
      freshness_status = EXCLUDED.freshness_status,
      is_tombstoned = EXCLUDED.is_tombstoned,
      payload_hash = EXCLUDED.payload_hash,
      normalized_summary = EXCLUDED.normalized_summary,
      updated_at = now()
    WHERE jumpyard.roller_bookings.roller_modified_at IS NULL
       OR EXCLUDED.roller_modified_at IS NULL
       OR EXCLUDED.roller_modified_at >= jumpyard.roller_bookings.roller_modified_at`,
    [
      stringParameter("rollerUniqueId", booking.rollerUniqueId),
      stringParameter("bookingReference", booking.bookingReference),
      stringParameter("rollerEnv", rollerEnv),
      stringParameter("venueId", venueId),
      stringParameter("bookingStatus", booking.bookingStatus),
      stringParameter("paymentStatus", booking.bookingStatus),
      intParameter("totalCents", booking.totalCents),
      stringParameter("bookingDate", booking.bookingDate),
      stringParameter("startTime", booking.startTime),
      stringParameter("endTime", booking.endTime),
      stringParameter("rollerModifiedAt", booking.latestModifiedAt),
      { name: "isTombstoned", value: { booleanValue: isTombstoned(booking.bookingStatus) } },
      stringParameter("payloadHash", booking.payloadHash),
      stringParameter(
        "normalizedSummary",
        JSON.stringify({
          bookingCustomerId: booking.customerId,
          bookingLocation: booking.location,
          itemCount: booking.itemCount,
          source: IMPORT_SOURCE,
        }),
      ),
    ],
    transactionId,
  );
}

function isTombstoned(status: string | null): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "cancelled" || normalized === "deleted";
}

async function upsertBookingItem(
  context: ImportContext,
  item: NormalizedItem,
  transactionId: string,
): Promise<void> {
  await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_items (
      booking_item_key,
      roller_unique_id,
      booking_item_id,
      product_id,
      quantity,
      booking_date,
      start_time,
      end_time,
      item_summary
    )
    VALUES (
      :bookingItemKey,
      :rollerUniqueId,
      :bookingItemId,
      :productId,
      :quantity,
      CAST(:bookingDate AS date),
      CAST(:startTime AS time),
      CAST(:endTime AS time),
      CAST(:itemSummary AS jsonb)
    )
    ON CONFLICT (booking_item_key) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_id = EXCLUDED.booking_item_id,
      product_id = EXCLUDED.product_id,
      quantity = EXCLUDED.quantity,
      booking_date = EXCLUDED.booking_date,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      item_summary = EXCLUDED.item_summary,
      updated_at = now()`,
    [
      stringParameter("bookingItemKey", item.bookingItemKey),
      stringParameter("rollerUniqueId", item.rollerUniqueId),
      stringParameter("bookingItemId", item.bookingItemId),
      stringParameter("productId", item.productId),
      intParameter("quantity", item.quantity),
      stringParameter("bookingDate", item.bookingDate),
      stringParameter("startTime", item.startTime),
      stringParameter("endTime", item.endTime),
      stringParameter("itemSummary", JSON.stringify(item.itemSummary)),
    ],
    transactionId,
  );
}

async function queryVerification(context: ImportContext, references: string[]): Promise<{ items: number; bookings: number }> {
  if (references.length === 0) {
    return { items: 0, bookings: 0 };
  }

  const parameters = references.map((reference, index) => stringParameter(`reference${index}`, reference));
  const placeholders = references.map((_, index) => `:reference${index}`).join(", ");
  const bookingRecords = await executeStatement(
    context,
    `SELECT COUNT(*) FROM jumpyard.roller_bookings WHERE booking_reference IN (${placeholders})`,
    parameters,
  );
  const itemRecords = await executeStatement(
    context,
    `SELECT COUNT(*) FROM jumpyard.roller_booking_items i
     JOIN jumpyard.roller_bookings b ON b.roller_unique_id = i.roller_unique_id
     WHERE b.booking_reference IN (${placeholders})`,
    parameters,
  );

  return {
    bookings: fieldToNumber(bookingRecords[0]?.[0]),
    items: fieldToNumber(itemRecords[0]?.[0]),
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
  normalized: NormalizedImport,
  recordsRead: number,
): ImportSummary {
  return {
    apply: args.apply,
    recordsRead,
    runId: `bookingitems_${args.startDate}_${args.endDate}_${Date.now().toString(36)}`,
    skippedRecords: normalized.skippedRecords,
    sourceWindow: {
      endDate: args.endDate,
      startDate: args.startDate,
    },
    upserts: {
      bookingItems: normalized.items.length,
      bookings: normalized.bookings.length,
    },
    venueId: args.venueId || deployConfig.resourcePrefix,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..", "..");
  loadLocalEnv(path.join(repoRoot, ".env"));

  if (args.apply && process.env.ROLLER_IMPORT_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`Set ROLLER_IMPORT_ALLOW_WRITE=${WRITE_CONFIRMATION} to write bookingitems into dev Aurora.`);
  }

  const deployConfig = readDeployConfig(args.configPath);
  const rollerConfig = readRollerConfig();
  const rollerValidation = validateRollerSmokeConfig(rollerConfig);

  if (!rollerValidation.ok) {
    throw new Error(`Roller config rejected: ${rollerValidation.errors.join(" ")}`);
  }

  const token = await requestRollerAccessToken(rollerConfig);
  const { records } = await fetchBookingItems(rollerConfig, token, args);
  const normalized = normalizeRecords(records);
  const summary = buildSummary(args, deployConfig, normalized, records.length);

  let verification: { items: number; bookings: number } | null = null;

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

    await applyImport(context, normalized, summary, rollerValidation.safeConfig.env);
    verification = await queryVerification(
      context,
      normalized.bookings.map((booking) => booking.bookingReference),
    );
  }

  if (args.json) {
    console.log(JSON.stringify({ ...summary, verification }, null, 2));
    return;
  }

  console.log(args.apply ? "Roller bookingitems Aurora import applied." : "Roller bookingitems Aurora import dry-run passed.");
  console.log(`- env: ${rollerValidation.safeConfig.env}`);
  console.log(`- baseUrl: ${rollerValidation.safeConfig.baseUrl}`);
  console.log(`- window: ${summary.sourceWindow.startDate} -> ${summary.sourceWindow.endDate}`);
  console.log(`- recordsRead: ${summary.recordsRead}`);
  console.log(`- bookings: ${summary.upserts.bookings}`);
  console.log(`- bookingItems: ${summary.upserts.bookingItems}`);
  console.log(`- skippedRecords: ${summary.skippedRecords}`);
  console.log(`- apply: ${summary.apply}`);
  if (verification) {
    console.log(`- auroraBookingsMatched: ${verification.bookings}`);
    console.log(`- auroraBookingItemsMatched: ${verification.items}`);
  }
  console.log("- no secrets, access tokens, customer names, emails, phone numbers, booking notes, or raw payloads were printed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
