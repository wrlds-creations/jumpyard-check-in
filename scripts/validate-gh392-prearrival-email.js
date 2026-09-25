'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { POLICY, ROLLOUT, SUPPORTED_PRODUCTS, PAGE_SIZE, PAGE_QUERY, isRolloutDay, normalizePreparation, classifyCandidate, preparePrearrivalEmailPage, processPrearrivalEmailRun } = require('../infra/lambda/session/prearrival-email');
const root = path.resolve(__dirname, '..');
const asOf = '2026-09-28T10:00:00.000Z'; // 12:00 Stockholm, for a 14:00 booking.
const row = (overrides = {}) => ({ roller_unique_id: 'anders-booking', booking_customer_id:'owner', venue_id: '50871', roller_env: 'live',
  booking_date: '2026-09-28', start_time: '14:00:00', booking_start_at: '2026-09-28T12:00:00.000Z',
  email: 'anders@example.com', product_support: 'supported', email_already_sent: false, email_attempt_exists: false, ...overrides });
const context = (r = row(), overrides = {}) => ({ booking: { rollerUniqueId: r.roller_unique_id, venueId: r.venue_id,
  rollerEnv: 'live', bookingDate: r.booking_date, startTime: r.start_time, bookingStatus: 'Active',
  freshnessStatus: 'fresh', isTombstoned: false, ...overrides }, tickets: [] });
const eligible = { canStart: true };

function deps(rows, overrides = {}) {
  return { environment: 'park-test', executeStatement: async () => rows, mappedRows: value => value,
    getBookingContext: async id => context(rows.find(r => r.roller_unique_id === id)),
    evaluateStartContext: () => eligible, ...overrides };
}

test('Permanent policy: two hours, public origin; read-only planning works for any date', () => {
  assert.equal(POLICY.leadMinutes, 120);
  assert.equal(POLICY.checkinBaseUrl, 'https://checkin.jumpyard.se/');
  for (const day of ['2026-09-27', '2026-09-28', '2026-09-29']) {
    assert.equal(normalizePreparation({ now: `${day}T10:00:00Z` }).error, undefined);
  }
});

test('No request can turn preparation into a send or override its audience/channel/link', async () => {
  for (const field of ['confirmSend', 'dryRun']) {
    for (const value of [true, 'true', 'false', 1, null, false]) {
      if ((field === 'confirmSend' && value === false) || (field === 'dryRun' && value === true)) continue;
      const result = await preparePrearrivalEmailPage({ [field]: value }, deps([], { executeStatement: () => assert.fail('No DB call allowed') }));
      assert.equal(result.body.error.code, 'prearrival_rollout_not_approved');
    }
  }
  for (const field of ['email', 'baseUrl', 'emailBaseUrl', 'checkinBaseUrl', 'channels', 'leadMinutes', 'venueId', 'windowStartAt', 'windowEndAt']) {
    assert.equal(normalizePreparation({ [field]: 'override' }).error, 'prearrival_policy_override_rejected');
  }
  assert.equal((await preparePrearrivalEmailPage({}, deps([], { environment: 'dev' }))).statusCode, 409);
});

test('T-120 boundary, five-minute tolerance, late bookings and start cutoff', () => {
  for (const [minutes, expected] of [[121, 'outside_due_window'], [120, 'eligible_pending_live_checks'], [115, 'eligible_pending_live_checks'], [1, 'eligible_pending_live_checks'], [0, 'outside_due_window'], [-1, 'outside_due_window']]) {
    const r = row({ booking_start_at: new Date(Date.parse(asOf) + minutes * 60_000).toISOString() });
    assert.equal(classifyCandidate(r, context(r), eligible, asOf), expected);
  }
});

test('Stockholm timezone/DST does not alter elapsed lead time', () => {
  assert.equal(normalizePreparation({ now: '2026-09-28T12:00:00+02:00' }).endAt, '2026-09-28T12:00:00.000Z');
  assert.equal(normalizePreparation({ now: '2026-10-25T01:30:00+02:00' }).endAt, '2026-10-25T01:30:00.000Z');
  for (const now of ['yesterday', '2026-09-28', '2026-09-28T12:00:00', '']) assert.ok(normalizePreparation({ now }).error);
});

test('Cancelled, unpaid, stale, changed, missing-contact and previously attempted bookings cannot be eligible', () => {
  const cases = [
    [row({ venue_id: 'other' }), {}, eligible, 'wrong_venue'],
    [row(), { rollerEnv: 'playground' }, eligible, 'wrong_environment'],
    [row(), { bookingStatus: 'Cancelled' }, eligible, 'inactive_booking'],
    [row(), { isTombstoned: true }, eligible, 'inactive_booking'],
    [row(), { freshnessStatus: 'stale' }, eligible, 'stale_booking'],
    [row(), { startTime: '15:00:00' }, eligible, 'booking_changed'],
    [row(), { rollerUniqueId: 'other-booking' }, eligible, 'booking_changed'],
    [row(), {}, { canStart: false }, 'booking_not_eligible'],
    [row({ email: null }), {}, eligible, 'booking_contact_missing'],
    [row({ email: 'invalid' }), {}, eligible, 'booking_contact_invalid'],
    [row({ email_already_sent: true }), {}, eligible, 'already_sent'],
    [row({ email_attempt_exists: true }), {}, eligible, 'previous_attempt_requires_review'],
  ];
  for (const [r, change, decision, expected] of cases) assert.equal(classifyCandidate(r, context(r, change), decision, asOf), expected);
});

test('Preparation uses the real payment and ticket eligibility rules', async () => {
  const session = loadLambda('session', 'evaluateStartContext');
  const paid = context(row(), {paymentStatus:'paid', amountOwingCents:0});
  paid.tickets = [{ticketId:'synthetic-ticket',bookingDate:'2026-09-28',ticketSource:'data_api_tickets',redeemStatusLastSeen:'unredeemed'}];
  for (const [booking, tickets, expected] of [
    [paid.booking, paid.tickets, 'eligible_pending_live_checks'],
    [{...paid.booking,amountOwingCents:100,paymentStatus:'partially_paid'}, paid.tickets, 'booking_not_eligible'],
    [paid.booking, [], 'booking_not_eligible'],
    [paid.booking, [{...paid.tickets[0],redeemStatusLastSeen:'redeemed'}], 'booking_not_eligible'],
  ]) {
    const result = await preparePrearrivalEmailPage({now:asOf}, deps([row()], {
      getBookingContext:async () => ({booking,tickets}), evaluateStartContext:session.evaluateStartContext,
    }));
    assert.equal(result.body.summary.counts[expected], 1, JSON.stringify(result.body.summary));
  }
});

test('Bounded pages traverse 151 simultaneous bookings without dropping any beyond the old limit of ten', async () => {
  const rows = Array.from({ length: 151 }, (_, i) => row({ roller_unique_id: `booking-${String(i).padStart(4, '0')}` }));
  const seen = [];
  let cursor;
  let examined = 0;
  do {
    const result = await preparePrearrivalEmailPage({ now: asOf, ...(cursor ? { cursor } : {}) }, deps(rows, {
      executeStatement: async (sql, parameters) => {
        assert.equal(sql, PAGE_QUERY);
        assert.equal(parameters.find(p => p.name === 'messageTemplate').value.stringValue, 'checkin_email_v1');
        const after = parameters.find(p => p.name === 'afterId').value.stringValue;
        const start = after ? rows.findIndex(r => r.roller_unique_id === after) + 1 : 0;
        return rows.slice(start, start + PAGE_SIZE + 1);
      },
      getBookingContext: async id => { seen.push(id); return context(rows.find(r => r.roller_unique_id === id)); },
    }));
    assert.equal(result.body.sendsEnabled, false);
    assert.equal(result.body.dryRun, true);
    assert.equal(JSON.stringify(result).includes('anders@example.com'), false);
    examined += result.body.summary.examined;
    cursor = result.body.nextCursor;
    assert.equal(result.body.hasMore, Boolean(cursor));
  } while (cursor);
  assert.equal(examined, 151);
  assert.equal(new Set(seen).size, 151);
});

test('Continuation pins the clock; invalid or out-of-window cursors are rejected', () => {
  const cursor = { asOf, afterStartAt: '2026-09-28T12:00:00Z', afterId: 'booking-0024' };
  assert.equal(normalizePreparation({ cursor }).asOf, asOf);
  for (const bad of [{ ...cursor, afterId: '' }, { ...cursor, afterStartAt: asOf }, { ...cursor, afterStartAt: '2026-09-28T12:01:00Z' }, [], null]) {
    assert.ok(normalizePreparation({ cursor: bad }).error);
  }
  assert.ok(normalizePreparation({ now: '2026-09-28T10:01:00Z', cursor }).error);
});

function loadLambda(name, internalNames, extra = '', testHooks = {}) {
  const absolute = path.join(root, `infra/lambda/${name}/index.js`);
  const module = { exports: {} };
  const environment = { JUMPYARD_ENVIRONMENT: 'park-test', JUMPYARD_EMERGENCY_STOP: 'false', ENABLE_GUEST_MESSAGE_SENDS: 'true', EMAIL_FROM_ADDRESS:'sender@example.com' };
  const sandbox = { module, exports: module.exports, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, setTimeout, clearTimeout, console,
    process: { env: environment }, testHooks,
    require(id) {
      if (id === 'crypto') return crypto;
      if (id.startsWith('./')) return require(path.resolve(path.dirname(absolute), id));
      if (id.startsWith('@aws-sdk/')) return new Proxy({}, { get: () => class { constructor(input) { this.input = input; } send() { assert.fail('Unexpected AWS operation'); } } });
      throw Error(`Unexpected module ${id}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8') + `\n${extra}\nmodule.exports.internal = { ${internalNames} };`, sandbox, { filename: absolute });
  return module.exports.internal;
}

function loadSession(extra = '', testHooks = {}) {
  return loadLambda('session', 'handleSendDueSessionLinkMessages, createSession, isExpired, handleResolveSessionLink, deliverPrearrivalEmail, prearrivalEmailIdempotencyKey, reservePrearrivalEmail', extra, testHooks);
}

test('Existing authenticated handler rejects actual prearrival sends even if general send env is accidentally true', async () => {
  const s = loadSession();
  const response = await s.handleSendDueSessionLinkMessages({}, { messagePolicy: POLICY.name, confirmSend: true }, 'test', { trustedScheduler: true });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).error.code, 'prearrival_rollout_not_approved');
  const unauthenticated = await s.handleSendDueSessionLinkMessages({ headers: {} }, { messagePolicy: POLICY.name }, 'test');
  assert.equal(unauthenticated.statusCode, 401);
});

test('The actual scheduler handler preserves the closed policy instead of falling back to legacy delivery', async () => {
  const s = loadLambda('session', 'handler: exports.handler');
  const event = {source:'jumpyard.booking-time-messaging-scheduler',detail:{trigger:'scheduled_booking_time_messaging',messagePolicy:POLICY.name,confirmSend:true}};
  const response = await s.handler(event);
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).error.code, 'prearrival_rollout_not_approved');
  const preview = await s.handler({...event,detail:{...event.detail,confirmSend:false,email:'override@example.com'}});
  assert.equal(JSON.parse(preview.body).error.code, 'prearrival_policy_override_rejected');
  assert.equal(normalizePreparation({confirmSend:true,dryRun:true}).error, 'prearrival_rollout_not_approved');
  assert.equal(normalizePreparation({confirmSend:true,now:asOf}).error, 'prearrival_clock_invalid');
});

test('New regular sessions persist four hours from creation; expired states stay expired', async () => {
  const s = loadSession(`executeStatement = async (sql, parameters) => {
    const expiry = parameters.find(p => p.name === 'expiresAt').value.stringValue;
    const diff = Date.parse(expiry) - Date.now();
    if (diff < 14399000 || diff > 14400000) throw Error('Wrong lifetime');
    return { columnMetadata: [{name:'expires_at'}], records: [[{stringValue:expiry}]] };
  };`);
  const created = await s.createSession({ booking: { rollerUniqueId: 'anders', bookingReference: 'b1' }, selectedTicketIds: ['ticket'], visitDate: '2026-09-28', idempotencyKey: 'key' });
  assert.equal(s.isExpired(created.expiresAt), false);
  assert.equal(s.isExpired(new Date(Date.now() - 1).toISOString()), true);
});

test('Opening Anders link routes to Anders booking despite a caller-supplied alternative booking', async () => {
  const s = loadSession(`findSessionLinkToken = async () => ({ rollerUniqueId: 'anders', channel: 'email', expiresAt: new Date(Date.now()+7200000).toISOString(), consumedAt: null });
    markSessionLinkOpened = async () => ({accepted:true, openedAt:new Date().toISOString()});
    shouldAuditSessionLinkOpen = () => false;
    handleStartSession = async (event, body, correlation, options) => {
      if (body.rollerUniqueId !== 'anders' || options.guestAccess.token !== 'personal-anders-token') throw Error('Wrong booking');
      return {session:{checkinSessionId:'saved-anders-session', safetyStatus:'completed', handoffCode:'0042'}};
    };`);
  const result = await s.handleResolveSessionLink({}, {token:'personal-anders-token', rollerUniqueId:'another-booking'}, 'test');
  assert.equal(result.session.checkinSessionId, 'saved-anders-session');
  assert.equal(result.session.safetyStatus, 'completed');
});

test('Delivery orchestration stops between recipients and counts unknown outcomes safely', async () => {
  let checks = 0;
  let deliveries = 0;
  const rows = [row({roller_unique_id:'a'}), row({roller_unique_id:'b'}), row({roller_unique_id:'c'})];
  const result = await preparePrearrivalEmailPage({ confirmSend:true }, deps(rows, {
    clock: () => new Date(asOf),
    authorizeRollout: () => ++checks <= 3,
    deliver: async () => { if (++deliveries === 1) return 'sent'; throw Error('synthetic provider ambiguity'); },
  }));
  assert.equal(result.body.summary.counts.sent, 1);
  assert.equal(result.body.summary.counts.delivery_requires_review, 1);
  assert.equal(result.body.summary.counts.rollout_stopped, 1);
  assert.equal(deliveries, 2);
});

test('Actual email handler confirms Roller, preserves booking-bound link and reserves before provider send', async () => {
  const now = Date.now();
  const start = new Date(now + 60 * 60_000);
  const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  const time = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(start);
  const candidate = row({booking_date:date, start_time:time, booking_start_at:start.toISOString()});
  const testHooks = {};
  const s = loadSession(`
    isPrearrivalEmailRolloutAuthorized = () => true;
    isPrearrivalRolloutVisitDate = () => true;
    const observed = [];
    const fixture = ${JSON.stringify(candidate)};
    verifyT0201BookingWithRoller = async (candidate, control) => {
      if (control.bookingIdentifierSha256 !== hashString(fixture.roller_unique_id)
        || control.bookingCustomerIdSha256 !== hashString(fixture.booking_customer_id)) throw Error('Wrong authoritative target');
      observed.push('refresh'); return {ok:true};
    };
    getBookingContext = async () => (${JSON.stringify(context(candidate))});
    findPrearrivalBookingContact = async () => buildEmailDestination(fixture.email, 'booking_contact');
    evaluateStartContext = () => ({canStart:true});
    let reserved = false;
    reservePrearrivalEmail = async () => { observed.push('reserve'); if (reserved) return {ok:true,replayed:true}; reserved=true; return {ok:true,replayed:false}; };
    createSessionLinkToken = async input => { if(input.context.booking.rollerUniqueId!==fixture.roller_unique_id) throw Error('Wrong link booking'); observed.push('token'); return {token:'unique-anders-token',tokenHash:'safe-hash'}; };
    sendEmailWithSes = async input => { if(input.destinationEmail!==fixture.email || !input.html.includes('https://checkin.jumpyard.se/') || !input.html.includes('unique-anders-token')) throw Error('Wrong email'); observed.push('provider'); return 'synthetic-provider-id'; };
    recordEmailDelivery = async input => { if(input.status!=='sent') throw Error('Unexpected failure'); observed.push('record'); };
    markSessionLinkSent = completeIdempotencyKey = writeEventLog = async () => {};
    testHooks.observed = observed;
  `, testHooks);
  assert.equal(await s.deliverPrearrivalEmail({}, candidate, 'test'), 'sent');
  assert.equal(await s.deliverPrearrivalEmail({}, candidate, 'test'), 'already_attempted');
  assert.deepEqual(Array.from(testHooks.observed), ['refresh', 'reserve', 'token', 'provider', 'record', 'refresh', 'reserve']);
});

test('Stable reservation key ignores schedule and recipient changes but distinguishes bookings and visit days', () => {
  const s = loadSession();
  const booking = {rollerUniqueId:'anders',bookingDate:'2026-09-28'};
  const key = s.prearrivalEmailIdempotencyKey(booking);
  assert.equal(key, s.prearrivalEmailIdempotencyKey({...booking,startTime:'15:00',email:'changed@example.com'}));
  assert.notEqual(key, s.prearrivalEmailIdempotencyKey({...booking,rollerUniqueId:'other'}));
  assert.notEqual(key, s.prearrivalEmailIdempotencyKey({...booking,bookingDate:'2026-09-29'}));
});

test('Authoritative Roller verification rejects changed or missing booking owner without altering the historical gate', () => {
  const lookup = loadLambda('lookup', 'evaluateT0201ControlledT30RollerBooking, hashString');
  const booking = { uniqueId:'anders-booking', customerId:'owner', status:'confirmed', amountOwing:0, paymentStatus:'paid',
    items:[{bookingDate:'2026-09-28',startTime:'14:00:00'}] };
  const expected = {expectedBookingDate:'2026-09-28', expectedStartTime:'14:00:00', expectedVenueId:'50871', verifiedVenueId:'50871',
    expectedIdentifierSha256:lookup.hashString('anders-booking'), expectedBookingCustomerIdSha256:lookup.hashString('owner')};
  assert.equal(Object.values(lookup.evaluateT0201ControlledT30RollerBooking(booking, expected)).every(Boolean), true);
  for (const customerId of ['someone-else', null, '']) {
    assert.equal(lookup.evaluateT0201ControlledT30RollerBooking({...booking, customerId}, expected).bookingContactMatches, false);
  }
  assert.equal(lookup.evaluateT0201ControlledT30RollerBooking(booking, {...expected, expectedBookingCustomerIdSha256:'invalid'}).bookingContactMatches, false);
  const historical = {...expected}; delete historical.expectedBookingCustomerIdSha256;
  assert.equal('bookingContactMatches' in lookup.evaluateT0201ControlledT30RollerBooking(booking, historical), false);
});

test('Changed recipient, provider ambiguity and a last-moment stop cannot cause automatic duplicate delivery', async () => {
  const start = new Date(Date.now() + 60 * 60_000);
  const candidate = row({ booking_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm'}).format(start),
    start_time:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(start), booking_start_at:start.toISOString() });
  for (const scenario of ['changed-contact', 'provider-ambiguous', 'stopped']) {
    const hooks = { scenario, candidate, context:context(candidate), providerCalls:0, reserved:false, records:[] };
    const s = loadSession(`
      isPrearrivalEmailRolloutAuthorized = () => true;
      isPrearrivalRolloutVisitDate = () => true;
      verifyT0201BookingWithRoller = async () => ({ok:true});
      getBookingContext = async () => testHooks.context;
      evaluateStartContext = () => ({canStart:true});
      findPrearrivalBookingContact = async () => buildEmailDestination(testHooks.scenario === 'changed-contact' ? 'changed@example.com' : testHooks.candidate.email, 'booking_contact');
      reservePrearrivalEmail = async () => { const replayed=testHooks.reserved; testHooks.reserved=true; return {ok:true,replayed}; };
      createSessionLinkToken = async () => {
        if(testHooks.scenario === 'stopped') process.env.JUMPYARD_EMERGENCY_STOP='true';
        return {token:'synthetic-only',tokenHash:'safe-hash'};
      };
      sendEmailWithSes = async () => { testHooks.providerCalls++; throw Error('Ambiguous provider response'); };
      recordEmailDelivery = async input => { testHooks.records.push(input.status); };
      completeIdempotencyKey = writeEventLog = async () => {};
    `, hooks);
    const first = await s.deliverPrearrivalEmail({}, candidate, 'test');
    if (scenario === 'changed-contact') {
      assert.equal(first, 'booking_changed'); assert.equal(hooks.reserved, false);
    } else {
      assert.equal(first, 'delivery_requires_review'); assert.equal(hooks.reserved, true);
      assert.deepEqual(hooks.records, ['failed']);
    }
    const retry = await s.deliverPrearrivalEmail({}, candidate, 'test');
    assert.equal(retry, scenario === 'stopped' ? 'rollout_stopped' : scenario === 'changed-contact' ? 'booking_changed' : 'already_attempted');
    assert.equal(hooks.providerCalls, scenario === 'provider-ambiguous' ? 1 : 0);
  }
});

test('Delivery is locked to the Stockholm day 2026-09-28 and to visits on that day', async () => {
  assert.equal(ROLLOUT.visitDate, '2026-09-28');
  for (const [instant, expected] of [['2026-09-27T21:59:59.999Z', false], ['2026-09-27T22:00:00.000Z', true],
    ['2026-09-28T21:59:59.999Z', true], ['2026-09-28T22:00:00.000Z', false], ['2026-09-29T10:00:00.000Z', false], ['invalid', false]]) {
    assert.equal(isRolloutDay(instant), expected, instant);
  }
  let delivered = 0;
  const other = await preparePrearrivalEmailPage({ confirmSend: true }, deps([row()], {
    clock: () => new Date('2026-09-27T12:00:00Z'), authorizeRollout: () => true,
    executeStatement: () => assert.fail('No DB call outside the rollout day'), deliver: async () => { delivered++; return 'sent'; },
  }));
  assert.equal(other.body.error.code, 'prearrival_outside_rollout_date');
  // 23:30 on 28/9 sees a 00:30 visit on 29/9 inside two hours; it must not send.
  const late = row({ booking_date: '2026-09-29', start_time: '00:30:00', booking_start_at: '2026-09-28T22:30:00.000Z' });
  const result = await preparePrearrivalEmailPage({ confirmSend: true }, deps([late], {
    clock: () => new Date('2026-09-28T21:30:00Z'), authorizeRollout: () => true, deliver: async () => { delivered++; return 'sent'; },
  }));
  assert.deepEqual(result.body.summary.counts, { outside_rollout_date: 1 });
  assert.equal(delivered, 0);
});

test('Only the flag, park-test, a released stop and the rollout day authorize delivery', () => {
  const load = (env) => loadLambda('session', 'isPrearrivalEmailRolloutAuthorized, isPrearrivalRolloutVisitDate',
    'Object.assign(process.env, ' + JSON.stringify(env) + ');');
  const day = Date.parse('2026-09-28T08:00:00Z');
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'true' }).isPrearrivalEmailRolloutAuthorized(day), true);
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'true' }).isPrearrivalEmailRolloutAuthorized(Date.parse('2026-09-29T08:00:00Z')), false);
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'true' }).isPrearrivalEmailRolloutAuthorized(Date.parse('2026-09-27T08:00:00Z')), false);
  assert.equal(load({}).isPrearrivalEmailRolloutAuthorized(day), false);
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'TRUE' }).isPrearrivalEmailRolloutAuthorized(day), false);
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'true', JUMPYARD_EMERGENCY_STOP: 'true' }).isPrearrivalEmailRolloutAuthorized(day), false);
  assert.equal(load({ ENABLE_GH392_PREARRIVAL_EMAIL: 'true', JUMPYARD_ENVIRONMENT: 'dev' }).isPrearrivalEmailRolloutAuthorized(day), false);
  const visit = load({}).isPrearrivalRolloutVisitDate;
  assert.equal(visit('2026-09-28'), true);
  for (const date of ['2026-09-27', '2026-09-29', '', null, undefined]) assert.equal(visit(date), false);
});

test('A candidate for another visit date stops before any Roller, reservation or provider call', async () => {
  const start = new Date(Date.now() + 60 * 60_000);
  const candidate = row({ booking_date: '2026-09-27', booking_start_at: start.toISOString() });
  const s = loadSession(`
    isPrearrivalEmailRolloutAuthorized = () => true;
    verifyT0201BookingWithRoller = reservePrearrivalEmail = sendEmailWithSes = async () => { throw Error('No side effect allowed'); };
  `);
  assert.equal(await s.deliverPrearrivalEmail({}, candidate, 'test'), 'outside_due_window');
});

test('Only bookings with admission and phone/cafe products are eligible (Love, 2026-09-25)', () => {
  for (const support of ['unsupported', 'no_items', undefined, null, 'SUPPORTED']) {
    const r = row({ product_support: support });
    assert.equal(classifyCandidate(r, context(r), eligible, asOf), 'unsupported_products', String(support));
  }
  const allowed = new Set([...SUPPORTED_PRODUCTS.admission, ...SUPPORTED_PRODUCTS.addOns, ...SUPPORTED_PRODUCTS.cafe]);
  // Parties, party food/extras, punch cards, gift cards, memberships, PT, groups, JumpSchool, merchandise, extensions.
  for (const excluded of ['970637', '970635', '1012434', '970645', '970643', '1012437', '970358', '971802', '983215', '983238',
    '983219', '1034073', '983217', '983225', '1216983', '1216987', '970629', '970631', '1398361', '1398363', '1398365', '1041162',
    '970612', '970605', '1113233', '1374615', '970508', '1075910', '997876', '1075913', '1191605']) {
    assert.equal(allowed.has(excluded), false, excluded);
  }
  for (const entry of ['1189805', '1189823', '1189771', '1189814', '1189832', '1189794', '1242135']) assert.ok(SUPPORTED_PRODUCTS.admission.includes(entry));
  assert.match(PAGE_QUERY, /AS product_support/);
  assert.match(PAGE_QUERY, /bool_and\(/);
  assert.match(PAGE_QUERY, /bool_or\(/);
  assert.match(PAGE_QUERY, /COALESCE\(line\.parent_product_id IN/);
});

test('A scheduled run walks every page with one clock and defers unsent rows when time runs out', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => row({ roller_unique_id: `booking-${String(i).padStart(4, '0')}` }));
  const pageDeps = (overrides) => deps(rows, {
    clock: () => new Date(asOf), authorizeRollout: () => true,
    executeStatement: async (sql, parameters) => {
      const after = parameters.find(p => p.name === 'afterId').value.stringValue;
      assert.equal(parameters.find(p => p.name === 'asOf').value.stringValue, asOf);
      const start = after ? rows.findIndex(r => r.roller_unique_id === after) + 1 : 0;
      return rows.slice(start, start + PAGE_SIZE + 1);
    }, ...overrides,
  });
  const sent = [];
  const full = await processPrearrivalEmailRun({ confirmSend: true, messagePolicy: POLICY.name }, pageDeps({ deliver: async r => { sent.push(r.roller_unique_id); return 'sent'; } }));
  assert.equal(full.statusCode, 200);
  assert.equal(full.body.pages, 3);
  assert.equal(full.body.complete, true);
  assert.deepEqual(full.body.summary.counts, { sent: 60 });
  assert.equal(new Set(sent).size, 60);
  assert.equal('nextCursor' in full.body, false);
  let deliveries = 0;
  const partial = await processPrearrivalEmailRun({ confirmSend: true }, pageDeps({
    deliver: async () => { deliveries++; return 'sent'; }, hasTimeLeft: () => deliveries < 10,
  }));
  assert.equal(deliveries, 10);
  assert.equal(partial.body.complete, false);
  assert.deepEqual(partial.body.summary.counts, { sent: 10, deferred_to_next_run: 15 });
  const blocked = await processPrearrivalEmailRun({ confirmSend: true }, pageDeps({ authorizeRollout: () => false }));
  assert.equal(blocked.body.error.code, 'prearrival_rollout_not_approved');
});

test('A recorded send or attempt is counted without reading the booking again', async () => {
  const rows = [row({ roller_unique_id: 'sent', email_attempt_exists: true, email_already_sent: true }),
    row({ roller_unique_id: 'failed', email_attempt_exists: true })];
  const result = await preparePrearrivalEmailPage({ confirmSend: true }, deps(rows, {
    clock: () => new Date(asOf), authorizeRollout: () => true,
    getBookingContext: () => assert.fail('No context read for a recorded attempt'), deliver: () => assert.fail('No second message'),
  }));
  assert.deepEqual(result.body.summary.counts, { already_sent: 1, previous_attempt_requires_review: 1 });
});

test('The authenticated operator route stays read-only even on the rollout day', async () => {
  const s = loadSession(`
    verifyCheckinLinkDevToken = async () => ({ ok: true });
    isPrearrivalEmailRolloutAuthorized = () => true;
    executeStatement = async () => { throw Error('No DB call for a refused send'); };
  `);
  for (const confirmSend of [true, 'true', 1]) {
    const response = await s.handleSendDueSessionLinkMessages({ headers: {} }, { messagePolicy: POLICY.name, confirmSend }, 'test');
    assert.equal(response.statusCode, 409);
    assert.equal(JSON.parse(response.body).error.code, 'prearrival_rollout_not_approved');
  }
});

test('The check-in email says wristbands and purchases are collected at the entrance', () => {
  const { buildCheckinEmailMessage } = require('../infra/lambda/session/email-template');
  const message = buildCheckinEmailMessage({ booking: { bookingDate: '2026-09-28', startTime: '14:00:00' }, checkinUrl: 'https://checkin.jumpyard.se/?jy_token=synthetic' });
  const line = 'När du kommer fram visar du din QR-kod i entrén så får du armband och det du har köpt.';
  assert.ok(message.text.includes(line));
  assert.ok(message.html.includes(line));
});

function localSql(query) {
  return execFileSync(process.env.GH392_PSQL, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '55492', '-U', 'gh392_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8', windowsHide: true });
}
function bindSql(query, parameters) {
  const values = Object.fromEntries(parameters.map(p => [p.name, p.value.stringValue ?? p.value.longValue ?? null]));
  return query.replace(/(?<!:):([a-zA-Z]\w*)/g, (_, name) => values[name] == null ? 'NULL' : `'${String(values[name]).replaceAll("'", "''")}'`);
}

test('PostgreSQL: a send reservation survives expiry, request changes and retries without being recycled', {skip:!process.env.GH392_PSQL}, async () => {
  const queries = [];
  const hooks = {executeStatement:async (sql, parameters) => { queries.push(bindSql(sql, parameters)); return {}; }};
  const s = loadSession('executeStatement = testHooks.executeStatement;', hooks);
  const booking = {rollerUniqueId:'anders',bookingDate:'2026-09-28'};
  await s.reservePrearrivalEmail(booking, s.prearrivalEmailIdempotencyKey(booking), 'initial-hash');
  await s.reservePrearrivalEmail(booking, s.prearrivalEmailIdempotencyKey(booking), 'changed-hash');
  const result = localSql(`BEGIN; CREATE SCHEMA jumpyard;
    CREATE TABLE jumpyard.idempotency_records (idempotency_key text PRIMARY KEY, operation text, request_hash text, status text, expires_at timestamptz);
    ${queries[0]};
    UPDATE jumpyard.idempotency_records SET expires_at='2000-01-01T00:00:00Z';
    ${queries[1]};
    SELECT json_build_object('count',count(*),'hash',min(request_hash)) FROM jumpyard.idempotency_records;
    ROLLBACK;`);
  const final = JSON.parse(result.trim().split(/\r?\n/).at(-1));
  assert.equal(final.count, 1); assert.equal(final.hash, 'initial-hash');
});

test('PostgreSQL: provisional sessions last four hours and a later payment retry preserves their original expiry', {skip:!process.env.GH392_PSQL}, async () => {
  const statements = [];
  const hooks = {executeStatement:async (sql, parameters) => { statements.push({sql,parameters}); return {}; }};
  const booking = loadLambda('booking', 'ensureProvisionalKioskHandoff', `
    findKioskPrepaymentAttempt = async () => ({payment_attempt_status:'approved',roller_draft_unique_id:'synthetic',roller_env:'live',booking_date:'2026-09-28',start_time:'14:00'});
    executeStatement = testHooks.executeStatement;
  `, hooks);
  const before = Date.now();
  await booking.ensureProvisionalKioskHandoff({paymentAttemptId:'jytp_synthetic',prepaymentDraftId:'synthetic'});
  const token = statements.find(s => s.sql.includes('INSERT INTO jumpyard.checkin_tokens'));
  const session = statements.find(s => s.sql.includes('INSERT INTO jumpyard.checkin_sessions'));
  const expiry = s => Date.parse(s.parameters.find(p => p.name === 'expiresAt').value.stringValue);
  assert.ok(expiry(session)-before >= 4*3600_000 && expiry(session)-Date.now() <= 4*3600_000);
  assert.ok(expiry(token)-before >= 2*3600_000 && expiry(token)-Date.now() <= 2*3600_000);
  const retry = session.parameters.map(p => p.name === 'expiresAt' ? {...p,value:{stringValue:new Date(expiry(session)+3600_000).toISOString()}} : p);
  const result = localSql(`BEGIN; CREATE SCHEMA jumpyard;
    CREATE TABLE jumpyard.checkin_sessions(checkin_session_id text PRIMARY KEY, roller_unique_id text,booking_reference text,visit_date date,status text,safety_status text,handoff_status text,selected_ticket_ids jsonb,source_lookup_ref text,idempotency_key text,expires_at timestamptz,session_summary jsonb,updated_at timestamptz);
    ${bindSql(session.sql,session.parameters)};
    ${bindSql(session.sql,retry)};
    SELECT extract(epoch FROM expires_at)*1000 FROM jumpyard.checkin_sessions; ROLLBACK;`);
  assert.equal(Number(result.trim().split(/\r?\n/).at(-1)), expiry(session));
});

// The opt-in database test uses only an independently initialized, disposable local cluster.
test('PostgreSQL: real keyset SQL, booking-owner contact, delivery status and Stockholm boundaries', { skip: !process.env.GH392_PSQL }, () => {
  const sql = query => execFileSync(process.env.GH392_PSQL, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '55492', '-U', 'gh392_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8', windowsHide: true });
  const literal = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const params = { venueId:'50871', asOf, endAt:'2026-09-28T12:00:00Z', afterStartAt:null, afterId:null, messageTemplate:'checkin_email_v1' };
  const query = p => PAGE_QUERY.replace(/(?<!:):([a-zA-Z]\w*)/g, (_, name) => literal(p[name]));
  const fixture = `CREATE SCHEMA jumpyard;
    CREATE TABLE jumpyard.roller_bookings (roller_unique_id text PRIMARY KEY, venue_id text, roller_env text, booking_date date, start_time time, normalized_summary jsonb);
    CREATE TABLE jumpyard.guest_profiles (roller_customer_id text PRIMARY KEY, email text);
    CREATE TABLE jumpyard.email_deliveries (roller_unique_id text, message_template text, dry_run boolean, status text, created_at timestamptz);
    INSERT INTO jumpyard.guest_profiles VALUES ('owner','anders@example.com'),('participant','child@example.com');
    INSERT INTO jumpyard.roller_bookings SELECT 'booking-'||lpad(i::text,4,'0'), '50871','live','2026-09-28','14:00', '{"bookingCustomerId":"owner"}' FROM generate_series(1,61) i;
    INSERT INTO jumpyard.roller_bookings VALUES ('too-early','50871','live','2026-09-28','14:01','{}'), ('started','50871','live','2026-09-28','12:00','{}'), ('wrong-park','1','live','2026-09-28','14:00','{}');
    INSERT INTO jumpyard.email_deliveries VALUES ('booking-0001','checkin_email_v1',false,'sent','2026-09-28T09:59:00Z'),('booking-0002','checkin_email_v1',false,'failed','2026-09-28T09:59:00Z');`;
  const first = JSON.parse(sql(`BEGIN; ${fixture} SELECT json_agg(x) FROM (${query(params)}) x; ROLLBACK;`).trim());
  assert.equal(first.length, PAGE_SIZE + 1);
  assert.equal(first[0].email, 'anders@example.com');
  assert.equal(first[0].email_already_sent, true);
  assert.equal(first[1].email_attempt_exists, true);
  const secondParams = {...params, afterStartAt:first[PAGE_SIZE-1].booking_start_at, afterId:first[PAGE_SIZE-1].roller_unique_id};
  const second = JSON.parse(sql(`BEGIN; ${fixture} SELECT json_agg(x) FROM (${query(secondParams)}) x; ROLLBACK;`).trim());
  assert.equal(second[0].roller_unique_id, 'booking-0026');
});
