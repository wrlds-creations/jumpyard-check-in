import type { BookingContentRow } from './packageContents';
import type { Booking } from './types';

export interface JumpTime {
  /** "14:00–15:00", or only the start when there is no end. */
  time: string;
  minutes: number | null;
}

/**
 * D0241 (Love, 2026-10-06: "rätt tider"): the booked jump, "14:00–15:00" and "60 min". A package's ROLLER
 * item spans all of the package (a Weekday Combo reads 14:00–16:00), so admissions with their own length end
 * at the start plus the longest length, like the band colour (GH-459) and the kiosk's "Hopptid" (kiosk #141).
 */
export function getJumpTime(booking: Booking | null | undefined, rows: BookingContentRow[]): JumpTime | null {
  if (!booking?.time) return null;
  const start = /^(\d{1,2}):(\d{2})$/.exec(booking.time);
  const lengths = rows.filter((row) => row.kind === 'admission' && row.durationMinutes).map((row) => row.durationMinutes as number);
  if (!start || !booking.admissionItems?.length || lengths.length === 0) {
    return { time: booking.endTime ? `${booking.time}–${booking.endTime}` : booking.time, minutes: booking.durationMinutes || null };
  }
  const minutes = Math.max(...lengths);
  const end = (Number(start[1]) * 60 + Number(start[2]) + minutes) % 1440;
  return { time: `${booking.time}–${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, minutes };
}
