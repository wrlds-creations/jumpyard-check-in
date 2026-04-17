import type { Addon, Booking, ConnectedProfile } from './types';

// Mock stubs for JY Cloud internal API.
// TODO: Replace with real endpoints when JumpYard Cloud is available.

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// TODO: POST /api/cloud/booking/lookup { token }
export async function validateToken(token: string): Promise<Booking> {
  await delay(1200);
  return {
    id: token.toUpperCase().slice(0, 8) || 'SMS12345',
    jumpers: 3,
    time: '14:00',
    date: 'Today',
    products: 1,
    paid: true,
    guestName: 'SMS Guest',
    lastName: 'Andersson',
    endTime: '15:00',
    durationMinutes: 60,
    existingAddons: [
      { id: 'lock', label: 'Hänglås', price: 40, qty: 1 },
      { id: 'socks', label: 'Strumpor', price: 40, qty: 3 },
    ],
  };
}

// TODO: POST /api/cloud/booking/lookup { code }
export async function lookupBooking(code: string): Promise<Booking> {
  await delay(900);
  return {
    id: code.toUpperCase() || 'QR_FAMILY_123',
    jumpers: 4,
    time: '14:00',
    date: 'Today',
    products: 0,
    paid: true,
    guestName: 'Demo Family',
    lastName: 'Johansson',
    endTime: '15:00',
    durationMinutes: 60,
    existingAddons: [],
  };
}

// ----- Capacity lookup (mock) -----
// Mirrors planned GET /api/cloud/capacity?slots=HH:MM,HH:MM
// Returns which products still have capacity at each slot. Deterministic per
// (slot, productId) so the same UI state is reproducible between renders.

export type ProductId = 'E60' | 'E90' | 'E120' | 'F60' | 'F90' | 'F120';

export interface SlotCapacity {
  time: string;                               // "HH:MM"
  availableProducts: ProductId[];             // products with > 0 seats
  remainingSeats: Record<ProductId, number>;  // seats per product (0 = full)
}

const ALL_PRODUCTS: readonly ProductId[] = ['E60', 'E90', 'E120', 'F60', 'F90', 'F120'] as const;

// Simple string hash for deterministic pseudo-random per (slot, product) pair.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

// TODO: GET /api/cloud/capacity?slots={csv}
export async function getCapacityForSlots(slots: string[]): Promise<SlotCapacity[]> {
  await delay(250);
  return slots.map(time => {
    const remainingSeats = {} as Record<ProductId, number>;
    const availableProducts: ProductId[] = [];
    for (const pid of ALL_PRODUCTS) {
      const h = hash(time + '|' + pid);
      // Family products (F*) are more likely to be sold out than entry tickets.
      const soldOut = pid.startsWith('F') ? (h % 3 === 0) : (h % 5 === 0);
      const seats = soldOut ? 0 : 4 + (h % 12);
      remainingSeats[pid] = seats;
      if (seats > 0) availableProducts.push(pid);
    }
    return { time, availableProducts, remainingSeats };
  });
}

// TODO: POST /api/cloud/walkin { sessionSlotId, jumpers, contactEmail, contactPhone, product, selectedTime }
export async function buyWalkIn(
  jumpers: number,
  contactEmail: string | null,
  contactPhone: string | null,
  product: { id: string; label: string; type: 'entry' | 'family'; durationMinutes: number },
  selectedTime: string
): Promise<Booking> {
  await delay(1000);
  void contactEmail;
  void contactPhone;
  const [h, m] = selectedTime.split(':').map(Number);
  const startMin = h * 60 + m;
  const endMin = startMin + product.durationMinutes;
  const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
  return {
    id: 'WALKIN_' + Math.floor(Math.random() * 9000 + 1000),
    jumpers,
    time: selectedTime,
    endTime,
    durationMinutes: product.durationMinutes,
    date: 'Today',
    products: 0,
    paid: false,
    existingAddons: [],
    productLabel: product.label,
    productType: product.type,
  };
}

// TODO: POST /api/cloud/safety/complete { bookingId, videoSeenAt, attestedAt }
export async function submitSafety(bookingId: string): Promise<void> {
  await delay(400);
  void bookingId;
}

// TODO: POST /api/cloud/addons/update { bookingId, addons, skyriderHeightConfirmed }
export async function submitAddons(
  bookingId: string,
  addons: Addon[],
  skyriderHeightConfirmed: boolean
): Promise<void> {
  await delay(300);
  void bookingId;
  void addons;
  void skyriderHeightConfirmed;
}

// TODO: POST /api/cloud/payment { bookingId, items, total }
export async function submitPayment(bookingId: string, total: number): Promise<{ reference: string }> {
  await delay(1500);
  void bookingId;
  void total;
  return { reference: 'PAY_' + Date.now().toString().slice(-6) };
}

// TODO: POST /api/cloud/connected/profiles { bookingId, profiles }
export async function submitConnectedProfiles(
  bookingId: string,
  profiles: ConnectedProfile[]
): Promise<void> {
  await delay(300);
  void bookingId;
  void profiles;
}

// TODO: POST /api/cloud/checkin/commit { bookingId }
export async function commitCheckin(bookingId: string): Promise<{ qrPayload: string; shortCode: string }> {
  await delay(600);
  return {
    qrPayload: 'JY:' + bookingId,
    shortCode: bookingId.slice(-4).toUpperCase(),
  };
}

// ----- Extension sub-flow -----

export interface ExtensionInfo {
  bookingId: string;
  currentEnd: string;
  newEnd: string;
  price: number;
}

// TODO: POST /api/cloud/extension/validate { token }
export async function validateExtensionToken(token: string): Promise<ExtensionInfo> {
  await delay(800);
  void token;
  return {
    bookingId: 'BOOK_' + (token || 'EXT12345').toUpperCase().slice(0, 8),
    currentEnd: '15:30',
    newEnd: '16:00',
    price: 50,
  };
}

// TODO: POST /api/cloud/extension/pay { bookingId, amount }
export async function submitExtensionPayment(
  bookingId: string,
  amount: number
): Promise<{ qrToken: string; paymentRef: string }> {
  await delay(1400);
  void amount;
  return {
    qrToken: 'EXT:' + bookingId + ':' + Date.now().toString().slice(-6),
    paymentRef: 'EXTPAY_' + Date.now().toString().slice(-6),
  };
}
