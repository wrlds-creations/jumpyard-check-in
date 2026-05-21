"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Hash,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Search,
  ShieldCheck,
  TicketCheck,
} from "lucide-react";
import {
  getStaffSession,
  listReadyStaffSessions,
  type StaffBookingItem,
  type StaffBookingTicket,
  type StaffSessionDetail,
  type StaffSessionSummary,
} from "@/lib/adminApi";

type LoadState = "idle" | "loading" | "ready" | "error";

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

function statusLabel(value?: string | null) {
  if (!value) return "-";

  const labels: Record<string, string> = {
    completed: "Klar",
    fresh: "Fresh",
    not_started: "Inte startad",
    paid: "Betald",
    ready_for_staff: "Redo",
    requires_staff: "Kräver personal",
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

function DetailPanel({ detail, loading }: { detail: StaffSessionDetail | null; loading: boolean }) {
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StaffSessionSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");

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
  }, [selectedId]);

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
                placeholder="Sök kod eller bokning"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none"
                autoComplete="off"
              />
            </label>
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
                onSelect={() => {
                  setError("");
                  setSelectedId(session.checkinSessionId);
                  setDetailState("loading");
                }}
                session={session}
              />
            ))}
          </div>
        </aside>

        <DetailPanel detail={detail} loading={detailState === "loading"} />
      </div>
    </main>
  );
}
