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
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 10;
const WRITE_CONFIRMATION = "I_UNDERSTAND_THIS_WRITES_DEV_AURORA_RELATED_DATA";
const SOURCE_TICKETS = "data_api_tickets";
const SOURCE_PAYMENTS = "data_api_bookingpayments";
const SOURCE_CUSTOMERS = "data_api_customers";

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

interface DataApiFetchResult<TRecord> {
  records: TRecord[];
  totalItems: number | null;
}

interface TicketRecord {
  bookingDate?: unknown;
  bookingItemId?: unknown;
  bookingReference?: unknown;
  createdDate?: unknown;
  customTicketId?: unknown;
  customerId?: unknown;
  expiryDate?: unknown;
  name?: unknown;
  numberOfRecurringPayments?: unknown;
  productId?: unknown;
  productSubType?: unknown;
  productType?: unknown;
  recurringPaymentFrequency?: unknown;
  ticketId?: unknown;
}

interface PaymentRecord {
  authorizingStaffId?: unknown;
  bookingPaymentId?: unknown;
  bookingReference?: unknown;
  createdDate?: unknown;
  creditCardLast4Digits?: unknown;
  deviceId?: unknown;
  paymentMethod?: unknown;
  receiptNumber?: unknown;
  staffId?: unknown;
  tip?: unknown;
  total?: unknown;
  transactionFeeAmount?: unknown;
  transactionId?: unknown;
}

interface CustomerRecord {
  acceptMarketing?: unknown;
  acceptMarketingSMS?: unknown;
  acceptMarketingSms?: unknown;
  contactNumber?: unknown;
  createdDate?: unknown;
  customerId?: unknown;
  email?: unknown;
  flags?: unknown;
  modifiedDate?: unknown;
}

interface NormalizedTicket {
  bookingDate: string | null;
  bookingItemId: string | null;
  bookingReference: string;
  customTicketId: string | null;
  expiryDate: string | null;
  productId: string | null;
  rollerCustomerId: string | null;
  summary: Record<string, unknown>;
  ticketId: string;
}

interface NormalizedPayment {
  amountCents: number | null;
  bookingPaymentId: string | null;
  bookingReference: string;
  createdDate: string | null;
  paymentKey: string;
  paymentMethod: string | null;
  summary: Record<string, unknown>;
}

interface NormalizedCustomer {
  contactNumber: string | null;
  contactNumberHash: string | null;
  contactNumberMasked: string | null;
  email: string | null;
  emailHash: string | null;
  emailMasked: string | null;
  guestProfileId: string;
  latestBookingContext: Record<string, unknown>;
  modifiedDate: string | null;
  rollerCustomerId: string | null;
  smsReady: boolean;
}

interface NormalizedImport {
  customers: NormalizedCustomer[];
  payments: NormalizedPayment[];
  skippedCustomers: number;
  skippedPayments: number;
  skippedTickets: number;
  tickets: NormalizedTicket[];
}

interface ApplyResult {
  customerUpserts: number;
  paymentUpserts: number;
  ticketUpserts: number;
}

interface ImportSummary {
  apply: boolean;
  sourceWindow: {
    endDate: string;
    startDate: string;
  };
  sourceRecords: {
    customers: number;
    payments: number;
    tickets: number;
  };
  skippedRecords: {
    customers: number;
    payments: number;
    tickets: number;
  };
  upserts: {
    customers: number;
    payments: number;
    tickets: number;
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

async function fetchDataApiRecords<TRecord>(
  config: RollerConfig,
  token: RollerToken,
  args: ImportArgs,
  endpointPath: string,
): Promise<DataApiFetchResult<TRecord>> {
  const records: TRecord[] = [];
  let totalItems: number | null = null;
  let totalPages: number | null = null;
  let pageNumber = 1;

  while (pageNumber <= args.maxPages) {
    const url = buildRollerUrl(config.baseUrl, endpointPath);
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
      throw new Error(`Roller Data API request to ${endpointPath} failed with HTTP ${response.status}.`);
    }

    if (!isRecord(body) || !Array.isArray(body.items)) {
      throw new Error(`Roller Data API response from ${endpointPath} did not include an items array.`);
    }

    records.push(...(body.items as TRecord[]));
    totalItems = numberOrNull(body.totalItems);
    totalPages = numberOrNull(body.totalPages);

    if (totalPages !== null && pageNumber >= totalPages) break;
    if (body.items.length < args.pageSize) break;

    pageNumber += 1;
  }

  return { records, totalItems };
}

function normalizeImport(
  tickets: TicketRecord[],
  payments: PaymentRecord[],
  customers: CustomerRecord[],
): NormalizedImport {
  const normalizedTickets: NormalizedTicket[] = [];
  const normalizedPayments: NormalizedPayment[] = [];
  const normalizedCustomers: NormalizedCustomer[] = [];
  let skippedTickets = 0;
  let skippedPayments = 0;
  let skippedCustomers = 0;

  for (const ticket of tickets) {
    const normalized = normalizeTicket(ticket);
    if (normalized) {
      normalizedTickets.push(normalized);
    } else {
      skippedTickets += 1;
    }
  }

  for (const payment of payments) {
    const normalized = normalizePayment(payment);
    if (normalized) {
      normalizedPayments.push(normalized);
    } else {
      skippedPayments += 1;
    }
  }

  for (const customer of customers) {
    const normalized = normalizeCustomer(customer);
    if (normalized) {
      normalizedCustomers.push(normalized);
    } else {
      skippedCustomers += 1;
    }
  }

  return {
    customers: normalizedCustomers,
    payments: normalizedPayments,
    skippedCustomers,
    skippedPayments,
    skippedTickets,
    tickets: normalizedTickets,
  };
}

function normalizeTicket(record: TicketRecord): NormalizedTicket | null {
  const ticketId = stringOrNull(record.ticketId);
  const bookingReference = stringOrNull(record.bookingReference);

  if (!ticketId || !bookingReference) return null;

  const productType = stringOrNull(record.productType);
  const productSubType = stringOrNull(record.productSubType);

  return {
    bookingDate: dateOrNull(record.bookingDate),
    bookingItemId: stringOrNull(record.bookingItemId),
    bookingReference,
    customTicketId: stringOrNull(record.customTicketId),
    expiryDate: dateOrNull(record.expiryDate),
    productId: stringOrNull(record.productId),
    rollerCustomerId: stringOrNull(record.customerId),
    summary: {
      createdDate: timestampOrNull(record.createdDate),
      hasTicketHolderName: Boolean(stringOrNull(record.name)),
      numberOfRecurringPayments: numberOrNull(record.numberOfRecurringPayments),
      productSubType,
      productType,
      recurringPaymentFrequency: stringOrNull(record.recurringPaymentFrequency),
      source: SOURCE_TICKETS,
    },
    ticketId,
  };
}

function normalizePayment(record: PaymentRecord): NormalizedPayment | null {
  const bookingReference = stringOrNull(record.bookingReference);
  const bookingPaymentId = stringOrNull(record.bookingPaymentId);
  const transactionId = stringOrNull(record.transactionId);
  const createdDate = timestampOrNull(record.createdDate);
  const paymentMethod = stringOrNull(record.paymentMethod);
  const amountCents = centsOrNull(record.total);

  if (!bookingReference) return null;

  const paymentKeySource = bookingPaymentId || `${bookingReference}:${transactionId ?? "no-transaction"}:${createdDate ?? ""}:${amountCents ?? ""}`;

  return {
    amountCents,
    bookingPaymentId,
    bookingReference,
    createdDate,
    paymentKey: `payment:${hashString(paymentKeySource)}`,
    paymentMethod,
    summary: {
      authorizingStaffId: stringOrNull(record.authorizingStaffId),
      creditCardLast4DigitsPresent: Boolean(stringOrNull(record.creditCardLast4Digits)),
      deviceId: stringOrNull(record.deviceId),
      receiptNumber: stringOrNull(record.receiptNumber),
      source: SOURCE_PAYMENTS,
      staffId: stringOrNull(record.staffId),
      tipCents: centsOrNull(record.tip),
      transactionFeeAmountCents: centsOrNull(record.transactionFeeAmount),
      transactionIdPresent: Boolean(transactionId),
    },
  };
}

function normalizeCustomer(record: CustomerRecord): NormalizedCustomer | null {
  const rollerCustomerId = stringOrNull(record.customerId);
  const email = normalizeEmail(record.email);
  const contactNumber = normalizePhone(record.contactNumber);

  if (!rollerCustomerId && !email && !contactNumber) return null;

  const guestProfileId = rollerCustomerId
    ? `roller_customer:${rollerCustomerId}`
    : `contact:${hashString(`${email ?? ""}:${contactNumber ?? ""}`)}`;
  const emailHash = email ? hashString(email) : null;
  const contactNumberHash = contactNumber ? hashString(contactNumber) : null;

  return {
    contactNumber,
    contactNumberHash,
    contactNumberMasked: maskPhone(contactNumber),
    email,
    emailHash,
    emailMasked: maskEmail(email),
    guestProfileId,
    latestBookingContext: {
      acceptMarketing: booleanOrNull(record.acceptMarketing),
      acceptMarketingSms: booleanOrNull(record.acceptMarketingSMS ?? record.acceptMarketingSms),
      createdDate: timestampOrNull(record.createdDate),
      flagCount: Array.isArray(record.flags) ? record.flags.length : 0,
      source: SOURCE_CUSTOMERS,
    },
    modifiedDate: timestampOrNull(record.modifiedDate),
    rollerCustomerId,
    smsReady: Boolean(contactNumber),
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

function centsOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Math.round(parsed * 100);
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function dateOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const date = text.slice(0, 10);
  return isIsoDate(date) ? date : null;
}

function timestampOrNull(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeEmail(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  return text.trim().toLowerCase();
}

function normalizePhone(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  return text.trim().replace(/[^\d+]/g, "");
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 4) return "***";
  return `***${phone.slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function boolParameter(name: string, value: boolean): SqlParameter {
  return { name, value: { booleanValue: value } };
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

async function applyImport(context: ImportContext, normalized: NormalizedImport): Promise<ApplyResult> {
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
    let ticketUpserts = 0;
    let paymentUpserts = 0;
    let customerUpserts = 0;

    for (const ticket of normalized.tickets) {
      ticketUpserts += await upsertTicket(context, ticket, transactionId);
    }

    for (const payment of normalized.payments) {
      paymentUpserts += await upsertPayment(context, payment, transactionId);
    }

    for (const customer of normalized.customers) {
      customerUpserts += await upsertCustomer(context, customer, transactionId);
    }

    await context.rds.send(
      new CommitTransactionCommand({
        resourceArn: context.clusterArn,
        secretArn: context.secretArn,
        transactionId,
      }),
    );

    return { customerUpserts, paymentUpserts, ticketUpserts };
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

async function upsertTicket(context: ImportContext, ticket: NormalizedTicket, transactionId: string): Promise<number> {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_tickets (
      ticket_id,
      roller_unique_id,
      booking_item_key,
      booking_item_id,
      roller_customer_id,
      custom_ticket_id,
      product_id,
      booking_date,
      expiry_date,
      ticket_holder_name_masked,
      locations,
      membership_status,
      last_seen_from_roller_at,
      ticket_summary
    )
    SELECT
      :ticketId,
      booking.roller_unique_id,
      item.booking_item_key,
      :bookingItemId,
      :rollerCustomerId,
      :customTicketId,
      :productId,
      CAST(:bookingDate AS date),
      CAST(:expiryDate AS date),
      NULL,
      '[]'::jsonb,
      NULLIF(:membershipStatus, ''),
      now(),
      CAST(:ticketSummary AS jsonb)
    FROM jumpyard.roller_bookings AS booking
    LEFT JOIN jumpyard.roller_booking_items AS item
      ON item.booking_item_id = :bookingItemId
    WHERE booking.booking_reference = :bookingReference
    ON CONFLICT (ticket_id) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_item_key = EXCLUDED.booking_item_key,
      booking_item_id = EXCLUDED.booking_item_id,
      roller_customer_id = EXCLUDED.roller_customer_id,
      custom_ticket_id = EXCLUDED.custom_ticket_id,
      product_id = EXCLUDED.product_id,
      booking_date = EXCLUDED.booking_date,
      expiry_date = EXCLUDED.expiry_date,
      membership_status = EXCLUDED.membership_status,
      last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
      ticket_summary = EXCLUDED.ticket_summary,
      updated_at = now()`,
    [
      stringParameter("ticketId", ticket.ticketId),
      stringParameter("bookingReference", ticket.bookingReference),
      stringParameter("bookingItemId", ticket.bookingItemId),
      stringParameter("rollerCustomerId", ticket.rollerCustomerId),
      stringParameter("customTicketId", ticket.customTicketId),
      stringParameter("productId", ticket.productId),
      stringParameter("bookingDate", ticket.bookingDate),
      stringParameter("expiryDate", ticket.expiryDate),
      stringParameter("membershipStatus", stringOrNull(ticket.summary.productSubType)),
      stringParameter("ticketSummary", JSON.stringify(ticket.summary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertPayment(context: ImportContext, payment: NormalizedPayment, transactionId: string): Promise<number> {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.roller_booking_payments (
      payment_key,
      roller_unique_id,
      booking_payment_id,
      payment_method,
      payment_status,
      amount_cents,
      created_date,
      payment_summary
    )
    SELECT
      :paymentKey,
      booking.roller_unique_id,
      :bookingPaymentId,
      :paymentMethod,
      NULL,
      :amountCents,
      CAST(:createdDate AS timestamptz),
      CAST(:paymentSummary AS jsonb)
    FROM jumpyard.roller_bookings AS booking
    WHERE booking.booking_reference = :bookingReference
    ON CONFLICT (payment_key) DO UPDATE SET
      roller_unique_id = EXCLUDED.roller_unique_id,
      booking_payment_id = EXCLUDED.booking_payment_id,
      payment_method = EXCLUDED.payment_method,
      amount_cents = EXCLUDED.amount_cents,
      created_date = EXCLUDED.created_date,
      payment_summary = EXCLUDED.payment_summary,
      updated_at = now()`,
    [
      stringParameter("paymentKey", payment.paymentKey),
      stringParameter("bookingReference", payment.bookingReference),
      stringParameter("bookingPaymentId", payment.bookingPaymentId),
      stringParameter("paymentMethod", payment.paymentMethod),
      intParameter("amountCents", payment.amountCents),
      stringParameter("createdDate", payment.createdDate),
      stringParameter("paymentSummary", JSON.stringify(payment.summary)),
    ],
    transactionId,
  );

  return result.updated;
}

async function upsertCustomer(context: ImportContext, customer: NormalizedCustomer, transactionId: string): Promise<number> {
  const result = await executeStatement(
    context,
    `INSERT INTO jumpyard.guest_profiles (
      guest_profile_id,
      roller_customer_id,
      email,
      email_hash,
      email_masked,
      contact_number,
      contact_number_hash,
      contact_number_masked,
      sms_ready,
      contact_source,
      latest_booking_context,
      last_seen_from_roller_at
    )
    VALUES (
      :guestProfileId,
      :rollerCustomerId,
      :email,
      :emailHash,
      :emailMasked,
      :contactNumber,
      :contactNumberHash,
      :contactNumberMasked,
      :smsReady,
      '${SOURCE_CUSTOMERS}',
      CAST(:latestBookingContext AS jsonb),
      CAST(:lastSeenFromRollerAt AS timestamptz)
    )
    ON CONFLICT (guest_profile_id) DO UPDATE SET
      roller_customer_id = EXCLUDED.roller_customer_id,
      email = EXCLUDED.email,
      email_hash = EXCLUDED.email_hash,
      email_masked = EXCLUDED.email_masked,
      contact_number = EXCLUDED.contact_number,
      contact_number_hash = EXCLUDED.contact_number_hash,
      contact_number_masked = EXCLUDED.contact_number_masked,
      sms_ready = EXCLUDED.sms_ready,
      contact_source = EXCLUDED.contact_source,
      latest_booking_context = EXCLUDED.latest_booking_context,
      last_seen_from_roller_at = EXCLUDED.last_seen_from_roller_at,
      updated_at = now()`,
    [
      stringParameter("guestProfileId", customer.guestProfileId),
      stringParameter("rollerCustomerId", customer.rollerCustomerId),
      stringParameter("email", customer.email),
      stringParameter("emailHash", customer.emailHash),
      stringParameter("emailMasked", customer.emailMasked),
      stringParameter("contactNumber", customer.contactNumber),
      stringParameter("contactNumberHash", customer.contactNumberHash),
      stringParameter("contactNumberMasked", customer.contactNumberMasked),
      boolParameter("smsReady", customer.smsReady),
      stringParameter("latestBookingContext", JSON.stringify(customer.latestBookingContext)),
      stringParameter("lastSeenFromRollerAt", customer.modifiedDate),
    ],
    transactionId,
  );

  return result.updated;
}

function buildSummary(
  args: ImportArgs,
  deployConfig: DeployConfig,
  sourceRecords: ImportSummary["sourceRecords"],
  normalized: NormalizedImport,
): ImportSummary {
  return {
    apply: args.apply,
    sourceRecords,
    skippedRecords: {
      customers: normalized.skippedCustomers,
      payments: normalized.skippedPayments,
      tickets: normalized.skippedTickets,
    },
    sourceWindow: {
      endDate: args.endDate,
      startDate: args.startDate,
    },
    upserts: {
      customers: 0,
      payments: 0,
      tickets: 0,
    },
    venueId: args.venueId || deployConfig.resourcePrefix,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..", "..");
  loadLocalEnv(path.join(repoRoot, ".env"));

  if (args.apply && process.env.ROLLER_RELATED_IMPORT_ALLOW_WRITE !== WRITE_CONFIRMATION) {
    throw new Error(`Set ROLLER_RELATED_IMPORT_ALLOW_WRITE=${WRITE_CONFIRMATION} to write related Data API sources into dev Aurora.`);
  }

  const deployConfig = readDeployConfig(args.configPath);
  const rollerConfig = readRollerConfig();
  const rollerValidation = validateRollerSmokeConfig(rollerConfig);

  if (!rollerValidation.ok) {
    throw new Error(`Roller config rejected: ${rollerValidation.errors.join(" ")}`);
  }

  const token = await requestRollerAccessToken(rollerConfig);
  const [ticketFetch, paymentFetch, customerFetch] = await Promise.all([
    fetchDataApiRecords<TicketRecord>(rollerConfig, token, args, "/data/tickets"),
    fetchDataApiRecords<PaymentRecord>(rollerConfig, token, args, "/data/bookingpayments"),
    fetchDataApiRecords<CustomerRecord>(rollerConfig, token, args, "/data/customers"),
  ]);
  const normalized = normalizeImport(ticketFetch.records, paymentFetch.records, customerFetch.records);
  const summary = buildSummary(
    args,
    deployConfig,
    {
      customers: customerFetch.records.length,
      payments: paymentFetch.records.length,
      tickets: ticketFetch.records.length,
    },
    normalized,
  );

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
    const applyResult = await applyImport(context, normalized);
    summary.upserts.customers = applyResult.customerUpserts;
    summary.upserts.payments = applyResult.paymentUpserts;
    summary.upserts.tickets = applyResult.ticketUpserts;
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(args.apply ? "Roller related Data API Aurora import applied." : "Roller related Data API Aurora import dry-run passed.");
  console.log(`- env: ${rollerValidation.safeConfig.env}`);
  console.log(`- baseUrl: ${rollerValidation.safeConfig.baseUrl}`);
  console.log(`- window: ${summary.sourceWindow.startDate} -> ${summary.sourceWindow.endDate}`);
  console.log(`- ticketsRead: ${summary.sourceRecords.tickets}`);
  console.log(`- paymentsRead: ${summary.sourceRecords.payments}`);
  console.log(`- customersRead: ${summary.sourceRecords.customers}`);
  console.log(`- ticketsUpserted: ${summary.upserts.tickets}`);
  console.log(`- paymentsUpserted: ${summary.upserts.payments}`);
  console.log(`- customersUpserted: ${summary.upserts.customers}`);
  console.log(`- skippedTickets: ${summary.skippedRecords.tickets}`);
  console.log(`- skippedPayments: ${summary.skippedRecords.payments}`);
  console.log(`- skippedCustomers: ${summary.skippedRecords.customers}`);
  console.log(`- apply: ${summary.apply}`);
  console.log("- no secrets, access tokens, customer names, emails, phone numbers, booking notes, or raw payloads were printed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
