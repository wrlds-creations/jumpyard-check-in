import type { Channel, CheckInSession } from './types';

/**
 * Presentation only; session readiness and identity remain server-owned.
 * GH-453 (D0229): an admitted session keeps its number all day, so it shows the completion too.
 */
export function isPhoneCompletionReady(session: CheckInSession | null, channel: Channel, alreadyCheckedIn = false) {
    if (!session || channel === 'kiosk' || !session.checkinSessionId || !session.handoffCode) return false;
    const status = session.status?.toLowerCase();
    const handoff = session.handoffStatus?.toLowerCase();
    if (status === 'redeemed' || status === 'completed' || handoff === 'completed') return true;
    if (alreadyCheckedIn) return false;
    return status === 'ready_for_staff' || handoff === 'ready_for_staff';
}

/** Today's date in Nacka (Europe/Stockholm), YYYY-MM-DD. */
export function stockholmToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
}

/** GH-453: the number belongs to an earlier visit day. */
export function isVisitDayOver(session: CheckInSession | null, now = new Date()) {
    const day = session?.handoffDay;
    return Boolean(day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day < stockholmToday(now));
}
