"use client";

import Image from "next/image";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, UserPlus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createAdminStaff,
  listAdminStaff,
  StaffApiError,
  updateAdminStaff,
  type AdminAuthSession,
  type AdminStaffRecord,
} from "@/lib/adminApi";
import {
  clearAdminAuthStorage,
  endAdminAuth,
  ensureFreshAdminAuth,
  getAdminIdentityConfigurationError,
  getAdminSessionExpiryReason,
  heartbeatAdminAuth,
  isAdminHeartbeatDue,
  markAdminActivity,
  openAdminLogoutChannel,
  readStoredAdminAuth,
  startAdminSignIn,
  type AdminLogoutChannel,
} from "@/lib/adminIdentity";

type LoadState = "idle" | "loading" | "ready" | "error";

const EMPTY_PIN: Readonly<{ pin: string; pinConfirm: string }> = Object.freeze({ pin: "", pinConfirm: "" });

function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function validatePin(pin: string, pinConfirm: string) {
  if (!/^\d{6}$/.test(pin)) return "PIN-koden måste bestå av exakt sex siffror.";
  if (pin !== pinConfirm) return "PIN-koderna är inte likadana.";
  return null;
}

function sortStaff(staff: AdminStaffRecord[]) {
  return [...staff].sort((left, right) => left.displayName.localeCompare(right.displayName, "sv-SE"));
}

export default function AdminPage() {
  const configurationError = getAdminIdentityConfigurationError();
  const [auth, setAuth] = useState<AdminAuthSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [authState, setAuthState] = useState<LoadState>("loading");
  const [staff, setStaff] = useState<AdminStaffRecord[]>([]);
  const [staffState, setStaffState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [createPin, setCreatePin] = useState("");
  const [createPinConfirm, setCreatePinConfirm] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [resetStaffId, setResetStaffId] = useState<string | null>(null);
  const [resetPin, setResetPin] = useState(EMPTY_PIN);
  const authRef = useRef<AdminAuthSession | null>(null);
  const logoutChannelRef = useRef<AdminLogoutChannel | null>(null);
  const logoutInProgressRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);

  const setCurrentAuth = useCallback((nextAuth: AdminAuthSession | null) => {
    authRef.current = nextAuth;
    setAuth(nextAuth);
  }, []);

  const clearSensitiveState = useCallback(() => {
    setCurrentAuth(null);
    setAuthState("idle");
    setStaff([]);
    setStaffState("idle");
    setError("");
    setSuccess("");
    setFirstName("");
    setLastName("");
    setCreatePin("");
    setCreatePinConfirm("");
    setCreating(false);
    setBusyStaffId(null);
    setResetStaffId(null);
    setResetPin(EMPTY_PIN);
  }, [setCurrentAuth]);

  const terminateAdminSession = useCallback(async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    const currentAuth = authRef.current;
    logoutChannelRef.current?.broadcast();
    clearAdminAuthStorage();
    clearSensitiveState();
    try {
      await endAdminAuth(currentAuth);
    } finally {
      logoutInProgressRef.current = false;
    }
  }, [clearSensitiveState]);

  const getUsableAuth = useCallback(async () => {
    const currentAuth = authRef.current;
    if (!currentAuth || getAdminSessionExpiryReason(currentAuth)) {
      await terminateAdminSession();
      throw new Error("Administratörssessionen har gått ut.");
    }
    try {
      const fresh = await ensureFreshAdminAuth(currentAuth);
      if (fresh !== currentAuth) setCurrentAuth(fresh);
      return fresh;
    } catch (authFailure) {
      await terminateAdminSession();
      throw authFailure;
    }
  }, [setCurrentAuth, terminateAdminSession]);

  const handleApiError = useCallback((requestError: unknown) => {
    if (requestError instanceof StaffApiError && requestError.isAuthenticationFailure) {
      void terminateAdminSession();
      return true;
    }
    return false;
  }, [terminateAdminSession]);

  const refreshStaff = useCallback(async () => {
    let activeAuth: AdminAuthSession;
    try {
      activeAuth = await getUsableAuth();
    } catch {
      return;
    }
    setStaffState("loading");
    setError("");
    try {
      const nextStaff = await listAdminStaff(activeAuth.auth.token);
      if (authRef.current?.session.sessionId !== activeAuth.session.sessionId) return;
      setStaff(sortStaff(nextStaff));
      setStaffState("ready");
    } catch (loadError) {
      if (handleApiError(loadError)) return;
      setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta personalen.");
      setStaffState("error");
    }
  }, [getUsableAuth, handleApiError]);

  useEffect(() => {
    const channel = openAdminLogoutChannel(() => {
      const remoteAuth = authRef.current ?? readStoredAdminAuth();
      clearAdminAuthStorage();
      clearSensitiveState();
      void endAdminAuth(remoteAuth, { clearStorage: false, managedLogout: false });
    });
    logoutChannelRef.current = channel;
    return () => {
      if (logoutChannelRef.current === channel) logoutChannelRef.current = null;
      channel.close();
    };
  }, [clearSensitiveState]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      const storedAuth = readStoredAdminAuth();
      if (!storedAuth || getAdminSessionExpiryReason(storedAuth)) {
        clearAdminAuthStorage();
        setAuthState("idle");
        return;
      }
      void heartbeatAdminAuth(storedAuth)
        .then((activeAuth) => {
          if (cancelled) return;
          setCurrentAuth(activeAuth);
          setAuthState("ready");
        })
        .catch(() => {
          if (cancelled) return;
          clearAdminAuthStorage();
          clearSensitiveState();
          void endAdminAuth(storedAuth, { clearStorage: false, managedLogout: false });
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [clearSensitiveState, setCurrentAuth]);

  useEffect(() => {
    if (!auth) return;
    const timeoutId = window.setTimeout(() => void refreshStaff(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [auth, refreshStaff]);

  useEffect(() => {
    if (!auth) return;
    let lastActivityWriteAt = 0;
    const recordActivity = () => {
      const currentAuth = authRef.current;
      const now = Date.now();
      if (!currentAuth) return;
      if (getAdminSessionExpiryReason(currentAuth, now)) {
        void terminateAdminSession();
        return;
      }
      if (now - lastActivityWriteAt < 15_000) return;
      lastActivityWriteAt = now;
      authRef.current = markAdminActivity(currentAuth, new Date(now));
    };
    const checkSession = () => {
      const currentAuth = authRef.current;
      if (!currentAuth || heartbeatInFlightRef.current) return;
      if (getAdminSessionExpiryReason(currentAuth)) {
        void terminateAdminSession();
        return;
      }
      if (!isAdminHeartbeatDue(currentAuth)) return;
      heartbeatInFlightRef.current = true;
      void heartbeatAdminAuth(currentAuth)
        .then((activeAuth) => {
          if (authRef.current?.session.sessionId === activeAuth.session.sessionId) setCurrentAuth(activeAuth);
        })
        .catch(() => void terminateAdminSession())
        .finally(() => {
          heartbeatInFlightRef.current = false;
        });
    };
    const events: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "scroll", "touchstart"];
    for (const eventName of events) window.addEventListener(eventName, recordActivity, { passive: true });
    const intervalId = window.setInterval(checkSession, 30_000);
    return () => {
      for (const eventName of events) window.removeEventListener(eventName, recordActivity);
      window.clearInterval(intervalId);
    };
  }, [auth, setCurrentAuth, terminateAdminSession]);

  const startLogin = useCallback(async () => {
    setAuthError("");
    setAuthState("loading");
    try {
      await startAdminSignIn();
    } catch (loginError) {
      setAuthError(loginError instanceof Error ? loginError.message : "Kunde inte starta inloggningen.");
      setAuthState("error");
    }
  }, []);

  const handleCreate = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    if (!normalizedFirstName || !normalizedLastName) {
      setError("Ange både förnamn och efternamn.");
      return;
    }
    const pinError = validatePin(createPin, createPinConfirm);
    if (pinError) {
      setError(pinError);
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      const activeAuth = await getUsableAuth();
      const created = await createAdminStaff(activeAuth.auth.token, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        pin: createPin,
      });
      setStaff((current) => sortStaff([...current.filter((item) => item.staffIdentityId !== created.staffIdentityId), created]));
      setFirstName("");
      setLastName("");
      setSuccess(`${created.displayName} är skapad och kan logga in med sin PIN-kod.`);
    } catch (createError) {
      if (!handleApiError(createError)) {
        setError(createError instanceof Error ? createError.message : "Kunde inte skapa personalen.");
      }
    } finally {
      setCreatePin("");
      setCreatePinConfirm("");
      setCreating(false);
    }
  }, [createPin, createPinConfirm, firstName, getUsableAuth, handleApiError, lastName]);

  const handleStatusChange = useCallback(async (record: AdminStaffRecord) => {
    setBusyStaffId(record.staffIdentityId);
    setError("");
    setSuccess("");
    try {
      const activeAuth = await getUsableAuth();
      const updated = await updateAdminStaff(activeAuth.auth.token, record.staffIdentityId, {
        action: record.active ? "disable" : "enable",
      });
      setStaff((current) => sortStaff(current.map((item) => item.staffIdentityId === updated.staffIdentityId ? updated : item)));
      setSuccess(`${updated.displayName} är nu ${updated.active ? "aktiv" : "inaktiverad"}.`);
    } catch (updateError) {
      if (!handleApiError(updateError)) {
        setError(updateError instanceof Error ? updateError.message : "Kunde inte uppdatera personalen.");
      }
    } finally {
      setBusyStaffId(null);
    }
  }, [getUsableAuth, handleApiError]);

  const handleResetPin = useCallback(async (event: FormEvent<HTMLFormElement>, record: AdminStaffRecord) => {
    event.preventDefault();
    const pinError = validatePin(resetPin.pin, resetPin.pinConfirm);
    if (pinError) {
      setError(pinError);
      return;
    }
    setBusyStaffId(record.staffIdentityId);
    setError("");
    setSuccess("");
    try {
      const activeAuth = await getUsableAuth();
      const updated = await updateAdminStaff(activeAuth.auth.token, record.staffIdentityId, {
        action: "reset_pin",
        pin: resetPin.pin,
      });
      setStaff((current) => sortStaff(current.map((item) => item.staffIdentityId === updated.staffIdentityId ? updated : item)));
      setResetStaffId(null);
      setSuccess(`PIN-koden för ${updated.displayName} är uppdaterad. Alla tidigare sessioner är avslutade.`);
    } catch (resetError) {
      if (!handleApiError(resetError)) {
        setError(resetError instanceof Error ? resetError.message : "Kunde inte uppdatera PIN-koden.");
      }
    } finally {
      setResetPin(EMPTY_PIN);
      setBusyStaffId(null);
    }
  }, [getUsableAuth, handleApiError, resetPin]);

  if (!auth) {
    return (
      <main className="grid min-h-screen min-w-0 place-items-center bg-background px-3 py-4 text-foreground sm:px-4 sm:py-8">
        <section className="w-full min-w-0 max-w-md rounded-3xl border border-border bg-surface p-3 shadow-sm sm:p-4">
          <div className="min-w-0 rounded-2xl border border-border bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Image src="/jumpyard_logo.png" alt="JumpYard" width={44} height={44} priority className="h-11 w-11 object-contain" />
              <div>
                <h1 className="text-2xl font-black italic uppercase text-foreground">Personaladmin</h1>
                <p className="mt-1 text-sm font-bold text-foreground">Skapa och hantera personliga PIN-koder.</p>
              </div>
            </div>
            {(authError || configurationError) && (
              <p className="mt-5 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {authError || configurationError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void startLogin()}
              disabled={authState === "loading" || Boolean(configurationError)}
              data-testid="admin-auth-submit"
              className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-lg font-black italic uppercase text-white shadow-sm disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45"
            >
              {authState === "loading" && <Loader2 className="animate-spin" size={18} />}
              Logga in som admin
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Image src="/jumpyard_logo.png" alt="JumpYard" width={42} height={42} priority className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black italic uppercase sm:text-xl">Personaladmin</h1>
              <p className="truncate text-xs font-bold text-foreground">{auth.admin.displayName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <button type="button" onClick={() => void refreshStaff()} aria-label="Uppdatera" className="grid h-11 w-11 place-items-center rounded-2xl border border-border bg-white">
              <RefreshCcw className={staffState === "loading" ? "animate-spin" : ""} size={18} />
            </button>
            <button type="button" onClick={() => void terminateAdminSession()} className="min-h-11 rounded-2xl px-1 text-xs font-bold text-foreground hover:text-danger min-[360px]:px-2 min-[360px]:text-sm sm:px-3">
              Logga ut
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-w-0 max-w-5xl gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-5 lg:grid-cols-[minmax(300px,360px)_1fr]">
        <section className="min-w-0 self-start rounded-3xl border border-border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary"><UserPlus size={20} /></span>
            <div>
              <h2 className="text-lg font-black italic uppercase">Skapa personal</h2>
              <p className="text-xs font-bold text-foreground">Standardbehörighet för check-in.</p>
            </div>
          </div>
          <form className="mt-5 grid gap-4" onSubmit={handleCreate} data-testid="admin-create-staff-form">
            <label className="grid gap-1.5 text-xs font-black italic uppercase tracking-wide text-foreground">
              Förnamn
              <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="off" maxLength={80} data-testid="admin-staff-first-name" className="min-h-12 w-full min-w-0 rounded-2xl border border-border px-4 text-base normal-case tracking-normal text-foreground outline-none focus:border-primary" />
            </label>
            <label className="grid gap-1.5 text-xs font-black italic uppercase tracking-wide text-foreground">
              Efternamn
              <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="off" maxLength={80} data-testid="admin-staff-last-name" className="min-h-12 w-full min-w-0 rounded-2xl border border-border px-4 text-base normal-case tracking-normal text-foreground outline-none focus:border-primary" />
            </label>
            <div className="rounded-2xl bg-surface p-3 text-xs font-bold leading-relaxed text-foreground">
              Lämna över skärmen så att den anställde kan välja sin PIN-kod.
            </div>
            <PinFields
              pin={createPin}
              pinConfirm={createPinConfirm}
              onPinChange={setCreatePin}
              onPinConfirmChange={setCreatePinConfirm}
              testIdPrefix="admin-create"
            />
            <button type="submit" disabled={creating} className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-black italic uppercase text-white disabled:bg-surface-strong disabled:text-foreground/45">
              {creating && <Loader2 className="animate-spin" size={18} />}
              Skapa personal
            </button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-black italic uppercase">Personal</h2>
            <p className="text-xs font-bold text-foreground">{staff.length} konton</p>
          </div>
          {(error || success) && (
            <div className={`m-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${error ? "border-danger/20 bg-danger/5 text-danger" : "border-success/20 bg-success/5 text-success"}`}>
              {error ? <AlertTriangle className="mt-0.5 shrink-0" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={18} />}
              <p>{error || success}</p>
            </div>
          )}
          <div className="divide-y divide-border">
            {staffState === "loading" && staff.length === 0 && (
              <div className="flex items-center gap-3 p-5 text-sm font-bold"><Loader2 className="animate-spin" size={18} /> Hämtar personal</div>
            )}
            {staffState !== "loading" && staff.length === 0 && (
              <p className="p-5 text-sm text-foreground">Ingen personal är skapad ännu.</p>
            )}
            {staff.map((record) => (
              <div key={record.staffIdentityId} className="p-4" data-testid="admin-staff-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black italic text-foreground">{record.displayName}</p>
                    <p className={`mt-1 text-xs font-bold uppercase ${record.active ? "text-success" : "text-foreground/45"}`}>{record.active ? "Aktiv" : "Inaktiverad"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setError(""); setSuccess(""); setResetPin(EMPTY_PIN); setResetStaffId((current) => current === record.staffIdentityId ? null : record.staffIdentityId); }} className="min-h-10 rounded-xl border border-border px-3 text-xs font-black uppercase">
                      Ny PIN
                    </button>
                    <button type="button" onClick={() => void handleStatusChange(record)} disabled={busyStaffId === record.staffIdentityId} className={`min-h-10 rounded-xl px-3 text-xs font-black uppercase ${record.active ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
                      {busyStaffId === record.staffIdentityId ? "Vänta" : record.active ? "Inaktivera" : "Aktivera"}
                    </button>
                  </div>
                </div>
                {resetStaffId === record.staffIdentityId && (
                  <form className="mt-4 grid min-w-0 gap-3 rounded-2xl bg-surface p-3 sm:p-4" onSubmit={(event) => void handleResetPin(event, record)} data-testid="admin-reset-pin-form">
                    <p className="text-xs font-bold leading-relaxed text-foreground">Lämna över skärmen så att {record.firstName} kan välja en ny PIN-kod.</p>
                    <PinFields pin={resetPin.pin} pinConfirm={resetPin.pinConfirm} onPinChange={(pin) => setResetPin((current) => ({ ...current, pin }))} onPinConfirmChange={(pinConfirm) => setResetPin((current) => ({ ...current, pinConfirm }))} testIdPrefix="admin-reset" />
                    <div className="flex flex-col gap-2 min-[360px]:flex-row">
                      <button type="submit" disabled={busyStaffId === record.staffIdentityId} className="min-h-11 flex-1 rounded-xl bg-primary px-3 text-xs font-black uppercase text-white">Spara ny PIN</button>
                      <button type="button" onClick={() => { setResetStaffId(null); setResetPin(EMPTY_PIN); }} className="min-h-11 rounded-xl border border-border px-3 text-xs font-black uppercase">Avbryt</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function PinFields({
  onPinChange,
  onPinConfirmChange,
  pin,
  pinConfirm,
  testIdPrefix,
}: {
  onPinChange: (value: string) => void;
  onPinConfirmChange: (value: string) => void;
  pin: string;
  pinConfirm: string;
  testIdPrefix: string;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid min-w-0 gap-1.5 text-xs font-black italic uppercase tracking-wide text-foreground">
        PIN-kod
        <input value={pin} onChange={(event) => onPinChange(normalizePin(event.target.value))} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" aria-label="Sexsiffrig PIN-kod" data-testid={`${testIdPrefix}-pin`} className="min-h-12 w-full min-w-0 rounded-2xl border border-border px-3 text-center text-lg font-black tracking-[0.22em] text-foreground outline-none focus:border-primary sm:text-xl sm:tracking-[0.3em]" />
      </label>
      <label className="grid min-w-0 gap-1.5 text-xs font-black italic uppercase tracking-wide text-foreground">
        Upprepa PIN
        <input value={pinConfirm} onChange={(event) => onPinConfirmChange(normalizePin(event.target.value))} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" aria-label="Upprepa sexsiffrig PIN-kod" data-testid={`${testIdPrefix}-pin-confirm`} className="min-h-12 w-full min-w-0 rounded-2xl border border-border px-3 text-center text-lg font-black tracking-[0.22em] text-foreground outline-none focus:border-primary sm:text-xl sm:tracking-[0.3em]" />
      </label>
    </div>
  );
}
