"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  TicketCheck,
} from "lucide-react";
import {
  getStaffSession,
  loginStaff,
  listReadyStaffSessions,
  redeemStaffSession,
  type StaffBookingItem,
  type StaffBookingTicket,
  type StaffAuthSession,
  type StaffSessionDetail,
  type StaffSessionSummary,
} from "@/lib/adminApi";

type LoadState = "idle" | "loading" | "ready" | "error";
type RedeemState = "idle" | "loading" | "success" | "error";
type ScannerState = "idle" | "starting" | "scanning" | "error";

const STAFF_AUTH_STORAGE_KEY = "jumpyard_staff_auth_v1";

interface ParsedHandoffPayload {
  checkinSessionId: string | null;
  handoffCode: string | null;
  raw: string;
}

type StaffIconName =
  | "addons-bag"
  | "admission-ticket"
  | "booking-card"
  | "group"
  | "info"
  | "jump"
  | "payment-card"
  | "profile"
  | "safety-check"
  | "success-check"
  | "time"
  | "visitor-wristband";

function StaffIcon({
  className = "h-8 w-8",
  name,
}: {
  className?: string;
  name: StaffIconName;
}) {
  return (
    <Image
      src={`/jumpyard-next-icons/${name}.png`}
      alt=""
      width={48}
      height={48}
      aria-hidden="true"
      className={`origin-center scale-125 object-contain ${className}`}
    />
  );
}

function formatClock(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value ?? "-";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatMoney(cents?: number | null) {
  if (cents === null || cents === undefined) return "-";

  return new Intl.NumberFormat("sv-SE", {
    currency: "SEK",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function getDisplayCode(session: StaffSessionSummary) {
  return session.handoffCode ?? session.bookingReference ?? session.checkinSessionId;
}

function searchableText(session: StaffSessionSummary) {
  return [
    session.handoffCode,
    session.bookingReference,
    session.checkinSessionId,
    session.rollerUniqueId,
    session.visitDate,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseHandoffPayload(value: string): ParsedHandoffPayload | null {
  const raw = value.trim();
  if (!raw) return null;

  const handoffMatch = raw.match(/^JY_HANDOFF:([^:]*):([^:\s]+)$/i);
  if (handoffMatch) {
    return {
      checkinSessionId: handoffMatch[2] || null,
      handoffCode: handoffMatch[1] || null,
      raw,
    };
  }

  const sessionMatch = raw.match(/^JY_SESSION:([^:\s]+)$/i);
  if (sessionMatch) {
    return {
      checkinSessionId: sessionMatch[1],
      handoffCode: null,
      raw,
    };
  }

  if (/^jycs_[a-z0-9_/-]+$/i.test(raw)) {
    return {
      checkinSessionId: raw,
      handoffCode: null,
      raw,
    };
  }

  if (/^JY[0-9]{4,}$/i.test(raw)) {
    return {
      checkinSessionId: null,
      handoffCode: raw.toUpperCase(),
      raw,
    };
  }

  return null;
}

function statusLabel(value?: string | null) {
  if (!value) return "-";

  const labels: Record<string, string> = {
    completed: "Klar",
    fresh: "Fresh",
    not_started: "Inte startad",
    paid: "Betald",
    ready_for_staff: "Redo",
    redeemed: "Incheckad",
    requires_staff: "Kräver hjälp",
    unredeemed: "Ej incheckad",
  };

  return labels[value] ?? value.replace(/_/g, " ");
}

function isStaffAuthExpired(auth: StaffAuthSession | null) {
  if (!auth?.auth.expiresAt) return true;
  return Date.parse(auth.auth.expiresAt) <= Date.now();
}

function readStoredStaffAuth() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STAFF_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffAuthSession;
    if (!parsed?.auth?.token || isStaffAuthExpired(parsed)) {
      window.sessionStorage.removeItem(STAFF_AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(STAFF_AUTH_STORAGE_KEY);
    return null;
  }
}

function storeStaffAuth(auth: StaffAuthSession | null) {
  if (typeof window === "undefined") return;
  if (!auth) {
    window.sessionStorage.removeItem(STAFF_AUTH_STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(STAFF_AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function SessionRow({
  isSelected,
  onSelect,
  session,
}: {
  isSelected: boolean;
  onSelect: () => void;
  session: StaffSessionSummary;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="handoff-session-row"
      data-handoff-code={session.handoffCode ?? ""}
      className={`w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition active:scale-[0.99] ${
        isSelected
          ? "border-primary bg-primary/5 ring-4 ring-primary/10"
          : "border-border bg-white hover:border-primary/40 hover:bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface">
            <StaffIcon name="visitor-wristband" className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-2xl font-black italic uppercase leading-none text-foreground">{getDisplayCode(session)}</p>
            <p className="mt-1 text-sm italic text-foreground/65">Bokning {session.bookingReference ?? "-"}</p>
          </div>
        </div>
        <span className="rounded-full bg-success/10 px-3 py-1 text-[11px] font-black uppercase text-success">
          {statusLabel(session.handoffStatus)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] uppercase text-foreground/60">
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{formatDate(session.visitDate)}</span>
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{formatClock(session.booking.startTime)}</span>
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{session.counts.selectedTickets} biljetter</span>
      </div>
    </button>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-h-24 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="break-words text-lg font-black italic text-foreground">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-foreground/60">{label}</p>
    </div>
  );
}

function ItemRows({ items }: { items: StaffBookingItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground/65">Inga produktrader.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {items.map((item) => (
        <div key={item.bookingItemKey ?? item.bookingItemId ?? item.productId ?? item.productName ?? "item"} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_86px_112px]">
          <div className="flex min-w-0 items-center gap-3">
            <StaffIcon name="admission-ticket" className="h-7 w-7 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black italic text-foreground">{item.parentProductName ?? item.productName ?? "Produkt"}</p>
              <p className="truncate text-xs text-foreground/60">
                {item.productName ?? item.productId ?? "-"}
              </p>
            </div>
          </div>
          <p className="text-sm font-black italic text-foreground">{item.quantity} st</p>
          <p className="text-sm text-foreground/65">
            {formatClock(item.startTime)}-{formatClock(item.endTime)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TicketRows({ tickets }: { tickets: StaffBookingTicket[] }) {
  if (tickets.length === 0) {
    return <p className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground/65">Inga biljetter.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      {tickets.map((ticket) => (
        <div key={ticket.ticketId ?? ticket.customTicketId ?? "ticket"} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_118px_108px]">
          <div className="flex min-w-0 items-center gap-3">
            <StaffIcon name="booking-card" className="h-7 w-7 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black italic text-foreground">{ticket.ticketId ?? ticket.customTicketId ?? "-"}</p>
              <p className="truncate text-xs text-foreground/60">Item {ticket.bookingItemId ?? "-"}</p>
            </div>
          </div>
          <span
            className={`w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase ${
              ticket.selectedForCheckIn ? "bg-primary/10 text-primary" : "bg-surface text-muted"
            }`}
          >
            {ticket.selectedForCheckIn ? "Vald" : "Ej vald"}
          </span>
          <p className="text-sm text-foreground/65">{statusLabel(ticket.redeemStatusLastSeen) ?? "-"}</p>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({
  auth,
  detail,
  loading,
  onRedeem,
  redeemMessage,
  redeemState,
}: {
  auth: StaffAuthSession | null;
  detail: StaffSessionDetail | null;
  loading: boolean;
  onRedeem: () => void;
  redeemMessage: string;
  redeemState: RedeemState;
}) {
  if (loading && !detail) {
    return (
      <section className="grid min-h-80 place-items-center rounded-3xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-black italic uppercase text-foreground">
          <Loader2 className="animate-spin" size={20} />
          Hämtar handoff
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="grid min-h-80 place-items-center rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
        <div>
          <StaffIcon name="info" className="mx-auto mb-3 h-12 w-12 opacity-70" />
          <p className="text-lg font-black italic text-foreground">Ingen handoff vald</p>
          <p className="mt-1 text-sm text-foreground/65">Välj en rad i listan.</p>
        </div>
      </section>
    );
  }

  const isCompleted = detail.status === "redeemed" || detail.handoffStatus === "completed";
  const canRedeem =
    !isCompleted &&
    detail.status === "ready_for_staff" &&
    detail.handoffStatus === "ready_for_staff" &&
    detail.safetyStatus === "completed" &&
    Boolean(auth?.auth.token) &&
    redeemState !== "loading";

  return (
    <section
      data-testid="handoff-detail"
      data-handoff-code={detail.handoffCode ?? ""}
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
    >
      <div className="border-b border-border bg-white px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10">
              <StaffIcon name="success-check" className="h-10 w-10" />
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-foreground/60">Handoff</p>
              <h2 className="mt-1 truncate text-4xl font-black italic uppercase leading-none text-foreground">{getDisplayCode(detail)}</h2>
              <p className="mt-1 text-sm text-foreground/65">Session {detail.checkinSessionId}</p>
            </div>
          </div>
          <span className="rounded-full bg-success/10 px-4 py-2 text-sm font-black uppercase text-success">
            {statusLabel(detail.handoffStatus)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={<StaffIcon name="booking-card" className="h-7 w-7" />} label="Bokning" value={detail.bookingReference ?? "-"} />
        <InfoTile icon={<CalendarDays size={20} />} label="Datum" value={formatDate(detail.visitDate)} />
        <InfoTile
          icon={<StaffIcon name="time" className="h-7 w-7" />}
          label="Tid"
          value={`${formatClock(detail.booking.startTime)}-${formatClock(detail.booking.endTime)}`}
        />
        <InfoTile icon={<StaffIcon name="safety-check" className="h-7 w-7" />} label="Säkerhet" value={statusLabel(detail.safetyStatus)} />
      </div>

      <div className="grid gap-4 p-4 pt-0 xl:grid-cols-[1fr_1fr]">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <StaffIcon name="addons-bag" className="h-7 w-7" />
            <h3 className="text-base font-black italic uppercase text-foreground">Produkter</h3>
          </div>
          <ItemRows items={detail.items} />
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <StaffIcon name="visitor-wristband" className="h-7 w-7" />
            <h3 className="text-base font-black italic uppercase text-foreground">Biljetter</h3>
          </div>
          <TicketRows tickets={detail.tickets} />
        </section>
      </div>

      <div
        data-testid="staff-redeem-panel"
        className="border-t border-border bg-white p-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <StaffIcon name="success-check" className="h-7 w-7" />
              <h3 className="text-base font-black italic uppercase text-foreground">Slutför check-in</h3>
            </div>
            <p className="text-sm text-foreground/65">
              Servern gör sista Roller-kontrollen och redeemar valda biljetter.
            </p>
          </div>

          {isCompleted ? (
            <span className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-success/10 px-4 text-sm font-black uppercase text-success">
              <CheckCircle2 size={18} />
              Incheckad
            </span>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
              <button
                type="button"
                onClick={onRedeem}
                disabled={!canRedeem}
                data-testid="staff-redeem-button"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45"
              >
                {redeemState === "loading" ? <Loader2 className="animate-spin" size={18} /> : <TicketCheck size={18} />}
                Slutför
              </button>
            </div>
          )}
        </div>

        {redeemMessage && (
          <p
            className={`mt-3 text-sm font-semibold ${
              redeemState === "error" ? "text-danger" : "text-success"
            }`}
          >
            {redeemMessage}
          </p>
        )}
      </div>

      <div className="grid gap-3 border-t border-border bg-white p-4 text-sm text-foreground/65 sm:grid-cols-3">
        <p>Betalning: {statusLabel(detail.booking.paymentStatus ?? detail.booking.bookingStatus)}</p>
        <p>Total: {formatMoney(detail.booking.totalCents)}</p>
        <p>Redo: {formatDateTime(detail.readyForStaffAt)}</p>
      </div>
    </section>
  );
}

export default function Home() {
  const [auth, setAuth] = useState<StaffAuthSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [authPasscode, setAuthPasscode] = useState("");
  const [authState, setAuthState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<StaffSessionDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>("idle");
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [detailRequestId, setDetailRequestId] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StaffSessionSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannerHandledRef = useRef(false);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);

  const selectSession = useCallback((checkinSessionId: string) => {
    setError("");
    setRedeemMessage("");
    setRedeemState("idle");
    setSelectedId(checkinSessionId);
    setDetailRequestId((current) => current + 1);
    setDetailState("loading");
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!auth || isStaffAuthExpired(auth)) {
      setAuth(null);
      setAuthState("idle");
      setDetail(null);
      setDetailState("idle");
      setSelectedId(null);
      setSessions([]);
      storeStaffAuth(null);
      setState("idle");
      return;
    }

    setState("loading");
    setError("");

    try {
      const nextSessions = await listReadyStaffSessions(auth.auth.token);
      const nextSelectedId =
        selectedId && nextSessions.some((session) => session.checkinSessionId === selectedId)
          ? selectedId
          : nextSessions[0]?.checkinSessionId ?? null;

      setSessions(nextSessions);
      setSelectedId(nextSelectedId);
      setDetailState(nextSelectedId ? "loading" : "idle");
      if (!nextSelectedId) setDetail(null);
      setState("ready");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta handovers.");
      setState("error");
    }
  }, [auth, selectedId]);

  const openHandoffPayload = useCallback(
    (value: string) => {
      const parsed = parseHandoffPayload(value);
      if (!parsed) {
        setError("Koden känns inte igen. Skanna QR-koden eller klistra in hela handoff-koden.");
        return;
      }

      setScannerMessage("");

      if (parsed.checkinSessionId) {
        setQuery(parsed.handoffCode ?? parsed.checkinSessionId);
        selectSession(parsed.checkinSessionId);
        return;
      }

      const handoffCode = parsed.handoffCode?.toLowerCase();
      const matchingSession = handoffCode
        ? sessions.find((session) => session.handoffCode?.toLowerCase() === handoffCode)
        : null;

      if (matchingSession) {
        setQuery(parsed.handoffCode ?? matchingSession.handoffCode ?? "");
        selectSession(matchingSession.checkinSessionId);
        return;
      }

      setQuery(parsed.handoffCode ?? parsed.raw);
      setError("Handoff-koden finns inte i väntelistan. Tryck Uppdatera eller klistra in hela QR-payloaden.");
    },
    [selectSession, sessions]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedAuth = readStoredStaffAuth();
      if (!storedAuth) {
        setAuthState("idle");
        setState("idle");
        return;
      }

      setAuth(storedAuth);
      setAuthState("ready");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!auth) return;
    const timeoutId = window.setTimeout(() => void refreshSessions(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [auth, refreshSessions]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    scannerHandledRef.current = false;

    async function startScanner() {
      try {
        if (!scannerVideoRef.current) {
          throw new Error("Scanner video saknas.");
        }

        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const codeReader = new BrowserQRCodeReader();
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          scannerVideoRef.current,
          (result, _error, controls) => {
            const text = result?.getText();
            if (!text || scannerHandledRef.current) return;

            scannerHandledRef.current = true;
            controls.stop();
            scannerControlsRef.current = null;
            setScannerOpen(false);
            setScannerState("idle");
            openHandoffPayload(text);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        scannerControlsRef.current = controls;
        setScannerState("scanning");
      } catch (scanError) {
        if (cancelled) return;
        scannerControlsRef.current = null;
        setScannerState("error");
        setScannerMessage(
          scanError instanceof Error
            ? `Kameran kunde inte startas: ${scanError.message}`
            : "Kameran kunde inte startas."
        );
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [openHandoffPayload, scannerOpen]);

  useEffect(() => {
    if (!selectedId || !auth || isStaffAuthExpired(auth)) return;

    let cancelled = false;

    getStaffSession(selectedId, auth.auth.token)
      .then((nextDetail) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setDetailState("ready");
      })
      .catch((detailError) => {
        if (cancelled) return;
        setDetail(null);
        setDetailState("error");
        setError(detailError instanceof Error ? detailError.message : "Kunde inte hämta handoff-detaljen.");
      });

    return () => {
      cancelled = true;
    };
  }, [auth, detailRequestId, selectedId]);

  const handleRedeem = useCallback(
    async () => {
      if (!detail || !auth || isStaffAuthExpired(auth)) {
        setRedeemMessage("Ange kod igen för att slutföra check-in.");
        setRedeemState("error");
        return;
      }

      setError("");
      setRedeemMessage("");
      setRedeemState("loading");

      try {
        const result = await redeemStaffSession({
          checkinSessionId: detail.checkinSessionId,
          staffToken: auth.auth.token,
          idempotencyKey: `staff-redeem:${detail.checkinSessionId}:${crypto.randomUUID()}`,
        });
        const redeemedIds = new Set(result.redeemedTicketIds);

        setDetail((current) => {
          if (!current || current.checkinSessionId !== detail.checkinSessionId) return current;

          return {
            ...current,
            completedAt: result.session.completedAt ?? current.completedAt,
            handoffStatus: result.session.handoffStatus ?? "completed",
            status: result.session.status ?? "redeemed",
            tickets: current.tickets.map((ticket) =>
              ticket.ticketId && redeemedIds.has(ticket.ticketId)
                ? { ...ticket, redeemStatusLastSeen: "redeemed" }
                : ticket
            ),
          };
        });
        setSessions((current) => current.filter((session) => session.checkinSessionId !== detail.checkinSessionId));
        setRedeemMessage(`Incheckad: ${result.redeemedTicketIds.length} biljetter.`);
        setRedeemState("success");
      } catch (redeemError) {
        setRedeemMessage(
          redeemError instanceof Error ? redeemError.message : "Kunde inte slutföra incheckningen."
        );
        setRedeemState("error");
      }
    },
    [auth, detail]
  );

  const handleStaffLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const passcode = authPasscode.trim();
      if (!passcode) {
        setAuthError("Ange kod.");
        return;
      }

      setAuthError("");
      setAuthState("loading");

      try {
        const nextAuth = await loginStaff(passcode);
        storeStaffAuth(nextAuth);
        setAuth(nextAuth);
        setAuthPasscode("");
        setAuthState("ready");
        setState("loading");
      } catch (loginError) {
        setAuthError(loginError instanceof Error ? loginError.message : "Kunde inte logga in.");
        setAuthState("error");
      }
    },
    [authPasscode]
  );

  const handleStaffLogout = useCallback(() => {
    storeStaffAuth(null);
    setAuth(null);
    setAuthError("");
    setAuthPasscode("");
    setAuthState("idle");
    setDetail(null);
    setDetailState("idle");
    setError("");
    setQuery("");
    setRedeemMessage("");
    setRedeemState("idle");
    setSelectedId(null);
    setSessions([]);
    setState("idle");
  }, []);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) => searchableText(session).includes(normalized));
  }, [query, sessions]);

  const hasError = state === "error" || detailState === "error";

  if (!auth) {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground">
        <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <div className="rounded-2xl border border-border bg-white p-5">
            <div className="flex items-center gap-3">
              <Image
                src="/jumpyard_logo.png"
                alt="JumpYard"
                width={44}
                height={44}
                priority
                className="h-11 w-11 object-contain"
              />
              <h1 className="text-2xl font-black italic uppercase text-foreground">Handoff</h1>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-foreground/70">Ange kod för att öppna handoff-kön.</p>

            <form className="mt-6 grid gap-4" onSubmit={handleStaffLogin} data-testid="staff-auth-login">
              <label className="grid gap-2">
                <span className="text-[10px] uppercase tracking-[0.22em] text-foreground/60">Kod</span>
                <span className="flex min-h-14 items-center rounded-2xl border border-border bg-white px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                  <input
                    value={authPasscode}
                    onChange={(event) => setAuthPasscode(event.target.value)}
                    data-testid="staff-auth-passcode"
                    type="password"
                    autoComplete="current-password"
                    className="h-full min-w-0 flex-1 border-0 bg-transparent text-base font-bold outline-none"
                  />
                </span>
              </label>

              {authError && (
                <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authState === "loading"}
                data-testid="staff-auth-submit"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-lg font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45"
              >
                {authState === "loading" && <Loader2 className="animate-spin" size={18} />}
                Fortsätt
              </button>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/jumpyard_logo.png"
              alt="JumpYard"
              width={42}
              height={42}
              priority
              className="h-9 w-9 object-contain"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-black italic uppercase leading-none text-foreground sm:text-2xl">Handoff</h1>
              <p className="truncate text-xs text-foreground/65 sm:text-sm">Redo för check-in</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void refreshSessions()}
              disabled={state === "loading"}
              aria-label="Uppdatera"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={state === "loading" ? "animate-spin" : ""} size={18} />
            </button>
            <button
              type="button"
              onClick={handleStaffLogout}
              aria-label="Avsluta"
              className="min-h-11 rounded-2xl px-2 text-sm italic text-foreground/65 transition hover:text-danger sm:px-3"
            >
              Avsluta
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[minmax(340px,400px)_1fr] lg:px-8">
        <aside className={`${selectedId ? "order-2" : "order-1"} rounded-3xl border border-border bg-white shadow-sm lg:order-1`}>
          <div className="border-b border-border p-4">
            <label className="flex min-h-14 items-center rounded-2xl border border-border bg-white px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openHandoffPayload(query);
                }}
                placeholder="Sök eller skanna QR"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold outline-none placeholder:text-foreground/35"
                autoComplete="off"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openHandoffPayload(query)}
                disabled={!query.trim()}
                data-testid="handoff-open-code"
                className="flex min-h-12 items-center justify-center rounded-2xl border border-border bg-white px-3 text-sm font-black italic uppercase text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground/40"
              >
                Sök
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scannerOpen) {
                    setScannerOpen(false);
                    setScannerState("idle");
                    return;
                  }

                  setScannerMessage("");
                  setScannerState("starting");
                  setScannerOpen(true);
                }}
                data-testid="handoff-scan-toggle"
                className="flex min-h-12 items-center justify-center rounded-2xl bg-primary px-3 text-sm font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark"
              >
                {scannerOpen ? "Stäng" : "Skanna QR"}
              </button>
            </div>

            {scannerOpen && (
              <div
                data-testid="handoff-qr-scanner"
                className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <video
                  ref={scannerVideoRef}
                  className="aspect-[4/3] w-full bg-black object-cover sm:aspect-video"
                  muted
                  playsInline
                />
                <div className="flex items-center justify-between gap-3 border-t border-border bg-white px-3 py-2">
                  <p className="text-xs uppercase text-foreground/60">
                    {scannerState === "starting"
                      ? "Startar kamera"
                      : scannerState === "scanning"
                        ? "Rikta kameran mot QR-koden"
                        : scannerState === "error"
                          ? scannerMessage
                          : "QR-skanner"}
                  </p>
                  {scannerState === "starting" && <Loader2 className="shrink-0 animate-spin text-muted" size={16} />}
                </div>
              </div>
            )}
          </div>

          {hasError && (
            <div className="border-b border-danger/20 bg-danger/5 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-black italic uppercase text-foreground">Väntar</p>
            <span className="rounded-full bg-surface px-3 py-1 text-xs text-foreground/60">{filteredSessions.length}</span>
          </div>

          <div className="grid max-h-none gap-3 overflow-auto p-3 lg:max-h-[calc(100vh-245px)]">
            {state === "loading" && sessions.length === 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-5 text-sm font-black italic uppercase text-foreground">
                <Loader2 className="animate-spin" size={18} />
                Hämtar
              </div>
            )}

            {state !== "loading" && filteredSessions.length === 0 && (
              <div className="rounded-2xl bg-surface px-4 py-8 text-sm text-foreground/65">Inga handovers väntar.</div>
            )}

            {filteredSessions.map((session) => (
              <SessionRow
                key={session.checkinSessionId}
                isSelected={session.checkinSessionId === selectedId}
                onSelect={() => selectSession(session.checkinSessionId)}
                session={session}
              />
            ))}
          </div>
        </aside>

        <div className={`${selectedId ? "order-1" : "order-2 hidden lg:block"} lg:order-2`}>
          <DetailPanel
            auth={auth}
            key={detail?.checkinSessionId ?? "empty"}
            detail={detail}
            loading={detailState === "loading"}
            onRedeem={handleRedeem}
            redeemMessage={redeemMessage}
            redeemState={redeemState}
          />
        </div>
      </div>
    </main>
  );
}
