/**
 * #491 round 1 (Love 2026-10-08): the start-time step shows the time now and how soon each start
 * time begins, so the next sessions are obvious. The phone's own clock is used, as for the slots.
 */

/** "13:42" for a Date, or an HH:MM value passed through (local previews pin the clock). */
export function formatClock(now: Date | string) {
  if (typeof now === 'string') return /^\d{1,2}:\d{2}$/.test(now) ? now.padStart(5, '0') : '';
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function minutesOfDay(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Whole minutes from the clock to a start time today; null when either cannot be read. */
export function minutesUntil(startTime: string, now: Date | string) {
  const start = minutesOfDay(startTime);
  const clock = minutesOfDay(formatClock(now));
  return start === null || clock === null ? null : start - clock;
}

/** "18 min", "1 h", "1 h 18 min". */
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "om 18 min" / "in 18 min", or "startar nu" when the start time has come. */
export function formatStartsIn(minutes: number | null, copy: { startsIn: string; startsNow: string }) {
  if (minutes === null) return null;
  if (minutes <= 0) return copy.startsNow;
  return copy.startsIn.replace('{time}', formatDuration(minutes));
}

/** Milliseconds to the next whole minute, so a live clock changes with the phone's own clock. */
export function msUntilNextMinute(now = new Date()) {
  return Math.max(250, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}
