// #188 kiosk / #505 phone (D0061 / D0250): a gift card or membership number tells its own type.
// ROLLER's gift card QR holds only the 10-digit card number, and a membership QR holds the number
// printed in the email, `<booking>-<ticket>`; a booking QR is the 9-digit booking number. Anything
// else is a discount code, or whatever type the guest has chosen. Phone and kiosk keep identical copies.

export type PaymentCodeKind = 'discount' | 'member' | 'giftCard';

export interface PaymentCode {
  kind: PaymentCodeKind;
  value: string;
}

const GIFT_CARD_PATTERN = /^\d{10}$/;
// The reader can send the hyphen as another dash, a plus or a slash, depending on its keyboard layout.
const MEMBER_PATTERN = /^(\d{6,})[-‐‑‒–—−+/](\d{6,})$/;
// Nacka's membership numbers: 9 digits, a hyphen, 9 digits.
const COMPLETE_MEMBER_PATTERN = /^\d{9}-\d{9}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** Removes what comes along with a copied or scanned number: control characters, spaces and a leading "#". */
export function cleanPaymentCode(raw: string) {
  return raw.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, '').replace(/^#+/, '');
}

/** The type a number shows by itself, or null when only the guest's choice can tell. */
export function detectPaymentCodeKind(raw: string): Exclude<PaymentCodeKind, 'discount'> | null {
  const value = cleanPaymentCode(raw);
  if (GIFT_CARD_PATTERN.test(value)) return 'giftCard';
  if (MEMBER_PATTERN.test(value)) return 'member';
  return null;
}

/** A scanned or pasted value as a type and a clean number; the shape wins over the chosen type. */
export function classifyPaymentCode(raw: string, chosenKind: PaymentCodeKind): PaymentCode | null {
  const value = cleanPaymentCode(raw);
  if (!value) return null;
  if (GIFT_CARD_PATTERN.test(value)) return { kind: 'giftCard', value };
  const member = MEMBER_PATTERN.exec(value);
  if (member) return { kind: 'member', value: `${member[1]}-${member[2]}` };
  return { kind: chosenKind, value };
}

/** A typed number that is complete enough to check without Applicera. */
export function isCompletePaymentCode(kind: PaymentCodeKind, value: string) {
  if (kind === 'giftCard') return GIFT_CARD_PATTERN.test(value);
  if (kind === 'member') return COMPLETE_MEMBER_PATTERN.test(value);
  return false;
}

/** A 10-digit gift card number in groups, 4807 213 659, for reading only. */
export function formatPaymentCodeForDisplay(kind: PaymentCodeKind, value: string) {
  if (kind !== 'giftCard' || !GIFT_CARD_PATTERN.test(value)) return value;
  return `${value.slice(0, 4)} ${value.slice(4, 7)} ${value.slice(7)}`;
}
