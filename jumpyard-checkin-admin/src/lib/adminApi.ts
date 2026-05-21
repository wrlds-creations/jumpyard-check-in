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

export interface StaffSessionSummary {
  booking: StaffBookingSummary;
  bookingReference: string | null;
  checkinSessionId: string;
  completedAt: string | null;
  counts: StaffSessionCounts;
  createdAt: string | null;
  expiresAt: string | null;
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

export async function listReadyStaffSessions(): Promise<StaffSessionSummary[]> {
  const response = await fetch(`${getApiBaseUrl()}/v1/staff/check-in/sessions`, {
    headers: {
      accept: "application/json",
    },
  });
  const body = await parseJson<StaffListResponse>(response);

  if (!response.ok || body.status !== "found") {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte hamta personalhandovers.");
  }

  return (body.sessions ?? []).filter((session) => Boolean(session.checkinSessionId));
}

export async function getStaffSession(checkinSessionId: string): Promise<StaffSessionDetail> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/staff/check-in/sessions/${encodeURIComponent(checkinSessionId)}`,
    {
      headers: {
        accept: "application/json",
      },
    }
  );
  const body = await parseJson<StaffDetailResponse>(response);

  if (!response.ok || body.status !== "found" || !body.session) {
    throw new Error(body.error?.message ?? "JumpYard Cloud kunde inte hamta handoff-detaljen.");
  }

  return body.session;
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
