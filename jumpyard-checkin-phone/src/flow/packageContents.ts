import type { Booking, PackageContent } from './types';

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
}

export function getPackageContentLabel(content: PackageContent, lang: 'sv' | 'en') {
  const copy = packageContentCopy[lang];
  return content.kind === 'pizza' ? copy.pizza : `${copy.wristband}${content.durationMinutes ? ` ${content.durationMinutes} min` : ''}`;
}

export function getBookingContentRows(booking: Booking, fallbackLabel: string, jumperCount: number, lang: 'sv' | 'en'): BookingContentRow[] {
  if (!booking.admissionItems?.length) {
    return [{ key: 'entry', kind: 'admission', quantity: jumperCount, collection: 'checkin', label: fallbackLabel }];
  }
  return booking.admissionItems.flatMap((item, index): BookingContentRow[] => {
    if (item.packageContents?.length) {
      return item.packageContents.map((content) => ({
        ...content,
        key: `${index}-${content.kind}`,
        label: getPackageContentLabel(content, lang),
        detail: item.label,
      }));
    }
    return [{ key: `${index}-entry`, kind: 'admission', quantity: item.quantity, collection: 'checkin', label: item.label || fallbackLabel }];
  });
}
