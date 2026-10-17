import type { BandColourCount, Booking, PackageContent } from './types';

export const packageContentCopy = {
  sv: { included: 'Det här ingår', wristband: 'Besöksband', pizza: 'Pizza att dela', later: 'Hämtas efter hoppet' },
  en: { included: 'What’s included', wristband: 'Wristband', pizza: 'Pizza to share', later: 'Collect after jumping' },
};

export function getPackageAdmissionQuantity(contents?: PackageContent[]) {
  const admission = contents?.find((item) => item.kind === 'admission' && item.collection === 'checkin');
  return admission && Number.isSafeInteger(admission.quantity) && admission.quantity > 0 ? admission.quantity : undefined;
}

/** GH-566: Cloud's catalog type for a family ticket (`Entré 60/90/120 min - Familj`) admits four jumpers. */
export const FAMILY_JUMPERS = 4;

/**
 * GH-566 (Love, 2026-10-17; the staff app's D0274): the bands of one admission item. A Combo hands out its package's
 * bands. Any other item hands out one band per ROLLER ticket, at least its quantity: a family is one line with
 * quantity 1 and four tickets, so it gets four. Before ROLLER issues the tickets of a phone or kiosk purchase,
 * Cloud's `family` type admits four per line.
 */
export function getAdmissionQuantity(item: {
  packageContents?: PackageContent[]; productType?: string | null; quantity?: number | null; tickets?: unknown[] | null;
}) {
  const packaged = getPackageAdmissionQuantity(item.packageContents);
  if (packaged !== undefined) return packaged;
  const quantity = Math.max(0, item.quantity ?? 0);
  return Math.max(quantity, item.tickets?.length ?? 0, item.productType === 'family' ? quantity * FAMILY_JUMPERS : 0);
}

export function scalePackageContents(contents: PackageContent[] | undefined, quantity: number): PackageContent[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return [];
  return (contents ?? []).map((item) => ({ ...item, quantity: item.quantity * quantity }));
}

export interface BookingContentRow {
  key: string;
  kind: 'admission' | 'pizza';
  quantity: number;
  collection: 'checkin' | 'later';
  label: string;
  detail?: string;
  /** GH-459: the band colour(s) of this admission row, from JumpYard Cloud. */
  bandColours?: BandColourCount[];
  /** D0241: the admission's own length, for the jump time (flow/jumpTime.ts). */
  durationMinutes?: number;
}

export function getPackageContentLabel(content: PackageContent, lang: 'sv' | 'en') {
  const copy = packageContentCopy[lang];
  return content.kind === 'pizza' ? copy.pizza : `${copy.wristband}${content.durationMinutes ? ` ${content.durationMinutes} min` : ''}`;
}

export function getBookingContentRows(booking: Booking, fallbackLabel: string, jumperCount: number, lang: 'sv' | 'en'): BookingContentRow[] {
  if (!booking.admissionItems?.length) {
    return [{ key: 'entry', kind: 'admission', quantity: jumperCount, collection: 'checkin', label: fallbackLabel,
      ...(booking.bandColours?.length ? { bandColours: booking.bandColours } : {}) }];
  }
  return booking.admissionItems.flatMap((item, index): BookingContentRow[] => {
    const bands = (quantity: number) => item.bandColour ? { bandColours: [{ ...item.bandColour, quantity }] } : {};
    if (item.packageContents?.length) {
      return item.packageContents.map((content) => ({
        ...content,
        key: `${index}-${content.kind}`,
        label: getPackageContentLabel(content, lang),
        detail: item.label,
        ...(content.kind === 'admission' ? bands(content.quantity) : {}),
      }));
    }
    return [{ key: `${index}-entry`, kind: 'admission', quantity: item.quantity, collection: 'checkin', label: item.label || fallbackLabel,
      ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}), ...bands(item.quantity) }];
  });
}
