import type { NewBookingCustomer } from './cloudClient';

/**
 * GH-473/D0234: new purchases ask for first name and email. Cloud fills in a known customer from
 * Klaviyo; when it cannot decide safely it answers with this code and the guest adds last name and
 * phone. The phone never invents a last name or a phone number.
 */
export const CONTACT_DETAILS_REQUIRED_CODE = 'contact_details_required';

export interface ContactFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: string) {
  return value.replace(/\D/g, '').length >= 6;
}

/** Email-first needs first name and email; after Cloud's request, last name and phone as well. */
export function isContactReady(contact: ContactFields, detailsRequired: boolean) {
  if (!contact.firstName.trim() || !isValidEmail(contact.email)) return false;
  return !detailsRequired || (contact.lastName.trim().length > 0 && isValidPhone(contact.phone));
}

/** Email-first sends only what the guest typed; the fallback sends all four fields. */
export function toNewBookingCustomer(contact: ContactFields, detailsRequired: boolean): NewBookingCustomer {
  const customer: NewBookingCustomer = { firstName: contact.firstName.trim(), email: contact.email.trim() };
  if (!detailsRequired) return customer;
  return { ...customer, lastName: contact.lastName.trim(), phone: contact.phone.trim() };
}

/** A saved contact that already holds last name or phone resumes in the four-field form. */
export function hasSavedContactDetails(contact: ContactFields) {
  return contact.lastName.trim().length > 0 || contact.phone.trim().length > 0;
}

export function isContactDetailsRequiredError(error: unknown) {
  return typeof error === 'object' && error !== null
    && (error as { code?: unknown }).code === CONTACT_DETAILS_REQUIRED_CODE;
}
