export type PaymentRecoveryOutcome = 'pending' | 'approved' | 'failed' | 'unknown';

export interface PaymentRecoveryConfig {
  available: true;
  apiUrl: string;
  configurationId: string;
  integrationId: string;
}

export interface PaymentRecoveryRecord {
  version: 1;
  attemptId: string;
  bookingIdentifier: string;
  kind: 'new_booking' | 'add_product';
  config: PaymentRecoveryConfig;
  sessionHash: string | null;
  returnConsumed: boolean;
  outcome: PaymentRecoveryOutcome;
  createdAt: number;
  expiresAt: number;
  lastObservedAt: number;
}

export interface PaymentRedirect {
  sessionId: string;
  redirectResult: string;
}

export const PAYMENT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = 'jumpyard.paymentRecovery.v1';
let rollbackWriteFloor = 0;
let lastReadFailed = false;

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(value);
}

function outcome(value: unknown): value is PaymentRecoveryOutcome {
  return value === 'pending' || value === 'approved' || value === 'failed' || value === 'unknown';
}

function publicConfig(value: unknown): PaymentRecoveryConfig | null {
  if (!object(value) || value.available !== true || typeof value.apiUrl !== 'string'
    || value.apiUrl.length > 2048 || !identifier(value.configurationId) || !identifier(value.integrationId)) return null;
  try {
    const url = new URL(value.apiUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return {
      available: true,
      apiUrl: url.toString(),
      configurationId: value.configurationId,
      integrationId: value.integrationId,
    };
  } catch {
    return null;
  }
}

function normalize(value: unknown, now: number): PaymentRecoveryRecord | null {
  if (!object(value) || value.version !== 1 || !identifier(value.attemptId)
    || !identifier(value.bookingIdentifier) || (value.kind !== 'new_booking' && value.kind !== 'add_product')
    || !outcome(value.outcome)) return null;
  const config = publicConfig(value.config);
  const { createdAt, expiresAt, lastObservedAt } = value;
  if (!config || typeof createdAt !== 'number' || typeof expiresAt !== 'number' || typeof lastObservedAt !== 'number'
    || !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(lastObservedAt)
    || createdAt < 0 || expiresAt !== createdAt + PAYMENT_RECOVERY_MAX_AGE_MS
    || lastObservedAt < createdAt || lastObservedAt >= expiresAt || lastObservedAt > now || now >= expiresAt) return null;
  if (value.sessionHash !== null && (typeof value.sessionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.sessionHash))) return null;
  if (value.returnConsumed !== undefined && typeof value.returnConsumed !== 'boolean') return null;
  if (value.returnConsumed === true && (!value.sessionHash || value.outcome === 'pending')) return null;
  return {
    version: 1,
    attemptId: value.attemptId,
    bookingIdentifier: value.bookingIdentifier,
    kind: value.kind,
    config,
    sessionHash: value.sessionHash as string | null,
    returnConsumed: value.returnConsumed === true,
    outcome: value.outcome,
    createdAt,
    expiresAt,
    lastObservedAt: now,
  };
}

function persist(record: PaymentRecoveryRecord): boolean {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function readPaymentRecovery(): PaymentRecoveryRecord | null {
  lastReadFailed = false;
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const now = Date.now();
    if (object(value) && typeof value.lastObservedAt === 'number' && Number.isSafeInteger(value.lastObservedAt)
      && value.lastObservedAt > now) rollbackWriteFloor = Math.max(rollbackWriteFloor, value.lastObservedAt);
    const record = normalize(value, now);
    if (!record) {
      target.removeItem(STORAGE_KEY);
      return null;
    }
    // Persist the observation before allowing reuse; expiry never moves forward.
    if (!persist(record)) {
      lastReadFailed = true;
      return null;
    }
    return record;
  } catch {
    lastReadFailed = true;
    try { target.removeItem(STORAGE_KEY); } catch { /* Storage may disappear while the page is suspended. */ }
    return null;
  }
}

export function beginPaymentRecovery(input: {
  attemptId: string;
  bookingIdentifier: string;
  kind: 'new_booking' | 'add_product';
  config: unknown;
}): PaymentRecoveryRecord | null {
  const current = readPaymentRecovery();
  const now = Date.now();
  const config = publicConfig(input.config);
  if (lastReadFailed || now < rollbackWriteFloor || !config || !identifier(input.attemptId) || !identifier(input.bookingIdentifier)
    || (input.kind !== 'new_booking' && input.kind !== 'add_product')) return null;
  if (current?.attemptId === input.attemptId) {
    return current.bookingIdentifier === input.bookingIdentifier && current.kind === input.kind
      && JSON.stringify(current.config) === JSON.stringify(config) ? current : null;
  }
  if (current && current.outcome !== 'failed') return null;
  const record: PaymentRecoveryRecord = {
    version: 1,
    attemptId: input.attemptId,
    bookingIdentifier: input.bookingIdentifier,
    kind: input.kind,
    config,
    sessionHash: null,
    returnConsumed: false,
    outcome: 'pending',
    createdAt: now,
    expiresAt: now + PAYMENT_RECOVERY_MAX_AGE_MS,
    lastObservedAt: now,
  };
  return persist(record) ? record : null;
}

async function sessionHash(sessionId: string): Promise<string | null> {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 2048 || /\s/.test(sessionId)) return null;
  try {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export async function bindPaymentRecoverySession(attemptId: string, sessionId: string): Promise<boolean> {
  const before = readPaymentRecovery();
  if (!before || before.attemptId !== attemptId || before.returnConsumed || before.outcome !== 'pending') return false;
  const hash = await sessionHash(sessionId);
  const current = readPaymentRecovery();
  if (!hash || !current || current.attemptId !== attemptId || current.createdAt !== before.createdAt
    || current.returnConsumed || current.outcome !== 'pending' || (current.sessionHash && current.sessionHash !== hash)) return false;
  return persist({ ...current, sessionHash: hash });
}

export function setPaymentRecoveryOutcome(attemptId: string, nextOutcome: PaymentRecoveryOutcome): boolean {
  const current = readPaymentRecovery();
  if (!current || current.attemptId !== attemptId || !outcome(nextOutcome)) return false;
  if (current.outcome === 'approved' && nextOutcome !== 'approved') return false;
  if (current.outcome === 'failed' && nextOutcome !== 'failed' && nextOutcome !== 'approved') return false;
  if (nextOutcome === 'pending' && current.outcome !== 'pending') return false;
  return persist({ ...current, outcome: nextOutcome });
}

export function claimPaymentRedirect(attemptId: string): boolean {
  const current = readPaymentRecovery();
  if (!current || current.attemptId !== attemptId || !current.sessionHash || current.returnConsumed
    || current.outcome === 'approved' || current.outcome === 'failed') return false;
  return persist({ ...current, returnConsumed: true, outcome: 'unknown' });
}

export function clearPaymentRecovery(attemptId?: string): boolean {
  const target = storage();
  if (!target) return false;
  try {
    if (attemptId !== undefined && readPaymentRecovery()?.attemptId !== attemptId) return false;
    target.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasPaymentRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(window.location.href).searchParams.has('redirectResult');
  } catch {
    return false;
  }
}

export function getPaymentRedirect(): PaymentRedirect | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URL(window.location.href).searchParams;
    const sessionId = params.get('sessionId');
    const redirectResult = params.get('redirectResult');
    if (params.getAll('sessionId').length !== 1 || params.getAll('redirectResult').length !== 1
      || !sessionId || sessionId.length > 2048 || /\s/.test(sessionId)
      || !redirectResult || redirectResult.length > 16384) return null;
    return { sessionId, redirectResult };
  } catch {
    return null;
  }
}

export async function matchesPaymentRedirect(record: PaymentRecoveryRecord, redirect: PaymentRedirect): Promise<boolean> {
  if (record.returnConsumed || !record.sessionHash || record.outcome === 'approved' || record.outcome === 'failed') return false;
  const hash = await sessionHash(redirect.sessionId);
  const current = readPaymentRecovery();
  return Boolean(hash && current && current.attemptId === record.attemptId && current.createdAt === record.createdAt
    && !current.returnConsumed && current.outcome !== 'approved' && current.outcome !== 'failed'
    && current.sessionHash === record.sessionHash && hash === record.sessionHash);
}

export function consumePaymentRedirect(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('sessionId');
  url.searchParams.delete('redirectResult');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function classifyPaymentResult(
  result: unknown,
  paymentResultEnum?: { approved?: number; failed?: number },
): Exclude<PaymentRecoveryOutcome, 'pending'> {
  if (!object(result)) return 'unknown';
  const raw = object(result.rawResult) ? result.rawResult : null;
  const resultCode = raw?.resultCode;
  if (resultCode === 'Authorised') return 'approved';
  if (resultCode === 'Cancelled' || resultCode === 'Refused') return 'failed';
  if (typeof resultCode === 'string') return 'unknown';
  if (raw?.eventCode === 'AUTHORISATION' && typeof raw.isSuccess === 'boolean') return raw.isSuccess ? 'approved' : 'failed';
  // Some SDK paths omit rawResult. Only its explicit cancellation/refusal message proves failure.
  if (result.result === (paymentResultEnum?.failed ?? 2)
    && (result.message === 'Cancelled' || result.message === 'Refused')) return 'failed';
  return 'unknown';
}
