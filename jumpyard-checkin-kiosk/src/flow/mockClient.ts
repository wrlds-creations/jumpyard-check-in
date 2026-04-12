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

// TODO: POST /api/cloud/walkin { sessionSlotId, jumpers, contactEmail, contactPhone }
export async function buyWalkIn(
  jumpers: number,
  contactEmail: string | null,
  contactPhone: string | null
): Promise<Booking> {
  await delay(1000);
  void contactEmail;
  void contactPhone;
  return {
    id: 'WALKIN_' + Math.floor(Math.random() * 9000 + 1000),
    jumpers,
    time: '15:00',
    endTime: '16:00',
    durationMinutes: 60,
    date: 'Today',
    products: 0,
    paid: false,
    existingAddons: [],
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
