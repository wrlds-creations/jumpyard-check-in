/**
 * GH-557 (D0273): Cloud answers `session_started` when ROLLER has stopped selling a session that has already
 * begun. A Cloud from before #557 answers the same case `capacity_unavailable` with
 * "Product <id> is not available for <date> <HH:mm>.", so that answer also counts once its start time has come.
 */
const PRODUCT_UNAVAILABLE = /^Product\s+\d+\s+is not available for\s+[\d-]+\s+(\d{2}):(\d{2})/i;

function clockMinutes(now: Date | string) {
  if (typeof now !== 'string') return now.getHours() * 60 + now.getMinutes();
  const match = /^(\d{1,2}):(\d{2})$/.exec(now);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isSessionStartedError(error: unknown, startTime: string | null | undefined, now: Date | string) {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === 'session_started') return true;
  if (code !== 'capacity_unavailable' || !startTime || typeof message !== 'string') return false;
  const refused = PRODUCT_UNAVAILABLE.exec(message);
  if (!refused || `${refused[1]}:${refused[2]}` !== startTime.slice(0, 5)) return false;
  const clock = clockMinutes(now);
  return clock !== null && Number(refused[1]) * 60 + Number(refused[2]) <= clock;
}
