import type { Channel, FlowContext, FlowState } from './types';

export function initialContext(channel: Channel): FlowContext {
  return {
    channel,
    token: null,
    booking: null,

    safetyVideoSeenAt: null,
    safetyAttestedAt: null,

    existingAddons: [],
    selectedAddons: [],
    addonsTotal: 0,

    skyriderSelected: false,
    skyriderHeightConfirmed: false,

    connectedSelected: false,
    connectedProfiles: [],

    paymentTotal: 0,
    paymentCompleted: false,

    guestContactEmail: null,
    guestContactPhone: null,

    baseProductId: null,
    baseProductLabel: null,
    baseProductType: null,
    baseDurationMinutes: 0,
    baseUnitPrice: 0,
    baseQuantity: 0,
    baseTotal: 0,
  };
}

export function initialState(channel: Channel): FlowState {
  if (channel === 'sms') return 'APP_MOBILE';
  if (channel === 'park-qr') return 'KIOSK_CHOICE';
  return 'IDLE';
}

// Branching from KIOSK_CHOICE is event-driven (guest picks BOOKING vs BUY).
export type Branch = 'booking' | 'buy' | null;

// Gate after addons/skyrider/connected: pick the next step.
// New ordering: addons group → [payment if needed] → safety (video + attest) → confirm.
// Safety moved to the end per Jumpyard midcheck decision (2026-04-16): payment feels
// "final" for guests, so the QR code should be gated behind safety acknowledgement
// as the last step, like check-in on an airline ticket.
function afterAddonsGroupGate(ctx: FlowContext): FlowState {
  return ctx.paymentTotal > 0 ? 'APP_PAYMENT' : 'APP_SAFETY_VIDEO';
}

function afterSkyriderGate(ctx: FlowContext): FlowState {
  if (ctx.connectedSelected) return 'APP_CONNECTED';
  return afterAddonsGroupGate(ctx);
}

export function nextState(
  current: FlowState,
  ctx: FlowContext,
  branch: Branch = null
): FlowState {
  switch (current) {
    case 'IDLE':
      return 'APP_START';

    case 'APP_START':
      return ctx.channel === 'sms' ? 'APP_MOBILE' : 'KIOSK_ENTRY';

    case 'APP_MOBILE':
      return 'APP_BOOKING';

    case 'KIOSK_ENTRY':
      return 'KIOSK_CHOICE';

    case 'KIOSK_CHOICE':
      return branch === 'buy' ? 'KIOSK_BUY' : 'KIOSK_LOOKUP';

    case 'KIOSK_LOOKUP':
    case 'KIOSK_BUY':
      return 'APP_BOOKING';

    case 'APP_BOOKING':
      return 'APP_ADDONS';

    case 'APP_ADDONS':
      if (ctx.skyriderSelected) return 'APP_SKYRIDER_ATTEST';
      return afterSkyriderGate(ctx);

    case 'APP_SKYRIDER_ATTEST':
      return afterSkyriderGate(ctx);

    case 'APP_CONNECTED':
      return afterAddonsGroupGate(ctx);

    case 'APP_PAYMENT':
      return 'APP_SAFETY_VIDEO';

    case 'APP_SAFETY_VIDEO':
      return 'APP_SAFETY_ATTEST';

    case 'APP_SAFETY_ATTEST':
      return 'APP_CONFIRM';

    case 'APP_CONFIRM':
      return ctx.channel === 'kiosk' ? 'KIOSK_PRINT' : 'APP_PRESENT';

    case 'KIOSK_PRINT':
      return 'APP_PRESENT';

    case 'APP_PRESENT':
      return 'APP_PRESENT';

    // Extension sub-flow
    case 'EXT_VIEW':
      return 'EXT_PAY';
    case 'EXT_PAY':
      return 'EXT_QR';
    case 'EXT_QR':
      return 'EXT_QR';

    default:
      return current;
  }
}

export function detectChannel(search: URLSearchParams): Channel {
  if (search.get('token')) return 'sms';
  if (search.get('park') === '1') return 'park-qr';
  return 'kiosk';
}
