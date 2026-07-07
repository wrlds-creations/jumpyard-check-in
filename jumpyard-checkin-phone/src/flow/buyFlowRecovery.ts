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
  type: 'entry' | 'family' | null;
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

export interface BuyFlowRecoverySnapshot {
  version: 1;
  updatedAt: string;
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
}

const STORAGE_KEY = 'jumpyard.buyFlowRecovery.v1';
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function hasStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
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
  const type = value.type === 'entry' || value.type === 'family' ? value.type : null;
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

function normalizeSnapshot(value: unknown): BuyFlowRecoverySnapshot | null {
  if (!isObject(value) || value.version !== 1 || !isRecoveryStep(value.currentFlowStep)) return null;

  const updatedAt = stringOrNull(value.updatedAt);
  const draftState = readDraftState(value.draftState);
  if (!updatedAt || (!draftState && !isPrePaymentStep(value.currentFlowStep))) return null;

  const updatedTime = Date.parse(updatedAt);
  if (!Number.isFinite(updatedTime) || Date.now() - updatedTime > MAX_AGE_MS) return null;

  return {
    addonQty: readAddonQty(value.addonQty),
    alreadyHasApprovedSocks: value.alreadyHasApprovedSocks === true,
    alreadyHasWaterBottle: value.alreadyHasWaterBottle === true,
    bookingReference: stringOrNull(value.bookingReference),
    contact: readContact(value.contact),
    currentFlowStep: value.currentFlowStep,
    draftState,
    draftUniqueId: stringOrNull(value.draftUniqueId),
    jumperCount: numberOrNull(value.jumperCount),
    paymentOptionsHadValues: value.paymentOptionsHadValues === true,
    quantity: positiveIntegerOrNull(value.quantity),
    selectedProduct: readProduct(value.selectedProduct),
    selectedStartTime: stringOrNull(value.selectedStartTime),
    skyriderConsentConfirmed: value.skyriderConsentConfirmed === true,
    updatedAt,
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
  if (!hasStorage()) return null;

  try {
    const snapshot = normalizeSnapshot(window.localStorage.getItem(STORAGE_KEY) ? JSON.parse(window.localStorage.getItem(STORAGE_KEY)!) : null);
    if (!snapshot) window.localStorage.removeItem(STORAGE_KEY);
    return snapshot;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeBuyFlowRecovery(snapshot: Omit<BuyFlowRecoverySnapshot, 'version' | 'updatedAt'>) {
  if (!hasStorage()) return;

  const next: BuyFlowRecoverySnapshot = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in private modes; recovery should never block checkout.
  }
}

export function clearBuyFlowRecovery() {
  if (!hasStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
