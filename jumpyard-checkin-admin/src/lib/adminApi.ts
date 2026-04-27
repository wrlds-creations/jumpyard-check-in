export type HandoutKind = "physical" | "experience";

export interface HandoutItem {
  id: string;
  label: string;
  qty: number;
  kind: HandoutKind;
}

export interface AdminCheckin {
  id: string;
  bookingId: string;
  shortCode: string;
  guestName: string;
  email: string;
  jumpers: number;
  time: string;
  status: "ready";
  redeemedAt: string | null;
  handoutItems: HandoutItem[];
}

type MockAddonId = "connected" | "socks" | "lock" | "skyrider" | "coffee";

interface MockAddon {
  id: MockAddonId;
  label: string;
  qty: number;
}

interface MockBooking {
  bookingId: string;
  shortCode: string;
  guestName: string;
  email: string;
  jumpers: number;
  time: string;
  addons: MockAddon[];
}

const PHYSICAL_ADDONS = new Set<MockAddonId>(["connected", "socks", "lock"]);

const MOCK_BOOKINGS: MockBooking[] = [
  {
    bookingId: "BOOK-A274",
    shortCode: "A274",
    guestName: "Sara Andersson",
    email: "sara.andersson@example.com",
    jumpers: 4,
    time: "14:00-15:00",
    addons: [
      { id: "connected", label: "Connected band", qty: 2 },
      { id: "socks", label: "Jump socks", qty: 4 },
      { id: "skyrider", label: "SkyRider", qty: 1 },
    ],
  },
  {
    bookingId: "BOOK-L902",
    shortCode: "L902",
    guestName: "Leo Johansson",
    email: "leo.johansson@example.com",
    jumpers: 2,
    time: "15:30-16:30",
    addons: [
      { id: "socks", label: "Jump socks", qty: 2 },
      { id: "lock", label: "Padlock", qty: 1 },
    ],
  },
  {
    bookingId: "BOOK-C113",
    shortCode: "C113",
    guestName: "Nora Karlsson",
    email: "nora.karlsson@example.com",
    jumpers: 3,
    time: "13:00-14:00",
    addons: [
      { id: "connected", label: "Connected band", qty: 3 },
      { id: "socks", label: "Jump socks", qty: 3 },
    ],
  },
  {
    bookingId: "BOOK-L117",
    shortCode: "L117",
    guestName: "Lou Andersson",
    email: "lou.andersson@example.com",
    jumpers: 5,
    time: "16:00-17:00",
    addons: [
      { id: "connected", label: "Connected band", qty: 5 },
      { id: "socks", label: "Jump socks", qty: 5 },
      { id: "lock", label: "Padlock", qty: 1 },
    ],
  },
  {
    bookingId: "BOOK-L442",
    shortCode: "L442",
    guestName: "Lisa Andersberg",
    email: "lisa.andersberg@example.com",
    jumpers: 3,
    time: "12:30-13:30",
    addons: [
      { id: "socks", label: "Jump socks", qty: 3 },
      { id: "skyrider", label: "SkyRider", qty: 2 },
    ],
  },
  {
    bookingId: "BOOK-K808",
    shortCode: "K808",
    guestName: "Klara Andreasson",
    email: "klara.andreasson@example.com",
    jumpers: 2,
    time: "17:30-18:30",
    addons: [
      { id: "connected", label: "Connected band", qty: 1 },
      { id: "socks", label: "Jump socks", qty: 2 },
    ],
  },
  {
    bookingId: "BOOK-A519",
    shortCode: "A519",
    guestName: "Amir Andersson",
    email: "amir.andersson@example.com",
    jumpers: 6,
    time: "18:00-19:00",
    addons: [
      { id: "socks", label: "Jump socks", qty: 6 },
      { id: "lock", label: "Padlock", qty: 2 },
    ],
  },
  {
    bookingId: "BOOK-E231",
    shortCode: "E231",
    guestName: "Ella Sandberg",
    email: "ella.sandberg@example.com",
    jumpers: 1,
    time: "11:00-12:00",
    addons: [
      { id: "connected", label: "Connected band", qty: 1 },
      { id: "socks", label: "Jump socks", qty: 1 },
    ],
  },
];

const generatedCheckins = new Map<string, AdminCheckin>();

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildHandoutItems(booking: MockBooking): HandoutItem[] {
  const items: HandoutItem[] = [
    {
      id: "wristbands",
      label: "Wristbands",
      qty: booking.jumpers,
      kind: "physical",
    },
  ];

  for (const addon of booking.addons) {
    items.push({
      id: addon.id,
      label: addon.label,
      qty: addon.qty,
      kind: PHYSICAL_ADDONS.has(addon.id) ? "physical" : "experience",
    });
  }

  return items;
}

function createCheckin(booking: MockBooking): AdminCheckin {
  return {
    id: `CHK-${booking.shortCode}`,
    bookingId: booking.bookingId,
    shortCode: booking.shortCode,
    guestName: booking.guestName,
    email: booking.email,
    jumpers: booking.jumpers,
    time: booking.time,
    status: "ready",
    redeemedAt: null,
    handoutItems: buildHandoutItems(booking),
  };
}

const seededCheckins = MOCK_BOOKINGS.map((booking) => createCheckin(booking));

function cloneCheckin(checkin: AdminCheckin): AdminCheckin {
  return {
    ...checkin,
    handoutItems: checkin.handoutItems.map((item) => ({ ...item })),
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function normalizeLookupInput(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  if (upper.startsWith("JY:")) {
    const [, bookingId] = upper.split(":");
    return bookingId?.trim() ?? "";
  }

  return upper.replace(/[^A-Z0-9-]/g, "");
}

function createFallbackCheckin(identifier: string): AdminCheckin {
  const valueHash = hash(identifier);
  const shortCode = identifier.slice(-4).padStart(4, "X");
  const jumpers = 1 + (valueHash % 5);
  const minute = valueHash % 2 === 0 ? "00" : "30";
  const startHour = 12 + (valueHash % 7);
  const endHour = startHour + 1;
  const addons: MockAddon[] = [];

  if (valueHash % 2 === 0) {
    addons.push({ id: "socks", label: "Jump socks", qty: jumpers });
  }

  if (valueHash % 5 === 0) {
    addons.push({ id: "connected", label: "Connected band", qty: Math.max(1, Math.floor(jumpers / 2)) });
  }

  if (valueHash % 7 === 0) {
    addons.push({ id: "lock", label: "Padlock", qty: 1 });
  }

  const booking = {
    bookingId: identifier.startsWith("BOOK-") ? identifier : `BOOK-${identifier}`,
    shortCode,
    guestName: `Guest ${shortCode}`,
    email: `guest-${shortCode.toLowerCase()}@example.com`,
    jumpers,
    time: `${String(startHour).padStart(2, "0")}:${minute}-${String(endHour).padStart(2, "0")}:${minute}`,
    addons,
  };

  return createCheckin(booking);
}

function allCheckins(): AdminCheckin[] {
  return [...seededCheckins, ...generatedCheckins.values()];
}

function findCheckin(identifier: string): AdminCheckin | null {
  const normalized = normalizeLookupInput(identifier);
  if (!normalized) return null;

  const exact = allCheckins().find(
    (checkin) =>
      checkin.id === normalized ||
      checkin.bookingId === normalized ||
      checkin.shortCode === normalized
  );

  if (exact) return exact;

  const fallback = createFallbackCheckin(normalized);
  generatedCheckins.set(fallback.id, fallback);
  return fallback;
}

function normalizeSearchInput(input: string): string {
  return input.trim().toLowerCase();
}

export function searchCheckins(query: string): AdminCheckin[] {
  const normalized = normalizeSearchInput(query);
  if (normalized.length < 2) return [];

  return allCheckins()
    .filter((checkin) => {
      const searchable = [
        checkin.guestName,
        checkin.email,
        checkin.shortCode,
        checkin.bookingId,
      ].join(" ").toLowerCase();

      return searchable.includes(normalized);
    })
    .slice(0, 8)
    .map(cloneCheckin);
}

export async function lookupCheckin(codeOrQrPayload: string): Promise<AdminCheckin> {
  await delay(350);

  const checkin = findCheckin(codeOrQrPayload);
  if (!checkin) {
    throw new Error("Enter a check-in code.");
  }

  return cloneCheckin(checkin);
}

export async function redeemCheckin(checkinId: string): Promise<AdminCheckin> {
  await delay(500);

  const checkin = allCheckins().find((item) => item.id === checkinId);
  if (!checkin) {
    throw new Error("Check-in could not be found.");
  }

  return cloneCheckin(checkin);
}
