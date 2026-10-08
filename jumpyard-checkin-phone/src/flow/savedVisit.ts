import { stockholmToday } from './phoneCompletion';
import type { Booking, CheckInSession } from './types';

// GH-453 (D0229): the phone keeps today's checked-in visit so a reload, a closed tab or a
// reopened page shows the same number at once. No new credential: only the booking reference the
// guest already used is kept, and the short-lived guest access token is never stored.
const SAVED_VISIT_KEY = 'jumpyard.savedVisit.v1';

export interface SavedVisit {
    visitDate: string;
    identifier: string;
    booking: Booking;
    session: CheckInSession;
    savedAt: string;
    /**
     * #491 round 1 (Love 2026-10-08): the guest chose "Gör en ny bokning". The visit is kept, so the
     * first screen offers a way back, but a reload no longer opens it by itself.
     */
    parkedAt?: string;
}

function storage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function saveVisit(booking: Booking, session: CheckInSession, now = new Date()) {
    const identifier = booking.id || booking.rollerUniqueId;
    if (!identifier || !session.checkinSessionId || !session.handoffCode) return;
    // The short-lived guest access token is never kept; JSON drops the undefined fields.
    const savedSession: CheckInSession = { ...session, guestAccessToken: undefined, guestAccessExpiresAt: null };
    const savedBooking: Booking = { ...booking, guestAccessToken: undefined, guestAccessExpiresAt: null };
    const visit: SavedVisit = {
        booking: savedBooking,
        identifier,
        savedAt: now.toISOString(),
        session: savedSession,
        visitDate: session.handoffDay || stockholmToday(now),
    };
    try {
        storage()?.setItem(SAVED_VISIT_KEY, JSON.stringify(visit));
    } catch {
        // A full or blocked storage only loses the reload shortcut; the guest can look the booking up.
    }
}

/** Today's saved visit, or null. A visit from another day is removed. */
export function readSavedVisit(now = new Date()): SavedVisit | null {
    const store = storage();
    try {
        const raw = store?.getItem(SAVED_VISIT_KEY);
        if (!raw) return null;
        const visit = JSON.parse(raw) as Partial<SavedVisit> | null;
        if (!visit || visit.visitDate !== stockholmToday(now)) {
            store?.removeItem(SAVED_VISIT_KEY);
            return null;
        }
        if (!visit.identifier || !visit.booking || !visit.session?.checkinSessionId || !visit.session.handoffCode) return null;
        return visit as SavedVisit;
    } catch {
        return null;
    }
}

/** Keep today's visit for the way back, without reopening it on the next load. */
export function parkSavedVisit(now = new Date()) {
    const visit = readSavedVisit(now);
    if (!visit) return;
    try {
        storage()?.setItem(SAVED_VISIT_KEY, JSON.stringify({ ...visit, parkedAt: now.toISOString() }));
    } catch {
        // Blocked storage only loses the way back; the guest can look the booking up.
    }
}

export function clearSavedVisit() {
    try {
        storage()?.removeItem(SAVED_VISIT_KEY);
    } catch {
        // Nothing to clear.
    }
}
