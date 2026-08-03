#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const APPROVAL = 'T0201_SINGLE_BOOKING_T30_EMAIL_APPROVED';

function fakeAwsModule() {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return class FakeAwsClientOrCommand {
          constructor(input) {
            this.input = input;
            this.name = String(property);
          }

          async send() {
            throw new Error(`Unexpected AWS call through ${String(property)} during T0201 validation.`);
          }
        };
      },
    },
  );
}

function loadSessionInternals() {
  const absolutePath = path.join(ROOT, 'infra', 'lambda', 'session', 'index.js');
  const source = fs.readFileSync(absolutePath, 'utf8');
  const module = { exports: {} };
  const environment = {
    ENABLE_GUEST_MESSAGE_SENDS: 'false',
    ENABLE_T0201_CONTROLLED_T30_EMAIL: 'true',
    JUMPYARD_EMERGENCY_STOP: 'false',
    JUMPYARD_ENVIRONMENT: 'park-test',
    T0201_CONTROLLED_T30_EMAIL_APPROVAL: APPROVAL,
  };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error('Unexpected network call during T0201 validation.');
    },
    module,
    exports: module.exports,
    process: { env: environment },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      if (moduleId === './email-template') {
        return require(path.join(path.dirname(absolutePath), 'email-template.js'));
      }
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during T0201 validation.`);
    },
    setTimeout,
  };

  const internalNames = [
    'buildDueSmsWindow',
    'createDueMessageIdempotencyKey',
    'createT0201ControlledEmailIdempotencyKey',
    'doesT0201FinalDeliveryTupleMatch',
    'hashString',
    'isT0201ControlledT30EmailDeliveryAuthorized',
    'sanitizeT0201DueMessageItem',
    'selectT0201ControlledT30EmailCandidate',
  ];
  vm.runInNewContext(
    `${source}\nmodule.exports.__t0201 = { ${internalNames.join(', ')} };`,
    sandbox,
    { filename: absolutePath },
  );
  return module.exports.__t0201;
}

function loadLookupInternals() {
  const absolutePath = path.join(ROOT, 'infra', 'lambda', 'lookup', 'index.js');
  const source = fs.readFileSync(absolutePath, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: async () => {
      throw new Error('Unexpected network call during T0201 lookup validation.');
    },
    module,
    exports: module.exports,
    process: { env: {} },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule();
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during T0201 lookup validation.`);
    },
    setTimeout,
  };
  vm.runInNewContext(
    `${source}\nmodule.exports.__t0201 = { evaluateT0201ControlledT30RollerBooking, extractT0201RollerVenueIdentity, hashString };`,
    sandbox,
    { filename: absolutePath },
  );
  return module.exports.__t0201;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function validateBoundedWindow(gates) {
  const request = {
    leadMinutes: 30,
    now: '2026-08-04T09:30:00.000Z',
    windowEndAt: null,
    windowEndsAtLead: true,
    windowMinutes: 5,
    windowStartAt: null,
  };
  const bounded = gates.buildDueSmsWindow(request);
  assert.equal(bounded.start.toISOString(), '2026-08-04T09:55:00.000Z');
  assert.equal(bounded.end.toISOString(), '2026-08-04T10:00:00.000Z');

  const legacy = gates.buildDueSmsWindow({ ...request, windowEndsAtLead: false });
  assert.equal(legacy.start.toISOString(), '2026-08-04T10:00:00.000Z');
  assert.equal(legacy.end.toISOString(), '2026-08-04T10:05:00.000Z');
}

function buildFixture(gates) {
  const bookingReference = 'test-booking-reference';
  const rollerUniqueId = 'test-roller-unique-id';
  const email = 'approved.recipient@example.com';
  const control = {
    bookingIdentifierSha256: gates.hashString(bookingReference),
    bookingStartAt: '2026-08-04T10:00:00.000Z',
    recipientEmailSha256: gates.hashString(email),
    venueId: '50871',
  };
  const candidate = {
    bookingDate: '2026-08-04',
    bookingReference,
    bookingStartAt: control.bookingStartAt,
    destinations: {
      email: { email, hash: control.recipientEmailSha256, masked: 'a***@example.com' },
    },
    rollerUniqueId,
    startTime: '12:00:00',
    venueId: '50871',
  };
  return { bookingReference, candidate, control, email, rollerUniqueId };
}

function validateExactTuple(gates) {
  const fixture = buildFixture(gates);
  const selected = gates.selectT0201ControlledT30EmailCandidate([fixture.candidate], fixture.control);
  assert.equal(selected.ok, true, 'The exact booking/time/venue/email tuple must match once.');

  const mismatches = [
    { ...fixture.candidate, venueId: '99999' },
    { ...fixture.candidate, bookingStartAt: '2026-08-04T10:01:00.000Z' },
    {
      ...fixture.candidate,
      destinations: { email: { ...fixture.candidate.destinations.email, hash: gates.hashString('wrong@example.com') } },
    },
    {
      ...fixture.candidate,
      destinations: { email: { ...fixture.candidate.destinations.email, email: 'wrong@example.com' } },
    },
    { ...fixture.candidate, bookingReference: 'wrong', rollerUniqueId: 'also-wrong' },
  ];
  for (const mismatch of mismatches) {
    assert.equal(
      gates.selectT0201ControlledT30EmailCandidate([mismatch], fixture.control).ok,
      false,
      'Every mismatch must fail closed.',
    );
  }
  assert.equal(
    gates.selectT0201ControlledT30EmailCandidate([fixture.candidate, fixture.candidate], fixture.control).reason,
    'approved_tuple_ambiguous',
    'Multiple matches must fail closed.',
  );

  const options = {
    controlledCandidate: fixture.candidate,
    controlledT30Email: true,
    controlledT30EmailControl: fixture.control,
    controlledT30EmailRollerVerified: true,
  };
  const context = {
    booking: {
      bookingDate: fixture.candidate.bookingDate,
      bookingReference: fixture.bookingReference,
      rollerUniqueId: fixture.rollerUniqueId,
      startTime: fixture.candidate.startTime,
      venueId: fixture.candidate.venueId,
    },
  };
  assert.equal(gates.isT0201ControlledT30EmailDeliveryAuthorized(options), true);
  assert.equal(
    gates.doesT0201FinalDeliveryTupleMatch({
      context,
      destination: fixture.candidate.destinations.email,
      options,
    }),
    true,
    'The final SES boundary must recheck the exact tuple.',
  );
  assert.equal(
    gates.doesT0201FinalDeliveryTupleMatch({
      context,
      destination: { ...fixture.candidate.destinations.email, hash: gates.hashString('changed@example.com') },
      options,
    }),
    false,
    'A recipient change immediately before SES must block delivery.',
  );
  assert.equal(
    gates.doesT0201FinalDeliveryTupleMatch({
      context,
      destination: { ...fixture.candidate.destinations.email, email: 'changed@example.com' },
      options,
    }),
    false,
    'A stale stored hash must not authorize a different raw recipient at the SES boundary.',
  );
}

function validateStableIdempotency(gates) {
  const { candidate, control } = buildFixture(gates);
  const firstWindow = {
    start: new Date('2026-08-04T09:55:00.000Z'),
    end: new Date('2026-08-04T10:00:00.000Z'),
  };
  const retryWindow = {
    start: new Date('2026-08-04T09:56:00.000Z'),
    end: new Date('2026-08-04T10:01:00.000Z'),
  };
  assert.equal(
    gates.createDueMessageIdempotencyKey(firstWindow, candidate, 'email'),
    gates.createDueMessageIdempotencyKey(retryWindow, candidate, 'email'),
    'Scheduler retries and overlapping windows must reserve the same email idempotency key.',
  );
  assert.notEqual(
    gates.createDueMessageIdempotencyKey(firstWindow, candidate, 'email'),
    gates.createDueMessageIdempotencyKey(firstWindow, { ...candidate, bookingStartAt: '2026-08-04T11:00:00.000Z' }, 'email'),
    'A distinct booking start must use a distinct idempotency key.',
  );
  assert.equal(
    gates.createT0201ControlledEmailIdempotencyKey(control),
    gates.createT0201ControlledEmailIdempotencyKey({ ...control }),
    'The exact control tuple must always produce one stable delivery key.',
  );
  assert.notEqual(
    gates.createT0201ControlledEmailIdempotencyKey(control),
    gates.createT0201ControlledEmailIdempotencyKey({ ...control, recipientEmailSha256: gates.hashString('other@example.com') }),
    'A different approved tuple must not share the delivery key.',
  );
}

function validateRedactedResult(gates) {
  const sanitized = gates.sanitizeT0201DueMessageItem({
    action: 'sent',
    bookingReference: 'must-not-leak',
    channel: 'email',
    destinationMasked: 'a***@example.com',
    provider: 'aws_ses',
    rollerUniqueId: 'must-not-leak-either',
  });
  assert.equal(sanitized.bookingReference, undefined);
  assert.equal(sanitized.rollerUniqueId, undefined);
  assert.equal(sanitized.action, 'sent');
}

function validateAuthoritativeRollerChecks(lookup) {
  const rollerBooking = {
    amountOwing: 0,
    bookingReference: 'test-booking-reference',
    items: [{ bookingDate: '2026-08-04', startTime: '12:00:00' }],
    paymentStatus: 'paid',
    status: 'confirmed',
    uniqueId: 'test-roller-unique-id',
  };
  const expected = {
    expectedBookingDate: '2026-08-04',
    expectedIdentifierSha256: lookup.hashString(rollerBooking.bookingReference),
    expectedStartTime: '12:00:00',
    expectedVenueId: '50871',
    verifiedVenueId: '50871',
  };
  assert.deepEqual(
    { ...lookup.evaluateT0201ControlledT30RollerBooking(rollerBooking, expected) },
    {
      bookingIsActive: true,
      identifierMatches: true,
      paymentIsSettled: true,
      scheduleMatches: true,
      venueMatches: true,
    },
    'Roller must confirm every send-critical field when booking detail omits venue fields.',
  );

  const failures = [
    [{ ...rollerBooking, venueId: '99999' }, 'venueMatches'],
    [{ ...rollerBooking, status: 'cancelled' }, 'bookingIsActive'],
    [{ ...rollerBooking, amountOwing: 1 }, 'paymentIsSettled'],
    [{ ...rollerBooking, items: [{ bookingDate: '2026-08-04', startTime: '12:01:00' }] }, 'scheduleMatches'],
    [{ ...rollerBooking, bookingReference: 'wrong', uniqueId: 'also-wrong' }, 'identifierMatches'],
  ];
  for (const [booking, failedCheck] of failures) {
    const checks = lookup.evaluateT0201ControlledT30RollerBooking(booking, expected);
    assert.equal(checks[failedCheck], false, `Roller ${failedCheck} mismatch must fail closed.`);
  }

  assert.equal(
    lookup.evaluateT0201ControlledT30RollerBooking(rollerBooking, { ...expected, verifiedVenueId: null }).venueMatches,
    false,
    'Missing Roller credential venue identity must fail closed.',
  );
  assert.equal(
    lookup.evaluateT0201ControlledT30RollerBooking(rollerBooking, { ...expected, verifiedVenueId: '99999' }).venueMatches,
    false,
    'A Roller credential bound to another venue must fail closed.',
  );
  assert.equal(lookup.extractT0201RollerVenueIdentity({ id: '50871' }), '50871');
  assert.equal(lookup.extractT0201RollerVenueIdentity({ venue: { venueId: '50871' } }), '50871');
  assert.equal(lookup.extractT0201RollerVenueIdentity({ data: { venueID: '50871' } }), '50871');
  assert.equal(lookup.extractT0201RollerVenueIdentity({ name: 'No identifier' }), null);
}

function validateStaticContracts() {
  const fullFlow = readJson('infra/config/park-test-full-flow-rehearsal.json');
  const normal = readJson('infra/config/park-test.json');
  assert.deepEqual(fullFlow.bookingTimeSms.channels, ['email']);
  assert.equal(fullFlow.bookingTimeSms.scheduleEnabled, true);
  assert.equal(fullFlow.bookingTimeSms.confirmSend, true);
  assert.equal(fullFlow.bookingTimeSms.windowEndsAtLead, true);
  assert.equal(fullFlow.safetyGates.controlledT30EmailApproval, APPROVAL);
  assert.equal(fullFlow.safetyGates.guestMessagingSendsEnabled, false);
  assert.equal(normal.bookingTimeSms.scheduleEnabled, false);
  assert.equal(normal.bookingTimeSms.confirmSend, false);
  assert.equal(normal.safetyGates.controlledT30EmailApproval, undefined);

  const stack = read('infra/lib/jumpyard-cloud-stack.ts');
  const session = read('infra/lambda/session/index.js');
  const lookup = read('infra/lambda/lookup/index.js');
  for (const expected of [
    'resources.checkinLinkDevTokenSecret.secretArn',
    'lookupHandler.grantInvoke(sessionHandler)',
    "actions: ['ses:SendEmail']",
    "resource: 'configuration-set'",
    'resourceName: resources.checkinEmailConfigurationSetName',
    'channels: config.bookingTimeSms.channels',
    'windowEndsAtLead: config.bookingTimeSms.windowEndsAtLead',
  ]) {
    assert.ok(stack.includes(expected), `Infrastructure must include ${expected}.`);
  }
  assert.ok(!stack.includes("new secretsmanager.Secret(this, 'ControlledT30EmailSecret'"), 'T0201 must reuse the retained check-in-link secret so immutable rollback/re-promotion stays safe.');
  assert.ok(!stack.includes("'ses:ConfigurationSet'"), 'SES configuration set must be an IAM resource, not an unsupported condition key.');
  for (const expected of [
    'selectT0201ControlledT30EmailCandidate',
    'verifyT0201BookingWithRoller',
    'doesT0201FinalDeliveryTupleMatch',
    "origin !== 'https://jumpyard-check-in-park-test.pages.dev'",
    "request.channels[0] !== 'email'",
  ]) {
    assert.ok(session.includes(expected), `Session runtime must include ${expected}.`);
  }
  assert.ok(lookup.includes('handleT0201ControlledT30EmailRefresh'));
  assert.ok(lookup.includes("buildRollerUrl(config.baseUrl, '/venues/me')"));
  assert.ok(lookup.includes('getVerifiedT0201RollerVenueId'));
  assert.ok(lookup.includes('t0201_authoritative_booking_refresh_blocked'));
  assert.ok(lookup.includes("trigger) === 'authoritative_booking_refresh'"));
  assert.ok(session.includes(".t0201Control ?? {}"), 'Session runtime must read only the nested T0201 control object.');
}

const gates = loadSessionInternals();
const lookup = loadLookupInternals();
validateBoundedWindow(gates);
validateExactTuple(gates);
validateStableIdempotency(gates);
validateRedactedResult(gates);
validateAuthoritativeRollerChecks(lookup);
validateStaticContracts();
console.log('[pass] T0201 exact single-booking T-30 email gate, Roller refresh, and stable idempotency');
