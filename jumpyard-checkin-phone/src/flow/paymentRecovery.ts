export type PaymentRecoveryOutcome = 'pending' | 'approved' | 'failed' | 'unknown';

export interface PaymentRecoverySubmission {
  version: 1;
  ownerId: string;
  phase: 'prepared' | 'submitted' | 'unresolved' | 'failed' | 'approved';
  protected: boolean;
  sessionHash: string | null;
}

export interface PaymentRecoveryOwnership {
  ownerId: string;
  protected: boolean;
  release: () => void;
}

interface SubmissionProof extends PaymentRecoverySubmission {
  attemptId: string;
  bookingIdentifier: string;
  createdAt: number;
  expiresAt: number;
}

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
  /** Separate monotonic evidence; legacy records have no submission proof. */
  submission?: PaymentRecoverySubmission | null;
}

export interface PaymentRedirect {
  sessionId: string;
  redirectResult: string;
}

export const PAYMENT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STORAGE_KEY = 'jumpyard.paymentRecovery.v1';
const SUBMISSION_KEY = 'jumpyard.paymentSubmission.v1';
const OBSERVATION_KEY = 'jumpyard.paymentObservation.v1';
const OWNERSHIP_LOCK = 'jumpyard.paymentSubmission.owner.v1';
const activeOwners = new Set<string>();
const protectedOwners = new Set<string>();
let pendingOwnershipRelease: Promise<unknown> | null = null;
let rollbackWriteFloor = 0;
let lastReadFailed = false;
let cleanupTimer: number | undefined;
let cleanupAt = Number.POSITIVE_INFINITY;
let cleanupQueued = false;

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
    // Observation writes must never overwrite submission evidence from another tab.
    const base = { ...record };
    delete base.submission;
    target.setItem(STORAGE_KEY, JSON.stringify(base));
    scheduleCleanup(record.expiresAt);
    return true;
  } catch {
    return false;
  }
}

function scheduleCleanup(expiresAt: number) {
  if (typeof window === 'undefined' || !window.setTimeout || expiresAt >= cleanupAt) return;
  if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
  cleanupAt = expiresAt;
  cleanupTimer = window.setTimeout(() => {
    cleanupAt = Number.POSITIVE_INFINITY;
    cleanupTimer = undefined;
    void purgeExpiredPaymentRecovery();
  }, Math.max(0, expiresAt - Date.now()));
}

function queueCleanup() {
  if (cleanupQueued) return;
  cleanupQueued = true;
  void Promise.resolve().then(purgeExpiredPaymentRecovery).finally(() => { cleanupQueued = false; });
}

/** Cleanup uses the same lease as checkout writers, so a stale read cannot delete a replacement. */
export async function purgeExpiredPaymentRecovery(): Promise<void> {
  const ownership = activeOwners.size ? null : await acquirePaymentRecoveryOwnership();
  if (!activeOwners.size && !ownership) { scheduleCleanup(Date.now() + 60_000); return; }
  try {
    const target = storage();
    if (!target) return;
    for (const key of [STORAGE_KEY, SUBMISSION_KEY, OBSERVATION_KEY]) {
      const raw = target.getItem(key);
      if (!raw) continue;
      let value: unknown;
      try { value = JSON.parse(raw); } catch { target.removeItem(key); continue; }
      if (!object(value) || typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt)
        || typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt !== value.createdAt + PAYMENT_RECOVERY_MAX_AGE_MS || Date.now() >= value.expiresAt) {
        target.removeItem(key);
      } else scheduleCleanup(value.expiresAt);
    }
  } catch { /* Expired data is never returned, even when browser storage is unavailable. */ }
  finally { ownership?.release(); }
}

function observe(record: PaymentRecoveryRecord, now: number): boolean {
  const target = storage();
  if (!target) return false;
  try {
    const previous: unknown = JSON.parse(target.getItem(OBSERVATION_KEY) ?? 'null');
    if (object(previous) && previous.attemptId === record.attemptId && previous.createdAt === record.createdAt
      && previous.expiresAt === record.expiresAt && typeof previous.lastObservedAt === 'number'
      && Number.isSafeInteger(previous.lastObservedAt) && previous.lastObservedAt >= record.createdAt
      && previous.lastObservedAt < record.expiresAt && previous.lastObservedAt > now) {
      rollbackWriteFloor = Math.max(rollbackWriteFloor, previous.lastObservedAt);
      return false;
    }
    if (now < rollbackWriteFloor) return false;
    // This is expiry/clock metadata only: an old observer cannot rewrite payment identity or evidence.
    target.setItem(OBSERVATION_KEY, JSON.stringify({ version: 1, attemptId: record.attemptId,
      createdAt: record.createdAt, expiresAt: record.expiresAt, lastObservedAt: now }));
    scheduleCleanup(record.expiresAt);
    return true;
  } catch { return false; }
}

function readSubmission(record: PaymentRecoveryRecord): SubmissionProof | null {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(SUBMISSION_KEY) ?? 'null');
    if (!object(value) || value.version !== 1 || value.attemptId !== record.attemptId
      || value.bookingIdentifier !== record.bookingIdentifier || value.createdAt !== record.createdAt
      || value.expiresAt !== record.expiresAt || !identifier(value.ownerId) || typeof value.protected !== 'boolean'
      || !['prepared', 'submitted', 'unresolved', 'failed', 'approved'].includes(String(value.phase))
      || (value.sessionHash !== null && (typeof value.sessionHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.sessionHash)))) return null;
    return { version: 1, ownerId: value.ownerId, protected: value.protected,
      phase: value.phase as SubmissionProof['phase'], sessionHash: value.sessionHash as string | null,
      attemptId: record.attemptId, bookingIdentifier: record.bookingIdentifier,
      createdAt: record.createdAt, expiresAt: record.expiresAt };
  } catch {
    return null;
  }
}

function persistSubmission(proof: SubmissionProof): boolean {
  if (proof.protected && protectedOwners.size === 0) return false;
  try {
    const target = storage();
    if (!target) return false;
    const serialized = JSON.stringify(proof);
    target.setItem(SUBMISSION_KEY, serialized);
    scheduleCleanup(proof.expiresAt);
    return target.getItem(SUBMISSION_KEY) === serialized;
  } catch {
    return false;
  }
}

function ownedRecord(record: PaymentRecoveryRecord, ownership: PaymentRecoveryOwnership) {
  if (!activeOwners.has(ownership.ownerId)) return null;
  const current = readPaymentRecovery();
  return current && current.attemptId === record.attemptId && current.createdAt === record.createdAt
    && current.bookingIdentifier === record.bookingIdentifier && current.kind === record.kind ? current : null;
}

/** Hold one current-version checkout owner across tabs; unsupported browsers retain legacy recovery. */
export async function acquirePaymentRecoveryOwnership(): Promise<PaymentRecoveryOwnership | null> {
  if (pendingOwnershipRelease) await pendingOwnershipRelease.catch(() => undefined);
  const ownerId = globalThis.crypto?.randomUUID?.() ?? (globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('') : null);
  if (!ownerId) return null;
  const manager = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!manager?.request) {
    activeOwners.add(ownerId);
    return { ownerId, protected: false, release: () => { activeOwners.delete(ownerId); } };
  }
  return new Promise((resolve) => {
    const request = manager.request(OWNERSHIP_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      activeOwners.add(ownerId);
      protectedOwners.add(ownerId);
      let releaseLock: () => void = () => undefined;
      const held = new Promise<void>((release) => { releaseLock = release; });
      resolve({ ownerId, protected: true, release: () => {
        activeOwners.delete(ownerId); protectedOwners.delete(ownerId); releaseLock();
        pendingOwnershipRelease = request;
      } });
      await held;
    }).catch(() => resolve(null));
    void request.finally(() => { if (pendingOwnershipRelease === request) pendingOwnershipRelease = null; });
  });
}

export function initializePaymentRecoverySubmission(record: PaymentRecoveryRecord, ownership: PaymentRecoveryOwnership): boolean {
  const current = ownedRecord(record, ownership);
  if (!current || current.outcome !== 'pending' || current.returnConsumed || current.submission) return false;
  if (!ownership.protected) return true;
  return persistSubmission({ version: 1, ownerId: ownership.ownerId, protected: true, phase: 'prepared',
    attemptId: current.attemptId, bookingIdentifier: current.bookingIdentifier, createdAt: current.createdAt,
    expiresAt: current.expiresAt, sessionHash: current.sessionHash });
}

export function markPaymentRecoverySubmitted(record: PaymentRecoveryRecord, ownership: PaymentRecoveryOwnership): boolean {
  const current = ownedRecord(record, ownership);
  if (!current || current.outcome !== 'pending' || current.returnConsumed || !current.sessionHash) return false;
  const proof = readSubmission(current);
  if (ownership.protected && (!proof || proof.ownerId !== ownership.ownerId || proof.phase !== 'prepared'
    || proof.sessionHash !== current.sessionHash)) return false;
  if (proof && (proof.ownerId !== ownership.ownerId || proof.phase !== 'prepared')) return false;
  const next: SubmissionProof = { version: 1, ownerId: ownership.ownerId, protected: ownership.protected,
    phase: 'submitted', attemptId: current.attemptId, bookingIdentifier: current.bookingIdentifier,
    createdAt: current.createdAt, expiresAt: current.expiresAt, sessionHash: current.sessionHash };
  return persistSubmission(next) && ownedRecord(record, ownership)?.submission?.phase === 'submitted';
}

export function failUnsubmittedPaymentRecovery(record: PaymentRecoveryRecord, ownership: PaymentRecoveryOwnership): boolean {
  const current = ownedRecord(record, ownership);
  const proof = current && readSubmission(current);
  if (!ownership.protected || !current || current.outcome !== 'pending' || current.returnConsumed
    || !proof?.protected || proof.ownerId !== ownership.ownerId || proof.phase !== 'prepared'
    || !proof.sessionHash || proof.sessionHash !== current.sessionHash) return false;
  return persistSubmission({ ...proof, phase: 'failed' }) && setPaymentRecoveryOutcome(current.attemptId, 'failed');
}

/** A paid lookup in another tab may approve only while the checkout owner has released its lease. */
export async function approvePaymentRecovery(attemptId: string): Promise<boolean> {
  const before = readPaymentRecovery();
  if (!before || before.attemptId !== attemptId) return false;
  if (activeOwners.size > 0) return setPaymentRecoveryOutcome(attemptId, 'approved');
  const ownership = await acquirePaymentRecoveryOwnership();
  if (!ownership) return false;
  try {
    const current = readPaymentRecovery();
    return current?.attemptId === attemptId && current.createdAt === before.createdAt
      && setPaymentRecoveryOutcome(attemptId, 'approved');
  } finally { ownership.release(); }
}

export function readPaymentRecovery(): PaymentRecoveryRecord | null {
  lastReadFailed = false;
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) {
      if (target.getItem(SUBMISSION_KEY) || target.getItem(OBSERVATION_KEY)) queueCleanup();
      return null;
    }
    const value: unknown = JSON.parse(raw);
    const now = Date.now();
    if (object(value) && typeof value.lastObservedAt === 'number' && Number.isSafeInteger(value.lastObservedAt)
      && value.lastObservedAt > now) rollbackWriteFloor = Math.max(rollbackWriteFloor, value.lastObservedAt);
    const record = normalize(value, now);
    if (!record) {
      queueCleanup();
      return null;
    }
    // Reading never mutates/removes the base purchase: another tab may have replaced it.
    if (!observe(record, now)) {
      lastReadFailed = true;
      return null;
    }
    const proof = readSubmission(record);
    if (proof) {
      record.submission = proof;
      if (proof.sessionHash) record.sessionHash = proof.sessionHash;
      if (proof.phase === 'approved') record.outcome = 'approved';
      else if (proof.phase === 'failed' && record.outcome !== 'approved') record.outcome = 'failed';
      else if (proof.phase === 'unresolved' && record.outcome === 'pending') record.outcome = 'unknown';
    } else record.submission = null;
    return record;
  } catch {
    lastReadFailed = true;
    queueCleanup();
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
  if (!current) {
    // Losing the base record does not erase an unexpired proof that payment may still be in flight.
    try {
      const proof: unknown = JSON.parse(storage()?.getItem(SUBMISSION_KEY) ?? 'null');
      if (object(proof) && typeof proof.expiresAt === 'number' && now < proof.expiresAt
        && proof.phase !== 'failed' && proof.phase !== 'approved') return null;
    } catch { return null; }
  }
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
  const proof = readSubmission(current);
  if (proof && (!activeOwners.has(proof.ownerId) || proof.phase !== 'prepared')) return false;
  if (!persist({ ...current, sessionHash: hash })) return false;
  return !proof || (activeOwners.has(proof.ownerId) && proof.phase === 'prepared'
    && persistSubmission({ ...proof, sessionHash: hash }));
}

export function setPaymentRecoveryOutcome(attemptId: string, nextOutcome: PaymentRecoveryOutcome): boolean {
  const current = readPaymentRecovery();
  if (!current || current.attemptId !== attemptId || !outcome(nextOutcome)) return false;
  if (current.outcome === 'approved' && nextOutcome !== 'approved') return false;
  if (current.outcome === 'failed' && nextOutcome !== 'failed' && nextOutcome !== 'approved') return false;
  if (nextOutcome === 'pending' && current.outcome !== 'pending') return false;
  const proof = readSubmission(current);
  if (proof) {
    if (proof.protected && protectedOwners.size === 0) return false;
    const phase = nextOutcome === 'approved' ? 'approved' : nextOutcome === 'failed' ? 'failed'
      : nextOutcome === 'unknown' && proof.phase === 'prepared' ? 'unresolved' : proof.phase;
    if (phase !== proof.phase && !persistSubmission({ ...proof, phase })) return false;
  }
  return persist({ ...current, outcome: nextOutcome });
}

export function claimPaymentRedirect(attemptId: string): boolean {
  const current = readPaymentRecovery();
  if (!current || current.attemptId !== attemptId || !current.sessionHash || current.returnConsumed
    || current.outcome === 'approved' || current.outcome === 'failed') return false;
  const proof = readSubmission(current);
  if (proof?.protected && protectedOwners.size === 0) return false;
  if (proof && !persistSubmission({ ...proof, phase: 'unresolved' })) return false;
  return persist({ ...current, returnConsumed: true, outcome: 'unknown' });
}

export function clearPaymentRecovery(attemptId?: string): boolean {
  const target = storage();
  if (!target || activeOwners.size === 0) return false;
  try {
    const current = readPaymentRecovery();
    if (attemptId !== undefined && current?.attemptId !== attemptId) return false;
    if (!current || current.outcome === 'unknown') return false;
    const proof = current && readSubmission(current);
    if (proof?.protected && protectedOwners.size === 0) return false;
    if (current.outcome === 'pending' && proof && (proof.phase !== 'prepared' || !activeOwners.has(proof.ownerId))) return false;
    // All shared-key deletion is serialized with checkout creation, including terminal UI cleanup.
    if (proof) target.removeItem(SUBMISSION_KEY);
    const observation: unknown = JSON.parse(target.getItem(OBSERVATION_KEY) ?? 'null');
    if (object(observation) && observation.attemptId === current.attemptId
      && observation.createdAt === current.createdAt) target.removeItem(OBSERVATION_KEY);
    target.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** A terminal UI action may clear only the exact generation it observed, while holding the writer lease. */
export async function clearPaymentRecoveryAfterCompletion(
  attemptId: string,
  beforeClear?: () => boolean | void,
): Promise<boolean> {
  const before = readPaymentRecovery();
  if (!before || before.attemptId !== attemptId || (before.outcome !== 'approved' && before.outcome !== 'failed')) return false;
  const ownership = activeOwners.size ? null : await acquirePaymentRecoveryOwnership();
  if (!activeOwners.size && !ownership) return false;
  try {
    const current = readPaymentRecovery();
    if (!current || current.attemptId !== attemptId || current.createdAt !== before.createdAt
      || current.bookingIdentifier !== before.bookingIdentifier || current.kind !== before.kind
      || current.outcome !== before.outcome) return false;
    if (beforeClear?.() === false) return false;
    return clearPaymentRecovery(attemptId);
  } catch { return false; }
  finally { ownership?.release(); }
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
