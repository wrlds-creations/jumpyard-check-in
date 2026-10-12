// #505 (D0250): pasting a gift card, membership number or code on the phone's contact step.
// paymentCodeShape.ts holds the type rules shared with the kiosk. This module decides what a paste
// puts in the field and when the pasted number gets its one automatic check. Later checks stay
// with Applicera and Continue, as before.
import type { PaymentCode, PaymentCodeKind } from './paymentCodeShape';

/**
 * A number pasted before the contact was ready is checked once the contact is ready and has not
 * changed for this long, so a half-typed email ("anna@x.s") does not use up the one check.
 */
export const PASTED_CODE_CONTACT_SETTLE_MS = 800;

export interface PastedPaymentCode extends PaymentCode {
  /** False for text longer than any code: it is filled in, cut to the field, but not checked. */
  autoCheck: boolean;
}

/** A classified paste as the field takes it; null when nothing usable was pasted. */
export function toPastedPaymentCode(code: PaymentCode | null, maxLength: number): PastedPaymentCode | null {
  if (!code) return null;
  return { kind: code.kind, value: code.value.slice(0, maxLength), autoCheck: code.value.length <= maxLength };
}

/** A pasted number that still owes its one automatic check. */
export interface PendingPastedCode {
  kind: PaymentCodeKind;
  value: string;
  /** The contact was not ready when the number was pasted. */
  waitsForContact: boolean;
}

export interface PastedCodeField {
  kind: PaymentCodeKind;
  value: string;
  /** No current quote has answered the value in the field yet. */
  unchecked: boolean;
  contactReady: boolean;
  /** Another quote or draft runs, or the contact step is not on screen. */
  busy: boolean;
}

export type PastedCodeCheck =
  | { action: 'none' }
  | { action: 'wait'; reason: 'contact' | 'busy' }
  | { action: 'check'; delayMs: number };

/**
 * Whether the pasted number is checked now, later or not at all. It is checked only while the
 * field still holds exactly the pasted, unchecked value; an edit, another type or an answered quote
 * ends the wait for good. The caller clears the pending number when the check starts, so each
 * pasted number is checked automatically once.
 */
export function decidePastedCodeCheck(pending: PendingPastedCode | null, field: PastedCodeField): PastedCodeCheck {
  if (!pending || pending.kind !== field.kind || pending.value !== field.value || !field.unchecked) {
    return { action: 'none' };
  }
  if (!field.contactReady) return { action: 'wait', reason: 'contact' };
  if (field.busy) return { action: 'wait', reason: 'busy' };
  return { action: 'check', delayMs: pending.waitsForContact ? PASTED_CODE_CONTACT_SETTLE_MS : 0 };
}
