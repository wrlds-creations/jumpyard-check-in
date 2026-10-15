"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, LoaderCircle, Minus, Plus, RefreshCcw, Search, X } from "lucide-react";
import type { HandoutArea, HandoutItem, HandoutReceipt, HandoutRequest, StaffAuthSession, StaffSessionDetail, StaffSessionSummary } from "@/lib/adminApi";
import { activeClaim, boardTab, checkedInLabel, checkedInTime, clock, itemIcon, jumpTime, nextPass, plannedBands, stageOf, stockholmDay, type BoardTab } from "./flow";
import { BandChip, Icon, cls } from "./ui";

// GH-541 (D0263): Cloud checks every finished group in itself, so the entrance keeps two lists.
// GH-547 (D0265): a guest who is done on the phone or kiosk is Incheckad at once; there is no red box.
const tabs: { id: BoardTab; label: string }[] = [{ id: "upcoming", label: "Kommande" }, { id: "completed", label: "Incheckade" }];
// The café computer stays on Café after "Byt personal" or an idle logout in the same browser tab.
const AREA_KEY = "jumpyard_staff_area_v1";
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
  onQuery: (query: string) => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  onHandout: (request: HandoutRequest, options?: { confirm?: boolean }) => Promise<boolean>;
}
type HandoutView = ReturnType<typeof handoutView>;

const left = (item: HandoutItem) => item.available ?? Math.max(0, item.quantity - item.collected);
const nameOf = (session: StaffSessionSummary) => session.guest?.name || session.bookingReference || "Bokning";
const checkedInAt = (session: StaffSessionSummary) => Date.parse(checkedInTime(session) || "") || 0;
const byStart = (a: StaffSessionSummary, b: StaffSessionSummary) =>
  (a.booking.startTime || "").localeCompare(b.booking.startTime || "") || nameOf(a).localeCompare(nameOf(b), "sv");
const newestFirst = (a: StaffSessionSummary, b: StaffSessionSummary) =>
  checkedInAt(b) - checkedInAt(a) || (b.handoffCode || "").localeCompare(a.handoffCode || "");
const oldestFirst = (a: StaffSessionSummary, b: StaffSessionSummary) =>
  (checkedInAt(a) || Number.MAX_SAFE_INTEGER) - (checkedInAt(b) || Number.MAX_SAFE_INTEGER) || (a.handoffCode || "").localeCompare(b.handoffCode || "");
function lastReceipt(receipts: HandoutReceipt[] | undefined, area: HandoutArea) {
  return (receipts || []).filter((receipt) => receipt.area === area)
    .reduce<HandoutReceipt | null>((last, receipt) => !last || Date.parse(receipt.completedAt) > Date.parse(last.completedAt) ? receipt : last, null);
}
function readArea(): HandoutArea {
  try { return window.sessionStorage.getItem(AREA_KEY) === "cafe" ? "cafe" : "entrance"; } catch { return "entrance"; }
}

function AdmissionCount({ count }: { count?: number }) {
  if (!Number.isSafeInteger(count) || !count || count < 0) return null;
  return <span className="flex items-center gap-1"><Icon name="visitor-wristband" className="h-5 w-5" />{count} {count === 1 ? "entré" : "entréer"}</span>;
}

function Note({ icon, tone = "", children }: { icon: string; tone?: string; children: ReactNode }) {
  return <p className={`flex items-center gap-2 text-sm font-bold ${tone}`}><Icon name={icon} className="h-6 w-6" />{children}</p>;
}

function rowStatus(session: StaffSessionSummary, area: HandoutArea, actorId?: string) {
  const claim = activeClaim(session.claims, area);
  if (claim) return { text: claim.actorId === actorId ? "Du hjälper" : `${claim.actorName} hjälper`, tone: "text-primary" };
  if (area === "cafe") return session.cafeRemaining ? { text: `${session.cafeRemaining} kvar`, tone: "text-primary" } : { text: "Utlämnat", tone: "text-success" };
  const stage = stageOf(session);
  if (stage === "completed") return { text: checkedInLabel(session), tone: "text-success" };
  if (session.isExpired) return { text: "Gått ut", tone: "" };
  if (stage === "started") return { text: "Påbörjad", tone: "text-primary" };
  return null;
}

function Row({ session, area, props, onArea }: {
  session: StaffSessionSummary; area: HandoutArea; props: Props; onArea?: (area: HandoutArea) => void;
}) {
  const open = props.selectedId === session.checkinSessionId;
  const status = rowStatus(session, area, props.auth.staff.actorId);
  const cafe = area === "cafe";
  // GH-459: entrance staff see which bands to take; a count shows when the group has several colours.
  const bands = cafe ? [] : session.bandColours ?? [];
  const counted = bands.length > 1 || bands.reduce((sum, band) => sum + band.quantity, 0) !== session.counts.admission;
  const chevron = <ChevronDown size={cafe ? 22 : 18} aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-180 text-primary" : ""}`} />;
  return <article className={`@container min-w-0 rounded-2xl border bg-white shadow-sm ${open ? "border-primary ring-4 ring-primary/10" : "border-border"}`}>
    <button type="button" aria-expanded={open} onClick={open ? props.onClose : () => props.onOpen(session.checkinSessionId)}
      className={`w-full min-w-0 text-left transition active:scale-[0.995] ${cafe ? "flex items-center gap-3 px-4 py-3 @2xl:gap-6 @2xl:px-6 @2xl:py-5" : "px-3 py-3"}`}>
      {cafe ? <>
        <span className="min-w-16 text-4xl font-black tabular-nums leading-none @2xl:min-w-28 @2xl:text-6xl">{session.handoffCode || "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-black italic uppercase leading-tight @2xl:text-3xl">{nameOf(session)}</span>
          <span className="mt-1 flex items-center gap-1 text-xs font-bold @2xl:text-sm"><Icon name="time" className="h-5 w-5" />{clock(session.booking.startTime)}</span>
        </span>
        {status && <span className={`shrink-0 text-base font-black italic uppercase @2xl:text-2xl ${status.tone}`}>{status.text}</span>}
        {chevron}
      </> : <>
        <span className="flex items-center justify-between gap-3">
          <span className="truncate text-lg font-black italic uppercase leading-tight">{nameOf(session)}</span>
          <span className="flex shrink-0 items-center gap-2">{session.handoffCode && <span className="text-2xl font-black tabular-nums leading-none">{session.handoffCode}</span>}{chevron}</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
            <AdmissionCount count={session.counts.admission} />
            {bands.map((band) => <BandChip key={band.id} colour={band} count={counted ? band.quantity : undefined} />)}
            <span className="flex items-center gap-1"><Icon name="time" className="h-5 w-5" />{jumpTime(session)}</span>
          </span>
          {status && <span className={`text-xs font-bold ${status.tone}`}>{status.text}</span>}
        </span>
      </>}
    </button>
    {open && <div className="border-t border-border"><Panel session={session} area={area} props={props} onArea={onArea} /></div>}
  </article>;
}

function Panel({ session, area, props, onArea }: { session: StaffSessionSummary; area: HandoutArea; props: Props; onArea?: (area: HandoutArea) => void }) {
  const detail = props.detail?.checkinSessionId === session.checkinSessionId ? props.detail : null;
  if (!detail) return <p role="status" className="flex items-center gap-2 px-4 py-4 text-sm font-bold">
    {props.detailLoading && <LoaderCircle size={18} aria-hidden="true" className="animate-spin text-primary motion-reduce:animate-none" />}
    {props.detailLoading ? "Hämtar…" : props.error || "Bokningen kunde inte hämtas. Försök igen."}</p>;
  return area === "cafe" ? <CafePanel key={detail.checkinSessionId} detail={detail} props={props} onArea={onArea} />
    : <EntrancePanel detail={detail} summary={session} props={props} onArea={onArea} />;
}

function handoutView(detail: StaffSessionDetail, area: HandoutArea, props: Props) {
  const handout = detail.handout;
  const claim = handout?.claims.find((item) => item.area === area);
  const current = activeClaim(handout?.claims, area);
  const owned = Boolean(claim?.actorId && claim.actorId === props.auth.staff.actorId);
  const colleague = Boolean(current && !owned);
  const pending = owned && Boolean(claim?.pendingOperation);
  const stage = stageOf(detail);
  const complete = stage === "completed";
  const products = handout?.items.filter((item) => item.area === area) || [];
  // GH-547 (D0265): a checked-in group is handed out at once, even while ROLLER still confirms its purchase
  // (the press is then kept on this device and confirmed in Cloud later).
  const blocker = colleague ? `${current?.actorName} hjälper gästen` : props.auth.staff.role === "staff_reader" ? "Du har läsbehörighet"
    : detail.visitDate !== stockholmDay() ? "Bokningen gäller en annan dag"
      : stage === "upcoming" ? "Check-in inte påbörjad"
        : detail.isExpired && !complete ? "Förberedelsen har gått ut – gästen öppnar bokningen igen"
          : stage === "started" ? "Gästen slutför check-in i mobilen eller kiosken" : null;
  return { claim, owned, pending, stage, complete, products, blocker, handout,
    remaining: products.filter((item) => left(item) > 0), locked: Boolean(blocker) || !handout };
}

function Goods({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{children}</div>;
}

function ProductRow({ item, amount, disabled = false, large = false, onAmount }: {
  item: HandoutItem; amount?: number; disabled?: boolean; large?: boolean; onAmount?: (amount: number) => void;
}) {
  const remaining = left(item);
  const done = remaining === 0 && item.collected > 0;
  const duration = !done && item.kind === "admission" ? item.detail?.match(/\b\d+\s*min\b/)?.[0] : null;
  // GH-459: the band colour comes from Cloud's scheme; nothing shows when it has none.
  const band = item.kind === "admission" ? item.bandColour : undefined;
  const name = band?.name?.sv ? `${item.name} ${band.name.sv}` : item.name;
  const stepper = Boolean(onAmount) && remaining > 0;
  const chosen = Math.max(0, Math.min(amount ?? remaining, remaining));
  const step = `grid h-11 w-11 place-items-center rounded-xl border border-border transition hover:border-primary disabled:text-primary/30 disabled:hover:border-border ${large ? "@2xl:h-14 @2xl:w-14" : ""}`;
  return <div role="group" aria-label={done ? `${name}, utlämnat` : `${name}, ${remaining} kvar`} data-state={done ? "completed" : "available"}
    className={`grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-white px-3 py-2 ${large ? "@2xl:min-h-20 @2xl:px-4" : ""}`}>
    <Icon name={itemIcon[item.kind] || "addons-bag"} className={large ? "h-9 w-9 @2xl:h-14 @2xl:w-14" : "h-9 w-9"} />
    <span className="min-w-0"><span className={`block font-black italic uppercase leading-tight ${large ? "text-base @2xl:text-3xl" : "text-base"}`}>{item.name}</span>
      {(duration || band || stepper) && <span className={`mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium ${large ? "@2xl:text-base" : ""}`}>
        {duration}{band && <BandChip colour={band} />}{stepper && <span className="font-bold">{remaining} kvar</span>}</span>}</span>
    {done ? <span className="grid h-8 w-8 place-items-center text-success"><Check size={24} strokeWidth={3} /></span>
      : stepper ? <span className="flex items-center gap-1.5">
        <button type="button" disabled={disabled || chosen === 0} onClick={() => onAmount?.(chosen - 1)} aria-label={`Minska ${item.name}`} className={step}><Minus size={18} /></button>
        <span className={`min-w-9 text-center text-3xl font-black italic tabular-nums ${large ? "@2xl:min-w-14 @2xl:text-5xl" : ""}`}>{chosen}</span>
        <button type="button" disabled={disabled || chosen >= remaining} onClick={() => onAmount?.(chosen + 1)} aria-label={`Öka ${item.name}`} className={step}><Plus size={18} /></button>
      </span>
        : <span className="text-3xl font-black italic tabular-nums">{remaining}</span>}
  </div>;
}

function Actions({ props, area, view, action, label, disabled, done, onRun, onArea }: {
  props: Props; area: HandoutArea; view: HandoutView; action: string | null; label: string; disabled: boolean;
  done: HandoutReceipt | null; onRun: () => void; onArea?: (area: HandoutArea) => void;
}) {
  const target = props.recoveryTarget;
  return <div className="grid content-start gap-2 pt-1">
    {props.error && <p role="alert" className="text-sm font-bold text-danger">{props.error}</p>}
    {target && <button type="button" className={`${cls.text} w-full`} onClick={() => { onArea?.(target.area); props.onOpen(target.checkinSessionId); }}>Öppna pågående utlämning</button>}
    {action ? <button type="button" aria-busy={props.busy} disabled={props.busy || disabled} onClick={onRun}
      className={`${cls.primary} min-h-14 w-full gap-2 text-base disabled:aria-busy:bg-primary disabled:aria-busy:text-white ${area === "cafe" ? "@2xl:min-h-20" : ""}`}>
      {/* The size sits on the label: Acumin's button role fixes the button's own size (D0247). */}
      {props.busy && <LoaderCircle size={20} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}<span aria-live="polite" className={area === "cafe" ? "@2xl:text-3xl" : ""}>{props.busy ? "Sparar…" : label}</span>
    </button> : done && view.products.length > 0 && !view.remaining.length && <p className={`flex min-h-12 items-center justify-center gap-2 text-base font-black italic uppercase text-success ${area === "cafe" ? "@2xl:text-2xl" : ""}`}>
      <Check size={20} strokeWidth={3} aria-hidden="true" />Utlämnat {clock(done.completedAt)} · {done.actorName}</p>}
    {view.owned && !view.pending && !props.busy && <button type="button" className={`${cls.text} justify-self-end`}
      onClick={() => void props.onHandout({ area, action: "release", revision: view.claim?.revision || 0 })}>Lämna tillbaka</button>}
  </div>;
}

function EntrancePanel({ detail, summary, props, onArea }: {
  detail: StaffSessionDetail; summary?: StaffSessionSummary; props: Props; onArea?: (area: HandoutArea) => void;
}) {
  const view = handoutView(detail, "entrance", props);
  // GH-541: before check-in the bands come from the row, the way a checked-in group shows them; read-only.
  const goods = view.complete || view.products.some((item) => item.kind === "admission") ? view.products
    : [...plannedBands(summary ?? detail), ...view.products];
  const cafe = (view.handout?.items || []).filter((item) => item.area === "cafe");
  const cafeLeft = cafe.filter((item) => left(item) > 0);
  // GH-541 (D0263): checked-in groups get their goods with one tap.
  const action = view.pending ? "resume" : view.complete && view.remaining.length ? "handout" : null;
  function run() {
    if (action === "resume") return void props.onHandout({ area: "entrance", action: "confirm", revision: view.claim?.revision || 0 });
    void props.onHandout({ area: "entrance", action: "select", revision: view.claim?.revision || 0,
      selection: view.remaining.map((item) => ({ id: item.id, quantity: left(item) })) }, { confirm: true });
  }
  return <div className="grid gap-2 p-3">
    {view.blocker && <Note icon="info">{view.blocker}</Note>}
    {goods.length > 0 ? <Goods>{goods.map((item) => <ProductRow key={item.id} item={item} />)}</Goods>
      : <p className="py-1 text-sm font-bold">{view.complete ? "Inget att lämna ut här." : "Produkterna visas när bokningen är klar."}</p>}
    {cafe.length > 0 && <Note icon="drink-cup">Caféet: {cafeLeft.length ? cafeLeft.map((item) => `${left(item)} ${item.name}`).join(" · ") : "utlämnat"}</Note>}
    <Actions props={props} area="entrance" view={view} action={action} disabled={view.locked} onRun={run} onArea={onArea}
      label={action === "resume" ? "Fortsätt bekräfta" : "Lämna ut"} done={lastReceipt(view.handout?.receipts, "entrance")} />
  </div>;
}

function CafePanel({ detail, props, onArea }: { detail: StaffSessionDetail; props: Props; onArea?: (area: HandoutArea) => void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const view = handoutView(detail, "cafe", props);
  // Café goods start at everything left; minus keeps some for later (D0217 partial collection).
  const amount = (item: HandoutItem) => Math.max(0, Math.min(picked[item.id] ?? left(item), left(item)));
  const selection = view.remaining.map((item) => ({ id: item.id, quantity: amount(item) })).filter((line) => line.quantity > 0);
  const action = view.pending ? "resume" : view.remaining.length ? "handout" : null;
  const history = (view.handout?.receipts || []).filter((receipt) => receipt.area === "cafe").reverse();
  async function run() {
    if (action === "resume") return void props.onHandout({ area: "cafe", action: "confirm", revision: view.claim?.revision || 0 });
    if (await props.onHandout({ area: "cafe", action: "select", revision: view.claim?.revision || 0, selection }, { confirm: true })) setPicked({});
  }
  return <div className="grid gap-3 p-3 @2xl:p-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] @4xl:items-start @4xl:gap-6">
    <div className="grid min-w-0 gap-2">
      {view.blocker && <Note icon="info">{view.blocker}</Note>}
      {view.products.length > 0 ? <Goods>{view.products.map((item) => <ProductRow key={item.id} item={item} large amount={amount(item)} disabled={view.locked || props.busy || view.pending}
        onAmount={(value) => setPicked({ ...picked, [item.id]: value })} />)}</Goods> : <p className="text-sm font-bold">Inget att hämta i caféet.</p>}
      {(history.length > 1 || (history.length > 0 && view.remaining.length > 0)) && <ul className="grid gap-1 pt-1 text-xs font-bold @2xl:text-sm">{history.map((receipt) => <li key={receipt.operationId}>
        {clock(receipt.completedAt)} · {receipt.actorName} · {receipt.items.map((line) => `${line.quantity} ${line.name}`).join(" · ")}</li>)}</ul>}
    </div>
    <Actions props={props} area="cafe" view={view} action={action} disabled={view.locked || (action === "handout" && !selection.length)}
      onRun={() => void run()} onArea={onArea} label={action === "resume" ? "Fortsätt bekräfta" : "Lämna ut"} done={lastReceipt(view.handout?.receipts, "cafe")} />
  </div>;
}

export default function StaffExperience(props: Props) {
  const [area, setArea] = useState<HandoutArea>(readArea);
  const [pass, setPass] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("upcoming");
  const [cafeDone, setCafeDone] = useState(false);
  // An open row stays in the list it was opened from (after the guest finishes or a full café handout) until it is closed.
  const [held, setHeld] = useState<{ id: string; place: string } | null>(null);
  function chooseArea(value: HandoutArea) {
    setArea(value);
    try { window.sessionStorage.setItem(AREA_KEY, value); } catch { /* the choice then lasts until the next login */ }
  }
  const query = props.query.trim();
  const cafe = area === "cafe";
  const passTime = pass || nextPass(props.sessions, new Date(), props.day);
  const slots = [...new Set(props.sessions.map((session) => session.booking.startTime?.slice(0, 5)).filter((value): value is string => Boolean(value)))].sort();
  const hold = held && held.id === props.selectedId ? held : null;
  const placeOf = (session: StaffSessionSummary, place: string) => hold?.id === session.checkinSessionId ? hold.place : place;
  const entrancePlace = (session: StaffSessionSummary) => placeOf(session, boardTab(session));
  const board = props.sessions.filter((session) => passTime === "all" || session.booking.startTime?.slice(0, 5) === passTime);
  const listed = query ? props.sessions
    : board.filter((session) => entrancePlace(session) === tab).sort(tab === "completed" ? newestFirst : byStart);
  const cafeSummary = (session: StaffSessionSummary) => !query && stageOf(session) !== "completed" && session.cafeSession
    ? { ...session, ...session.cafeSession, counts: { ...session.counts, admission: undefined } } : session;
  const cafeRows = props.sessions.filter((session) => (session.cafeQuantity || 0) > 0).map(cafeSummary);
  const cafePlace = (session: StaffSessionSummary) => placeOf(session, (session.cafeRemaining || 0) > 0 ? "waiting" : "served");
  const waiting = cafeRows.filter((session) => cafePlace(session) === "waiting").sort(oldestFirst);
  const served = cafeRows.filter((session) => cafePlace(session) === "served").sort(newestFirst);
  const rows = (list: StaffSessionSummary[], rowArea: HandoutArea, place: string) => {
    const opener = { ...props, onOpen: (id: string) => { setHeld({ id, place }); props.onOpen(id); } };
    return <div className="grid gap-2">{list.map((session) => <Row key={session.checkinSessionId} session={session} area={rowArea}
      props={opener} onArea={chooseArea} />)}</div>;
  };
  const empty = (text: string) => <p role="status" className="py-8 text-center text-sm font-bold lg:text-base">{props.loading ? "Hämtar bokningar…" : text}</p>;
  const width = cafe ? "max-w-[1680px]" : "max-w-2xl";
  return <main className="min-h-screen bg-white text-black" style={{ "--border": "#efcfd6", "--surface": "#fff4f6", "--surface-strong": "#fce4e9", "--success": "#087f5b" } as CSSProperties}>
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-3 py-2 backdrop-blur sm:px-6 lg:px-10">
      <div className={`mx-auto flex ${width} items-center justify-between gap-3`}><div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Image src="/jumpyard_logo.png" alt="JumpYard" width={42} height={42} priority className="h-9 w-9 shrink-0 object-contain" />
        <div className="min-w-0"><h1 className="text-xl font-black italic uppercase leading-none sm:text-2xl">Check-in</h1>
          <p className="mt-1 truncate text-xs font-bold" data-testid="staff-personal-identity">{props.auth.staff.displayName}</p></div>
      </div><div className="flex items-center gap-1"><button type="button" aria-label="Uppdatera" className={cls.icon} onClick={props.onRefresh}><RefreshCcw size={17} className={props.loading ? "animate-spin" : ""} /></button>
        <button type="button" onClick={props.onLogout} aria-label="Byt personal" className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-white px-2.5 text-xs font-bold text-primary transition hover:bg-primary/5 active:scale-[0.98] sm:text-sm"><Icon name="profile" className="h-6 w-6" /><span>Byt<span className="hidden min-[400px]:inline"> personal</span></span></button></div></div>
    </header>
    <div className={`mx-auto ${width} px-3 py-3 sm:px-6 ${cafe ? "lg:px-10 lg:py-6" : ""}`}>
      <label className={`flex min-h-12 min-w-0 items-center gap-2 rounded-2xl border border-border px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 ${cafe ? "lg:min-h-16 lg:px-5" : ""}`}><Search size={18} className="shrink-0" />
        <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") props.onSearch(); }} placeholder="Namn, bokning eller nummer" aria-label="Sök namn, bokning eller nummer" autoComplete="off" className={`h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-black/50 ${cafe ? "lg:text-xl" : ""}`} />
        {props.query && <button type="button" aria-label="Rensa sökning" onClick={() => props.onQuery("")} className="grid h-9 w-9 place-items-center"><X size={16} /></button>}
      </label>
      <div className="mt-3 flex items-end justify-between gap-2 border-b border-border"><div className="flex gap-1">{(["entrance", "cafe"] as HandoutArea[]).map((value) => <button key={value} type="button" aria-pressed={area === value} onClick={() => chooseArea(value)} className={`-mb-px flex min-h-12 items-center gap-1 border-b-3 px-2 text-base font-black italic uppercase ${area === value ? "border-primary text-primary" : "border-transparent"}`}><Icon name={value === "entrance" ? "group" : "drink-cup"} className="h-6 w-6" />{value === "entrance" ? "Entré" : "Café"}</button>)}</div>
        {!cafe && <label className="relative mb-2 flex items-center gap-1 text-sm font-black italic"><Icon name="time" className="h-6 w-6" /><select aria-label="Visa pass" value={passTime} onChange={(event) => setPass(event.target.value)} className="max-w-34 appearance-none bg-transparent py-2 pr-4 outline-none">{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}<option value="all">Hela dagen</option></select><ChevronDown size={14} className="pointer-events-none absolute right-0" /></label>}
      </div>
      {props.error && !props.selectedId && <p role="alert" className="mt-3 rounded-2xl border border-primary p-3 text-sm font-bold text-danger">{props.error}</p>}
      {cafe ? query ? <div className="mt-3">{rows(props.sessions.map(cafeSummary), "cafe", "search")}{props.sessions.length === 0 && empty("Ingen träff idag.")}</div> : <>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">{[false, true].map((done) => <button key={String(done)} type="button" onClick={() => setCafeDone(done)} aria-pressed={cafeDone === done}
          className={`min-h-12 rounded-2xl border text-base font-black italic uppercase ${cafeDone === done ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>{done ? "Utlämnat" : "Kvar att hämta"} <span className="tabular-nums">{done ? served.length : waiting.length}</span></button>)}</div>
        <div className="mt-3 grid gap-6 lg:mt-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
          <section aria-label="Kvar att hämta" className={cafeDone ? "hidden lg:block" : ""}>
            <h2 className="mb-3 hidden items-baseline gap-3 text-2xl font-black italic uppercase lg:flex">Kvar att hämta<span className="text-primary tabular-nums">{waiting.length}</span></h2>
            {rows(waiting, "cafe", "waiting")}{waiting.length === 0 && empty("Inget kvar att hämta.")}
          </section>
          <section aria-label="Utlämnat" className={cafeDone ? "" : "hidden lg:block"}>
            <h2 className="mb-3 hidden items-baseline gap-3 text-2xl font-black italic uppercase lg:flex">Utlämnat<span className="text-success tabular-nums">{served.length}</span></h2>
            {rows(served, "cafe", "served")}{served.length === 0 && empty("Inget utlämnat än.")}
          </section>
        </div>
      </> : <>
        {!query && <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-border">{tabs.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}
          className={`flex min-h-16 flex-col items-center justify-center gap-0.5 border-l border-border first:border-l-0 ${tab === item.id ? "bg-primary/5 text-primary shadow-[inset_0_-3px_0_0_var(--primary)]" : "bg-white"}`}>
          <span className="text-sm font-black italic uppercase">{item.label}</span><span className="text-2xl font-black italic tabular-nums">{board.filter((session) => entrancePlace(session) === item.id).length}</span></button>)}</div>}
        <div className="my-3 text-xs font-bold">{query ? `${listed.length} ${listed.length === 1 ? "träff" : "träffar"} idag` : pass === null && passTime !== "all" ? `Nästa pass · ${passTime}` : `${listed.length} ${listed.length === 1 ? "bokning" : "bokningar"}`}</div>
        {rows(listed, "entrance", query ? "search" : tab)}
        {listed.length === 0 && empty("Inga bokningar här just nu.")}
      </>}
    </div>
  </main>;
}
