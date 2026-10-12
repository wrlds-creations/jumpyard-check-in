import { stockholmToday } from './phoneCompletion';

/**
 * #504 (Love, 2026-10-12): the last page says "Gör så här nu" when the guest is at JumpYard and
 * "När ni kommer till JumpYard" otherwise. The guest is on site when the page was opened from the
 * printed sign (`https://checkin.jumpyard.se/?skylt=nacka`) or from the kiosk's "Lappen i mobilen"
 * link, which Cloud marks with `arrival: 'kiosk'` (the link itself carries one token only, kiosk
 * D0048). The tab remembers it for the visit day, so a reload or a new booking keeps it.
 */
const ON_SITE_KEY = 'jumpyard.onSite.v1';

/** The sign's link names the park (`?skylt=nacka`). */
export function isSignArrival(search: URLSearchParams) {
    return Boolean(search.get('skylt')?.trim());
}

/** Remembers for today, in this tab, that the guest is at JumpYard. */
export function rememberOnSite(storage: Pick<Storage, 'setItem'> | null = sessionStorageOrNull(), today = stockholmToday()) {
    try {
        storage?.setItem(ON_SITE_KEY, today);
    } catch {
        // A private tab without storage still shows "now" until the page is reloaded.
    }
}

/** True when this tab saw the sign or the kiosk link today. */
export function wasOnSiteToday(storage: Pick<Storage, 'getItem'> | null = sessionStorageOrNull(), today = stockholmToday()) {
    try {
        return storage?.getItem(ON_SITE_KEY) === today;
    } catch {
        return false;
    }
}

function sessionStorageOrNull(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.sessionStorage;
    } catch {
        return null;
    }
}
