const DEFAULT_CLOUD_API_BASE_URL = "https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com";
export const STAFF_BOARD_PAGE_INTERVAL_MS = 300;

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
  admission?: number;
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
  bookingSyncStatus: 'pending' | 'confirmed' | 'needs_staff' | string;
  checkinSessionId: string;
  completedAt: string | null;
  counts: StaffSessionCounts;
  createdAt: string | null;
  expiresAt: string | null;
  guest: StaffGuestIdentity | null;
  handoffCode: string | null;
  handoffDay?: string | null;
  checkedInBy?: { actorId?: string; displayName?: string } | null;
  claims?: HandoutClaim[];
  cafeQuantity?: number;
  cafeRemaining?: number;
  cafeSession?: Pick<StaffSessionSummary, "checkinSessionId" | "handoffCode" | "handoffDay" | "completedAt" | "checkedInBy" | "status" | "handoffStatus"> | null;
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

export interface StaffPackageContent {
  kind: "admission" | "pizza";
  /** Total contents for this booking item's purchased package quantity. */
  quantity: number;
  collection: "checkin" | "later";
  durationMinutes?: number;
}

export interface StaffBookingItem {
  bookingDate: string | null;
  bookingItemId: string | null;
  bookingItemKey: string | null;
  durationMinutes?: number | null;
  endTime: string | null;
  fulfillmentSource?: "original" | "linked_add_on" | "provisional" | string | null;
  linkedBookingReference?: string | null;
  linkedRollerUniqueId?: string | null;
  packageContents?: StaffPackageContent[];
  parentProductId: string | null;
  parentProductName: string | null;
  parentType?: string | null;
  productId: string | null;
  productName: string | null;
  productSubType?: string | null;
  productType?: string | null;
  quantity: number;
  startTime: string | null;
  summary?: Record<string, unknown>;
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
  handout?: HandoutState;
}

export type HandoutArea = "entrance" | "cafe";
export interface HandoutSelection { id: string; quantity: number }
export interface HandoutItem extends HandoutSelection {
  area: HandoutArea;
  kind: string;
  name: string;
  detail: string | null;
  collected: number;
  available?: number;
}
export interface HandoutClaim {
  area: HandoutArea;
  actorId: string | null;
  actorName: string | null;
  expiresAt: string;
  revision: number;
  selection: HandoutSelection[];
  pendingOperation: string | null;
  checkinSessionId: string;
}
export interface HandoutReceipt {
  operationId: string;
  area: HandoutArea;
  actorId: string;
  actorName: string;
  items: HandoutItem[];
  completedAt: string;
}
export interface HandoutState {
  claims: HandoutClaim[];
  items: HandoutItem[];
  receipts: HandoutReceipt[];
}
export interface HandoutRequest {
  area: HandoutArea;
  action: "select" | "release" | "confirm";
  revision: number;
  selection?: HandoutSelection[];
}
export interface HandoutResult {
  status: string;
  completed?: boolean;
  handout: HandoutState;
  session: Partial<StaffSessionSummary>;
}

export type StaffRedeemRecovery = "local_receipt" | "roller_ticket_status";

export interface StaffRedeemResult {
  /** #333: set when JumpYard Cloud completed a redemption Roller had already accepted. */
  recovered: StaffRedeemRecovery | null;
  redeemedTicketIds: string[];
  roller?: {
    statusCode?: number | null;
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
  heartbeatRetryCount?: number;
  heartbeatRetryAt?: string;
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

const STAFF_AUTHENTICATION_FAILURE_CODES = new Set<string>([
  "staff_auth_session_absolute_expired",
  "staff_auth_session_idle_expired",
  "staff_auth_session_invalid",
  "staff_auth_session_required",
  "staff_auth_session_revoked",
  "staff_auth_token_expired",
  "staff_auth_token_invalid",
  "staff_auth_token_required",
  "staff_auth_token_revoked",
  "staff_identity_audience_invalid",
  "staff_identity_claims_invalid",
  "staff_identity_claims_required",
  "staff_identity_not_authorized",
  "staff_legacy_token_disabled",
  "staff_pin_reenrollment_required",
]);

export function isStaffAuthenticationFailure(code: string | null) {
  return Boolean(code && STAFF_AUTHENTICATION_FAILURE_CODES.has(code));
}

export class StaffApiError extends Error {
  readonly code: string | null;
  readonly status: number;
  recoveryTarget?: { checkinSessionId: string; area: HandoutArea };

  constructor(message: string, status: number, code?: string | null) {
    super(message);
    this.name = "StaffApiError";
    this.code = code ?? null;
    this.status = status;
  }

  get isAuthenticationFailure() {
    return isStaffAuthenticationFailure(this.code);
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
  recovered?: string | null;
  redeemedTicketIds?: string[];
  roller?: {
    statusCode?: number | null;
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
  // Bound both the request and response body. Only heartbeat is retried by the caller.
  const controller = action === "heartbeat" ? new AbortController() : undefined;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 15_000) : undefined;
  let response: Response | undefined;
  try {
    response = await fetch(`${getApiBaseUrl()}/v1/staff/auth/session`, {
      method: "POST",
      signal: controller?.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action }),
    });
    // An auth rejection is definitive even if its body is missing or unreadable.
    if (response.status === 401 || response.status === 403) {
      throw new StaffApiError("Personalsessionen är inte längre giltig.", response.status);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new StaffApiError("Kontakten med JumpYard Cloud avbröts.", response.ok ? 0 : response.status);
    }
    let body: StaffSessionActionResponse;
    try {
      body = JSON.parse(text) as StaffSessionActionResponse;
      if (!body || typeof body !== "object") throw new Error("Invalid response");
    } catch {
      // Preserve 429/5xx even when a gateway returns HTML or an empty body.
      throw new StaffApiError("JumpYard Cloud returnerade ett ogiltigt svar.", response.status);
    }
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
  } catch (error) {
    if (error instanceof StaffApiError) throw error;
    if (!response) throw new StaffApiError("Kontakten med JumpYard Cloud avbröts.", 0);
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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

export async function listReadyStaffSessions(staffToken: string, query?: string, day?: string): Promise<StaffSessionSummary[]> {
  const params = new URLSearchParams();
  if (day) params.set("view", "board");
  if (day) params.set("day", day);
  const trimmedQuery = query?.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  const sessions: StaffSessionSummary[] = [];
  const cursors = new Set<string>();
  for (let page = 0; page < 50; page += 1) {
    const pageStartedAt = Date.now();
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`${getApiBaseUrl()}/v1/staff/check-in/sessions${suffix}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${staffToken}`,
      },
    });
    const body = await parseJson<StaffListResponse & { nextCursor?: string | null }>(response);
    if (!response.ok || body.status !== "found") {
      throw staffApiError(response, body, "JumpYard Cloud kunde inte hämta handovers.");
    }
    sessions.push(...(body.sessions ?? []).filter((session) => Boolean(session.checkinSessionId)));
    if (!body.nextCursor) return sessions;
    if (cursors.has(body.nextCursor)) break;
    cursors.add(body.nextCursor);
    params.set("cursor", body.nextCursor);
    // Bound simultaneous whole-day pagination across the park's staff phones.
    const pause = STAFF_BOARD_PAGE_INTERVAL_MS - (Date.now() - pageStartedAt);
    if (pause > 0) await new Promise<void>((resolve) => setTimeout(resolve, pause));
  }
  throw new Error("Alla bokningar kunde inte hämtas. Sök efter gästen eller uppdatera igen.");
}

export async function changeStaffHandout(checkinSessionId: string, staffToken: string, request: HandoutRequest): Promise<HandoutResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${getApiBaseUrl()}/v1/staff/check-in/sessions/${encodeURIComponent(checkinSessionId)}/handout`, {
      method: "POST",
      signal: controller.signal,
      headers: { accept: "application/json", authorization: `Bearer ${staffToken}`, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = await parseJson<HandoutResult & { checkinSessionId?: string; area?: HandoutArea; error?: { code?: string; message?: string } }>(response);
    if (!response.ok || body.status !== "ok") {
      const error = staffApiError(response, body, "Utlämningen kunde inte bekräftas. Kontrollera status och försök igen.");
      if (body.checkinSessionId && (body.area === "entrance" || body.area === "cafe")) {
        error.recoveryTarget = { checkinSessionId: body.checkinSessionId, area: body.area };
      }
      throw error;
    }
    return body;
  } finally { clearTimeout(timeout); }
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
    recovered: body.recovered === "local_receipt" || body.recovered === "roller_ticket_status" ? body.recovered : null,
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
