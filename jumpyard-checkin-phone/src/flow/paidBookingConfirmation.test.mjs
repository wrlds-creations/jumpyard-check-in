import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  PAID_CONFIRMATION_LOOKUP_ATTEMPTS,
  PAID_CONFIRMATION_LOOKUP_RETRY_DELAY_MS,
  PAID_CONFIRMATION_RETRY_DELAYS_MS,
  classifyPaidConfirmation,
  getApprovedPurchaseIdentifier,
  getPaidConfirmationRetryDelay,
  isApprovedPurchaseAwaitingConfirmation,
  resolvePaidConfirmation,
} from './paidBookingConfirmation.ts';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const buySource = read('../components/BuyTickets.tsx');
const pageSource = read('../app/page.tsx');
const attestSource = read('../components/SafetyAttest.tsx');
const languageSource = read('../context/LanguageContext.tsx');

const booking = (paid, overrides = {}) => ({
  id: 'B123',
  rollerUniqueId: 'roller-1',
  jumpers: 2,
  time: '11:00',
  products: 1,
  paid,
  ...overrides,
});

const noWait = async () => undefined;

test('an unpaid lookup is awaiting, never accepted as paid', () => {
  assert.equal(classifyPaidConfirmation(booking(false)), 'awaiting');
  assert.equal(classifyPaidConfirmation(booking(true)), 'paid');
  assert.equal(classifyPaidConfirmation(booking(undefined)), 'awaiting');
});

test('the confirmation schedule is sparse and bounded, then manual', () => {
  assert.deepEqual([...PAID_CONFIRMATION_RETRY_DELAYS_MS], [15_000, 30_000, 60_000]);
  assert.equal(getPaidConfirmationRetryDelay(0), 15_000);
  assert.equal(getPaidConfirmationRetryDelay(1), 30_000);
  assert.equal(getPaidConfirmationRetryDelay(2), 60_000);
  assert.equal(getPaidConfirmationRetryDelay(3), null);
  assert.equal(getPaidConfirmationRetryDelay(-1), null);
  assert.equal(getPaidConfirmationRetryDelay(1.5), null);
  assert.ok(PAID_CONFIRMATION_RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0) <= 120_000);
});

test('one successful lookup is one call, whether ROLLER says paid or not yet', async () => {
  const calls = [];
  const lookup = async (identifier) => {
    calls.push(identifier);
    return booking(calls.length > 1);
  };

  const first = await resolvePaidConfirmation(lookup, 'roller-1', { wait: noWait });
  assert.equal(first.status, 'awaiting');
  assert.equal(first.booking.paid, false);
  assert.deepEqual(calls, ['roller-1']);

  const second = await resolvePaidConfirmation(lookup, 'roller-1', { wait: noWait });
  assert.equal(second.status, 'paid');
  assert.equal(calls.length, 2);
});

test('lookup failures retry a bounded number of times with the short delay, then report unavailable', async () => {
  const waits = [];
  let calls = 0;
  const alwaysFailing = async () => {
    calls += 1;
    throw new Error('network');
  };

  const outcome = await resolvePaidConfirmation(alwaysFailing, 'roller-1', { wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(outcome, { status: 'unavailable' });
  assert.equal(calls, PAID_CONFIRMATION_LOOKUP_ATTEMPTS);
  assert.deepEqual(waits, Array(PAID_CONFIRMATION_LOOKUP_ATTEMPTS - 1).fill(PAID_CONFIRMATION_LOOKUP_RETRY_DELAY_MS));

  let recovering = 0;
  const recovered = await resolvePaidConfirmation(async () => {
    recovering += 1;
    if (recovering < 3) throw new Error('network');
    return booking(true);
  }, 'roller-1', { wait: noWait });
  assert.equal(recovered.status, 'paid');
  assert.equal(recovering, 3);
});

test('awaiting applies only to an approved purchase without a session', () => {
  const base = { booking: booking(false), buyEntryFlow: true, checkinSession: null, paymentCompleted: true };
  assert.equal(isApprovedPurchaseAwaitingConfirmation(base), true);
  assert.equal(isApprovedPurchaseAwaitingConfirmation({ ...base, checkinSession: { checkinSessionId: 's1', status: 'guest_in_progress' } }), false);
  assert.equal(isApprovedPurchaseAwaitingConfirmation({ ...base, buyEntryFlow: false }), false);
  assert.equal(isApprovedPurchaseAwaitingConfirmation({ ...base, paymentCompleted: false }), false);
  assert.equal(isApprovedPurchaseAwaitingConfirmation({ ...base, booking: null }), false);
});

test('the same purchase identity is reused for every confirmation check', () => {
  assert.equal(getApprovedPurchaseIdentifier(booking(false)), 'roller-1');
  assert.equal(getApprovedPurchaseIdentifier(booking(false, { rollerUniqueId: null })), 'B123');
  assert.equal(getApprovedPurchaseIdentifier(booking(false, { rollerUniqueId: '  ', id: ' ' })), null);
  assert.equal(getApprovedPurchaseIdentifier(null), null);
});

test('phone approval no longer accepts the first lookup regardless of paid state', () => {
  assert.doesNotMatch(buySource, /resolvedBooking = await lookupBooking\(identifier\);\s*break;/);
  assert.match(buySource, /resolvePaidConfirmation\(lookupBooking, identifier, \{ wait \}\)/);
  assert.match(buySource, /confirmation\.status === 'unavailable'/);
  assert.match(buySource, /onBookingReady\(confirmation\.booking\)/);
  assert.match(buySource, /setStep\('APPROVED'\);[\s\S]*resolvePaidDraftBooking\(undefined, true\)/);
});

test('an approved purchase continues into safety while ROLLER confirms; only unapproved bookings see the summary', () => {
  assert.match(pageSource, /if \(!booking\.paid\) \{\s*if \(paymentApproved\) return continueIntoSafetyAwaitingConfirmation\(\);/);
  assert.match(pageSource, /preparePaidNewBooking\(booking, null, \{ paymentApproved: true \}\)/);
  assert.match(pageSource, /snapshot\.draftState\?\.paymentApproved === true/);
  assert.match(pageSource, /if \(paymentApproved\) return continueIntoSafetyAwaitingConfirmation\(\);\s*setSessionStartError/);
});

test('the staff handoff confirms the paid state once more with sparse retries and never asks for a new payment', () => {
  assert.match(pageSource, /isApprovedPurchaseAwaitingConfirmation\(ctx\)/);
  assert.match(pageSource, /resolvePaidConfirmation\(lookupBooking, identifier, \{ wait: delay \}\)/);
  assert.match(pageSource, /manualRetry \? null : getPaidConfirmationRetryDelay\(retryIndex\)/);
  assert.match(pageSource, /startCheckInSession\(confirmation\.booking, 'safety'\)/);
  assert.match(pageSource, /markSessionReadyForStaff\(checkinSession, 'completed'\)/);
  assert.match(pageSource, /setPaidConfirmationState\('delayed'\)/);
  assert.doesNotMatch(pageSource, /setInterval/);
  assert.match(pageSource, /if \(state === 'APP_SAFETY_ATTEST'\) return;\s*paidConfirmationRunRef\.current \+= 1;/);
  assert.match(attestSource, /paid-confirmation-notice/);
  assert.match(attestSource, /paid-confirmation-retry/);
  assert.match(attestSource, /disabled=\{!allChecked \|\| isSubmitting \|\| retryAction !== null\}/);
  for (const key of ['paymentConfirmationWaiting', 'paymentConfirmationDelayed', 'paymentConfirmationRetry']) {
    assert.equal((languageSource.match(new RegExp(`\\b${key}:`, 'g')) ?? []).length, 2, key);
  }
  assert.match(languageSource, /Betala inte igen\./);
  assert.match(languageSource, /Do not pay again\./);
});
