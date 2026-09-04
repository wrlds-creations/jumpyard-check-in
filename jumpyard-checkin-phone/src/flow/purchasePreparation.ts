import type { Booking } from './types';
import type { PaidConfirmationOutcome } from './paidBookingConfirmation';

/** Initial booking availability only; #331's later paid/handoff schedule stays separate. */
export const PURCHASE_PREPARATION_RETRY_DELAYS_MS = [5_000, 15_000] as const;
export const PURCHASE_PREPARATION_TIMEOUT_MS = 45_000;

type PreparationOptions = {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  timeoutMs?: number;
};

function preparationError(name: 'AbortError' | 'TimeoutError') {
  const error = new Error(name === 'TimeoutError' ? 'Purchase preparation timed out.' : 'Purchase preparation was cancelled.');
  error.name = name;
  return error;
}

/**
 * Bound both the request and its response body. Racing also releases the caller
 * if a transport fails to settle after abort; its late result is never accepted.
 * The caller's signal cancels immediately on replacement or unmount.
 */
export async function runPurchasePreparationRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: PreparationOptions = {},
): Promise<T> {
  const isCurrent = options.isCurrent ?? (() => true);
  if (options.signal?.aborted || !isCurrent()) throw preparationError('AbortError');

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? PURCHASE_PREPARATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw preparationError('TimeoutError');

  let stop: (error: Error) => void = () => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    stop = (error) => {
      controller.abort(error);
      reject(error);
    };
  });
  const cancel = () => stop(preparationError('AbortError'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => stop(preparationError('TimeoutError')), timeoutMs);

  const assertCurrent = () => {
    if (controller.signal.aborted || options.signal?.aborted || !isCurrent()) {
      const error = preparationError('AbortError');
      controller.abort(error);
      throw error;
    }
  };

  try {
    const result = await Promise.race([
      Promise.resolve().then(() => {
        assertCurrent();
        return request(controller.signal);
      }),
      cancelled,
    ]);
    assertCurrent();
    return result;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(preparationError('AbortError'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(preparationError('AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * At most three sequential lookups across one deadline. Retry only a failed
 * lookup: a returned booking is ready for safety even when still marked unpaid.
 */
export async function resolvePurchasePreparation(
  lookup: (identifier: string, options?: { signal?: AbortSignal }) => Promise<Booking>,
  identifier: string,
  options: PreparationOptions & { wait?: (ms: number) => Promise<unknown> } = {},
): Promise<PaidConfirmationOutcome> {
  try {
    return await runPurchasePreparationRequest(async (signal) => {
      const isCurrent = () => !signal.aborted && (options.isCurrent?.() ?? true);
      for (let attempt = 0; attempt <= PURCHASE_PREPARATION_RETRY_DELAYS_MS.length; attempt += 1) {
        if (!isCurrent()) return { status: 'unavailable' };
        try {
          const booking = await lookup(identifier, { signal });
          if (!isCurrent()) return { status: 'unavailable' };
          return { status: booking.paid === true ? 'paid' : 'awaiting', booking };
        } catch {
          if (!isCurrent()) return { status: 'unavailable' };
          const delay = PURCHASE_PREPARATION_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) break;
          await (options.wait ? options.wait(delay) : waitForRetry(delay, signal));
        }
      }
      return { status: 'unavailable' };
    }, options);
  } catch {
    return { status: 'unavailable' };
  }
}
