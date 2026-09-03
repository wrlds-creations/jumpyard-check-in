import type { Booking, FlowContext } from './types';

/**
 * #331: ROLLER confirms an approved phone payment slightly later than the card
 * approval. The guest continues into safety while ROLLER catches up, and the paid
 * state is confirmed again right before the staff handoff. Only that final
 * confirmation waits, and it waits with a short, sparse schedule instead of polling.
 */
export const PAID_CONFIRMATION_RETRY_DELAYS_MS = [15_000, 30_000, 60_000] as const;

/** Bounded attempts for one confirmation check when the lookup itself fails. */
export const PAID_CONFIRMATION_LOOKUP_ATTEMPTS = 3;
export const PAID_CONFIRMATION_LOOKUP_RETRY_DELAY_MS = 2_000;

export type PaidConfirmationStatus = 'paid' | 'awaiting';

export type PaidConfirmationOutcome =
  | { status: PaidConfirmationStatus; booking: Booking }
  | { status: 'unavailable' };

export type PaidConfirmationUiState = 'idle' | 'checking' | 'waiting' | 'delayed';

type ApprovedPurchaseContext = Pick<FlowContext, 'booking' | 'buyEntryFlow' | 'checkinSession' | 'paymentCompleted'>;

export function classifyPaidConfirmation(booking: Booking): PaidConfirmationStatus {
  return booking.paid === true ? 'paid' : 'awaiting';
}

/** Delay before retry number `retryIndex` (0-based); null once the schedule is exhausted. */
export function getPaidConfirmationRetryDelay(retryIndex: number): number | null {
  if (!Number.isInteger(retryIndex) || retryIndex < 0) return null;
  return PAID_CONFIRMATION_RETRY_DELAYS_MS[retryIndex] ?? null;
}

/**
 * True while an approved purchase is in the safety steps without a check-in session,
 * which only happens when ROLLER had not confirmed the payment at approval time.
 */
export function isApprovedPurchaseAwaitingConfirmation(ctx: ApprovedPurchaseContext): boolean {
  return Boolean(ctx.booking) && ctx.buyEntryFlow && ctx.paymentCompleted && ctx.checkinSession === null;
}

export function getApprovedPurchaseIdentifier(booking: Pick<Booking, 'id' | 'rollerUniqueId'> | null): string | null {
  const identifier = booking?.rollerUniqueId ?? booking?.id ?? '';
  return identifier.trim() || null;
}

function defaultWait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * One confirmation check: a single lookup, retried only when the lookup itself fails.
 * A lookup that succeeds but reports an unpaid booking is "awaiting", never a failure.
 */
export async function resolvePaidConfirmation(
  lookup: (identifier: string) => Promise<Booking>,
  identifier: string,
  options: {
    attempts?: number;
    retryDelayMs?: number;
    wait?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<PaidConfirmationOutcome> {
  const attempts = Math.max(1, options.attempts ?? PAID_CONFIRMATION_LOOKUP_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? PAID_CONFIRMATION_LOOKUP_RETRY_DELAY_MS;
  const wait = options.wait ?? defaultWait;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const booking = await lookup(identifier);
      return { status: classifyPaidConfirmation(booking), booking };
    } catch {
      if (attempt < attempts - 1) await wait(retryDelayMs);
    }
  }

  return { status: 'unavailable' };
}
