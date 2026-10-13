/**
 * #533 (Love, 2026-10-13): a guest who continues without any JumpSocks gets a friendly reminder, "Glöm inte
 * strumporna! 😊", with "Lägg till strumpor" and "Vi har egna". A purchase meets it when leaving the Entré
 * (quantity) step, where socks are chosen; an existing booking when leaving its add-on step, which shows
 * the same JumpSocks block (#515). It reads only what the step already shows, so it adds no request.
 */
export interface SocksReminderCheck {
  /** Socks can be added on this step: the catalog prices them and has room for another pair. */
  socksAvailable: boolean;
  /** Every pair on the order: what the booking already has plus what is added now. */
  socksQuantity: number;
  /** Pairs an existing booking already has ("✓ 1 ingår"); a new purchase has none. */
  socksIncluded: number;
  /** The guest has already met the reminder in this visit or said they have their own socks. */
  answered: boolean;
}

/** At most once per visit, and never when socks are chosen or already in the booking. */
export function shouldRemindAboutSocks({ socksAvailable, socksQuantity, socksIncluded, answered }: SocksReminderCheck): boolean {
  return socksAvailable && !answered && socksIncluded <= 0 && socksQuantity <= 0;
}
