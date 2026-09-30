/**
 * #458 (D0231): the guest is done the moment the payment is approved, while ROLLER confirms the
 * booking in the background. Two late lookups ask Cloud to fetch ROLLER's paid booking, which
 * attaches it to the provisional handoff even if ROLLER's webhook is late. Nothing waits on them
 * and failures are ignored.
 */
export const ROLLER_CONFIRMATION_NUDGE_DELAYS_MS = [15_000, 60_000] as const;

export function scheduleRollerConfirmationNudges(
  lookup: (identifier: string) => Promise<unknown>,
  identifier: string,
  schedule: (callback: () => void, delayMs: number) => unknown = (callback, delayMs) => setTimeout(callback, delayMs),
) {
  if (!identifier) return;
  for (const delayMs of ROLLER_CONFIRMATION_NUDGE_DELAYS_MS) {
    schedule(() => {
      void lookup(identifier).catch(() => undefined);
    }, delayMs);
  }
}
