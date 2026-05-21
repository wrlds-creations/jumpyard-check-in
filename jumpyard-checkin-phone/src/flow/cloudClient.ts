import type { Addon, AddonId, Booking, LookupSource } from '@/flow/types';

const DEFAULT_CLOUD_API_BASE_URL = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';
const VENUE_TIME_ZONE = 'Europe/Stockholm';

export type LookupIssue =
  | 'not_found'
  | 'payment_required'
  | 'wrong_date'
  | 'no_redeemable_tickets'
  | 'lookup_failed'
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

function createLookupError(body: CloudLookupResponse | null, httpStatus?: number) {
  if (body?.status === 'not_found' || body?.error?.code === 'booking_not_found') {
    return new CloudLookupError('not_found', 'Booking was not found.', httpStatus);
  }

  return new CloudLookupError('lookup_failed', body?.error?.message ?? 'JumpYard Cloud lookup failed.', httpStatus);
}

function toBooking(booking: CloudBooking, reason: string, source?: CloudLookupSource): Booking {
  const primaryItems = getPrimaryItems(booking.items);
  const sessionItem = primaryItems[0] ?? booking.items[0] ?? null;
  const existingAddons = getExistingAddons(booking.items);

  return {
    id: booking.bookingReference ?? booking.rollerUniqueId ?? '',
    jumpers: getJumperCount(primaryItems, booking.items),
    time: formatClockTime(sessionItem?.startTime) ?? '',
    endTime: formatClockTime(sessionItem?.endTime) ?? undefined,
    durationMinutes: getDurationMinutes(sessionItem?.startTime, sessionItem?.endTime),
    date: sessionItem?.bookingDate ?? undefined,
    products: booking.items.length,
    paid: reason === 'ready' || Number(booking.amountOwing ?? 0) === 0,
    paymentStatus: booking.paymentStatus ?? booking.status,
    amountOwing: booking.amountOwing,
    existingAddons,
    productLabel: getProductLabel(sessionItem),
    productType: 'entry',
    lookupSource: normalizeLookupSource(source),
  };
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
