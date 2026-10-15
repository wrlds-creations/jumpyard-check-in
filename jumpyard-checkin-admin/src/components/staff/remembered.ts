import type { HandoutArea, HandoutItem, HandoutReceipt, HandoutRequest, HandoutResult, HandoutSelection, StaffSessionDetail, StaffSessionSummary } from "@/lib/adminApi";
import { activeClaim } from "./flow";

/**
 * GH-547 (D0265): a "Lämna ut" pressed before ROLLER confirmed the purchase. Cloud takes no handout
 * until ROLLER has the booking (`booking_sync_pending`, about 80 s after a kiosk payment), so this
 * device keeps the press and confirms it in Cloud itself once Cloud accepts it. A press lasts the
 * operating day in this browser tab (sessionStorage, T0194) and survives a reload. It holds the
 * session id, the counter and product lines only, and nothing in Cloud while it waits.
 */
export interface RememberedLine { kind: string; productId: string | null; name: string; quantity: number }
export interface RememberedHandout {
  checkinSessionId: string;
  area: HandoutArea;
  day: string;
  pressedAt: string;
  lines: RememberedLine[];
  /** Failed confirmations once ROLLER is done; waiting for ROLLER does not count. */
  attempts: number;
  nextAt: number;
}
export type RememberedOutcome = "done" | "wait" | "retry" | "stop";
export const REMEMBERED_KEY = "jumpyard_staff_remembered_handouts_v1";
const MAX_ATTEMPTS = 20;
// The handout was finished elsewhere, or the booking changed: nothing is left to confirm.
const FINAL_CODES = new Set(["quantity_already_collected", "session_not_found", "wrong_date", "payment_or_booking_changed",
  "invalid_selection", "invalid_handout", "admission_requires_whole_group", "personal_staff_identity_required"]);

const keyOf = (item: { kind: string; productId?: string | null; name: string }) => `${item.kind}:${item.productId || item.name}`;
const left = (item: HandoutItem) => item.available ?? Math.max(0, item.quantity - item.collected);

export function readRemembered(day: string): RememberedHandout[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(REMEMBERED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((record): record is RememberedHandout => record?.day === day &&
      typeof record.checkinSessionId === "string" && (record.area === "entrance" || record.area === "cafe") && Array.isArray(record.lines)) : [];
  } catch { return []; }
}
export function storeRemembered(records: RememberedHandout[]) {
  try { window.sessionStorage.setItem(REMEMBERED_KEY, JSON.stringify(records)); } catch { /* the open page still keeps them */ }
}

/** The goods a press covers among `items`: the group's bands whole (Cloud hands bands to the whole group
 * only) and up to the pressed number of everything else, matched by product. */
export function rememberedSelection(lines: RememberedLine[], items: HandoutItem[]): HandoutSelection[] {
  const wanted = new Map<string, number>();
  for (const line of lines) wanted.set(keyOf(line), (wanted.get(keyOf(line)) ?? 0) + line.quantity);
  const bands = lines.some((line) => line.kind === "admission");
  return items.flatMap((item) => {
    const available = left(item);
    if (available <= 0) return [];
    if (item.kind === "admission") return bands ? [{ id: item.id, quantity: available }] : [];
    const quantity = Math.min(available, wanted.get(keyOf(item)) ?? 0);
    if (quantity <= 0) return [];
    wanted.set(keyOf(item), (wanted.get(keyOf(item)) ?? 0) - quantity);
    return [{ id: item.id, quantity }];
  });
}

/** Keeps a press: the chosen lines of the goods on screen, added to an earlier press for the same group and counter. */
export function rememberHandout(records: RememberedHandout[], detail: StaffSessionDetail, request: HandoutRequest,
  day: string, now = new Date()): RememberedHandout[] {
  const items = detail.handout?.items ?? [];
  const lines = (request.selection ?? []).flatMap((line) => {
    const item = items.find((candidate) => candidate.id === line.id && candidate.area === request.area);
    return item && line.quantity > 0 ? [{ kind: item.kind, productId: item.productId ?? null, name: item.name, quantity: line.quantity }] : [];
  });
  if (!lines.length) return records;
  const earlier = records.find((record) => record.checkinSessionId === detail.checkinSessionId && record.area === request.area);
  const record: RememberedHandout = earlier ? { ...earlier, lines: [...earlier.lines, ...lines], attempts: 0, nextAt: 0 }
    : { checkinSessionId: detail.checkinSessionId, area: request.area, day, pressedAt: now.toISOString(), lines, attempts: 0, nextAt: 0 };
  return [...records.filter((candidate) => candidate !== earlier), record];
}

/** This device shows a remembered press as handed out, with the press as its receipt, until Cloud has it. The
 * receipt names the staff member signed in here, who is also the one Cloud records when it confirms the press. */
export function withRemembered<T extends StaffSessionDetail>(detail: T, records: RememberedHandout[], actorName: string): T {
  const own = records.filter((record) => record.checkinSessionId === detail.checkinSessionId);
  if (!own.length || !detail.handout) return detail;
  let items = detail.handout.items;
  const receipts: HandoutReceipt[] = [...detail.handout.receipts];
  for (const record of own) {
    const chosen = rememberedSelection(record.lines, items.filter((item) => item.area === record.area));
    if (!chosen.length) continue;
    const handed = items.flatMap((item) => {
      const quantity = chosen.find((line) => line.id === item.id)?.quantity ?? 0;
      return quantity ? [{ ...item, quantity }] : [];
    });
    items = items.map((item) => {
      const quantity = chosen.find((line) => line.id === item.id)?.quantity ?? 0;
      return quantity ? { ...item, collected: item.collected + quantity, available: Math.max(0, left(item) - quantity) } : item;
    });
    receipts.push({ operationId: `remembered:${record.area}`, area: record.area, actorId: "", actorName,
      completedAt: record.pressedAt, items: handed });
  }
  return { ...detail, handout: { ...detail.handout, items, receipts } };
}

/** A café row whose goods this device has handed out moves to Utlämnat. */
export function withRememberedCafe(session: StaffSessionSummary, records: RememberedHandout[]): StaffSessionSummary {
  const handed = records.filter((record) => record.checkinSessionId === session.checkinSessionId && record.area === "cafe")
    .reduce((sum, record) => sum + record.lines.reduce((total, line) => total + line.quantity, 0), 0);
  return handed && session.cafeRemaining ? { ...session, cafeRemaining: Math.max(0, session.cafeRemaining - handed) } : session;
}

export interface RememberedTools {
  actorId?: string;
  getDetail: (checkinSessionId: string) => Promise<StaffSessionDetail>;
  change: (checkinSessionId: string, request: HandoutRequest) => Promise<HandoutResult>;
  onResult?: (detail: StaffSessionDetail, result: HandoutResult) => void;
}

/** One try to confirm a remembered press: "wait" while ROLLER is not done, "retry" after a failure,
 * "stop" when the staff session ended (the press stays for the next login), "done" otherwise. */
export async function confirmRemembered(record: RememberedHandout, tools: RememberedTools): Promise<{ outcome: RememberedOutcome; failure?: unknown }> {
  const { area, checkinSessionId } = record;
  try {
    const detail = await tools.getDetail(checkinSessionId);
    if (detail.bookingSyncStatus !== "confirmed" || !detail.handout) return { outcome: "wait" };
    const claim = detail.handout.claims.find((candidate) => candidate.area === area);
    const mine = Boolean(claim?.actorId && claim.actorId === tools.actorId);
    let result: HandoutResult;
    if (mine && claim?.pendingOperation) {
      // A confirmation that timed out resumes as the same operation.
      result = await tools.change(checkinSessionId, { area, action: "confirm", revision: claim.revision });
    } else {
      if (!mine && activeClaim(detail.handout.claims, area)) return { outcome: "retry" };
      const selection = rememberedSelection(record.lines, detail.handout.items.filter((item) => item.area === area));
      if (!selection.length) return { outcome: "done" };
      const selected = await tools.change(checkinSessionId, { area, action: "select", revision: claim?.revision ?? 0, selection });
      const revision = selected.handout.claims.find((candidate) => candidate.area === area)?.revision;
      if (!Number.isSafeInteger(revision)) return { outcome: "retry" };
      result = await tools.change(checkinSessionId, { area, action: "confirm", revision: revision as number });
    }
    tools.onResult?.(detail, result);
    return { outcome: result.completed ? "done" : "retry" };
  } catch (failure) {
    const code = (failure as { code?: unknown })?.code;
    if ((failure as { isAuthenticationFailure?: boolean })?.isAuthenticationFailure) return { outcome: "stop", failure };
    return { outcome: typeof code === "string" && FINAL_CODES.has(code) ? "done" : "retry", failure };
  }
}

/** The press after a try: dropped when done or after 20 failed tries (about eight minutes), otherwise due again later. */
export function afterAttempt(record: RememberedHandout, outcome: RememberedOutcome, now = Date.now()): RememberedHandout | null {
  if (outcome === "done") return null;
  if (outcome === "stop") return record;
  if (outcome === "wait") return { ...record, nextAt: now + 5_000 };
  const attempts = record.attempts + 1;
  return attempts >= MAX_ATTEMPTS ? null : { ...record, attempts, nextAt: now + Math.min(30_000, 3_000 * 2 ** Math.min(attempts - 1, 4)) };
}
