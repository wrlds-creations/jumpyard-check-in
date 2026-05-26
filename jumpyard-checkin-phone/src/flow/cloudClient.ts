import type { Addon, AddonId, Booking, CheckInSession, LookupSource } from '@/flow/types';

const DEFAULT_CLOUD_API_BASE_URL = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';
const VENUE_TIME_ZONE = 'Europe/Stockholm';

export type LookupIssue =
  | 'not_found'
  | 'payment_required'
  | 'wrong_date'
  | 'no_redeemable_tickets'
  | 'lookup_failed'
  | 'network_error';

export type SessionIssue =
  | 'not_found'
  | 'payment_required'
  | 'wrong_date'
  | 'no_redeemable_tickets'
  | 'already_redeemed'
  | 'booking_not_active'
  | 'booking_not_fresh'
  | 'session_expired'
  | 'session_not_active'
  | 'session_failed'
  | 'network_error';

export class CloudLookupError extends Error {
  readonly reason: LookupIssue;
  readonly httpStatus?: number;

  constructor(reason: LookupIssue, message: string, httpStatus?: number) {
    super(message);
    this.name = 'CloudLookupError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export class CloudSessionError extends Error {
  readonly reason: SessionIssue;
  readonly httpStatus?: number;

  constructor(reason: SessionIssue, message: string, httpStatus?: number) {
    super(message);
    this.name = 'CloudSessionError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

export class CloudBookingError extends Error {
  readonly code: string;
  readonly httpStatus?: number;

  constructor(code: string, message: string, httpStatus?: number) {
    super(message);
    this.name = 'CloudBookingError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

interface CloudLookupResponse {
  status: 'found' | 'not_found' | 'invalid_request' | 'roller_error' | 'config_error' | 'internal_error';
  booking?: CloudBooking;
  eligibility?: {
    canCheckIn: boolean;
    reason: 'ready' | 'payment_required' | 'wrong_date' | 'no_redeemable_tickets';
    amountOwing?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
  source?: CloudLookupSource;
}

interface CloudSessionResponse {
  status:
    | 'session_started'
    | 'session_resumed'
    | 'ready_for_staff'
    | 'blocked'
    | 'not_found'
    | 'invalid_request'
    | 'internal_error';
  session?: CloudSession;
  error?: {
    code?: string;
    message?: string;
  };
  booking?: CloudBooking;
  source?: CloudLookupSource;
}

interface CloudSession {
  checkinSessionId: string;
  status: string;
  handoffStatus?: string | null;
  handoffCode?: string | null;
  safetyStatus?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
}

interface CloudLookupSource {
  system: string;
  environment?: string | null;
  lookupPath?: string | null;
  freshnessStatus?: string | null;
  refreshedFromRoller?: boolean;
}

interface CloudBooking {
  bookingReference: string | null;
  rollerUniqueId: string | null;
  status: string | null;
  paymentStatus: string | null;
  amountOwing: number | null;
  items: CloudBookingItem[];
}

interface CloudBookingItem {
  productName: string | null;
  parentProductName: string | null;
  productType: string | null;
  quantity: number | null;
  bookingDate: string | null;
  startTime: string | null;
  endTime: string | null;
  tickets: unknown[];
}

export interface NewBookingProduct {
  available: boolean;
  capacityRemaining: number | null;
  durationMinutes: number;
  endTime: string | null;
  jumpersPerUnit: number;
  key: string;
  label: string;
  onlineSalesOpen: boolean;
  parentProductId: string;
  productId: string | null;
  productName: string | null;
  startTime: string;
  type: 'entry' | 'family';
  unitPrice: number | null;
  unitPriceCents: number | null;
}

export interface NewBookingAvailabilitySlot {
  date: string;
  startTime: string;
  products: NewBookingProduct[];
}

export interface NewBookingAvailability {
  date: string;
  slots: NewBookingAvailabilitySlot[];
}

export interface NewBookingCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface NewBookingItemRequest {
  bookingDate: string;
  productId: number;
  quantity: number;
  startTime: string;
}

export interface NewBookingQuote {
  externalId: string | null;
  costs: CloudBookingCosts;
  itemCount: number;
  expiresAt: string | null;
}

export interface NewBookingDraftResult {
  draft: {
    uniqueId: string | null;
    capacityReservationId: string | null;
    bookingReference: string | null;
    costs: CloudBookingCosts;
    itemCount: number;
  };
  paymentSession: {
    jwt?: string | null;
    jwtPresent: boolean;
    jwtSummary?: {
      present: boolean;
      partCount?: number;
      expiresAt?: string | null;
    };
    config?: {
      available: boolean;
      apiUrl: string | null;
      configurationId: string | null;
      integrationId: string | null;
      lookupStatusCode?: number | null;
    };
  };
  prepayment?: {
    addOnGroupId?: string | null;
    amountOwing: number | null;
    amountOwingCents: number | null;
    flowType?: 'new_booking' | 'add_product' | string;
    originalBookingReference?: string | null;
    originalRollerUniqueId?: string | null;
    paymentBlockedReason: string | null;
    prepaymentDraftId: string;
    rollerDraftUniqueId: string | null;
    status: string;
    total: number | null;
    totalCents: number | null;
  };
}

export interface AddProductDraftResult {
  draft: NewBookingDraftResult['draft'];
  addOn?: {
    addOnGroupId: string | null;
    originalBookingReference: string | null;
    originalRollerUniqueId: string | null;
    mode: string | null;
  };
  paymentSession: NewBookingDraftResult['paymentSession'];
  prepayment?: NewBookingDraftResult['prepayment'];
}

export interface CheckInSessionLinkResult {
  booking: Booking;
  checkinSession: CheckInSession;
}

interface CloudBookingCosts {
  total: number | null;
  amountOwing: number | null;
  tax?: number | null;
  transactionFee?: number | null;
  cardFee?: number | null;
  discount?: number | null;
}

interface AvailabilityResponse {
  status: 'available' | 'invalid_request' | 'blocked' | 'roller_error' | 'config_error' | 'internal_error';
  availability?: NewBookingAvailability;
  error?: { code?: string; message?: string };
}

interface QuoteResponse {
  status: 'quoted' | 'invalid_request' | 'blocked' | 'rejected' | 'roller_error' | 'config_error' | 'internal_error';
  quote?: NewBookingQuote;
  error?: { code?: string; message?: string };
}

interface DraftResponse {
  status: 'draft_created' | 'invalid_request' | 'blocked' | 'rejected' | 'roller_error' | 'config_error' | 'internal_error';
  draft?: NewBookingDraftResult['draft'];
  paymentSession?: NewBookingDraftResult['paymentSession'];
  prepayment?: NewBookingDraftResult['prepayment'];
  error?: { code?: string; message?: string };
}

interface AddProductQuoteResponse {
  status: 'quoted' | 'invalid_request' | 'blocked' | 'rejected' | 'roller_error' | 'config_error' | 'internal_error';
  quote?: NewBookingQuote;
  error?: { code?: string; message?: string };
}

interface AddProductDraftResponse {
  status:
    | 'add_product_draft_created'
    | 'invalid_request'
    | 'blocked'
    | 'rejected'
    | 'roller_error'
    | 'config_error'
    | 'internal_error';
  draft?: NewBookingDraftResult['draft'];
  addOn?: AddProductDraftResult['addOn'];
  paymentSession?: NewBookingDraftResult['paymentSession'];
  prepayment?: NewBookingDraftResult['prepayment'];
  error?: { code?: string; message?: string };
}

export async function lookupBooking(code: string): Promise<Booking> {
  const identifier = code.trim();
  if (!identifier) {
    throw new CloudLookupError('lookup_failed', 'Booking reference is required.');
  }

  let response: Response;
  let body: CloudLookupResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/check-in/lookup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        identifier,
        identifierType: inferIdentifierType(identifier),
        expectedDate: getExpectedDate(),
        correlationId: `phone_${Date.now().toString(36)}`,
      }),
    });
    body = await parseResponse(response);
  } catch (error) {
    if (error instanceof CloudLookupError) throw error;
    throw new CloudLookupError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || !body) {
    throw createLookupError(body, response.status);
  }

  if (body.status !== 'found' || !body.booking || !body.eligibility) {
    throw createLookupError(body, response.status);
  }

  if (body.eligibility.reason === 'payment_required') {
    return toBooking(body.booking, body.eligibility.reason, body.source);
  }

  if (!body.eligibility.canCheckIn || body.eligibility.reason !== 'ready') {
    const reason = body.eligibility.reason === 'ready' ? 'lookup_failed' : body.eligibility.reason;
    throw new CloudLookupError(reason, 'Booking is not ready for check-in.', response.status);
  }

  return toBooking(body.booking, body.eligibility.reason, body.source);
}

export async function resolveCheckInSessionLink(token: string): Promise<CheckInSessionLinkResult> {
  const rawToken = token.trim();
  if (!rawToken) {
    throw new CloudSessionError('session_failed', 'A check-in link token is required.');
  }

  let response: Response;
  let body: CloudSessionResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/check-in/session-links/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        correlationId: `phone_link_${Date.now().toString(36)}`,
        token: rawToken,
      }),
    });
    body = await parseSessionResponse(response);
  } catch (error) {
    if (error instanceof CloudSessionError) throw error;
    throw new CloudSessionError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || !body?.session || !body.booking) {
    throw createSessionError(body, response.status);
  }

  if (body.status !== 'session_started' && body.status !== 'session_resumed') {
    throw createSessionError(body, response.status);
  }

  return {
    booking: toBooking(body.booking, 'ready', body.source),
    checkinSession: toCheckInSession(body.session),
  };
}

export async function startCheckInSession(booking: Booking): Promise<CheckInSession> {
  const identifier = booking.rollerUniqueId ?? booking.id;
  if (!identifier) {
    throw new CloudSessionError('session_failed', 'Booking reference is required before starting a session.');
  }

  let response: Response;
  let body: CloudSessionResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/check-in/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        bookingReference: booking.id,
        rollerUniqueId: booking.rollerUniqueId ?? undefined,
        identifier,
        expectedDate: booking.date ?? getExpectedDate(),
        idempotencyKey: getSessionStartIdempotencyKey(booking),
        correlationId: `phone_session_${Date.now().toString(36)}`,
      }),
    });
    body = await parseSessionResponse(response);
  } catch (error) {
    if (error instanceof CloudSessionError) throw error;
    throw new CloudSessionError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || !body?.session) {
    throw createSessionError(body, response.status);
  }

  if (body.status !== 'session_started' && body.status !== 'session_resumed') {
    throw createSessionError(body, response.status);
  }

  return toCheckInSession(body.session);
}

export async function markSessionReadyForStaff(
  session: CheckInSession,
  safetyStatus: 'completed' | 'requires_staff' = 'completed'
): Promise<CheckInSession> {
  if (!session.checkinSessionId) {
    throw new CloudSessionError('session_failed', 'A check-in session id is required before staff handoff.');
  }

  let response: Response;
  let body: CloudSessionResponse | null = null;

  try {
    response = await fetch(
      `${getApiBaseUrl()}/v1/check-in/sessions/${encodeURIComponent(session.checkinSessionId)}/ready-for-staff`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          idempotencyKey: getReadyForStaffIdempotencyKey(session, safetyStatus),
          safetyStatus,
          correlationId: `phone_ready_${Date.now().toString(36)}`,
        }),
      }
    );
    body = await parseSessionResponse(response);
  } catch (error) {
    if (error instanceof CloudSessionError) throw error;
    throw new CloudSessionError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || !body?.session || body.status !== 'ready_for_staff') {
    throw createSessionError(body, response.status);
  }

  return toCheckInSession(body.session);
}

export async function getNewBookingAvailability(startTimes: string[], date = getExpectedDate()): Promise<NewBookingAvailability> {
  let response: Response;
  let body: AvailabilityResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/bookings/availability`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        correlationId: `phone_availability_${Date.now().toString(36)}`,
        date,
        startTimes,
      }),
    });
    body = await parseBookingResponse<AvailabilityResponse>(response);
  } catch (error) {
    if (error instanceof CloudBookingError) throw error;
    throw new CloudBookingError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || body?.status !== 'available' || !body.availability) {
    throw createBookingError(body, response.status);
  }

  return body.availability;
}

export async function quoteNewBooking(customer: NewBookingCustomer, items: NewBookingItemRequest[]): Promise<NewBookingQuote> {
  let response: Response;
  let body: QuoteResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/bookings/quote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        correlationId: `phone_quote_${Date.now().toString(36)}`,
        customer,
        items,
        name: `${customer.firstName} ${customer.lastName}`.trim() || 'JumpYard booking',
        requireAvailability: true,
      }),
    });
    body = await parseBookingResponse<QuoteResponse>(response);
  } catch (error) {
    if (error instanceof CloudBookingError) throw error;
    throw new CloudBookingError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || body?.status !== 'quoted' || !body.quote) {
    throw createBookingError(body, response.status);
  }

  return body.quote;
}

export async function createDraftBooking(
  customer: NewBookingCustomer,
  items: NewBookingItemRequest[],
  idempotencyKey: string
): Promise<NewBookingDraftResult> {
  let response: Response;
  let body: DraftResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/bookings/draft`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        confirmDraft: true,
        correlationId: `phone_draft_${Date.now().toString(36)}`,
        customer,
        idempotencyKey,
        items,
        name: `${customer.firstName} ${customer.lastName}`.trim() || 'JumpYard booking',
        requireAvailability: true,
        sendConfirmations: false,
      }),
    });
    body = await parseBookingResponse<DraftResponse>(response);
  } catch (error) {
    if (error instanceof CloudBookingError) throw error;
    throw new CloudBookingError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || body?.status !== 'draft_created' || !body.draft || !body.paymentSession) {
    throw createBookingError(body, response.status);
  }

  return {
    draft: body.draft,
    paymentSession: {
      config: body.paymentSession.config,
      jwt: body.paymentSession.jwt ?? null,
      jwtPresent: body.paymentSession.jwtPresent,
      jwtSummary: body.paymentSession.jwtSummary,
    },
    prepayment: body.prepayment,
  };
}

export async function quoteAddProducts(
  bookingReference: string,
  customer: NewBookingCustomer,
  items: NewBookingItemRequest[],
  requireAvailability: boolean
): Promise<NewBookingQuote> {
  let response: Response;
  let body: AddProductQuoteResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/bookings/${encodeURIComponent(bookingReference)}/add-products/quote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        correlationId: `phone_addon_quote_${Date.now().toString(36)}`,
        customer,
        items,
        name: `Add-on for ${bookingReference}`,
        requireAvailability,
      }),
    });
    body = await parseBookingResponse<AddProductQuoteResponse>(response);
  } catch (error) {
    if (error instanceof CloudBookingError) throw error;
    throw new CloudBookingError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || body?.status !== 'quoted' || !body.quote) {
    throw createBookingError(body, response.status);
  }

  return body.quote;
}

export async function createAddProductDraft(
  bookingReference: string,
  customer: NewBookingCustomer,
  items: NewBookingItemRequest[],
  idempotencyKey: string,
  requireAvailability: boolean
): Promise<AddProductDraftResult> {
  let response: Response;
  let body: AddProductDraftResponse | null = null;

  try {
    response = await fetch(`${getApiBaseUrl()}/v1/bookings/${encodeURIComponent(bookingReference)}/add-products`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        confirmDraft: true,
        correlationId: `phone_addon_draft_${Date.now().toString(36)}`,
        customer,
        idempotencyKey,
        items,
        name: `Add-on for ${bookingReference}`,
        requireAvailability,
        sendConfirmations: false,
      }),
    });
    body = await parseBookingResponse<AddProductDraftResponse>(response);
  } catch (error) {
    if (error instanceof CloudBookingError) throw error;
    throw new CloudBookingError('network_error', 'Could not reach JumpYard Cloud.');
  }

  if (!response.ok || body?.status !== 'add_product_draft_created' || !body.draft || !body.paymentSession) {
    throw createBookingError(body, response.status);
  }

  return {
    addOn: body.addOn,
    draft: body.draft,
    paymentSession: {
      config: body.paymentSession.config,
      jwtPresent: body.paymentSession.jwtPresent,
      jwtSummary: body.paymentSession.jwtSummary,
    },
    prepayment: body.prepayment,
  };
}

function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL || DEFAULT_CLOUD_API_BASE_URL;
  return configured.replace(/\/+$/, '');
}

function getExpectedDate() {
  return process.env.NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE || getVenueToday();
}

function getVenueToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: VENUE_TIME_ZONE,
    year: 'numeric',
  }).format(new Date());
}

function inferIdentifierType(identifier: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
    return 'rollerUniqueId';
  }

  if (/^\d{5,12}$/.test(identifier)) {
    return 'bookingReference';
  }

  return 'unknown';
}

async function parseResponse(response: Response): Promise<CloudLookupResponse | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as CloudLookupResponse;
  } catch {
    throw new CloudLookupError('lookup_failed', 'JumpYard Cloud returned an invalid response.', response.status);
  }
}

async function parseSessionResponse(response: Response): Promise<CloudSessionResponse | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as CloudSessionResponse;
  } catch {
    throw new CloudSessionError('session_failed', 'JumpYard Cloud returned an invalid session response.', response.status);
  }
}

async function parseBookingResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CloudBookingError('booking_response_invalid', 'JumpYard Cloud returned an invalid booking response.', response.status);
  }
}

function createLookupError(body: CloudLookupResponse | null, httpStatus?: number) {
  if (body?.status === 'not_found' || body?.error?.code === 'booking_not_found') {
    return new CloudLookupError('not_found', 'Booking was not found.', httpStatus);
  }

  return new CloudLookupError('lookup_failed', body?.error?.message ?? 'JumpYard Cloud lookup failed.', httpStatus);
}

function createSessionError(body: CloudSessionResponse | null, httpStatus?: number) {
  if (
    body?.status === 'not_found' ||
    body?.error?.code === 'booking_not_found' ||
    body?.error?.code === 'session_not_found'
  ) {
    return new CloudSessionError('not_found', 'Booking was not found in JumpYard Cloud.', httpStatus);
  }

  const code = body?.error?.code;
  if (isSessionIssue(code)) {
    return new CloudSessionError(code, body?.error?.message ?? 'Check-in session could not start.', httpStatus);
  }

  return new CloudSessionError('session_failed', body?.error?.message ?? 'Check-in session could not start.', httpStatus);
}

function createBookingError(body: { error?: { code?: string; message?: string } } | null, httpStatus?: number) {
  return new CloudBookingError(
    body?.error?.code ?? 'booking_failed',
    body?.error?.message ?? 'JumpYard Cloud booking request failed.',
    httpStatus
  );
}

function isSessionIssue(value?: string): value is SessionIssue {
  return (
    value === 'payment_required' ||
    value === 'wrong_date' ||
    value === 'no_redeemable_tickets' ||
    value === 'already_redeemed' ||
    value === 'booking_not_active' ||
    value === 'booking_not_fresh' ||
    value === 'session_expired' ||
    value === 'session_not_active'
  );
}

function toBooking(booking: CloudBooking, reason: string, source?: CloudLookupSource): Booking {
  const primaryItems = getPrimaryItems(booking.items);
  const sessionItem = primaryItems[0] ?? booking.items[0] ?? null;
  const existingAddons = getExistingAddons(booking.items);

  return {
    id: booking.bookingReference ?? booking.rollerUniqueId ?? '',
    rollerUniqueId: booking.rollerUniqueId,
    jumpers: getJumperCount(primaryItems, booking.items),
    time: formatClockTime(sessionItem?.startTime) ?? '',
    endTime: formatClockTime(sessionItem?.endTime) ?? undefined,
    durationMinutes: getDurationMinutes(sessionItem?.startTime, sessionItem?.endTime),
    date: sessionItem?.bookingDate ?? undefined,
    products: booking.items.length,
    paid: isPaidBooking(reason, booking),
    paymentStatus: booking.paymentStatus ?? booking.status,
    amountOwing: booking.amountOwing,
    existingAddons,
    productLabel: getProductLabel(sessionItem),
    productType: 'entry',
    lookupSource: normalizeLookupSource(source),
  };
}

function getSessionStartIdempotencyKey(booking: Booking) {
  const bookingRef = booking.rollerUniqueId ?? booking.id;
  const visitDate = booking.date ?? getExpectedDate();
  return `phone-session-start:${bookingRef}:${visitDate}`;
}

function getReadyForStaffIdempotencyKey(session: CheckInSession, safetyStatus: string) {
  return `phone-ready-for-staff:${session.checkinSessionId}:${safetyStatus}`;
}

function toCheckInSession(session: CloudSession): CheckInSession {
  return {
    checkinSessionId: session.checkinSessionId,
    status: session.status,
    handoffCode: session.handoffCode ?? null,
    handoffStatus: session.handoffStatus ?? null,
    safetyStatus: session.safetyStatus ?? null,
    completedAt: session.completedAt ?? null,
    expiresAt: session.expiresAt ?? null,
  };
}

function isPaidBooking(reason: string, booking: CloudBooking) {
  if (reason === 'ready') return true;

  const status = `${booking.paymentStatus ?? booking.status ?? ''}`.toLowerCase();
  if (status.includes('pending') || status.includes('unpaid') || status.includes('partial')) return false;

  if (booking.amountOwing !== null && booking.amountOwing > 0) return false;

  return status === 'paid' || status === 'nopaymentrequired' || status === 'paidinfull';
}

function normalizeLookupSource(source?: CloudLookupSource): LookupSource | undefined {
  if (!source?.system) return undefined;

  return {
    system: source.system,
    environment: source.environment ?? null,
    lookupPath: source.lookupPath ?? null,
    freshnessStatus: source.freshnessStatus ?? null,
    refreshedFromRoller: Boolean(source.refreshedFromRoller),
  };
}

function getPrimaryItems(items: CloudBookingItem[]) {
  const nonAddons = items.filter((item) => !isAddonItem(item));
  return nonAddons.length > 0 ? nonAddons : items;
}

function getJumperCount(primaryItems: CloudBookingItem[], allItems: CloudBookingItem[]) {
  const quantity = primaryItems.reduce((total, item) => total + Math.max(0, item.quantity ?? 0), 0);
  if (quantity > 0) return quantity;

  const tickets = primaryItems.reduce((total, item) => total + item.tickets.length, 0);
  if (tickets > 0) return tickets;

  return Math.max(1, allItems[0]?.quantity ?? 1);
}

function getExistingAddons(items: CloudBookingItem[]): Addon[] {
  const addons = new Map<AddonId, Addon>();

  for (const item of items) {
    if (!isAddonItem(item)) continue;

    const id = inferAddonId(item);
    const label = getProductLabel(item) ?? id;
    const qty = Math.max(1, item.quantity ?? item.tickets.length ?? 1);
    const existing = addons.get(id);

    addons.set(id, {
      id,
      label: existing?.label ?? label,
      price: 0,
      qty: (existing?.qty ?? 0) + qty,
    });
  }

  return [...addons.values()];
}

function isAddonItem(item: CloudBookingItem) {
  const text = `${item.productType ?? ''} ${item.productName ?? ''} ${item.parentProductName ?? ''}`.toLowerCase();
  return (
    text.includes('addon') ||
    text.includes('add-on') ||
    text.includes('sock') ||
    text.includes('strump') ||
    text.includes('skyrider') ||
    text.includes('hänglås') ||
    text.includes('hanglas') ||
    text.includes('coffee') ||
    text.includes('kaffe') ||
    text.includes('connected')
  );
}

function inferAddonId(item: CloudBookingItem): AddonId {
  const text = `${item.productName ?? ''} ${item.parentProductName ?? ''}`.toLowerCase();
  if (text.includes('skyrider')) return 'skyrider';
  if (text.includes('connected')) return 'connected';
  if (text.includes('coffee') || text.includes('kaffe')) return 'coffee';
  if (text.includes('hänglås') || text.includes('hanglas') || text.includes('lock')) return 'lock';
  if (text.includes('sock') || text.includes('strump')) return 'socks';
  return 'extra_person';
}

function getProductLabel(item: CloudBookingItem | null) {
  if (!item) return undefined;
  return item.parentProductName ?? item.productName ?? undefined;
}

function formatClockTime(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value ?? undefined;

  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function getDurationMinutes(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return undefined;

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return undefined;

  return end >= start ? end - start : end + 24 * 60 - start;
}

function timeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}
