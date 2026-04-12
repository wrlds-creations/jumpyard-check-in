// Mirrors WebApp lane in jumpyard-processes/editor/src/data/pilotFlow.ts.
// Keep FlowState enum 1:1 with pilot node ids.

export type Channel = 'sms' | 'park-qr' | 'kiosk';

export type FlowState =
  | 'IDLE'
  | 'APP_START'
  | 'APP_MOBILE'
  | 'KIOSK_ENTRY'
  | 'KIOSK_CHOICE'
  | 'KIOSK_LOOKUP'
  | 'KIOSK_BUY'
  | 'APP_BOOKING'
  | 'APP_SAFETY_VIDEO'
  | 'APP_SAFETY_ATTEST'
  | 'APP_ADDONS'
  | 'APP_SKYRIDER_ATTEST'
  | 'APP_CONNECTED'
  | 'APP_PAYMENT'
  | 'APP_CONFIRM'
  | 'KIOSK_PRINT'
  | 'APP_PRESENT'
  // Extension sub-flow (separate entry point, not part of the check-in chain)
  | 'EXT_VIEW'
  | 'EXT_PAY'
  | 'EXT_QR';

export type AddonId = 'skyrider' | 'connected' | 'coffee' | 'extra_person' | 'lock' | 'socks';

export interface Addon {
  id: AddonId;
  label: string;
  price: number;
  qty: number;
}

export interface Booking {
  id: string;
  jumpers: number;
  time: string;
  endTime?: string;
  durationMinutes?: number;
  date?: string;
  products: number;
  paid: boolean;
  guestName?: string;
  lastName?: string;
  existingAddons?: Addon[];
}

export interface ConnectedProfile {
  id: number;
  name: string;
  icon: string;
}

export interface FlowContext {
  channel: Channel;
  token: string | null;
  booking: Booking | null;

  safetyVideoSeenAt: string | null;
  safetyAttestedAt: string | null;

  existingAddons: Addon[];
  selectedAddons: Addon[];
  addonsTotal: number;

  skyriderSelected: boolean;
  skyriderHeightConfirmed: boolean;

  connectedSelected: boolean;
  connectedProfiles: ConnectedProfile[];

  paymentTotal: number;
  paymentCompleted: boolean;

  guestContactEmail: string | null;
  guestContactPhone: string | null;
}
