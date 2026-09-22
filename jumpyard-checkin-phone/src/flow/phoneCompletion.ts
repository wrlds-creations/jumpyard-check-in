import type { Channel, CheckInSession } from './types';

/** Presentation only; session readiness and identity remain server-owned. */
export function isPhoneCompletionReady(session: CheckInSession | null, channel: Channel, alreadyCheckedIn = false) {
    if (!session || channel === 'kiosk' || alreadyCheckedIn || !session.checkinSessionId || !session.handoffCode) return false;
    const status = session.status?.toLowerCase();
    const handoff = session.handoffStatus?.toLowerCase();
    if (status === 'redeemed' || status === 'completed' || handoff === 'completed') return false;
    return status === 'ready_for_staff' || handoff === 'ready_for_staff';
}
