import type { HandoutArea, HandoutClaim, StaffSessionSummary } from "@/lib/adminApi";

export type Stage = "ready" | "started" | "upcoming" | "completed";
export function boardPollDelay(bookingCount: number) {
  // Keep a whole-day refresh below two page requests/second per phone.
  // Selected guest details still refresh every two seconds.
  return Math.max(2_000, Math.ceil(bookingCount / 100) * 500);
}
export function stageOf(session: StaffSessionSummary): Stage {
  if (session.status === "redeemed" || session.handoffStatus === "completed") return "completed";
  if (session.status === "upcoming") return "upcoming";
  if (session.status === "ready_for_staff" && session.safetyStatus === "completed" &&
      session.bookingSyncStatus === "confirmed" && !session.isExpired) return "ready";
  return "started";
}
export function stockholmDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function clock(value?: string | null) {
  if (!value) return "—";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" }).format(date);
}
export function nextPass(sessions: StaffSessionSummary[], now = new Date(), day = stockholmDay(now)) {
  const slots = [...new Set(sessions.map((session) => session.booking.startTime?.slice(0, 5)).filter((slot): slot is string => Boolean(slot)))].sort();
  return slots.find((slot) => day !== stockholmDay(now) || slot >= clock(now.toISOString())) || "all";
}
export function activeClaim(claims: HandoutClaim[] | undefined, area: HandoutArea, now = Date.now()) {
  const claim = claims?.find((candidate) => candidate.area === area);
  return claim?.actorId && (Boolean(claim.pendingOperation) || Date.parse(claim.expiresAt) > now) ? claim : null;
}
export const itemIcon: Record<string, string> = {
  admission: "visitor-wristband", socks: "grip-socks", coffee: "drink-cup", cafe: "drink-cup",
  pizza: "combo-pizza", water: "water-bottle", padlock: "padlock", skyrider: "zipline", other: "addons-bag",
};
export function handoutMessage(code: string | null, fallback: string) {
  return ({
    guest_claimed: "En kollega hjälper gästen. Statusen uppdateras strax.",
    handout_changed: "Valet har ändrats på en annan telefon. Kontrollera det uppdaterade valet.",
    staff_busy: "Du hjälper redan en annan gäst. Öppna pågående utlämning först.",
    handout_resume_required: "Fortsätt i den pågående utlämningen för den här bokningen.",
    handout_confirmation_pending: "Bekräftelsen är inte klar. Tryck Fortsätt bekräfta.",
    quantity_already_collected: "Det här har redan lämnats ut. Kontrollera kvittot.",
    handout_products_changed: "Bokningens produkter har ändrats. Kontrollera bokningen innan utlämning.",
    admission_not_confirmed: "Gästen behöver checkas in i entrén först.",
    admission_requires_whole_group: "Välj alla besöksband för att checka in gruppen.",
    wrong_date: "Bokningen gäller en annan dag. Kontrollera datumet.",
    booking_sync_pending: "Betalningen är godkänd. Bokningen bekräftas fortfarande.",
    payment_or_booking_changed: "Betalningen eller bokningen behöver kontrolleras.",
    session_not_ready_for_staff: "Gästen behöver slutföra check-in först.",
    safety_not_completed: "Säkerhetsgenomgången är inte klar.",
  } as Record<string, string>)[code || ""] || fallback;
}
