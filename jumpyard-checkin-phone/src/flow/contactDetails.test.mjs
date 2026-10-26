import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import backendLookup from '../../../infra/lambda/booking/contact-lookup.js';
import {
  CONTACT_DETAILS_REQUIRED_CODE,
  INVALID_EMAIL_CODE,
  hasSavedContactDetails,
  isContactDetailsRequiredError,
  isContactReady,
  isEmailRefusedError,
  isValidEmail,
  isValidPhone,
  normalizeEmailForRefusal,
  shouldShowEmailFormatMessage,
  toNewBookingCustomer,
} from './contactDetails.ts';

// GH-473/D0234. Synthetic contacts only (example.invalid, PTS fiction numbers 070-174 06 05..99).
const contact = (overrides = {}) => ({ firstName: 'Guest', lastName: '', email: 'guest@example.invalid', phone: '', ...overrides });

test('the phone and Cloud share one fallback code', () => {
  assert.equal(CONTACT_DETAILS_REQUIRED_CODE, 'contact_details_required');
  assert.equal(CONTACT_DETAILS_REQUIRED_CODE, backendLookup.CONTACT_DETAILS_REQUIRED);
  assert.equal(isContactDetailsRequiredError({ code: 'contact_details_required', httpStatus: 409 }), true);
  for (const error of [null, undefined, 'contact_details_required', new Error('contact_details_required'), { code: 'customer_required' }]) {
    assert.equal(isContactDetailsRequiredError(error), false);
  }
});

test('email-first is ready with a first name and a valid email; the fallback also needs last name and phone', () => {
  assert.equal(isContactReady(contact(), false), true);
  assert.equal(isContactReady(contact({ firstName: '  ' }), false), false);
  assert.equal(isContactReady(contact({ email: 'guest@example' }), false), false);
  assert.equal(isContactReady(contact(), true), false);
  assert.equal(isContactReady(contact({ lastName: 'Test' }), true), false);
  assert.equal(isContactReady(contact({ lastName: 'Test', phone: '12345' }), true), false);
  assert.equal(isContactReady(contact({ lastName: 'Test', phone: '070-174 06 05' }), true), true);
  assert.equal(isContactReady(contact({ lastName: ' ', phone: '070-174 06 05' }), true), false);
  assert.equal(isValidEmail(' guest@example.invalid '), true);
  assert.equal(isValidPhone('+44 7700 900123'), true);
});

test('the customer never contains an invented last name or phone', () => {
  assert.deepEqual(toNewBookingCustomer(contact({ firstName: ' Guest ', email: ' guest@example.invalid ' }), false),
    { firstName: 'Guest', email: 'guest@example.invalid' });
  assert.deepEqual(toNewBookingCustomer(contact({ lastName: 'Ignored', phone: '0701740605' }), false),
    { firstName: 'Guest', email: 'guest@example.invalid' }, 'hidden fields are not sent in email-first mode');
  assert.deepEqual(toNewBookingCustomer(contact({ lastName: ' Test ', phone: ' 070-174 06 05 ' }), true),
    { firstName: 'Guest', email: 'guest@example.invalid', lastName: 'Test', phone: '070-174 06 05' });
});

test('a saved contact with a last name or phone resumes in the four-field form', () => {
  assert.equal(hasSavedContactDetails(contact()), false);
  assert.equal(hasSavedContactDetails(contact({ lastName: 'Test' })), true);
  assert.equal(hasSavedContactDetails(contact({ phone: '0701740605' })), true);
  assert.equal(hasSavedContactDetails(contact({ lastName: '  ', phone: ' ' })), false);
});

// GH-552: one table for the phone and Cloud, so a mistyped email never reaches Cloud's lookup.
const VALID_EMAILS = ['guest@example.invalid', ' guest@example.invalid ', 'Guest.Name@Example.Invalid',
  "o'brien+jy552@sub.example.invalid", 'a@b.co'];
const INVALID_EMAILS = ['love@wrlds.co,', 'guest,x@example.invalid', 'guest @example.invalid', 'guest@example', 'guest@',
  '@example.invalid', 'guest', 'guest@@example.invalid', 'guest@example..invalid', 'guest@example.invalid.',
  'guest@-example.invalid', 'gäst@example.invalid', 'guest@exämple.invalid', '', '   ', `${'g'.repeat(240)}@example.invalid`];

test('GH-552: the phone accepts exactly the email format Cloud accepts', () => {
  for (const email of VALID_EMAILS) {
    assert.equal(isValidEmail(email), true, email);
    assert.equal(backendLookup.isValidEmailFormat(email), true, email);
  }
  for (const email of INVALID_EMAILS) {
    assert.equal(isValidEmail(email), false, email);
    assert.equal(backendLookup.isValidEmailFormat(email), false, email);
    assert.equal(isContactReady(contact({ email }), false), false, `${email}: Continue stays off`);
    assert.equal(isContactReady(contact({ email, lastName: 'Test', phone: '070-174 06 05' }), true), false,
      `${email}: also with all four fields`);
  }
});

test('GH-552: the message shows at once for a character no address holds, otherwise after leaving the field', () => {
  // Love's typo, a space inside, a second @ and å are wrong whatever the guest types next.
  for (const email of ['love@wrlds.co,', 'guest @example', 'guest@@', 'gäst@']) {
    for (const editing of [true, false]) assert.equal(shouldShowEmailFormatMessage(email, editing), true, email);
  }
  // A half-typed address is not a mistake while the guest is still typing.
  for (const email of ['guest', 'guest@', 'guest@example', 'guest@example.']) {
    assert.equal(shouldShowEmailFormatMessage(email, true), false, email);
    assert.equal(shouldShowEmailFormatMessage(email, false), true, email);
  }
  for (const email of ['', '   ', 'guest@example.invalid', ' guest@example.invalid ', 'Guest@Example.Invalid']) {
    for (const editing of [true, false]) assert.equal(shouldShowEmailFormatMessage(email, editing), false, email);
  }
});

// GH-596: ROLLER's POST /bookings/draft/costs on 2026-10-26 took the first list and answered the second
// with 409 "A valid booking owner email is required" (synthetic example.com addresses).
const ROLLER_ACCEPTED_EMAILS = ['jy596.ok@example.com', 'jy596-@example.com', "o'jy596@example.com", 'jy596_x@example.com',
  'jumpyard.quote@example.invalid', 'anna.svensson@gmail.com', 'anna@gmail.se'];
const ROLLER_REFUSED_EMAILS = ['jy596.@example.com', 'jy596..x@example.com', '.jy596@example.com', 'jy596@example.c',
  'jy596@example.c0m', 'anna...@gmail.com'];

test('GH-596: the phone and Cloud accept exactly what ROLLER accepts', () => {
  for (const email of ROLLER_ACCEPTED_EMAILS) {
    assert.equal(isValidEmail(email), true, email);
    assert.equal(backendLookup.isValidEmailFormat(email), true, email);
  }
  for (const email of ROLLER_REFUSED_EMAILS) {
    assert.equal(isValidEmail(email), false, email);
    assert.equal(backendLookup.isValidEmailFormat(email), false, email);
    assert.equal(isContactReady(contact({ email }), false), false, `${email}: Continue stays off`);
  }
});

test('GH-596: dots that no address can have show the message while the guest types', () => {
  // A dot first, two in a row, a dot next to the @ and a hyphen right after it are wrong whatever comes next.
  for (const email of ['.anna', 'anna..', 'anna.@', 'anna...@gmail.com', 'anna@.', 'anna@-']) {
    for (const editing of [true, false]) assert.equal(shouldShowEmailFormatMessage(email, editing), true, email);
  }
  // A domain ending is only wrong once the guest has left the field: "gmail.c" may still become "gmail.com".
  for (const email of ['anna@gmail.c', 'anna.', 'anna.s']) {
    assert.equal(shouldShowEmailFormatMessage(email, true), false, email);
  }
  assert.equal(shouldShowEmailFormatMessage('anna@gmail.c', false), true);
});

test('GH-596: an address Cloud refused keeps the message until the guest changes it', () => {
  assert.equal(INVALID_EMAIL_CODE, backendLookup.INVALID_EMAIL);
  assert.equal(isEmailRefusedError({ code: 'invalid_email', httpStatus: 409 }), true);
  assert.equal(isEmailRefusedError({ code: 'invalid_email', httpStatus: 400 }), true);
  for (const error of [null, undefined, 'invalid_email', { code: 'roller_draft_failed' }, { code: 'customer_email_invalid' }]) {
    assert.equal(isEmailRefusedError(error), false);
  }
  const refused = normalizeEmailForRefusal(' Guest@Example.Invalid ');
  assert.equal(refused, 'guest@example.invalid');
  for (const editing of [true, false]) {
    assert.equal(shouldShowEmailFormatMessage('guest@example.invalid', editing, refused), true);
    assert.equal(shouldShowEmailFormatMessage('GUEST@example.invalid ', editing, refused), true);
    assert.equal(shouldShowEmailFormatMessage('guest2@example.invalid', editing, refused), false);
  }
  const component = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(component, /const emailRefused = refusedEmail !== null && normalizeEmailForRefusal\(email\) === refusedEmail;/);
  assert.match(component, /const customerValid = isContactReady\(\{ firstName, lastName, email, phone \}, contactDetailsRequired\) && !emailRefused;/);
  assert.match(component, /if \(isEmailRefusedError\(error\)\) \{\s*setRefusedEmail\(normalizeEmailForRefusal\(email\)\);\s*setSubmitError\(t\.buy\.emailRefused\);\s*return;/);
  const copy = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(copy, /emailRefused: 'Vi kunde inte använda e-postadressen\. Rätta den och försök igen\.',/);
  assert.match(copy, /emailRefused: "We couldn't use that email address\. Correct it and try again\.",/);
});

test('GH-552: the message sits on the email label row; Cloud\'s fallback is unchanged', () => {
  const component = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(component, /const emailFormatMessageShown = shouldShowEmailFormatMessage\(email, emailFocused, refusedEmail\);/);
  assert.match(component, /\{t\.buy\.emailLabel\}\s*\{\/\*[^*]*\*\/\}\s*\{emailFormatMessageShown && \(\s*<span role="alert" data-testid="buy-email-invalid"[^>]*>\s*<JumpyardIcon name="warning-transparent"[^>]*\/> \{t\.buy\.emailInvalid\}\s*<\/span>\s*\)\}\s*<\/span>\s*<input\s+ref=\{emailInputRef\}/);
  assert.match(component, /aria-invalid=\{emailFormatMessageShown\}/);
  // D0234: only Cloud's uncertain lookup asks for last name and phone.
  assert.match(component, /if \(code === 'contact_details_required' \|\| \(code === 'customer_required' && !contactDetailsRequired\)\) \{/);
  const copy = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  assert.match(copy, /emailInvalid: 'Kontrollera e-postadressen',/);
  assert.match(copy, /emailInvalid: 'Check the email address',/);
});
