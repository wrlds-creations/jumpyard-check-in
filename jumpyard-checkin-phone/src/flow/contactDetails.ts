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

// GH-552: the format Cloud accepts for an email-first purchase (infra/lambda/booking/contact-lookup.js):
// plain characters, one @ and a domain with a dot, compared in lower case after trimming.
const EMAIL_FORMAT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
// A character no address can hold (a comma, a space, å), or a second @.
const NEVER_IN_EMAIL = /[^a-z0-9.!#$%&'*+/=?^_`{|}~@-]|@[^@]*@/i;

export function isValidEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_FORMAT.test(email);
}

/**
 * GH-552: "Kontrollera e-postadressen" for an address Cloud would refuse. A character no address can
 * hold shows it at once; a half-typed address only once the guest has left the field.
 */
export function shouldShowEmailFormatMessage(value: string, editing: boolean) {
  const email = value.trim();
  if (!email || isValidEmail(email)) return false;
  return !editing || NEVER_IN_EMAIL.test(email);
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
