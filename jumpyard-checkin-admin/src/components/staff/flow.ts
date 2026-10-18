import type { HandoutArea, HandoutClaim, HandoutItem, StaffSessionSummary } from "@/lib/adminApi";

export type Stage = "started" | "upcoming" | "completed";
/** GH-541 (D0263): the entrance keeps two lists; Påbörjad is still Kommande. */
export type BoardTab = "upcoming" | "completed";
export function boardPollDelay(bookingCount: number) {
  // Keep a whole-day refresh below two page requests/second per phone.
  // Selected guest details still refresh every two seconds.
  return Math.max(2_000, Math.ceil(bookingCount / 100) * 500);
}
export function stageOf(session: StaffSessionSummary): Stage {
  if (session.status === "redeemed" || session.handoffStatus === "completed") return "completed";
  // GH-547 (D0265): the guest's last screen on the phone or kiosk is check-in for staff, whatever ROLLER
  // and Cloud's own check-in in ROLLER are still doing. Failures go to the monitor, not to staff.
  if (session.status === "ready_for_staff" && session.safetyStatus === "completed") return "completed";
  if (session.status === "upcoming") return "upcoming";
  return "started";
}
export function boardTab(session: StaffSessionSummary): BoardTab {
  return stageOf(session) === "completed" ? "completed" : "upcoming";
}
/** GH-571: kalas are told apart in every list, from the morning ("Kalas · MIDI"). */
export function kalasLabel(session: Pick<StaffSessionSummary, "kalas">) {
  if (!session.kalas) return null;
  return session.kalas.package ? `Kalas · ${session.kalas.package}` : "Kalas";
}
/** GH-571: ROLLER said no (409) to Cloud's check-in, so the app cannot check the group in either. The group stays
 * under Incheckade (D0265) with "Till kassan" and the reason. An outage is not a refusal: Lämna ut retries it. */
export function rollerRefusal(session: Pick<StaffSessionSummary, "status" | "autoCheckin">) {
  const auto = session.autoCheckin;
  if (session.status === "redeemed" || auto?.status !== "needs_staff" || auto.roller?.statusCode !== 409) return null;
  const reason = auto.roller.reason;
  const note = reason === "product_type_not_accepted" ? "Kalas checkas in i kassan. ROLLER tar inte emot kalas härifrån."
    : reason === "ticket_usage_exhausted" || reason === "ticket_redemption_usage_exhausted"
      ? "ROLLER säger att biljetterna redan är inlösta, troligen i kassan."
      : "ROLLER tog inte emot incheckningen. Kassan hjälper gruppen.";
  return { label: "Till kassan", note };
}
/** GH-547: a group is checked in when the guest was done; Cloud's redeem time stands in only without it. */
export function checkedInTime(session: Pick<StaffSessionSummary, "completedAt" | "readyForStaffAt">) {
  return session.readyForStaffAt || session.completedAt;
}
/** GH-541: the check-in time without Cloud's automatic actor ("automatiskt"); a colleague's name stays. */
export function checkedInLabel(session: Pick<StaffSessionSummary, "completedAt" | "readyForStaffAt" | "checkedInBy">) {
  const by = session.checkedInBy;
  const automatic = !by?.displayName || Boolean(by.actorId?.startsWith("system:")) || by.role === "system";
  return `Incheckad ${clock(checkedInTime(session))}${automatic ? "" : ` · ${by?.displayName}`}`;
}
const minutesOf = (value?: string | null) => {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
/** GH-541: the jump time from start to end, like the guest's "Hopptid" (D0254); the latest band end stands in for a missing end. */
export function jumpTime(session: Pick<StaffSessionSummary, "booking" | "bandColours">) {
  const start = clock(session.booking.startTime);
  const ends = (session.bandColours ?? []).map((band) => band.endTime).filter((value): value is string => Boolean(value)).sort();
  const end = session.booking.endTime ? clock(session.booking.endTime) : ends.length ? clock(ends[ends.length - 1]) : null;
  return end && end !== "—" && start !== "—" && end !== start ? `${start}–${end}` : start;
}
/** GH-541: before check-in Cloud lists no bands (only chosen tickets count), so a folded-out Kommande row shows the
 * board's band colours as band lines instead: one per colour with its duration, and any uncoloured rest. */
export function plannedBands(session: Pick<StaffSessionSummary, "booking" | "bandColours" | "counts">): HandoutItem[] {
  const start = minutesOf(session.booking.startTime);
  const line = (id: string, quantity: number, detail: string | null = null): HandoutItem =>
    ({ id: `planned:${id}`, area: "entrance", kind: "admission", name: "Besöksband", detail, quantity, collected: 0, available: quantity });
  const bands = (session.bandColours ?? []).filter((band) => Number.isSafeInteger(band.quantity) && band.quantity > 0);
  const lines = bands.map((band) => {
    const end = minutesOf(band.endTime);
    const minutes = start !== null && end !== null && end > start ? end - start : null;
    return { ...line(band.id, band.quantity, minutes ? `${minutes} min` : null), bandColour: { id: band.id, name: band.name, swatch: band.swatch } };
  });
  const rest = (session.counts.admission ?? 0) - bands.reduce((sum, band) => sum + band.quantity, 0);
  return Number.isSafeInteger(rest) && rest > 0 ? [...lines, line("admission", rest)] : lines;
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
  pizza: "combo-pizza", water: "water", padlock: "padlock", skyrider: "zipline", other: "addons-bag",
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
    payment_or_booking_changed: "Betalningen eller bokningen behöver kontrolleras.",
    session_not_ready_for_staff: "Gästen behöver slutföra check-in först.",
    safety_not_completed: "Säkerhetsgenomgången är inte klar.",
    redeem_in_progress: "Incheckningen pågår redan. Vänta några sekunder.",
    session_already_completed: "Gruppen är redan incheckad.",
    session_expired: "Förberedelsen har gått ut – gästen öppnar bokningen igen.",
    roller_redeem_rejected: "ROLLER tog inte emot incheckningen. Skicka gruppen till kassan.",
  } as Record<string, string>)[code || ""] || fallback;
}
