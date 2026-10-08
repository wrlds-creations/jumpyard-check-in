import type { NewBookingAvailability, NewBookingAvailabilitySlot, NewBookingProduct } from './cloudClient';

/**
 * #491 (workshop 2026-10-07): every shown start time says how many 60-minute spots are left.
 * The 60-minute entry decides for the whole slot: when it is full, the slot is full.
 */
export const FEW_SPOTS_BELOW = 10;

/** Loaded availability is reused on Continue while it is this fresh (#427: no second read). */
export const SLOT_AVAILABILITY_REUSE_MS = 5 * 60 * 1000;

export type SlotCapacityState = 'unknown' | 'open' | 'few' | 'full';

export interface SlotCapacity {
  state: SlotCapacityState;
  /** Spots left on the 60-minute entry; null when ROLLER reports no number. */
  remaining: number | null;
}

/** Cloud's E60 product, or any 60-minute entry in a fixture. */
export function findSixtyMinuteEntry(slot: NewBookingAvailabilitySlot | null | undefined): NewBookingProduct | null {
  const entries = (slot?.products ?? []).filter((product) => product.type === 'entry' && product.durationMinutes === 60);
  return entries.find((product) => product.key === 'E60') ?? entries[0] ?? null;
}

export function getSlotCapacity(slot: NewBookingAvailabilitySlot | null | undefined): SlotCapacity {
  const entry = findSixtyMinuteEntry(slot);
  // No answer for this time (still loading, failed, or no 60-minute entry): the slot stays selectable
  // and the product step decides, as before #491.
  if (!entry) return { state: 'unknown', remaining: null };
  const remaining = typeof entry.capacityRemaining === 'number' && Number.isFinite(entry.capacityRemaining)
    ? Math.max(0, Math.floor(entry.capacityRemaining))
    : null;
  if (!entry.available || remaining === 0) return { state: 'full', remaining: 0 };
  if (remaining === null) return { state: 'open', remaining: null };
  return { state: remaining < FEW_SPOTS_BELOW ? 'few' : 'open', remaining };
}

export function isSlotSelectable(capacity: SlotCapacity) {
  return capacity.state !== 'full';
}

export function findAvailabilitySlot(availability: NewBookingAvailability | null | undefined, startTime: string | null) {
  if (!availability || !startTime) return null;
  return availability.slots.find((slot) => slot.startTime === startTime) ?? null;
}

/** True when one loaded answer covers every requested start time. */
export function availabilityCovers(availability: NewBookingAvailability | null | undefined, startTimes: readonly string[]) {
  return Boolean(availability && startTimes.length > 0 && startTimes.every((time) => findAvailabilitySlot(availability, time)));
}

export function isAvailabilityFresh(loadedAt: number | null, now = Date.now()) {
  return loadedAt !== null && now >= loadedAt && now - loadedAt < SLOT_AVAILABILITY_REUSE_MS;
}
