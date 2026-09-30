import assert from 'node:assert/strict';
import test from 'node:test';
import backendLookup from '../../../infra/lambda/booking/contact-lookup.js';
import {
  CONTACT_DETAILS_REQUIRED_CODE,
  hasSavedContactDetails,
  isContactDetailsRequiredError,
  isContactReady,
  isValidEmail,
  isValidPhone,
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
