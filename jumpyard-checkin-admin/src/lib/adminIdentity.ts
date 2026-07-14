import {
  manageAdminIdentitySession,
  type AdminAuthSession,
  type AdminPrincipal,
} from "@/lib/adminApi";

export type AdminSessionExpiryReason = "absolute" | "idle" | "token";

export interface AdminLogoutChannel {
  broadcast: () => void;
  close: () => void;
}

const ADMIN_STORAGE_KEY = "jumpyard_admin_auth_v1";
const ADMIN_PKCE_STORAGE_KEY = "jumpyard_admin_pkce_v1";
const ADMIN_LOGOUT_CHANNEL_NAME = "jumpyard_admin_logout_v1";
const ADMIN_LOGOUT_SIGNAL = Object.freeze({ type: "admin_logout", version: 1 });
const LOCAL_INACTIVITY_MS = 15 * 60 * 1000;
const LOCAL_ABSOLUTE_MAX_MS = 8 * 60 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
const PKCE_MAX_AGE_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const OAUTH_SCOPE = "openid";

const COGNITO_DOMAIN =
  process.env.NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_DOMAIN ??
  process.env.NEXT_PUBLIC_JUMPYARD_STAFF_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID =
  process.env.NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_CLIENT_ID ??
  process.env.NEXT_PUBLIC_JUMPYARD_STAFF_COGNITO_CLIENT_ID;

interface PendingPkce {
  createdAt: string;
  redirectUri: string;
  state: string;
  verifier: string;
}

interface CognitoTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
}

let refreshPromise: Promise<AdminAuthSession> | null = null;
let adminLogoutEpoch = 0;

export function getAdminIdentityConfigurationError() {
  if (!COGNITO_CLIENT_ID?.trim()) return "Administratörsinloggningen saknar klientkonfiguration.";
  try {
    getCognitoDomain();
  } catch {
    return "Administratörsinloggningen saknar en giltig säker domän.";
  }
  return null;
}

export function openAdminLogoutChannel(onRemoteLogout: () => void): AdminLogoutChannel {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") {
    return { broadcast() {}, close() {} };
  }

  const channel = new window.BroadcastChannel(ADMIN_LOGOUT_CHANNEL_NAME);
  let closed = false;
  const handleMessage = (event: MessageEvent<unknown>) => {
    if (!isAdminLogoutSignal(event.data)) return;
    adminLogoutEpoch += 1;
    onRemoteLogout();
  };
  channel.addEventListener("message", handleMessage);

  return {
    broadcast() {
      if (closed) return;
      adminLogoutEpoch += 1;
      channel.postMessage(ADMIN_LOGOUT_SIGNAL);
    },
    close() {
      if (closed) return;
      closed = true;
      channel.removeEventListener("message", handleMessage);
      channel.close();
    },
  };
}

export async function startAdminSignIn() {
  assertBrowser();
  const logoutEpoch = adminLogoutEpoch;
  const configError = getAdminIdentityConfigurationError();
  if (configError) throw new Error(configError);

  const verifier = randomBase64Url(64);
  const state = randomBase64Url(32);
  const redirectUri = getCallbackUri();
  const challenge = await sha256Base64Url(verifier);
  assertAdminLogoutEpoch(logoutEpoch);
  const pending: PendingPkce = {
    createdAt: new Date().toISOString(),
    redirectUri,
    state,
    verifier,
  };

  window.sessionStorage.setItem(ADMIN_PKCE_STORAGE_KEY, JSON.stringify(pending));

  const authorizeUrl = new URL("/oauth2/authorize", getCognitoDomain());
  authorizeUrl.searchParams.set("client_id", getCognitoClientId());
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "login");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", OAUTH_SCOPE);
  authorizeUrl.searchParams.set("state", state);

  window.location.assign(authorizeUrl.toString());
}

export async function completeAdminSignIn(): Promise<AdminAuthSession> {
  assertBrowser();
  const logoutEpoch = adminLogoutEpoch;
  const callbackUrl = new URL(window.location.href);
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  const oauthError = callbackUrl.searchParams.get("error");

  window.history.replaceState({}, document.title, "/auth/callback");
  const pending = readPendingPkce();
  window.sessionStorage.removeItem(ADMIN_PKCE_STORAGE_KEY);

  if (oauthError) throw new Error("Inloggningen avbröts eller nekades. Försök igen.");
  if (!code || !returnedState || !pending || !safeStringEquals(returnedState, pending.state)) {
    throw new Error("Inloggningssvaret kunde inte verifieras. Starta inloggningen igen.");
  }

  const pendingAge = Date.now() - Date.parse(pending.createdAt);
  if (!Number.isFinite(pendingAge) || pendingAge < 0 || pendingAge > PKCE_MAX_AGE_MS) {
    throw new Error("Inloggningen tog för lång tid. Starta inloggningen igen.");
  }
  if (pending.redirectUri !== getCallbackUri()) throw new Error("Inloggningssvaret hör till en annan adress.");

  const tokens = await exchangeAuthorizationCode(code, pending);
  let started: Awaited<ReturnType<typeof manageAdminIdentitySession>> | null = null;
  try {
    assertAdminLogoutEpoch(logoutEpoch);
    started = await manageAdminIdentitySession("start", tokens.accessToken);
    assertAdminLogoutEpoch(logoutEpoch);
    const admin = requireAdminPrincipal(started.principal);
    const now = new Date();
    const auth: AdminAuthSession = {
      auth: {
        expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000).toISOString(),
        token: tokens.accessToken,
        tokenType: "Bearer",
      },
      admin,
      lastActivityAt: now.toISOString(),
      lastHeartbeatAt: now.toISOString(),
      refreshToken: tokens.refreshToken,
      session: clampInitialSession(started.session, now.getTime()),
    };
    storeAdminAuth(auth);
    return auth;
  } catch (sessionError) {
    if (started) {
      try {
        await settleWithin(manageAdminIdentitySession("logout", tokens.accessToken), 2_500);
      } catch {
        // The server-side session remains bounded if cleanup is already complete.
      }
    }
    try {
      await settleWithin(revokeRefreshToken(tokens.refreshToken), 2_500);
    } catch {
      // Never retain rejected provider credentials locally.
    }
    throw sessionError;
  }
}

export function readStoredAdminAuth(): AdminAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminAuthSession;
    if (!isStoredAdminAuthShape(parsed)) {
      window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    return null;
  }
}

export function storeAdminAuth(auth: AdminAuthSession | null) {
  if (typeof window === "undefined") return;
  if (!auth) {
    clearAdminAuthStorage();
    return;
  }
  window.sessionStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(auth));
}

export function clearAdminAuthStorage() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  window.sessionStorage.removeItem(ADMIN_PKCE_STORAGE_KEY);
}

export function getAdminSessionExpiryReason(
  auth: AdminAuthSession | null,
  now = Date.now(),
): AdminSessionExpiryReason | null {
  if (!auth?.auth.token || parseTime(auth.auth.expiresAt) <= now) return "token";
  const absoluteExpiresAt = parseTime(auth.session.absoluteExpiresAt);
  if (!absoluteExpiresAt || absoluteExpiresAt <= now) return "absolute";
  const localIdleExpiresAt = parseTime(auth.lastActivityAt) + LOCAL_INACTIVITY_MS;
  const serverIdleExpiresAt = parseTime(auth.session.idleExpiresAt);
  if (!serverIdleExpiresAt || Math.min(localIdleExpiresAt, serverIdleExpiresAt) <= now) return "idle";
  return null;
}

export function markAdminActivity(auth: AdminAuthSession, now = new Date()) {
  if (!readMatchingStoredAdminSession(auth)) return auth;
  const updated = { ...auth, lastActivityAt: now.toISOString() };
  storeAdminAuth(updated);
  return updated;
}

export function isAdminHeartbeatDue(auth: AdminAuthSession, now = Date.now()) {
  return now - parseTime(auth.lastHeartbeatAt) >= HEARTBEAT_INTERVAL_MS;
}

export async function ensureFreshAdminAuth(auth: AdminAuthSession): Promise<AdminAuthSession> {
  if (!readMatchingStoredAdminSession(auth)) throw new Error("Administratörssessionen har avslutats.");
  if (getAdminSessionExpiryReason(auth)) throw new Error("Administratörssessionen har gått ut.");
  if (parseTime(auth.auth.expiresAt) > Date.now() + TOKEN_REFRESH_SKEW_MS) return auth;

  if (!refreshPromise) {
    refreshPromise = refreshCognitoAccessToken(auth).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function heartbeatAdminAuth(auth: AdminAuthSession): Promise<AdminAuthSession> {
  const fresh = await ensureFreshAdminAuth(auth);
  const result = await manageAdminIdentitySession("heartbeat", fresh.auth.token);
  const principal = requireAdminPrincipal(result.principal);
  const current = readMatchingStoredAdminSession(fresh);
  if (!current || principal.actorId !== current.admin.actorId || result.session.sessionId !== current.session.sessionId) {
    throw new Error("Administratörssessionen kunde inte verifieras.");
  }
  const updated: AdminAuthSession = {
    ...current,
    admin: principal,
    lastHeartbeatAt: new Date().toISOString(),
    session: {
      ...result.session,
      absoluteExpiresAt: earliestIso(result.session.absoluteExpiresAt, current.session.absoluteExpiresAt),
    },
  };
  storeAdminAuth(updated);
  return updated;
}

export async function endAdminAuth(
  auth: AdminAuthSession | null,
  { clearStorage = true, managedLogout = true }: { clearStorage?: boolean; managedLogout?: boolean } = {},
) {
  if (typeof window === "undefined") return;
  if (auth) {
    try {
      await settleWithin(manageAdminIdentitySession("logout", auth.auth.token), 2_500);
    } catch {
      // Local cleanup must continue even if the bounded server session is already gone.
    }
    try {
      await settleWithin(revokeRefreshToken(auth.refreshToken), 2_500);
    } catch {
      // Cognito may already have revoked the refresh token.
    }
  }
  if (clearStorage) clearAdminAuthStorage();
  if (managedLogout && auth) window.location.replace(getManagedLogoutUrl());
}

async function refreshCognitoAccessToken(auth: AdminAuthSession): Promise<AdminAuthSession> {
  const response = await fetch(new URL("/oauth2/token", getCognitoDomain()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getCognitoClientId(),
      grant_type: "refresh_token",
      refresh_token: auth.refreshToken,
    }),
  });
  const tokens = await readTokenResponse(response, false);
  const current = readMatchingStoredAdminSession(auth);
  if (!current) throw new Error("Administratörssessionen har avslutats.");
  const updated: AdminAuthSession = {
    ...current,
    auth: {
      expiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString(),
      token: tokens.accessToken,
      tokenType: "Bearer",
    },
    refreshToken: tokens.refreshToken || auth.refreshToken,
  };
  storeAdminAuth(updated);
  return updated;
}

async function exchangeAuthorizationCode(code: string, pending: PendingPkce) {
  const response = await fetch(new URL("/oauth2/token", getCognitoDomain()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getCognitoClientId(),
      code,
      code_verifier: pending.verifier,
      grant_type: "authorization_code",
      redirect_uri: pending.redirectUri,
    }),
  });
  return readTokenResponse(response, true);
}

async function readTokenResponse(response: Response, requireRefreshToken: boolean) {
  let body: CognitoTokenResponse = {};
  try {
    body = (await response.json()) as CognitoTokenResponse;
  } catch {
    // Keep provider response details out of the public error.
  }
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  const expiresInSeconds = Number(body.expires_in);
  if (
    !response.ok ||
    !accessToken ||
    body.token_type?.toLowerCase() !== "bearer" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds <= 0 ||
    (requireRefreshToken && !refreshToken)
  ) {
    throw new Error("Den säkra administratörssessionen kunde inte skapas. Försök igen.");
  }
  return { accessToken, expiresInSeconds, refreshToken };
}

async function revokeRefreshToken(refreshToken: string) {
  const response = await fetch(new URL("/oauth2/revoke", getCognitoDomain()), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: getCognitoClientId(), token: refreshToken }),
  });
  if (!response.ok) throw new Error("Cognito token revoke failed.");
}

function readPendingPkce(): PendingPkce | null {
  try {
    const raw = window.sessionStorage.getItem(ADMIN_PKCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPkce>;
    if (
      typeof parsed.createdAt !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.verifier !== "string"
    ) return null;
    return parsed as PendingPkce;
  } catch {
    return null;
  }
}

function requireAdminPrincipal(principal?: AdminPrincipal): AdminPrincipal {
  if (
    !principal ||
    typeof principal.actorId !== "string" ||
    !principal.actorId ||
    typeof principal.displayName !== "string" ||
    !principal.displayName ||
    principal.role !== "staff_admin" ||
    typeof principal.environment !== "string" ||
    !principal.environment ||
    typeof principal.venueId !== "string" ||
    !principal.venueId ||
    !Array.isArray(principal.permissions) ||
    !principal.permissions.includes("staff:identities:manage")
  ) throw new Error("Kontot saknar administratörsbehörighet.");
  return principal;
}

function isStoredAdminAuthShape(value: AdminAuthSession) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.auth?.token === "string" &&
    value.auth.token &&
    typeof value.auth.expiresAt === "string" &&
    typeof value.refreshToken === "string" &&
    value.refreshToken &&
    value.admin?.role === "staff_admin" &&
    value.admin.permissions?.includes("staff:identities:manage") &&
    typeof value.lastActivityAt === "string" &&
    typeof value.lastHeartbeatAt === "string" &&
    typeof value.session?.sessionId === "string" &&
    typeof value.session.idleExpiresAt === "string" &&
    typeof value.session.absoluteExpiresAt === "string"
  );
}

function readMatchingStoredAdminSession(auth: AdminAuthSession) {
  const current = readStoredAdminAuth();
  if (current?.session.sessionId !== auth.session.sessionId || current.admin.actorId !== auth.admin.actorId) return null;
  return current;
}

function clampInitialSession(session: AdminAuthSession["session"], startedAt: number) {
  if (!session?.sessionId || !session.idleExpiresAt || !session.absoluteExpiresAt) {
    throw new Error("Administratörssessionen saknar giltighetstid.");
  }
  const idleExpiresAt = parseTime(session.idleExpiresAt);
  const absoluteExpiresAt = parseTime(session.absoluteExpiresAt);
  if (idleExpiresAt <= startedAt || absoluteExpiresAt <= startedAt) {
    throw new Error("Administratörssessionen har en ogiltig giltighetstid.");
  }
  return {
    ...session,
    absoluteExpiresAt: earliestIso(session.absoluteExpiresAt, new Date(startedAt + LOCAL_ABSOLUTE_MAX_MS).toISOString()),
  };
}

function getManagedLogoutUrl() {
  const url = new URL("/logout", getCognitoDomain());
  url.searchParams.set("client_id", getCognitoClientId());
  url.searchParams.set("logout_uri", `${window.location.origin}/admin`);
  return url.toString();
}

function getCallbackUri() {
  return `${window.location.origin}/auth/callback`;
}

function getCognitoClientId() {
  const clientId = COGNITO_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Cognito client id is missing.");
  return clientId;
}

function getCognitoDomain() {
  const configured = COGNITO_DOMAIN?.trim();
  if (!configured) throw new Error("Cognito domain is missing.");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    !url.hostname.endsWith(".amazoncognito.com")
  ) throw new Error("Cognito domain is invalid.");
  return url;
}

function parseTime(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function earliestIso(left: string, right: string) {
  return new Date(Math.min(parseTime(left), parseTime(right))).toISOString();
}

function safeStringEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Base64Url(value: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isAdminLogoutSignal(value: unknown): value is typeof ADMIN_LOGOUT_SIGNAL {
  if (!value || typeof value !== "object") return false;
  const signal = value as { type?: unknown; version?: unknown };
  return signal.type === ADMIN_LOGOUT_SIGNAL.type && signal.version === ADMIN_LOGOUT_SIGNAL.version;
}

function assertAdminLogoutEpoch(expectedEpoch: number) {
  if (adminLogoutEpoch !== expectedEpoch) throw new Error("Inloggningen avbröts eftersom administratörssessionen avslutades i en annan flik.");
}

function assertBrowser() {
  if (typeof window === "undefined") throw new Error("Administratörsinloggning kräver en webbläsare.");
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
