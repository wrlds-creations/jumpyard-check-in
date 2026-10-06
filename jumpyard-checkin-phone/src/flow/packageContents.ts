import type { BandColourCount, Booking, PackageContent } from './types';

export const packageContentCopy = {
  sv: { included: 'Det här ingår', wristband: 'Besöksband', pizza: 'Pizza att dela', later: 'Hämtas efter hoppet' },
  en: { included: 'What’s included', wristband: 'Wristband', pizza: 'Pizza to share', later: 'Collect after jumping' },
};

export function getPackageAdmissionQuantity(contents?: PackageContent[]) {
  const admission = contents?.find((item) => item.kind === 'admission' && item.collection === 'checkin');
  return admission && Number.isSafeInteger(admission.quantity) && admission.quantity > 0 ? admission.quantity : undefined;
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
