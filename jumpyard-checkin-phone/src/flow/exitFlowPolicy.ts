import type { AddonsOfferStep } from '@/components/AddonsOffer';
import type { BuyTicketsStep } from '@/components/BuyTickets';
import type { CheckInSession, FlowState } from '@/flow/types';

export type ExitFlowMode = 'hidden' | 'confirm';

const SAFETY_LOCKED_STATES = new Set<FlowState>([
  'APP_SAFETY_VIDEO',
  'APP_SAFETY_ATTEST',
  'APP_CONFIRM',
  'APP_PRESENT',
  'KIOSK_PRINT',
]);

const START_STATES = new Set<FlowState>([
  'IDLE',
  'APP_START',
  'APP_MOBILE',
  'KIOSK_ENTRY',
  'KIOSK_CHOICE',
]);

export function hasReachedSafety(
  state: FlowState,
  session: CheckInSession | null
) {
  if (SAFETY_LOCKED_STATES.has(state)) return true;
  if (session?.guestResumeStep === 'safety') return true;

  const status = `${session?.status ?? ''}`.toLowerCase();
  const handoffStatus = `${session?.handoffStatus ?? ''}`.toLowerCase();
  const safetyStatus = `${session?.safetyStatus ?? ''}`.toLowerCase();

  return (
    status === 'ready_for_staff' ||
    status === 'completed' ||
    status === 'redeemed' ||
    handoffStatus === 'ready_for_staff' ||
    handoffStatus === 'completed' ||
    safetyStatus === 'completed'
  );
}

export function getExitFlowMode({
  addonsStep,
  buyStep,
  safetyLocked = false,
  session,
  state,
}: {
  addonsStep: AddonsOfferStep;
  buyStep: BuyTicketsStep;
  safetyLocked?: boolean;
  session: CheckInSession | null;
  state: FlowState;
}): ExitFlowMode {
  if (START_STATES.has(state) || safetyLocked || hasReachedSafety(state, session)) return 'hidden';

  if (state === 'KIOSK_BUY' && (buyStep === 'PAYMENT' || buyStep === 'PENDING')) {
    return 'hidden';
  }

  if (
    state === 'APP_ADDONS' &&
    (addonsStep === 'PAYMENT' || addonsStep === 'APPROVED' || addonsStep === 'PENDING')
  ) {
    return 'hidden';
  }

  if (state === 'APP_PAYMENT') return 'hidden';

  return 'confirm';
}
