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

/**
 * "om 18 min" / "in 18 min", "startar nu" when the start time has come, and "Har precis börjat" once it
 * has begun (GH-557) when the copy has that line.
 */
export function formatStartsIn(
  minutes: number | null,
  copy: { startsIn: string; startsNow: string; justStarted?: string },
) {
  if (minutes === null) return null;
  if (minutes < 0 && copy.justStarted) return copy.justStarted;
  if (minutes <= 0) return copy.startsNow;
  return copy.startsIn.replace('{time}', formatDuration(minutes));
}

/**
 * GH-557 (D0273): ROLLER sells a session until 10 minutes after its start, as on JumpYard's website, so the
 * time step offers a start time that began less than this many minutes ago.
 */
export const JUST_STARTED_MINUTES = 10;

function timeOfDay(minutesFromMidnight: number) {
  return `${String(Math.floor(minutesFromMidnight / 60)).padStart(2, '0')}:${String(minutesFromMidnight % 60).padStart(2, '0')}`;
}

/**
 * The start times the time step offers at `now`: the half hour that began less than JUST_STARTED_MINUTES ago,
 * then the next `count` half hours, counting one that starts this minute ("startar nu").
 */
export function buildSlotTimes(now: Date | string, count = 3) {
  const clock = minutesOfDay(formatClock(now));
  if (clock === null) return [];
  const lastStart = Math.floor(clock / 30) * 30;
  const times = clock > lastStart && clock - lastStart < JUST_STARTED_MINUTES ? [timeOfDay(lastStart)] : [];
  const firstUpcoming = times.length;
  for (let minutes = Math.ceil(clock / 30) * 30; times.length - firstUpcoming < count && minutes < 24 * 60; minutes += 30) {
    times.push(timeOfDay(minutes));
  }
  return times;
}

/** Milliseconds to the next whole minute, so a live clock changes with the phone's own clock. */
export function msUntilNextMinute(now = new Date()) {
  return Math.max(250, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
}
