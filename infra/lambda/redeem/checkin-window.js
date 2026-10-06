'use strict';

// GH-456 (D0230): a booking can be checked in from 120 minutes before its booked start (when
// the pre-arrival email arrives) until the booked session ends, on the visit day in
// Europe/Stockholm. Late guests keep their band colour. Automatic admission gets a short grace
// after the end so a check-in finished in the last minute still reaches ROLLER.
const OPENS_BEFORE_START_MINUTES = 120;
const AUTO_REDEEM_GRACE_MINUTES = 30;

function stockholmNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function minutesOf(time) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 1440 ? minutes : null;
}

function clockOf(minutes) {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function sessionMinutes({ startTime, endTime }) {
  const start = minutesOf(startTime);
  let end = minutesOf(endTime);
  if (start !== null && end !== null && end <= start) end += 1440;
  return { start, end };
}

/**
 * Whether a NEW check-in may start: 'open', 'too_early' or 'too_late'. Missing times never
 * block (staff and kassan remain the fallback); a session that is already ready or redeemed is
 * never evaluated here.
 */
function evaluateCheckinWindow({ visitDate, startTime, endTime }, now = new Date()) {
  const current = stockholmNow(now);
  const { start, end } = sessionMinutes({ startTime, endTime });
  const opens = start === null ? null : Math.max(0, start - OPENS_BEFORE_START_MINUTES);
  const window = {
    closesAt: end === null ? null : clockOf(end),
    opensAt: opens === null ? null : clockOf(opens),
    startTime: start === null ? null : clockOf(start),
    visitDate: visitDate || null,
  };
  if (!visitDate) return { state: 'open', ...window };
  if (visitDate > current.date) return { state: 'too_early', ...window };
  if (visitDate < current.date) return { state: 'too_late', ...window };
  if (opens !== null && current.minutes < opens) return { state: 'too_early', ...window };
  if (end !== null && current.minutes > end) return { state: 'too_late', ...window };
  return { state: 'open', ...window };
}

/** Whether Cloud may admit a ready, paid session automatically right now (today, until end + grace). */
function canAutoRedeemNow({ visitDate, startTime, endTime }, now = new Date()) {
  const current = stockholmNow(now);
  if (!visitDate || visitDate !== current.date) return false;
  const { end } = sessionMinutes({ startTime, endTime });
  return end === null || current.minutes <= end + AUTO_REDEEM_GRACE_MINUTES;
}

module.exports = {
  AUTO_REDEEM_GRACE_MINUTES,
  OPENS_BEFORE_START_MINUTES,
  canAutoRedeemNow,
  evaluateCheckinWindow,
  stockholmNow,
};
