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
  identityMode: "pin" | "legacy";
  lastActivityAt?: string;
  lastHeartbeatAt?: string;
  refreshToken?: string;
  session?: StaffIdentitySession;
  staff: {
    actorId?: string;
    displayName: string;
    environment?: string;
    permissions?: StaffPermission[];
    role?: StaffRole;
    venueId?: string;
  };
}

export type StaffPermission = "staff:sessions:read" | "staff:sessions:redeem";
export type StaffRole = "staff_operator" | "staff_reader";

export type AdminPermission = "staff:identities:manage";

export interface AdminPrincipal {
  actorId: string;
  displayName: string;
  environment: string;
  permissions: AdminPermission[];
  role: "staff_admin";
  venueId: string;
}

export interface AdminAuthSession {
  auth: {
    expiresAt: string;
    token: string;
    tokenType: "Bearer";
  };
  lastActivityAt: string;
  lastHeartbeatAt: string;
  refreshToken: string;
  session: StaffIdentitySession;
  admin: AdminPrincipal;
}

export interface AdminStaffRecord {
  active: boolean;
  createdAt?: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  staffIdentityId: string;
  updatedAt?: string | null;
}

export interface StaffPrincipal {
  actorId: string;
  displayName: string;
  environment: string;
  permissions: StaffPermission[];
  role: StaffRole;
  venueId: string;
}

export interface StaffIdentitySession {
  absoluteExpiresAt: string;
  idleExpiresAt: string;
  sessionId: string;
}

export type StaffSessionAction = "heartbeat" | "logout" | "start";

export interface StaffSessionActionResult {
  principal?: StaffPrincipal;
  session: StaffIdentitySession;
  status: "staff_session_active" | "staff_session_logged_out" | "staff_session_started";
}

export interface AdminSessionActionResult {
  principal?: AdminPrincipal;
  session: StaffIdentitySession;
  status: "admin_session_active" | "admin_session_logged_out" | "admin_session_started";
}

export class StaffApiError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = "StaffApiError";
    this.code = code ?? null;
    this.status = status;
  }

  get isAuthenticationFailure() {
    return this.status === 401 || this.status === 403;
  }
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
  session?: StaffIdentitySession;
  staff?: StaffAuthSession["staff"];
  error?: {
    code?: string;
    message?: string;
  };
}

interface StaffSessionActionResponse {
  status?: StaffSessionActionResult["status"] | "forbidden" | "invalid_request" | "internal_error";
  principal?: StaffPrincipal;
  session?: StaffIdentitySession;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AdminSessionActionResponse {
  status?: AdminSessionActionResult["status"] | "forbidden" | "invalid_request" | "internal_error";
  principal?: AdminPrincipal;
  admin?: AdminPrincipal;
  session?: StaffIdentitySession;
  error?: {
    code?: string;
    message?: string;
  };
}

interface AdminStaffListResponse {
  status?: "found" | "forbidden" | "invalid_request" | "internal_error";
  staff?: AdminStaffRecord[];
  identities?: AdminStaffRecord[];
  error?: {
    code?: string;
    message?: string;
  };
}

interface AdminStaffMutationResponse {
  status?: "created" | "updated" | "forbidden" | "invalid_request" | "internal_error";
  staff?: AdminStaffRecord;
  identity?: AdminStaffRecord;
  error?: {
    code?: string;
    message?: string;
  };
}

export async function loginStaff(credential: string, identityMode: "pin" | "legacy"): Promise<StaffAuthSession> {
  const response = await fetch(`${getApiBaseUrl()}/v1/staff/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(identityMode === "legacy" ? { passcode: credential } : { pin: credential }),
  });
  const body = await parseJson<StaffAuthResponse>(response);

  if (
    !response.ok ||
    body.status !== "authenticated" ||
    !body.auth ||
    !body.staff ||
    (identityMode === "pin" && !body.session)
  ) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte logga in.");
  }

  return {
    auth: body.auth,
    identityMode,
    lastActivityAt: identityMode === "pin" ? new Date().toISOString() : undefined,
    lastHeartbeatAt: identityMode === "pin" ? new Date().toISOString() : undefined,
    session: identityMode === "pin" ? body.session : undefined,
    staff: body.staff,
  };
}

export async function manageStaffIdentitySession(
  action: StaffSessionAction,
  accessToken: string,
): Promise<StaffSessionActionResult> {
  const response = await fetch(`${getApiBaseUrl()}/v1/staff/auth/session`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const body = await parseJson<StaffSessionActionResponse>(response);
  const expectedStatus = {
    heartbeat: "staff_session_active",
    logout: "staff_session_logged_out",
    start: "staff_session_started",
  }[action];

  if (!response.ok || body.status !== expectedStatus || !body.session || (action !== "logout" && !body.principal)) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte hantera personalsessionen.");
  }

  return {
    principal: body.principal,
    session: body.session,
    status: body.status,
  } as StaffSessionActionResult;
}

export async function manageAdminIdentitySession(
  action: StaffSessionAction,
  accessToken: string,
): Promise<AdminSessionActionResult> {
  const response = await fetch(`${getApiBaseUrl()}/v1/admin/auth/session`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
  const body = await parseJson<AdminSessionActionResponse>(response);
  const expectedStatus = {
    heartbeat: "admin_session_active",
    logout: "admin_session_logged_out",
    start: "admin_session_started",
  }[action] as AdminSessionActionResult["status"];
  const principal = body.principal ?? body.admin;

  if (!response.ok || body.status !== expectedStatus || !body.session || (action !== "logout" && !principal)) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte hantera administratörssessionen.");
  }

  return {
    principal,
    session: body.session,
    status: body.status,
  } as AdminSessionActionResult;
}

export async function listAdminStaff(adminToken: string): Promise<AdminStaffRecord[]> {
  const response = await fetch(`${getApiBaseUrl()}/v1/admin/staff`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${adminToken}`,
    },
  });
  const body = await parseJson<AdminStaffListResponse>(response);
  const staff = body.staff ?? body.identities;
  if (!response.ok || body.status !== "found" || !Array.isArray(staff)) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte hämta personalen.");
  }
  return staff.filter(isAdminStaffRecord);
}

export async function createAdminStaff(
  adminToken: string,
  input: { firstName: string; lastName: string; pin: string },
): Promise<AdminStaffRecord> {
  const response = await fetch(`${getApiBaseUrl()}/v1/admin/staff`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${adminToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      pin: input.pin,
      role: "staff_operator",
    }),
  });
  const body = await parseJson<AdminStaffMutationResponse>(response);
  const staff = body.staff ?? body.identity;
  if (!response.ok || body.status !== "created" || !staff || !isAdminStaffRecord(staff)) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte skapa personalen.");
  }
  return staff;
}

export async function updateAdminStaff(
  adminToken: string,
  staffIdentityId: string,
  input: { action: "disable" | "enable" } | { action: "reset_pin"; pin: string },
): Promise<AdminStaffRecord> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/admin/staff/${encodeURIComponent(staffIdentityId)}`,
    {
      method: "PATCH",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const body = await parseJson<AdminStaffMutationResponse>(response);
  const staff = body.staff ?? body.identity;
  if (!response.ok || body.status !== "updated" || !staff || !isAdminStaffRecord(staff)) {
    throw staffApiError(response, body, "JumpYard Cloud kunde inte uppdatera personalen.");
  }
  return staff;
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
    throw staffApiError(response, body, "JumpYard Cloud kunde inte hämta handovers.");
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
    throw staffApiError(response, body, "JumpYard Cloud kunde inte hämta handoff-detaljen.");
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
    throw staffApiError(response, body, "JumpYard Cloud kunde inte slutföra incheckningen.");
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
    if (response.status === 401 || response.status === 403) {
      throw new StaffApiError("Personalsessionen är inte längre giltig.", response.status);
    }
    throw new Error("JumpYard Cloud returnerade ett tomt svar.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new StaffApiError("Personalsessionen är inte längre giltig.", response.status);
    }
    throw new Error("JumpYard Cloud returnerade ett ogiltigt svar.");
  }
}

function staffApiError(
  response: Response,
  body: { error?: { code?: string; message?: string } },
  fallbackMessage: string,
) {
  return new StaffApiError(body.error?.message ?? fallbackMessage, response.status, body.error?.code);
}

function isAdminStaffRecord(value: unknown): value is AdminStaffRecord {
  if (!value || typeof value !== "object") return false;
  const staff = value as Partial<AdminStaffRecord>;
  return (
    typeof staff.active === "boolean" &&
    typeof staff.displayName === "string" &&
    Boolean(staff.displayName.trim()) &&
    typeof staff.firstName === "string" &&
    Boolean(staff.firstName.trim()) &&
    typeof staff.lastName === "string" &&
    Boolean(staff.lastName.trim()) &&
    (staff.role === "staff_operator" || staff.role === "staff_reader") &&
    typeof staff.staffIdentityId === "string" &&
    Boolean(staff.staffIdentityId)
  );
}
