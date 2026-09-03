import {
  manageStaffIdentitySession,
  StaffApiError,
  type StaffAuthSession,
  type StaffPrincipal,
} from "@/lib/adminApi";

export type StaffIdentityMode = "pin" | "legacy";
export type StaffSessionExpiryReason = "absolute" | "idle" | "token";

export interface StaffLogoutChannel {
  broadcast: () => void;
  close: () => void;
}

const LEGACY_STORAGE_KEY = "jumpyard_staff_auth_v1";
const PIN_STORAGE_KEY = "jumpyard_staff_auth_v3";
const LOGOUT_CHANNEL_NAME = "jumpyard_staff_logout_v2";
const LOGOUT_SIGNAL = Object.freeze({ type: "staff_logout", version: 2 });
const LOCAL_INACTIVITY_MS = 15 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_RETRY_BASE_MS = 30_000;
const HEARTBEAT_RETRY_MAX_MS = 120_000;
const heartbeatsInFlight = new Map<string, { auth: StaffAuthSession; promise: Promise<StaffAuthSession> }>();

const STAFF_IDENTITY_MODE = process.env.NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE;

export function openStaffLogoutChannel(onRemoteLogout: () => void): StaffLogoutChannel {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") {
    return { broadcast() {}, close() {} };
  }

  const channel = new window.BroadcastChannel(LOGOUT_CHANNEL_NAME);
  let closed = false;
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (!isStaffLogoutSignal(event.data)) return;
    onRemoteLogout();
  };
  channel.addEventListener("message", handleMessage);

  return {
    broadcast() {
      if (closed) return;
      channel.postMessage(LOGOUT_SIGNAL);
    },
    close() {
      if (closed) return;
      closed = true;
      channel.removeEventListener("message", handleMessage);
      channel.close();
    },
  };
}

export function getStaffIdentityMode(): StaffIdentityMode {
  return STAFF_IDENTITY_MODE?.trim().toLowerCase() === "legacy" ? "legacy" : "pin";
}

export function readStoredStaffAuth(): StaffAuthSession | null {
  if (typeof window === "undefined") return null;

  const mode = getStaffIdentityMode();
  const storageKey = mode === "pin" ? PIN_STORAGE_KEY : LEGACY_STORAGE_KEY;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffAuthSession;
    if (!isStoredStaffAuthShape(parsed, mode)) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function storeStaffAuth(auth: StaffAuthSession | null) {
  if (typeof window === "undefined") return;

  if (!auth) {
    clearStaffAuthStorage();
    return;
  }

  const pin = auth.identityMode === "pin";
  window.sessionStorage.removeItem(pin ? LEGACY_STORAGE_KEY : PIN_STORAGE_KEY);
  window.sessionStorage.setItem(pin ? PIN_STORAGE_KEY : LEGACY_STORAGE_KEY, JSON.stringify(auth));
}

export function clearStaffAuthStorage() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PIN_STORAGE_KEY);
  window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function getStaffSessionExpiryReason(
  auth: StaffAuthSession | null,
  now = Date.now(),
): StaffSessionExpiryReason | null {
  if (!auth?.auth.token || parseTime(auth.auth.expiresAt) <= now) return "token";
  if (auth.identityMode === "legacy") return null;

  const absoluteExpiresAt = parseTime(auth.session?.absoluteExpiresAt);
  if (!absoluteExpiresAt || absoluteExpiresAt <= now) return "absolute";

  const localIdleExpiresAt = parseTime(auth.lastActivityAt) + LOCAL_INACTIVITY_MS;
  const serverIdleExpiresAt = parseTime(auth.session?.idleExpiresAt);
  if (!serverIdleExpiresAt || Math.min(localIdleExpiresAt, serverIdleExpiresAt) <= now) return "idle";

  return null;
}

export function markStaffActivity(auth: StaffAuthSession, now = new Date()) {
  if (auth.identityMode !== "pin") return auth;
  if (!readMatchingStoredPinSession(auth)) return auth;

  const updated: StaffAuthSession = {
    ...auth,
    lastActivityAt: now.toISOString(),
  };
  storeStaffAuth(updated);
  return updated;
}

export function isStaffHeartbeatDue(auth: StaffAuthSession, now = Date.now()) {
  if (auth.identityMode !== "pin") return false;
  if (auth.heartbeatRetryAt) return now >= parseTime(auth.heartbeatRetryAt);
  return now - parseTime(auth.lastHeartbeatAt) >= HEARTBEAT_INTERVAL_MS;
}

export function canStaffRedeem(auth: StaffAuthSession | null) {
  if (!auth) return false;
  if (auth.identityMode === "legacy") return true;
  return (
    auth.staff.role === "staff_operator" &&
    Array.isArray(auth.staff.permissions) &&
    auth.staff.permissions.includes("staff:sessions:redeem")
  );
}

export async function ensureFreshStaffAuth(auth: StaffAuthSession): Promise<StaffAuthSession> {
  if (auth.identityMode === "legacy") {
    if (getStaffSessionExpiryReason(auth)) throw new Error("Personalsessionen har gått ut.");
    return auth;
  }
  if (!readMatchingStoredPinSession(auth)) throw new Error("Personalsessionen har avslutats.");
  if (getStaffSessionExpiryReason(auth)) throw new Error("Personalsessionen har gått ut.");
  return auth;
}

export function heartbeatStaffAuth(auth: StaffAuthSession): Promise<StaffAuthSession> {
  const key = auth.session?.sessionId ?? "legacy";
  const pending = heartbeatsInFlight.get(key);
  if (pending && pending.auth.auth.token === auth.auth.token && pending.auth.staff.actorId === auth.staff.actorId) {
    return pending.promise;
  }
  const promise = performStaffHeartbeat(auth).finally(() => {
    if (heartbeatsInFlight.get(key)?.promise === promise) heartbeatsInFlight.delete(key);
  });
  heartbeatsInFlight.set(key, { auth, promise });
  return promise;
}

async function performStaffHeartbeat(auth: StaffAuthSession): Promise<StaffAuthSession> {
  const fresh = await ensureFreshStaffAuth(auth);
  if (fresh.identityMode !== "pin") return fresh;
  const beforeRequest = requireCurrentStaffSession(fresh);
  // Resume and visibility changes must respect the same persisted retry deadline.
  if (parseTime(beforeRequest.heartbeatRetryAt) > Date.now()) return beforeRequest;

  let result;
  try {
    result = await manageStaffIdentitySession("heartbeat", fresh.auth.token);
  } catch (error) {
    const current = requireCurrentStaffSession(fresh);
    if (!isTransientStaffHeartbeatError(error)) throw error;
    const retryCount = Math.min(Math.max(0, current.heartbeatRetryCount ?? 0) + 1, 3);
    const delay = Math.min(HEARTBEAT_RETRY_BASE_MS * 2 ** (retryCount - 1), HEARTBEAT_RETRY_MAX_MS);
    const updated: StaffAuthSession = {
      ...current,
      heartbeatRetryCount: retryCount,
      heartbeatRetryAt: new Date(Date.now() + delay + Math.floor(Math.random() * delay * 0.2)).toISOString(),
    };
    // Retain only the already-valid session: never extend idle/absolute expiry or activity.
    storeStaffAuth(updated);
    return updated;
  }
  const principal = requirePrincipal(result.principal);
  const current = requireCurrentStaffSession(fresh);
  if (
    principal.actorId !== current.staff.actorId ||
    principal.venueId !== current.staff.venueId ||
    principal.environment !== current.staff.environment ||
    result.session.sessionId !== current.session?.sessionId
  ) {
    throw new Error("Personalsessionen kunde inte verifieras.");
  }

  const updated: StaffAuthSession = {
    ...current,
    lastHeartbeatAt: new Date().toISOString(),
    heartbeatRetryAt: undefined,
    heartbeatRetryCount: undefined,
    session: {
      ...result.session,
      absoluteExpiresAt: earliestIso(result.session.absoluteExpiresAt, current.session.absoluteExpiresAt),
    },
    staff: principal,
  };
  if (getStaffSessionExpiryReason(updated)) throw new Error("Personalsessionen har gått ut.");
  storeStaffAuth(updated);
  return updated;
}

function isTransientStaffHeartbeatError(error: unknown) {
  return error instanceof StaffApiError &&
    !error.isAuthenticationFailure &&
    (error.status === 0 || error.status === 408 || error.status === 429 || (error.status >= 500 && error.status <= 599));
}

function requireCurrentStaffSession(auth: StaffAuthSession) {
  const current = readMatchingStoredPinSession(auth);
  if (!current) throw new Error("Personalsessionen har avslutats.");
  if (getStaffSessionExpiryReason(current)) throw new Error("Personalsessionen har gått ut.");
  return current;
}

export async function endStaffAuth(
  auth: StaffAuthSession | null,
  { clearStorage = true }: { clearStorage?: boolean; managedLogout?: boolean } = {},
) {
  if (typeof window === "undefined") return;

  if (auth?.identityMode === "pin") {
    try {
      await settleWithin(manageStaffIdentitySession("logout", auth.auth.token), 2_500);
    } catch {
      // Local cleanup must still finish if the already-bounded server session has ended.
    }
  }

  // A delayed logout response must not erase a replacement login in this tab.
  const current = readStoredStaffAuth();
  if (clearStorage && (!current || current.auth.token === auth?.auth.token)) clearStaffAuthStorage();
}

function requirePrincipal(principal?: StaffPrincipal): StaffPrincipal {
  if (
    !principal ||
    typeof principal.actorId !== "string" ||
    !principal.actorId ||
    typeof principal.displayName !== "string" ||
    !principal.displayName ||
    typeof principal.environment !== "string" ||
    !principal.environment ||
    (principal.role !== "staff_operator" && principal.role !== "staff_reader") ||
    typeof principal.venueId !== "string" ||
    !principal.venueId ||
    !Array.isArray(principal.permissions) ||
    !principal.permissions.every((permission) =>
      ["staff:sessions:read", "staff:sessions:redeem"].includes(permission),
    ) ||
    !principal.permissions.includes("staff:sessions:read")
  ) {
    throw new Error("Personalidentiteten saknar behörighetsinformation.");
  }
  return principal;
}

function isStoredStaffAuthShape(value: StaffAuthSession, mode: StaffIdentityMode) {
  if (!value || typeof value !== "object" || typeof value.auth?.token !== "string" || !value.auth.token) return false;
  if (typeof value.auth.expiresAt !== "string" || typeof value.staff?.displayName !== "string") return false;
  if (mode === "legacy") return value.identityMode === "legacy";

  return (
    value.identityMode === "pin" &&
    typeof value.staff.actorId === "string" &&
    typeof value.staff.role === "string" &&
    Array.isArray(value.staff.permissions) &&
    typeof value.lastActivityAt === "string" &&
    typeof value.lastHeartbeatAt === "string" &&
    typeof value.session?.sessionId === "string" &&
    typeof value.session.idleExpiresAt === "string" &&
    typeof value.session.absoluteExpiresAt === "string"
  );
}

function readMatchingStoredPinSession(auth: StaffAuthSession) {
  const current = readStoredStaffAuth();
  if (
    current?.identityMode !== "pin" ||
    current.auth.token !== auth.auth.token ||
    current.session?.sessionId !== auth.session?.sessionId ||
    current.staff.actorId !== auth.staff.actorId
  ) {
    return null;
  }
  return current;
}

function parseTime(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function earliestIso(left: string, right?: string | null) {
  const rightTime = parseTime(right);
  return new Date(rightTime ? Math.min(parseTime(left), rightTime) : parseTime(left)).toISOString();
}

function isStaffLogoutSignal(value: unknown): value is typeof LOGOUT_SIGNAL {
  if (!value || typeof value !== "object") return false;
  const signal = value as { type?: unknown; version?: unknown };
  return signal.type === LOGOUT_SIGNAL.type && signal.version === LOGOUT_SIGNAL.version;
}

async function settleWithin<T>(operation: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Operation timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
