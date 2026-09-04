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

export type AddonId = 'skyrider' | 'connected' | 'coffee' | 'extra_person' | 'lock' | 'socks' | 'water_bottle';

export interface Addon {
  id: AddonId;
  label: string;
  price: number;
  qty: number;
  rollerProductId?: number | null;
  requiresAvailability?: boolean;
}

// Display-only package contents supplied by Cloud; never purchase or redeem items.
export interface PackageContent {
  kind: 'admission' | 'pizza';
  quantity: number;
  collection: 'checkin' | 'later';
  durationMinutes?: number;
}

export interface BookingAdmissionItem {
  label?: string;
  quantity: number;
  durationMinutes?: number;
  packageContents?: PackageContent[];
}

export interface LookupSource {
  system: string;
  environment?: string | null;
  lookupPath?: string | null;
  freshnessStatus?: string | null;
  refreshedFromRoller?: boolean;
}

export interface CheckInSession {
  checkinSessionId: string;
  status: string;
  guestResumeStep?: 'safety' | null;
  guestAccessToken?: string;
  guestAccessExpiresAt?: string | null;
  handoffStatus?: string | null;
  handoffCode?: string | null;
  safetyStatus?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
}

// GH-338: exact payment state reported by JumpYard Cloud lookup eligibility.
export type BookingPaymentState = 'paid' | 'partially_paid' | 'pending' | 'unpaid' | 'unknown';

export interface Booking {
  id: string;
  rollerUniqueId?: string | null;
  guestAccessToken?: string;
  guestAccessExpiresAt?: string | null;
  jumpers: number;
  time: string;
  endTime?: string;
  durationMinutes?: number;
  date?: string;
  products: number;
  paid: boolean;
  paymentState?: BookingPaymentState;
  paymentStatus?: string | null;
  amountOwing?: number | null;
  guestName?: string;
  lastName?: string;
  existingAddons?: Addon[];
  productLabel?: string;
  productType?: 'entry' | 'family' | 'combo';
  admissionItems?: BookingAdmissionItem[];
  lookupSource?: LookupSource;
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
  checkinSession: CheckInSession | null;
  buyEntryFlow: boolean;

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

  baseProductId: string | null;
  baseProductLabel: string | null;
  baseProductType: 'entry' | 'family' | 'combo' | null;
  baseDurationMinutes: number;
  baseUnitPrice: number;
  baseQuantity: number;
  baseTotal: number;
}
