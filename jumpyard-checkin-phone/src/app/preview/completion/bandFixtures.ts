import type { BandColour, Booking } from '@/flow/types';

/** Development fixture (GH-459): the colours JumpYard Cloud returns for these admission end
 * times. PhoneCompletion.test.mjs checks every entry against Cloud's scheme. */
export const PREVIEW_BAND_COLOURS = {
    '12:30': { id: 'rod', name: { sv: 'Röd', en: 'Red' }, swatch: ['#E2231A'], endTime: '12:30' },
    '13:00': { id: 'morkbla', name: { sv: 'Mörkblå', en: 'Dark blue' }, swatch: ['#1F3A93'], endTime: '13:00' },
    '15:00': { id: 'svart-rod', name: { sv: 'Svart/Röd', en: 'Black/Red' }, swatch: ['#141414', '#E2231A'], endTime: '15:00' },
    '15:30': { id: 'gul', name: { sv: 'Gul', en: 'Yellow' }, swatch: ['#FFD400'], endTime: '15:30' },
    '16:00': { id: 'gron', name: { sv: 'Grön', en: 'Green' }, swatch: ['#00A651'], endTime: '16:00' },
    '16:30': { id: 'ljusbla', name: { sv: 'Ljusblå', en: 'Light blue' }, swatch: ['#3DB7E4'], endTime: '16:30' },
    '17:00': { id: 'rosa-lila', name: { sv: 'Rosa/Lila', en: 'Pink/Purple' }, swatch: ['#F27BB0', '#7B3FA0'], endTime: '17:00' },
} satisfies Record<string, BandColour>;

/** What the phone builds from Cloud's provisional handoff when one Weekday Combo at 12:00 is
 * paid on the phone: two 60-minute bands with their colour now and the pizza later (#459,
 * D0207). packageContents.test.mjs checks it against the real phone mapping of Cloud's answer. */
export const PREVIEW_PHONE_COMBO_PURCHASE = {
    jumpers: 2, time: '12:00', endTime: '13:00', durationMinutes: 60, productLabel: 'Weekday Combo', productType: 'combo',
    admissionItems: [{ label: 'Weekday Combo', quantity: 2, durationMinutes: 60, packageContents: [
        { kind: 'admission', quantity: 2, collection: 'checkin', durationMinutes: 60 },
        { kind: 'pizza', quantity: 1, collection: 'later' },
    ], bandColour: PREVIEW_BAND_COLOURS['13:00'] }],
    bandColours: [{ ...PREVIEW_BAND_COLOURS['13:00'], quantity: 2 }],
} satisfies Partial<Booking>;

/** GH-566: what the phone builds from Cloud's answer for one family ticket, 90 minutes at 11:30: one line with quantity 1,
 * so four bands of its colour, whether it was paid on the phone (Cloud's `family` type before ROLLER issues the tickets)
 * or booked (ROLLER's four tickets). packageContents.test.mjs checks it against the real phone mapping of both answers. */
export const PREVIEW_PHONE_FAMILY = {
    jumpers: 1, bandCount: 4, time: '11:30', endTime: '13:00', durationMinutes: 90, productLabel: 'Entré 90 min - Familj',
    productType: 'entry', bandColours: [{ ...PREVIEW_BAND_COLOURS['13:00'], quantity: 4 }],
} satisfies Partial<Booking>;
