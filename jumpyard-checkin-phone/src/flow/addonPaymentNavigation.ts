import type { AddonsOfferStep } from '@/components/AddonsOffer';
import type { FlowState } from '@/flow/types';

export type AddonPaymentFailure = 'failed' | 'unknown' | null;

/**
 * #330: what the shared Back action may do while the add-on offer is shown.
 *
 * - `page`: the offer has nothing of its own to go back to; the page-level Back state applies.
 * - `select`: Back returns to the add-on selection and keeps the basket. Before submission the
 *   fresh attempt is discarded; after a confirmed failure the failed attempt is closed first.
 * - `hidden`: no Back at all. A submitted or unresolved payment must reach its own outcome, and
 *   an approved add-on may only continue forward into safety.
 */
export type AddonBackRule = 'page' | 'select' | 'hidden';

export function getAddonBackRule({
  step,
  paymentNavigationLocked,
  paymentFailure,
}: {
  step: AddonsOfferStep;
  paymentNavigationLocked: boolean;
  paymentFailure: AddonPaymentFailure;
}): AddonBackRule {
  if (step === 'SELECT') return 'page';
  if (step === 'APPROVED') return 'hidden';
  if (step === 'PAYMENT' && (paymentNavigationLocked || paymentFailure === 'unknown')) return 'hidden';
  return 'select';
}

export type FlowBackAction = 'addons' | 'page' | null;

/** Which Back action the shared navigation row offers, if any. */
export function getFlowBackAction({
  state,
  backState,
  addonsBackRule,
}: {
  state: FlowState;
  backState: FlowState | null;
  addonsBackRule: AddonBackRule;
}): FlowBackAction {
  if (state === 'APP_ADDONS') {
    if (addonsBackRule === 'hidden') return null;
    if (addonsBackRule === 'select') return 'addons';
  }
  return backState ? 'page' : null;
}
