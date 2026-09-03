import type { AddonId, FlowState } from './types';

export type BuyFlowRecoveryBuyStep =
  | 'TIMESLOT'
  | 'PRODUCT'
  | 'QUANTITY'
  | 'ADDONS'
  | 'SKYRIDER_ATTEST'
  | 'CONTACT'
  | 'REVIEW';

export type BuyFlowRecoveryStep =
  | BuyFlowRecoveryBuyStep
  | 'PAYMENT'
  | 'PENDING'
  | 'APP_SAFETY_VIDEO'
  | 'APP_SAFETY_ATTEST'
  | 'APP_CONFIRM'
  | 'APP_PRESENT';

export interface BuyFlowRecoveryProduct {
  key?: string | null;
  productId: string | null;
  label: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  type: 'entry' | 'family' | 'combo' | null;
  unitPrice: number | null;
}

export interface BuyFlowRecoveryDraftState {
  bookingReference: string | null;
  uniqueId: string | null;
  prepaymentDraftId: string | null;
  amountOwing: number | null;
  status: string | null;
  paymentApproved: boolean;
  paymentRequired: boolean;
}

export type BuyFlowRecoveryAddonQty = Partial<Record<AddonId, number>>;

export interface BuyFlowRecoveryContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface BuyFlowRecoveryCompletion {
  bookingIdentifier: string;
  status: 'ready_for_staff' | 'completed';
}

export interface BuyFlowRecoverySnapshot {
  version: 1;
  updatedAt: string;
  expiresAt: string;
  lastObservedAt: string;
  currentFlowStep: BuyFlowRecoveryStep;
  bookingReference: string | null;
  draftUniqueId: string | null;
  selectedStartTime: string | null;
  selectedProduct: BuyFlowRecoveryProduct | null;
  jumperCount: number | null;
  quantity?: number | null;
  addonQty?: BuyFlowRecoveryAddonQty;
  alreadyHasApprovedSocks?: boolean;
  alreadyHasWaterBottle?: boolean;
  skyriderConsentConfirmed?: boolean;
  contact?: BuyFlowRecoveryContact | null;
  paymentOptionsHadValues?: boolean;
  draftState: BuyFlowRecoveryDraftState | null;
  /** Local evidence of the completed guest flow; current payment guards still take precedence. */
  completion?: BuyFlowRecoveryCompletion | null;
}

const STORAGE_KEY = 'jumpyard.buyFlowRecovery.v1';
const STORAGE_UPDATED_EVENT = 'jumpyard:buy-flow-recovery-updated';
export const BUY_FLOW_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LAST_OBSERVED_PERSIST_INTERVAL_MS = 60 * 1000;

interface ActiveCleanupDeadline {
  deadline: number;
  expiresAt: string;
  updatedAt: string;
}

let activeCleanupDeadline: ActiveCleanupDeadline | null = null;
let rollbackWriteFloor: number | null = null;

function getStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyRecoveryUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(STORAGE_UPDATED_EVENT));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecoveryStep(value: unknown): value is BuyFlowRecoveryStep {
  return (
    value === 'TIMESLOT' ||
    value === 'PRODUCT' ||
    value === 'QUANTITY' ||
    value === 'ADDONS' ||
    value === 'SKYRIDER_ATTEST' ||
    value === 'CONTACT' ||
    value === 'REVIEW' ||
    value === 'PAYMENT' ||
    value === 'PENDING' ||
    value === 'APP_SAFETY_VIDEO' ||
    value === 'APP_SAFETY_ATTEST' ||
    value === 'APP_CONFIRM' ||
    value === 'APP_PRESENT'
  );
}

function isPrePaymentStep(value: unknown): value is BuyFlowRecoveryBuyStep {
  return (
    value === 'TIMESLOT' ||
    value === 'PRODUCT' ||
    value === 'QUANTITY' ||
    value === 'ADDONS' ||
    value === 'SKYRIDER_ATTEST' ||
    value === 'CONTACT' ||
    value === 'REVIEW'
  );
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveIntegerOrNull(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readProduct(value: unknown): BuyFlowRecoveryProduct | null {
  if (!isObject(value)) return null;
  const type = value.type === 'entry' || value.type === 'family' || value.type === 'combo' ? value.type : null;
  return {
    durationMinutes: numberOrNull(value.durationMinutes),
    key: stringOrNull(value.key),
    label: stringOrNull(value.label),
    productId: stringOrNull(value.productId),
    startTime: stringOrNull(value.startTime),
    type,
    unitPrice: numberOrNull(value.unitPrice),
  };
}

function readDraftState(value: unknown): BuyFlowRecoveryDraftState | null {
  if (!isObject(value)) return null;
  return {
    amountOwing: numberOrNull(value.amountOwing),
    bookingReference: stringOrNull(value.bookingReference),
    paymentApproved: value.paymentApproved === true,
    paymentRequired: value.paymentRequired === true,
    prepaymentDraftId: stringOrNull(value.prepaymentDraftId),
    status: stringOrNull(value.status),
    uniqueId: stringOrNull(value.uniqueId),
  };
}

function readAddonQty(value: unknown): BuyFlowRecoveryAddonQty | undefined {
  if (!isObject(value)) return undefined;
  const next: BuyFlowRecoveryAddonQty = {};
  const ids: AddonId[] = ['skyrider', 'connected', 'coffee', 'extra_person', 'lock', 'socks', 'water_bottle'];
  for (const id of ids) {
    const qty = value[id];
    if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) {
      next[id] = qty;
    }
  }
  return next;
}

function readContact(value: unknown): BuyFlowRecoveryContact | null {
  if (!isObject(value)) return null;
  return {
    email: typeof value.email === 'string' ? value.email : '',
    firstName: typeof value.firstName === 'string' ? value.firstName : '',
    lastName: typeof value.lastName === 'string' ? value.lastName : '',
    phone: typeof value.phone === 'string' ? value.phone : '',
  };
}

function storedObservationTime(value: unknown): number | null {
  if (!isObject(value) || value.version !== 1) return null;
  const updatedTime = Date.parse(stringOrNull(value.updatedAt) ?? '');
  const lastObservedTime = Date.parse(stringOrNull(value.lastObservedAt) ?? '');
  const validTimes = [updatedTime, lastObservedTime].filter(Number.isFinite);
  return validTimes.length > 0 ? Math.max(...validTimes) : null;
}

function completionBookingIdentifier(value: unknown): string | null {
  if (!isObject(value) || Array.isArray(value) || !isObject(value.draftState) || Array.isArray(value.draftState)
    || value.draftState.paymentApproved !== true || value.draftState.paymentRequired !== false) return null;
  const draft = value.draftState;
  const identifiers = [value.bookingReference, draft.bookingReference, value.draftUniqueId, draft.uniqueId];
  if (identifiers.some(id => id !== null && id !== undefined
    && (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(id)))) return null;
  if (value.bookingReference != null && draft.bookingReference != null && value.bookingReference !== draft.bookingReference) return null;
  if (value.draftUniqueId != null && draft.uniqueId != null && value.draftUniqueId !== draft.uniqueId) return null;
  return identifiers.find(id => typeof id === 'string') as string | undefined ?? null;
}

/** Completion can offer an explicit new purchase, but never proves an unresolved payment was cancelled. */
export function hasCompletedBuyFlowRecovery(snapshot: unknown): boolean {
  const identifier = completionBookingIdentifier(snapshot);
  if (!identifier || !isObject(snapshot)) return false;
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'completion')) {
    // The legacy safety writer reached APP_PRESENT only after completion or already-redeemed recovery.
    return snapshot.currentFlowStep === 'APP_PRESENT' && isObject(snapshot.draftState)
      && snapshot.draftState.prepaymentDraftId == null;
  }
  const completion = snapshot.completion;
  if (!isObject(completion) || Array.isArray(completion) || completion.bookingIdentifier !== identifier) return false;
  return (snapshot.currentFlowStep === 'APP_CONFIRM' && completion.status === 'ready_for_staff')
    || (snapshot.currentFlowStep === 'APP_PRESENT' && completion.status === 'completed');
}

function readCompletion(value: unknown): Pick<BuyFlowRecoverySnapshot, 'completion'> {
  if (!isObject(value)) return { completion: null };
  if (!Object.prototype.hasOwnProperty.call(value, 'completion')) {
    // Do not let normalization of malformed legacy flags/ids manufacture completion evidence.
    return value.currentFlowStep === 'APP_PRESENT' && !hasCompletedBuyFlowRecovery(value) ? { completion: null } : {};
  }
  if (!hasCompletedBuyFlowRecovery(value) || !isObject(value.completion)) return { completion: null };
  return { completion: {
    bookingIdentifier: value.completion.bookingIdentifier as string,
    status: value.completion.status as BuyFlowRecoveryCompletion['status'],
  } };
}

function normalizeSnapshot(value: unknown): BuyFlowRecoverySnapshot | null {
  if (!isObject(value) || value.version !== 1 || !isRecoveryStep(value.currentFlowStep)) return null;

  const updatedAt = stringOrNull(value.updatedAt);
  const draftState = readDraftState(value.draftState);
  if (!updatedAt || (!draftState && !isPrePaymentStep(value.currentFlowStep))) return null;

  const updatedTime = Date.parse(updatedAt);
  const now = Date.now();
  const expectedExpiresTime = updatedTime + BUY_FLOW_RECOVERY_MAX_AGE_MS;
  const suppliedExpiresAt = stringOrNull(value.expiresAt);
  const suppliedExpiresTime = suppliedExpiresAt ? Date.parse(suppliedExpiresAt) : expectedExpiresTime;
  const suppliedLastObservedAt = stringOrNull(value.lastObservedAt) ?? updatedAt;
  const suppliedLastObservedTime = Date.parse(suppliedLastObservedAt);
  if (
    !Number.isFinite(updatedTime)
    || !Number.isFinite(expectedExpiresTime)
    || !Number.isFinite(suppliedExpiresTime)
    || !Number.isFinite(suppliedLastObservedTime)
    || suppliedExpiresTime !== expectedExpiresTime
    || suppliedLastObservedTime < updatedTime
    || suppliedLastObservedTime > expectedExpiresTime
    || updatedTime > now
    || suppliedLastObservedTime > now
    || now >= expectedExpiresTime
  ) return null;

  const observedTime = now - suppliedLastObservedTime >= LAST_OBSERVED_PERSIST_INTERVAL_MS
    ? now
    : suppliedLastObservedTime;

  return {
    ...readCompletion(value),
    addonQty: readAddonQty(value.addonQty),
    alreadyHasApprovedSocks: value.alreadyHasApprovedSocks === true,
    alreadyHasWaterBottle: value.alreadyHasWaterBottle === true,
    bookingReference: stringOrNull(value.bookingReference),
    contact: readContact(value.contact),
    currentFlowStep: value.currentFlowStep,
    draftState,
    draftUniqueId: stringOrNull(value.draftUniqueId),
    expiresAt: new Date(expectedExpiresTime).toISOString(),
    jumperCount: numberOrNull(value.jumperCount),
    lastObservedAt: new Date(observedTime).toISOString(),
    paymentOptionsHadValues: value.paymentOptionsHadValues === true,
    quantity: positiveIntegerOrNull(value.quantity),
    selectedProduct: readProduct(value.selectedProduct),
    selectedStartTime: stringOrNull(value.selectedStartTime),
    skyriderConsentConfirmed: value.skyriderConsentConfirmed === true,
    updatedAt: new Date(updatedTime).toISOString(),
    version: 1,
  };
}

export function getBuyFlowRecoveryIdentifier(snapshot: BuyFlowRecoverySnapshot | null) {
  return snapshot?.bookingReference ?? snapshot?.draftState?.bookingReference ?? snapshot?.draftUniqueId ?? snapshot?.draftState?.uniqueId ?? null;
}

export function getBuyFlowRecoveryTargetState(snapshot: BuyFlowRecoverySnapshot | null): FlowState {
  return snapshot?.currentFlowStep === 'APP_SAFETY_ATTEST' ? 'APP_SAFETY_ATTEST' : 'APP_SAFETY_VIDEO';
}

export function isPrePaymentBuyFlowRecovery(snapshot: BuyFlowRecoverySnapshot | null): snapshot is BuyFlowRecoverySnapshot {
  return Boolean(snapshot && !getBuyFlowRecoveryIdentifier(snapshot) && isPrePaymentStep(snapshot.currentFlowStep));
}

export function readBuyFlowRecovery() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const storedValue = storage.getItem(STORAGE_KEY);
    const parsed = storedValue ? JSON.parse(storedValue) : null;
    const observationTime = storedObservationTime(parsed);
    if (observationTime !== null && Date.now() < observationTime) {
      rollbackWriteFloor = Math.max(rollbackWriteFloor ?? 0, observationTime);
    }
    const snapshot = normalizeSnapshot(parsed);
    if (!snapshot) {
      activeCleanupDeadline = null;
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    const normalizedValue = JSON.stringify(snapshot);
    if (normalizedValue !== storedValue) storage.setItem(STORAGE_KEY, normalizedValue);
    return snapshot;
  } catch {
    activeCleanupDeadline = null;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can disappear while a page is suspended; recovery remains optional.
    }
    return null;
  }
}

export function writeBuyFlowRecovery(
  snapshot: Omit<BuyFlowRecoverySnapshot, 'version' | 'updatedAt' | 'expiresAt' | 'lastObservedAt'>,
) {
  const storage = getStorage();
  if (!storage) return;

  const now = Date.now();

  try {
    const storedValue = storage.getItem(STORAGE_KEY);
    const observationTime = storedValue
      ? storedObservationTime(JSON.parse(storedValue))
      : null;
    const requiredFloor = Math.max(rollbackWriteFloor ?? 0, observationTime ?? 0);
    if (requiredFloor > now) {
      rollbackWriteFloor = requiredFloor;
      activeCleanupDeadline = null;
      storage.removeItem(STORAGE_KEY);
      notifyRecoveryUpdated();
      return;
    }
    rollbackWriteFloor = null;
  } catch {
    activeCleanupDeadline = null;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can disappear while a page is suspended; recovery remains optional.
    }
  }

  const updatedAt = new Date(now).toISOString();

  const next: BuyFlowRecoverySnapshot = {
    ...snapshot,
    ...readCompletion(snapshot),
    expiresAt: new Date(now + BUY_FLOW_RECOVERY_MAX_AGE_MS).toISOString(),
    lastObservedAt: updatedAt,
    updatedAt,
    version: 1,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    activeCleanupDeadline = null;
    notifyRecoveryUpdated();
  } catch {
    // Storage can be unavailable in private modes; recovery should never block checkout.
  }
}

export function clearBuyFlowRecovery() {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
    activeCleanupDeadline = null;
    notifyRecoveryUpdated();
  } catch {
    // Recovery cleanup should never block the active checkout flow.
  }
}

export function startBuyFlowRecoveryCleanup() {
  const storage = getStorage();
  if (!storage || typeof window === 'undefined') return () => undefined;

  let timeoutId: number | null = null;
  const ownerDocument = typeof document === 'undefined' ? null : document;

  const monotonicNow = () => {
    const value = window.performance?.now();
    return Number.isFinite(value) ? value : Date.now();
  };

  const clearScheduledCleanup = () => {
    if (timeoutId === null) return;
    window.clearTimeout(timeoutId);
    timeoutId = null;
  };

  const scheduleCleanup = () => {
    clearScheduledCleanup();

    const snapshot = readBuyFlowRecovery();
    if (!snapshot) {
      activeCleanupDeadline = null;
      return;
    }

    const now = Date.now();
    const monotonicTime = monotonicNow();
    const expiresAt = Date.parse(snapshot.expiresAt);
    const wallClockRemaining = Math.max(0, expiresAt - now);
    if (
      !activeCleanupDeadline
      || activeCleanupDeadline.updatedAt !== snapshot.updatedAt
      || activeCleanupDeadline.expiresAt !== snapshot.expiresAt
    ) {
      activeCleanupDeadline = {
        deadline: monotonicTime + Math.min(
          BUY_FLOW_RECOVERY_MAX_AGE_MS,
          wallClockRemaining,
        ),
        expiresAt: snapshot.expiresAt,
        updatedAt: snapshot.updatedAt,
      };
    }

    const monotonicRemaining = activeCleanupDeadline.deadline - monotonicTime;
    if (wallClockRemaining <= 0 || monotonicRemaining <= 0) {
      activeCleanupDeadline = null;
      clearBuyFlowRecovery();
      return;
    }

    const delay = Math.max(1, Math.min(
      LAST_OBSERVED_PERSIST_INTERVAL_MS,
      BUY_FLOW_RECOVERY_MAX_AGE_MS,
      wallClockRemaining,
      monotonicRemaining,
    ));
    timeoutId = window.setTimeout(scheduleCleanup, delay);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key === STORAGE_KEY || event.key === null) scheduleCleanup();
  };

  window.addEventListener(STORAGE_UPDATED_EVENT, scheduleCleanup);
  window.addEventListener('storage', handleStorage);
  window.addEventListener('pageshow', scheduleCleanup);
  ownerDocument?.addEventListener('visibilitychange', scheduleCleanup);
  scheduleCleanup();

  return () => {
    clearScheduledCleanup();
    window.removeEventListener(STORAGE_UPDATED_EVENT, scheduleCleanup);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('pageshow', scheduleCleanup);
    ownerDocument?.removeEventListener('visibilitychange', scheduleCleanup);
  };
}
