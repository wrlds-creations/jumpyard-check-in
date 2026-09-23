'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { COPY_VERSION, validateChoice, createPendingGrant, deliverPendingGrant, buildGuestGrant } = require('./email-marketing-consent');
const now = Date.parse('2026-09-23T12:00:00Z');
const choice = { granted: true, copyVersion: COPY_VERSION, locale: 'sv' };
const grant = createPendingGrant(choice, { email: 'guest@example.invalid' }, 'draft-1', 'external-1', 'playground', new Date(now));
const guest = { firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid', phone: '+46701234567',
  acceptMarketing: false, acceptMarketingSMS: true, flags: [], address: { city: 'Test' }, dateOfBirth: null };
const booking = { uniqueId: 'draft-1', externalId: 'external-1', bookingReference: 'test-reference',
  customerId: 42, paymentStatus: 'Paid', status: 'Confirmed', amountOwing: 0 };

function transport(overrides = {}) {
  const calls = []; let claimed = false;
  const deps = {
    getBooking: async () => { calls.push('read_booking'); return { ...booking }; },
    getGuest: async () => { calls.push('read_guest'); return { ...guest }; },
    claim: async () => { calls.push('claim'); if (claimed) return false; claimed = true; return true; },
    putGuest: async (id, body) => { calls.push('write_guest'); assert.equal(id, '42'); assert.equal(body.acceptMarketing, true); assert.equal(body.acceptMarketingSms, true); },
    record: async (status) => { calls.push(status); },
    ...overrides,
  };
  return { deps, calls };
}

test('only an explicit, known, versioned choice is valid; absent means no instruction', () => {
  for (const value of [undefined, null, choice, { ...choice, locale: 'en' }]) assert.equal(validateChoice(value), null);
  for (const value of [false, true, [], {}, { ...choice, granted: false }, { ...choice, locale: 'de' }, { ...choice, copyVersion: 'unknown' }]) {
    assert.equal(validateChoice(value)?.code, 'email_marketing_consent_invalid');
  }
  assert.equal(createPendingGrant(null, {}, '', '', 'playground'), null);
  assert.ok(!JSON.stringify(grant).includes('guest@example.invalid'));
  assert.equal(grant.capturedAt, new Date(now).toISOString());
  assert.equal(grant.copyText, 'Ja tack! Mejla mig erbjudanden & nyheter från JumpYard');
});

test('unpaid, partial, missing payment evidence, cancelled, wrong draft or external identity never grants', async () => {
  for (const patch of [{ paymentStatus: 'Unpaid' }, { paymentStatus: 'Partially paid' }, { paymentStatus: null },
    { amountOwing: 1 }, { amountOwing: null }, { amountOwing: '0' }, { status: 'Cancelled' }, { status: 'Refunded' },
    { status: 'Paid', bookingStatus: 'Cancelled' }, { status: 'Paid', bookingStatus: 'Refunded' },
    { uniqueId: 'another-draft' }, { externalId: 'another-external' }, { bookingReference: null }]) {
    const h = transport({ getBooking: async () => ({ ...booking, ...patch }) });
    assert.equal(await deliverPendingGrant(grant, h.deps, now), 'not_paid');
    assert.deepEqual(h.calls, []);
  }
});

test('ROLLER status Paid is valid when the separate paymentStatus field is absent', async () => {
  const h = transport({ getBooking: async () => ({ ...booking, paymentStatus: undefined, status: 'Paid' }) });
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'submitted');
});

test('paid grant preserves current contact and SMS preferences and is not replayed', async () => {
  const h = transport();
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'submitted');
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'already_claimed');
  assert.equal(h.calls.filter(value => value === 'write_guest').length, 1);
  assert.ok(h.calls.indexOf('claim') < h.calls.indexOf('write_guest'));
  const body = buildGuestGrant(guest, grant);
  assert.equal(body.email, guest.email);
  assert.equal(body.phone, guest.phone);
  assert.equal(body.address, guest.address);
  assert.equal(body.flags, guest.flags);
  assert.equal(guest.acceptMarketing, false);
});

test('existing opt-in is a consumed no-op, not another write', async () => {
  const h = transport({ getGuest: async () => ({ ...guest, acceptMarketing: true }) });
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'already_opted_in');
  assert.ok(!h.calls.includes('write_guest'));
});

test('mismatched email, unknown preference or guest ID stops without a claim', async () => {
  for (const patch of [{ email: 'different@example.invalid' }, { acceptMarketing: undefined }, { acceptMarketingSMS: undefined }]) {
    const h = transport({ getGuest: async () => ({ ...guest, ...patch }) });
    assert.equal(await deliverPendingGrant(grant, h.deps, now), 'guest_unverified');
    assert.ok(!h.calls.includes('claim'));
  }
});

test('ambiguous provider write is recorded and never retried by a duplicate event', async () => {
  let writes = 0;
  const h = transport({ putGuest: async () => { writes++; throw new Error('Timeout'); } });
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'unknown');
  assert.equal(await deliverPendingGrant(grant, h.deps, now), 'already_claimed');
  assert.equal(writes, 1);
});

test('absent, expired or future-dated consent cannot contact the provider', async () => {
  for (const [value, time, expected] of [[null, now, 'not_pending'], [grant, now - 1, 'expired'], [grant, now + 86400001, 'expired']]) {
    const h = transport();
    assert.equal(await deliverPendingGrant(value, h.deps, time), expected);
    assert.deepEqual(h.calls, []);
  }
});
