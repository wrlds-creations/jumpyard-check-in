import type { CloudDiscountCodeSummary, CloudGiftCardSummary } from './cloudClient';

export type PaymentOptionInputState = 'empty' | 'ready' | 'applied' | 'rejected';

// A current quote must explicitly report application. An empty error list alone
// is not proof that an entered code has been checked or reduced the price.
export function getPaymentOptionInputState(
  value: string,
  summary: CloudDiscountCodeSummary | CloudGiftCardSummary | undefined,
  appliedAmount: number | null
): PaymentOptionInputState {
  if (!value.trim()) return 'empty';
  if (!summary || summary.requestedCount <= 0) return 'ready';
  if (summary.errors.length > 0) return 'rejected';
  return appliedAmount !== null && Number.isFinite(appliedAmount) && appliedAmount > 0
    ? 'applied'
    : 'ready';
}
