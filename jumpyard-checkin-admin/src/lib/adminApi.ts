const DEFAULT_CLOUD_API_BASE_URL = "https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com";

export interface StaffBookingSummary {
  amountOwingCents: number | null;
  bookingDate: string | null;
  bookingStatus: string | null;
  endTime: string | null;
  freshnessStatus: string | null;
  paymentStatus: string | null;
  startTime: string | null;
  totalCents: number | null;
}

export interface StaffSessionCounts {
  bookingItems: number;
  selectedTickets: number;
  tickets: number;
}

export interface StaffGuestIdentity {
  emailMasked: string | null;
  name: string | null;
  phoneMasked: string | null;
}

export interface StaffSessionSummary {
  booking: StaffBookingSummary;
  bookingReference: string | null;
  checkinSessionId: string;
  completedAt: string | null;
  counts: StaffSessionCounts;
  createdAt: string | null;
  expiresAt: string | null;
  guest: StaffGuestIdentity | null;
  handoffCode: string | null;
  handoffStatus: string | null;
  isExpired: boolean;
  readyForStaffAt: string | null;
  rollerUniqueId: string | null;
  safetyStatus: string | null;
  selectedTicketIds: string[];
  status: string | null;
  updatedAt: string | null;
  visitDate: string | null;
}

export interface StaffBookingItem {
  bookingDate: string | null;
  bookingItemId: string | null;
  bookingItemKey: string | null;
  endTime: string | null;
  fulfillmentSource?: "original" | "linked_add_on" | string | null;
  linkedBookingReference?: string | null;
  linkedRollerUniqueId?: string | null;
  parentProductId: string | null;
  parentProductName: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number;
  startTime: string | null;
}

export interface StaffBookingTicket {
  bookingDate: string | null;
  bookingItemId: string | null;
  customTicketId: string | null;
  expiryDate: string | null;
  lastSeenFromRollerAt: string | null;
  productId: string | null;
  redeemStatusLastSeen: string | null;
  selectedForCheckIn: boolean;
  ticketId: string | null;
}

export interface StaffSessionDetail extends StaffSessionSummary {
  items: StaffBookingItem[];
  tickets: StaffBookingTicket[];
}

export interface StaffRedeemResult {
  redeemedTicketIds: string[];
  roller?: {
    statusCode?: number;
  };
  session: Partial<StaffSessionSummary> & {
    checkinSessionId: string;
  };
}

export interface StaffAuthSession {
  auth: {
    expiresAt: string;
    token: string;
    tokenType: "Bearer";
  };
  staff: {
    displayName: string;
  };
}

interface StaffListResponse {
  status: "found" | "not_found" | "invalid_request" | "internal_error";
  sessions?: StaffSessionSummary[];
  error?: {
    code?: string;
    message?: string;
  };
}

interface StaffDetailResponse {
  status: "found" | "not_found" | "invalid_request" | "internal_error";
  session?: StaffSessionDetail;
  error?: {
    code?: string;
    message?: string;
  };
}

interface StaffRedeemResponse {
  status: "redeemed" | "blocked" | "forbidden" | "not_found" | "invalid_request" | "internal_error" | "roller_error";
  redeemedTicketIds?: string[];
  roller?: {
    statusCode?: number;
  };
  session?: Partial<StaffSessionSummary> & {
    checkinSessionId: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface StaffAuthResponse {
  status: "authenticated" | "forbidden" | "invalid_request" | "internal_error";
  auth?: StaffAuthSession["auth"];
  staff?: StaffAuthSession["staff"];
  error?: {
    code?: string;
    message?: string;
  };
}

export async function loginStaff(passcode: string): Promise<StaffAuthSession> {
  const response = await fetch(`${getApiBaseUrl()}/v1/staff/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ passcode }),
  });
  const body = await parseJson<StaffAuthResponse>(response);

  if (!response.ok || body.status !== "authenticated" || !body.auth || !body.staff) {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte logga in.");
  }

  return {
    auth: body.auth,
    staff: body.staff,
  };
}

export async function listReadyStaffSessions(staffToken: string, query?: string): Promise<StaffSessionSummary[]> {
  const params = new URLSearchParams();
  const trimmedQuery = query?.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${getApiBaseUrl()}/v1/staff/check-in/sessions${suffix}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${staffToken}`,
    },
  });
  const body = await parseJson<StaffListResponse>(response);

  if (!response.ok || body.status !== "found") {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte hämta handovers.");
  }

  return (body.sessions ?? []).filter((session) => Boolean(session.checkinSessionId));
}

export async function getStaffSession(checkinSessionId: string, staffToken: string): Promise<StaffSessionDetail> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/staff/check-in/sessions/${encodeURIComponent(checkinSessionId)}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${staffToken}`,
      },
    }
  );
  const body = await parseJson<StaffDetailResponse>(response);

  if (!response.ok || body.status !== "found" || !body.session) {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte hämta handoff-detaljen.");
  }

  return body.session;
}

export async function redeemStaffSession({
  checkinSessionId,
  idempotencyKey,
  staffToken,
}: {
  checkinSessionId: string;
  idempotencyKey: string;
  staffToken: string;
}): Promise<StaffRedeemResult> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/staff/check-in/sessions/${encodeURIComponent(checkinSessionId)}/redeem`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${staffToken}`,
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        confirmRedeem: true,
        idempotencyKey,
      }),
    }
  );
  const body = await parseJson<StaffRedeemResponse>(response);

  if (!response.ok || body.status !== "redeemed" || !body.session) {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte slutföra incheckningen.");
  }

  return {
    redeemedTicketIds: body.redeemedTicketIds ?? [],
    roller: body.roller,
    session: body.session,
  };
}

function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL || DEFAULT_CLOUD_API_BASE_URL;
  return configured.replace(/\/+$/, "");
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    throw new Error("JumpYard Cloud returnerade ett tomt svar.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("JumpYard Cloud returnerade ett ogiltigt svar.");
  }
}
