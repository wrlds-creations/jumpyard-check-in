"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock3,
  Hash,
  KeyRound,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Search,
  ShieldCheck,
  ScanLine,
  TicketCheck,
  X,
} from "lucide-react";
import {
  getStaffSession,
  listReadyStaffSessions,
  redeemStaffSession,
  type StaffBookingItem,
  type StaffBookingTicket,
  type StaffSessionDetail,
  type StaffSessionSummary,
} from "@/lib/adminApi";

type LoadState = "idle" | "loading" | "ready" | "error";
type RedeemState = "idle" | "loading" | "success" | "error";
type ScannerState = "idle" | "starting" | "scanning" | "error";

interface ParsedHandoffPayload {
  checkinSessionId: string | null;
  handoffCode: string | null;
  raw: string;
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
    requires_staff: "Kräver personal",
    unredeemed: "Ej incheckad",
  };

  return labels[value] ?? value.replace(/_/g, " ");
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
      className={`w-full border-l-4 px-4 py-4 text-left transition ${
        isSelected
          ? "border-primary bg-primary/5"
          : "border-transparent bg-white hover:border-primary/40 hover:bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-black italic uppercase text-foreground">{getDisplayCode(session)}</p>
          <p className="mt-1 text-sm font-semibold text-muted">Bokning {session.bookingReference ?? "-"}</p>
        </div>
        <span className="rounded-md bg-success/10 px-2.5 py-1 text-xs font-black uppercase text-success">
          {statusLabel(session.handoffStatus)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold uppercase text-muted">
        <span>{formatDate(session.visitDate)}</span>
        <span>{formatClock(session.booking.startTime)}</span>
        <span>{session.counts.selectedTickets} biljetter</span>
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
    <div className="min-h-24 border border-border bg-white p-4">
      <div className="mb-3 text-muted">{icon}</div>
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
    </div>
  );
}

function ItemRows({ items }: { items: StaffBookingItem[] }) {
  if (items.length === 0) {
    return <p className="border border-border bg-white px-4 py-3 text-sm font-semibold text-muted">Inga produktrader.</p>;
  }

  return (
    <div className="divide-y divide-border border border-border bg-white">
      {items.map((item) => (
        <div key={item.bookingItemKey ?? item.bookingItemId ?? item.productId ?? item.productName ?? "item"} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_90px_120px]">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">{item.parentProductName ?? item.productName ?? "Produkt"}</p>
            <p className="truncate text-xs font-semibold text-muted">
              {item.productName ?? item.productId ?? "-"}
            </p>
          </div>
          <p className="text-sm font-black text-foreground">{item.quantity} st</p>
          <p className="text-sm font-semibold text-muted">
            {formatClock(item.startTime)}-{formatClock(item.endTime)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TicketRows({ tickets }: { tickets: StaffBookingTicket[] }) {
  if (tickets.length === 0) {
    return <p className="border border-border bg-white px-4 py-3 text-sm font-semibold text-muted">Inga biljetter.</p>;
  }

  return (
    <div className="divide-y divide-border border border-border bg-white">
      {tickets.map((ticket) => (
        <div key={ticket.ticketId ?? ticket.customTicketId ?? "ticket"} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_140px_120px]">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground">{ticket.ticketId ?? ticket.customTicketId ?? "-"}</p>
            <p className="truncate text-xs font-semibold text-muted">Item {ticket.bookingItemId ?? "-"}</p>
          </div>
          <span
            className={`w-fit rounded-md px-2.5 py-1 text-xs font-black uppercase ${
              ticket.selectedForCheckIn ? "bg-primary/10 text-primary" : "bg-surface text-muted"
            }`}
          >
            {ticket.selectedForCheckIn ? "Vald" : "Ej vald"}
          </span>
          <p className="text-sm font-semibold text-muted">{statusLabel(ticket.redeemStatusLastSeen) ?? "-"}</p>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({
  detail,
  loading,
  onRedeem,
  redeemMessage,
  redeemState,
}: {
  detail: StaffSessionDetail | null;
  loading: boolean;
  onRedeem: (devToken: string) => void;
  redeemMessage: string;
  redeemState: RedeemState;
}) {
  const [redeemToken, setRedeemToken] = useState("");

  if (loading && !detail) {
    return (
      <section className="grid min-h-80 place-items-center border border-border bg-surface p-8">
        <div className="flex items-center gap-3 text-sm font-black uppercase text-muted">
          <Loader2 className="animate-spin" size={20} />
          Hämtar handoff
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="grid min-h-80 place-items-center border border-border bg-surface p-8 text-center">
        <div>
          <TicketCheck className="mx-auto mb-3 text-muted" size={34} />
          <p className="text-lg font-black text-foreground">Ingen handoff vald</p>
          <p className="mt-1 text-sm font-semibold text-muted">Välj en rad i listan.</p>
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
    redeemToken.trim().length > 0 &&
    redeemState !== "loading";

  return (
    <section
      data-testid="handoff-detail"
      data-handoff-code={detail.handoffCode ?? ""}
      className="border border-border bg-surface"
    >
      <div className="border-b border-border bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">Handoff</p>
            <h2 className="mt-1 text-3xl font-black italic uppercase text-foreground">{getDisplayCode(detail)}</h2>
            <p className="mt-1 text-sm font-semibold text-muted">Session {detail.checkinSessionId}</p>
          </div>
          <span className="rounded-md bg-success/10 px-3 py-2 text-sm font-black uppercase text-success">
            {statusLabel(detail.handoffStatus)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile icon={<Hash size={20} />} label="Bokning" value={detail.bookingReference ?? "-"} />
        <InfoTile icon={<CalendarDays size={20} />} label="Datum" value={formatDate(detail.visitDate)} />
        <InfoTile
          icon={<Clock3 size={20} />}
          label="Tid"
          value={`${formatClock(detail.booking.startTime)}-${formatClock(detail.booking.endTime)}`}
        />
        <InfoTile icon={<ShieldCheck size={20} />} label="Säkerhet" value={statusLabel(detail.safetyStatus)} />
      </div>

      <div className="grid gap-4 p-4 pt-0 xl:grid-cols-[1fr_1fr]">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <PackageCheck className="text-primary" size={20} />
            <h3 className="text-base font-black uppercase text-foreground">Produkter</h3>
          </div>
          <ItemRows items={detail.items} />
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <TicketCheck className="text-primary" size={20} />
            <h3 className="text-base font-black uppercase text-foreground">Biljetter</h3>
          </div>
          <TicketRows tickets={detail.tickets} />
        </section>
      </div>

      <div
        data-testid="staff-redeem-panel"
        className="border-t border-border bg-white p-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <TicketCheck className="text-primary" size={20} />
              <h3 className="text-base font-black uppercase text-foreground">Slutför check-in</h3>
            </div>
            <p className="text-sm font-semibold text-muted">
              Servern gör sista Roller-kontrollen och redeemar valda biljetter.
            </p>
          </div>

          {isCompleted ? (
            <span className="inline-flex min-h-11 items-center gap-2 bg-success/10 px-4 text-sm font-black uppercase text-success">
              <CheckCircle2 size={18} />
              Incheckad
            </span>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[360px] sm:flex-row">
              <label className="flex min-h-11 flex-1 items-center gap-2 border border-border bg-white px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                <KeyRound className="shrink-0 text-muted" size={18} />
                <input
                  value={redeemToken}
                  onChange={(event) => setRedeemToken(event.target.value)}
                  placeholder="Tillfällig dev-kod"
                  type="password"
                  data-testid="staff-redeem-token"
                  className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const token = redeemToken.trim();
                  setRedeemToken("");
                  onRedeem(token);
                }}
                disabled={!canRedeem}
                data-testid="staff-redeem-button"
                className="flex min-h-11 items-center justify-center gap-2 bg-primary px-4 text-sm font-black uppercase text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-muted"
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

      <div className="grid gap-3 border-t border-border bg-white p-4 text-sm font-semibold text-muted sm:grid-cols-3">
        <p>Betalning: {statusLabel(detail.booking.paymentStatus ?? detail.booking.bookingStatus)}</p>
        <p>Total: {formatMoney(detail.booking.totalCents)}</p>
        <p>Redo: {formatDateTime(detail.readyForStaffAt)}</p>
      </div>
    </section>
  );
}

export default function Home() {
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
    setState("loading");
    setError("");

    try {
      const nextSessions = await listReadyStaffSessions();
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
  }, [selectedId]);

  const openHandoffPayload = useCallback(
    (value: string) => {
      const parsed = parseHandoffPayload(value);
      if (!parsed) {
        setError("Koden kÃ¤nns inte igen. Skanna QR-koden eller klistra in hela handoff-koden.");
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
      setError("Handoff-koden finns inte i vÃ¤ntelistan. Tryck Uppdatera eller klistra in hela QR-payloaden.");
    },
    [selectSession, sessions]
  );

  useEffect(() => {
    let cancelled = false;

    listReadyStaffSessions()
      .then((nextSessions) => {
        if (cancelled) return;
        const nextSelectedId = nextSessions[0]?.checkinSessionId ?? null;
        setSessions(nextSessions);
        setSelectedId(nextSelectedId);
        setDetailState(nextSelectedId ? "loading" : "idle");
        setState("ready");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta handovers.");
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!selectedId) return;

    let cancelled = false;

    getStaffSession(selectedId)
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
  }, [detailRequestId, selectedId]);

  const handleRedeem = useCallback(
    async (devToken: string) => {
      if (!detail || !devToken) return;

      setError("");
      setRedeemMessage("");
      setRedeemState("loading");

      try {
        const result = await redeemStaffSession({
          checkinSessionId: detail.checkinSessionId,
          devToken,
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
    [detail]
  );

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) => searchableText(session).includes(normalized));
  }, [query, sessions]);

  const hasError = state === "error" || detailState === "error";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/jumpyard_logo.png"
              alt="JumpYard"
              width={42}
              height={42}
              priority
              className="h-10 w-10 object-contain"
            />
            <div>
              <h1 className="text-2xl font-black italic uppercase text-foreground">Personalhandoff</h1>
              <p className="text-sm font-semibold text-muted">Redo för personal från JumpYard Cloud</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void refreshSessions()}
            disabled={state === "loading"}
            className="flex min-h-11 items-center gap-2 border border-border bg-white px-4 text-sm font-black uppercase text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={state === "loading" ? "animate-spin" : ""} size={18} />
            Uppdatera
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[380px_1fr] lg:px-8">
        <aside className="border border-border bg-white">
          <div className="border-b border-border p-4">
            <label className="flex min-h-12 items-center gap-2 border border-border bg-white px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <Search className="shrink-0 text-muted" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openHandoffPayload(query);
                }}
                placeholder="Sök, skanna eller klistra in QR"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                autoComplete="off"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openHandoffPayload(query)}
                disabled={!query.trim()}
                data-testid="handoff-open-code"
                className="flex min-h-11 items-center justify-center gap-2 border border-border bg-white px-3 text-xs font-black uppercase text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
              >
                <ScanLine size={17} />
                Öppna
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
                className="flex min-h-11 items-center justify-center gap-2 bg-primary px-3 text-xs font-black uppercase text-white transition hover:bg-primary-dark"
              >
                {scannerOpen ? <X size={17} /> : <Camera size={17} />}
                {scannerOpen ? "Stäng" : "Skanna QR"}
              </button>
            </div>

            {scannerOpen && (
              <div
                data-testid="handoff-qr-scanner"
                className="mt-3 overflow-hidden border border-border bg-surface"
              >
                <video
                  ref={scannerVideoRef}
                  className="h-56 w-full bg-black object-cover"
                  muted
                  playsInline
                />
                <div className="flex items-center justify-between gap-3 border-t border-border bg-white px-3 py-2">
                  <p className="text-xs font-bold uppercase text-muted">
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
              <div className="flex items-start gap-2 text-sm font-semibold text-danger">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-black uppercase text-foreground">Väntar</p>
            <span className="rounded-md bg-surface px-2.5 py-1 text-xs font-black text-muted">{filteredSessions.length}</span>
          </div>

          <div className="max-h-[calc(100vh-245px)] overflow-auto">
            {state === "loading" && sessions.length === 0 && (
              <div className="flex items-center gap-3 px-4 py-5 text-sm font-black uppercase text-muted">
                <Loader2 className="animate-spin" size={18} />
                Hämtar
              </div>
            )}

            {state !== "loading" && filteredSessions.length === 0 && (
              <div className="px-4 py-8 text-sm font-semibold text-muted">Inga handovers väntar.</div>
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

        <DetailPanel
          key={detail?.checkinSessionId ?? "empty"}
          detail={detail}
          loading={detailState === "loading"}
          onRedeem={handleRedeem}
          redeemMessage={redeemMessage}
          redeemState={redeemState}
        />
      </div>
    </main>
  );
}
