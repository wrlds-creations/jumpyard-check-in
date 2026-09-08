"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Plus, RefreshCcw, ScanLine, Search, X } from "lucide-react";
import type { HandoutArea, HandoutItem, HandoutRequest, HandoutSelection, StaffAuthSession, StaffSessionDetail, StaffSessionSummary } from "@/lib/adminApi";
import { activeClaim, clock, itemIcon, nextPass, stageOf, stockholmDay, type Stage } from "./flow";
import { Icon, cls } from "./ui";

const stages: { id: Stage; label: string }[] = [
  { id: "ready", label: "Redo" }, { id: "started", label: "Påbörjade" },
  { id: "upcoming", label: "Kommande" }, { id: "completed", label: "Incheckade" },
];
interface Props {
  auth: StaffAuthSession;
  sessions: StaffSessionSummary[];
  detail: StaffSessionDetail | null;
  selectedId: string | null;
  loading: boolean;
  detailLoading: boolean;
  busy: boolean;
  error: string;
  recoveryTarget?: { checkinSessionId: string; area: HandoutArea } | null;
  query: string;
  day: string;
  scanner: ReactNode;
  onDay: (day: string) => void;
  onQuery: (query: string) => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onScan: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  onHandout: (request: HandoutRequest) => Promise<boolean>;
}

function BookingRow({ session, area, actorId, selected, onOpen }: {
  session: StaffSessionSummary; area: HandoutArea; actorId?: string; selected: boolean; onOpen: () => void;
}) {
  const claim = activeClaim(session.claims, area);
  const stage = stageOf(session);
  const status = claim ? claim.actorId === actorId ? "Du hjälper" : `${claim.actorName} hjälper`
    : area === "cafe" ? session.cafeRemaining ? `${session.cafeRemaining} kvar att hämta` : "Utlämnat"
      : stage === "completed" ? `Incheckad ${clock(session.completedAt)}${session.checkedInBy?.displayName ? ` · ${session.checkedInBy.displayName}` : ""}`
      : session.bookingSyncStatus !== "confirmed" ? "Bekräftas" : session.isExpired ? "Gått ut"
        : stages.find((item) => item.id === stage)?.label;
  return <button type="button" onClick={onOpen} aria-pressed={selected}
    className={`w-full min-w-0 rounded-2xl border px-3 py-3 text-left shadow-sm transition active:scale-[0.99] ${selected ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border bg-white hover:border-primary"}`}>
    <span className="flex items-center justify-between gap-3">
      <span className="truncate text-base font-black italic uppercase leading-tight">{session.guest?.name || session.bookingReference || "Bokning"}</span>
      {session.handoffCode && <span className="shrink-0 text-lg font-black tabular-nums leading-none">{session.handoffCode}</span>}
    </span>
    <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
      <span className="flex items-center gap-3 text-xs font-bold">
        <span className="flex items-center gap-1"><Icon name="group" className="h-5 w-5" />{session.counts.admission || session.counts.selectedTickets || session.counts.tickets || "—"}</span>
        <span className="flex items-center gap-1"><Icon name="time" className="h-5 w-5" />{clock(session.booking.startTime)}</span>
      </span>
      <span className={`text-xs font-bold ${claim ? "text-primary" : stage === "ready" || stage === "completed" ? "text-success" : ""}`}>{status}</span>
    </span>
  </button>;
}

function ProductRow({ item, quantity, disabled, onQuantity }: {
  item: HandoutItem; quantity: number; disabled: boolean; onQuantity: (quantity: number) => void;
}) {
  const remaining = item.available ?? Math.max(0, item.quantity - item.collected);
  return <div className={`rounded-2xl border ${quantity > 0 ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "border-border bg-white"}`}>
    <button type="button" onClick={() => onQuantity(quantity > 0 ? 0 : remaining)} disabled={disabled || remaining === 0}
      aria-pressed={quantity > 0} aria-label={`${item.name}, ${remaining} kvar`}
      className="grid min-h-18 w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-3 text-left">
      <Icon name={itemIcon[item.kind] || "addons-bag"} className="h-10 w-10" />
      <span className="min-w-0"><span className="block text-sm font-black italic uppercase leading-tight">{item.name}</span>
        <span className="mt-1 block text-xs font-medium">{item.collected > 0 ? `${item.collected} av ${item.quantity} utlämnade` : item.detail}</span></span>
      <span className="text-2xl font-black italic tabular-nums">{remaining}<span className="ml-1 text-xs not-italic">st</span></span>
      {remaining === 0 ? <Icon name="success-check" className="h-7 w-7" /> : <span aria-hidden="true"
        className={`grid h-7 w-7 place-items-center rounded-full border-2 ${quantity > 0 ? "border-primary bg-primary text-white" : "border-border"}`}>
        {quantity > 0 && <Check size={16} strokeWidth={3} />}</span>}
    </button>
    {quantity > 0 && remaining > 1 && item.kind !== "admission" && <div className="flex items-center justify-between border-t border-primary/15 px-3 py-1">
      <span className="text-xs font-bold">Lämna ut {quantity} av {remaining}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={disabled} onClick={() => onQuantity(quantity - 1)} aria-label={`Minska ${item.name}`} className="grid h-11 w-11 place-items-center"><Minus size={18} /></button>
        <span className="w-6 text-center text-lg font-black tabular-nums">{quantity}</span>
        <button type="button" disabled={disabled || quantity >= remaining} onClick={() => onQuantity(quantity + 1)} aria-label={`Öka ${item.name}`} className="grid h-11 w-11 place-items-center"><Plus size={18} /></button>
      </div>
    </div>}
  </div>;
}

function Detail({ props, area, onArea }: { props: Props; area: HandoutArea; onArea: (area: HandoutArea) => void }) {
  const [served, setServed] = useState(false);
  const detail = props.detail;
  if (!detail) return <section className="rounded-3xl border border-border bg-white p-5">
    <button type="button" className={cls.text} onClick={props.onClose}>Tillbaka</button>
    <p role="status" className="py-4 text-sm font-bold">{props.detailLoading ? "Hämtar bokningen…" : props.error || "Öppna en bokning eller skanna gästens QR-kod."}</p>
  </section>;
  const handout = detail.handout;
  const claim = handout?.claims.find((item) => item.area === area);
  const currentClaim = activeClaim(handout?.claims, area);
  const owned = Boolean(claim?.actorId && claim.actorId === props.auth.staff.actorId);
  const colleague = Boolean(currentClaim && !owned && Date.parse(currentClaim.expiresAt) > Date.now());
  const pending = Boolean(claim?.pendingOperation);
  const selected = owned || pending ? claim?.selection || [] : [];
  const stage = stageOf(detail);
  const complete = stage === "completed";
  const products = handout?.items.filter((item) => item.area === area) || [];
  const other = handout?.items.filter((item) => item.area !== area) || [];
  const remaining = products.filter((item) => (item.available ?? item.quantity - item.collected) > 0);
  const reader = props.auth.staff.role === "staff_reader";
  const blocked = reader || !handout || colleague || detail.visitDate !== stockholmDay() ||
    (!complete && stage !== "ready") || (area === "cafe" && !complete);
  const disabled = blocked || props.busy || pending;
  const blocker = colleague ? `${currentClaim?.actorName} hjälper gästen` : reader ? "Du har läsbehörighet"
    : area === "cafe" && !complete ? "Checka in gästen i entrén först"
      : detail.visitDate !== stockholmDay() ? "Bokningen gäller en annan dag"
        : stage === "upcoming" ? "Check-in inte påbörjad"
          : detail.bookingSyncStatus !== "confirmed" ? "Bokningen bekräftas"
            : detail.isExpired && !complete ? "Förberedelsen har gått ut – gästen öppnar bokningen igen"
              : stage === "started" ? "Gästen slutför check-in i mobilen eller kiosken" : null;
  const needsAdmission = selected.some((line) => products.some((item) => item.id === line.id && item.kind === "admission"));
  function change(selection: HandoutSelection[]) {
    setServed(false);
    void props.onHandout({ area, action: "select", revision: claim?.revision || 0, selection });
  }
  function quantity(item: HandoutItem, quantity: number) {
    change([...selected.filter((line) => line.id !== item.id), ...(quantity > 0 ? [{ id: item.id, quantity }] : [])]);
  }
  async function confirm() {
    if (await props.onHandout({ area, action: "confirm", revision: claim?.revision || 0 })) setServed(true);
  }
  return <section className="rounded-3xl border border-border bg-white shadow-sm">
    <div className="flex items-start justify-between gap-3 border-b border-border p-4">
      <div className="min-w-0"><h2 className="break-words text-2xl font-black italic uppercase leading-tight sm:text-3xl">{detail.guest?.name || "Bokning"}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1"><Icon name="group" className="h-5 w-5" />{detail.counts.admission || detail.counts.selectedTickets || detail.counts.tickets} gäster</span>
          <span className="flex items-center gap-1"><Icon name="time" className="h-5 w-5" />{clock(detail.booking.startTime)}</span>
          <span>{detail.bookingReference}</span>
          {detail.handoffDay && detail.handoffDay !== detail.visitDate && <span>Nummer från {detail.handoffDay}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{detail.handoffCode && <span className="text-2xl font-black tabular-nums">{detail.handoffCode}</span>}
        <button type="button" onClick={props.onClose} className={cls.icon} aria-label="Stäng bokning"><X size={18} /></button>
      </div>
    </div>
    {complete && <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold text-success"><Icon name="success-check" className="h-6 w-6" />
      Incheckad {clock(detail.completedAt)}{detail.checkedInBy?.displayName ? ` · ${detail.checkedInBy.displayName}` : ""}</p>}
    {blocker && <p className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold"><Icon name="info" className="h-6 w-6" />{blocker}</p>}
    {served && <div role="status" className="flex items-center gap-3 border-b border-border px-4 py-4 text-success"><Icon name="success-check" className="h-10 w-10" /><p className="text-lg font-black italic uppercase">Utlämningen är sparad</p></div>}
    <div className="p-3 sm:p-4">
      <div className="mb-2 flex min-h-9 items-center justify-between gap-3"><h3 className="text-xs font-black italic uppercase tracking-wider">{area === "cafe" ? "Café" : "Lämna ut"}</h3>
        {remaining.length > 1 && !blocked && <button type="button" className={cls.text} disabled={disabled} onClick={() => change(remaining.map((item) => ({ id: item.id, quantity: item.available ?? item.quantity - item.collected })))}>Välj alla</button>}
      </div>
      <div className="grid gap-2">{products.map((item) => <ProductRow key={item.id} item={item} quantity={selected.find((line) => line.id === item.id)?.quantity || 0} disabled={disabled} onQuantity={(value) => quantity(item, value)} />)}</div>
      {products.length === 0 && <p className="py-3 text-sm">{stage === "ready" || complete ? "Inget att lämna ut här." : "Produkterna visas när bokningen är klar."}</p>}
      {other.length > 0 && <details className="mt-4" open={area === "entrance"}>
        <summary className="cursor-pointer py-2 text-xs font-black italic uppercase tracking-wider">{area === "cafe" ? "Entré · visa utlämning" : "Hämtas i caféet"}</summary>
        <div className="grid gap-2">{other.map((item) => <ProductRow key={item.id} item={item} quantity={0} disabled onQuantity={() => {}} />)}</div>
        <button type="button" className={`${cls.text} mt-2`} onClick={() => onArea(area === "cafe" ? "entrance" : "cafe")}>Visa {area === "cafe" ? "entré" : "café"}</button>
      </details>}
      {Boolean(handout?.receipts.length) && <details className="mt-3"><summary className="cursor-pointer py-2 text-xs font-bold">Utlämningshistorik</summary>
        <ul className="grid gap-2">{handout?.receipts.map((receipt) => <li key={receipt.operationId} className="rounded-xl border border-border p-3 text-sm">
          <p className="font-bold">{receipt.items.map((item) => `${item.quantity} ${item.name.toLocaleLowerCase("sv-SE")}`).join(" · ")}</p>
          <p className="mt-1 text-xs">{clock(receipt.completedAt)} · {receipt.actorName} · {receipt.area === "cafe" ? "Café" : "Entré"}</p>
        </li>)}</ul>
      </details>}
    </div>
    <div className="sticky bottom-0 rounded-b-3xl border-t border-border bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4">
      {owned && <div className="mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-xs font-bold"><Icon name="profile" className="h-5 w-5" />Du hjälper gästen</span>
        {!pending && <button type="button" disabled={props.busy} className={cls.text} onClick={() => void props.onHandout({ area, action: "release", revision: claim?.revision || 0 })}>Lämna tillbaka</button>}
      </div>}
      {props.error && <p role="alert" className="mb-3 text-sm font-bold text-danger">{props.error}</p>}
      {props.recoveryTarget && <button type="button" className={`${cls.text} mb-3 w-full`} onClick={() => {
        onArea(props.recoveryTarget!.area); props.onOpen(props.recoveryTarget!.checkinSessionId);
      }}>Öppna pågående utlämning</button>}
      {pending && <p className="mb-2 text-xs font-bold">Bekräftelsen sparas. Vid avbrott fortsätter du med samma val.</p>}
      <button type="button" className={`${cls.primary} min-h-14 w-full`} disabled={props.busy || blocked || (!pending && selected.length === 0 && !served && remaining.length > 0)}
        onClick={served || (!pending && remaining.length === 0) ? props.onScan : () => void confirm()}>
        {props.busy ? "Sparar…" : pending ? "Fortsätt bekräfta" : served || remaining.length === 0 ? "Skanna nästa" : needsAdmission && !complete ? "Checka in" : "Lämna ut"}
      </button>
      <button type="button" className={`${cls.text} mt-2 w-full`} onClick={props.onClose}>Tillbaka till kön</button>
    </div>
  </section>;
}

export default function StaffExperience(props: Props) {
  const [area, setArea] = useState<HandoutArea>("entrance");
  const [pass, setPass] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("ready");
  const [cafeDone, setCafeDone] = useState(false);
  const passTime = pass || nextPass(props.sessions, new Date(), props.day);
  const slots = [...new Set(props.sessions.map((session) => session.booking.startTime?.slice(0, 5)).filter((value): value is string => Boolean(value)))].sort();
  const passBookings = props.sessions.filter((session) => passTime === "all" || session.booking.startTime?.slice(0, 5) === passTime);
  const cafeSummary = (session: StaffSessionSummary) => stageOf(session) !== "completed" && session.cafeSession ? { ...session, ...session.cafeSession } : session;
  const cafeBookings = props.sessions.filter((session) => (session.cafeSession || stageOf(session) === "completed") && (session.cafeQuantity || 0) > 0).map(cafeSummary);
  const visible = props.query.trim() ? area === "cafe" ? props.sessions.map(cafeSummary) : props.sessions
    : area === "cafe" ? cafeBookings.filter((session) => cafeDone ? session.cafeRemaining === 0 : (session.cafeRemaining || 0) > 0) : passBookings.filter((session) => stageOf(session) === stage);
  const earlier = area === "entrance" && !props.query.trim() && passTime !== "all" ? props.sessions.filter((session) => stageOf(session) === "ready" && (session.booking.startTime || "") < passTime) : [];
  const owned = props.sessions.map((session) => ({ session, claim:
    [activeClaim(session.claims, "entrance"), activeClaim(session.claims, "cafe")]
      .find((claim) => claim?.actorId === props.auth.staff.actorId),
  })).find((entry) => entry.claim);
  const own = owned?.session;
  const ownClaim = owned?.claim;
  const selected = Boolean(props.selectedId);
  const detail = selected ? <Detail key={`${props.selectedId}:${area}`} props={props} area={area} onArea={setArea} /> : null;
  return <main className="min-h-screen bg-white text-black" style={{ "--border": "#efcfd6", "--surface": "#fff4f6", "--surface-strong": "#fce4e9", "--success": "#087f5b" } as CSSProperties}>
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-3 py-2 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Image src="/jumpyard_logo.png" alt="JumpYard" width={42} height={42} priority className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0"><h1 className="text-xl font-black italic uppercase leading-none sm:text-2xl">Check-in</h1>
          <p className="mt-1 truncate text-xs font-bold" data-testid="staff-personal-identity">{props.auth.staff.displayName} · {props.day}</p></div>
      </div><div className="flex items-center gap-1"><button type="button" aria-label="Uppdatera" className={cls.icon} onClick={props.onRefresh}><RefreshCcw size={17} className={props.loading ? "animate-spin" : ""} /></button>
        <button type="button" onClick={props.onLogout} className="min-h-11 px-2 text-xs font-bold italic sm:text-sm">Byt personal</button></div></div>
    </header>
    {props.scanner}
    {detail && <div className="mx-auto max-w-3xl px-3 py-3 lg:hidden">{detail}</div>}
    <div className={`mx-auto max-w-7xl gap-4 px-3 py-3 sm:px-6 lg:grid-cols-[minmax(340px,400px)_1fr] lg:px-8 ${selected ? "hidden lg:grid" : "grid"}`}>
      <aside className="min-w-0">
        {own && ownClaim && ownClaim.checkinSessionId !== props.selectedId && <button type="button" className="mb-3 flex min-h-12 w-full items-center gap-2 rounded-2xl border border-primary bg-primary/5 px-3 text-left text-sm font-bold" onClick={() => {
          setArea(ownClaim.area); props.onOpen(ownClaim.checkinSessionId);
        }}><Icon name="profile" className="h-7 w-7" />Fortsätt med {own.guest?.name || own.handoffCode}</button>}
        <div className="flex gap-2"><label className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"><Search size={18} className="shrink-0" />
          <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onSearch(); }} placeholder="Namn, bokning eller nummer" aria-label="Sök namn, bokning eller nummer" autoComplete="off" className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-black/50" />
          {props.query && <button type="button" aria-label="Rensa sökning" onClick={() => props.onQuery("")} className="grid h-9 w-9 place-items-center"><X size={16} /></button>}
        </label><button type="button" onClick={props.onScan} className={`${cls.primary} px-3`} aria-label="Skanna QR"><ScanLine size={19} /></button></div>
        <div className="mt-3 flex items-end justify-between gap-2 border-b border-border"><div className="flex gap-1">{(["entrance", "cafe"] as HandoutArea[]).map((value) => <button key={value} type="button" aria-pressed={area === value} onClick={() => setArea(value)} className={`-mb-px flex min-h-12 items-center gap-1 border-b-3 px-2 text-sm font-black italic uppercase ${area === value ? "border-primary text-primary" : "border-transparent"}`}><Icon name={value === "entrance" ? "group" : "drink-cup"} className="h-6 w-6" />{value === "entrance" ? "Entré" : "Café"}</button>)}</div>
          <label className="relative mb-2 flex items-center gap-1 text-sm font-black italic"><Icon name="time" className="h-6 w-6" /><select aria-label="Visa pass" value={passTime} onChange={(event) => setPass(event.target.value)} className="max-w-34 appearance-none bg-transparent py-2 pr-4 outline-none">{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}<option value="all">Hela dagen</option></select><ChevronDown size={14} className="pointer-events-none absolute right-0" /></label>
        </div>
        {!props.query.trim() && area === "entrance" && <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-2xl border border-border">{stages.map((item) => <button key={item.id} type="button" aria-pressed={stage === item.id} onClick={() => setStage(item.id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 border-l border-border first:border-l-0 ${stage === item.id ? "bg-primary/5 text-primary shadow-[inset_0_-3px_0_0_var(--primary)]" : "bg-white"}`}><span className="text-[10px] font-black italic uppercase min-[360px]:text-[11px]">{item.label}</span><span className="text-lg font-black italic tabular-nums">{passBookings.filter((session) => stageOf(session) === item.id).length}</span></button>)}</div>}
        {area === "cafe" && !props.query.trim() && <div className="mt-3 grid grid-cols-2 gap-2">{[false, true].map((done) => <button key={String(done)} type="button" onClick={() => setCafeDone(done)} aria-pressed={cafeDone === done} className={`min-h-12 rounded-2xl border text-sm font-black italic uppercase ${cafeDone === done ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>{done ? "Utlämnat" : "Kvar att hämta"}</button>)}</div>}
        {props.error && !selected && <p role="alert" className="mt-3 rounded-2xl border border-primary p-3 text-sm font-bold text-danger">{props.error}</p>}
        <div className="my-3 flex items-center justify-between gap-2 text-xs font-bold"><span>{props.query.trim() ? `${visible.length} ${visible.length === 1 ? "träff" : "träffar"} · hela dagen` : area === "cafe" ? "Incheckade · skanna eller välj gäst" : pass === null && passTime !== "all" ? `Nästa pass · ${passTime}` : `${visible.length} ${visible.length === 1 ? "bokning" : "bokningar"}`}</span>
          <label className="min-w-0">{/^[0-9]{4}$/.test(props.query.trim()) && <span className="block text-[10px]">Nummerdatum</span>}<input type="date" aria-label="Visa datum" value={props.day} onChange={(event) => { if (event.target.value) { setPass(null); props.onDay(event.target.value); } }} className="min-h-9 min-w-0 max-w-32 rounded-lg border border-border bg-white px-1" /></label></div>
        <div className="grid gap-2">{visible.map((session) => <BookingRow key={session.checkinSessionId} session={session} area={area} actorId={props.auth.staff.actorId} selected={session.checkinSessionId === props.selectedId} onOpen={() => props.onOpen(session.checkinSessionId)} />)}</div>
        {visible.length === 0 && <p role="status" className="py-8 text-center text-sm font-bold">{props.loading ? "Hämtar bokningar…" : "Inga bokningar här just nu."}</p>}
        {earlier.length > 0 && <details className="mt-4"><summary className="cursor-pointer py-3 text-sm font-bold">Tidigare gäster som väntar · {earlier.length}</summary><div className="grid gap-2">{earlier.map((session) => <BookingRow key={session.checkinSessionId} session={session} area={area} actorId={props.auth.staff.actorId} selected={false} onOpen={() => props.onOpen(session.checkinSessionId)} />)}</div></details>}
      </aside>
      <div className="hidden lg:block">{detail || <div className="grid min-h-80 place-content-center rounded-3xl border border-border p-6 text-center"><Icon name={area === "cafe" ? "drink-cup" : "visitor-wristband"} className="mx-auto h-20 w-20" /><h2 className="mt-5 text-2xl font-black italic uppercase">Redo när gästen är redo</h2><p className="mt-2 text-sm">Skanna QR eller välj en bokning.</p></div>}</div>
    </div>
  </main>;
}
