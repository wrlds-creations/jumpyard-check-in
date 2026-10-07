// GH-488 (D0243): a kiosk installation claims a server-owned kiosk name (Nacka K1–K5, Test K1)
// after an allowlisted staff PIN proof, and the name binds its payment terminal. The Session
// Lambda proves the person (no session, shared limiter); the Booking Lambda owns every write.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const contract = require('../infra/lambda/booking/kiosk-terminal-contract');
const bookingSource = fs.readFileSync(path.join(root, 'infra/lambda/booking/index.js'), 'utf8');
const sessionSource = fs.readFileSync(path.join(root, 'infra/lambda/session/index.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'infra/migrations/0025_kiosk_installation_pairing.sql'), 'utf8');

// Synthetic fixtures, never provisioned credentials or real terminal identifiers.
const proof = (seed) => {
  const capability = seed.repeat(43);
  return { capability, installationId: `ki_${crypto.createHash('sha256').update(capability).digest('hex').slice(0, 24)}` };
};
const kioskA = proof('A');
const kioskB = proof('B');
const kioskC = proof('C');
const staffAllowed = 'jystaff_allowed';
const staffOther = 'jystaff_other';
const staffPin = '582914';
const pepper = 'gh488-independent-pin-pepper-0123456789abcdef';
const lock = (digit) => `kt_${String(digit).repeat(32)}`;

function terminalsFixture() {
  const terminals = {
    primary: { terminalId: 'synthetic-p400', deviceId: 'synthetic-device', lockId: lock(9), displayName: 'Test T1' },
  };
  for (const n of [1, 2, 3, 4, 5]) {
    terminals[`nacka-t${n}`] = { terminalId: `synthetic-p630-${n}`, lockId: lock(n), displayName: `Nacka T${n}` };
  }
  return terminals;
}

function namesFixture() {
  const names = {
    'test-k1': { active: true, displayName: 'Test K1', kind: 'test', paymentTerminalAlias: 'primary', venueId: '50871' },
  };
  for (const n of [5, 3, 1, 4, 2]) {
    names[`nacka-k${n}`] = {
      active: true, displayName: `Nacka K${n}`, kind: 'operational', paymentTerminalAlias: `nacka-t${n}`, venueId: '50871',
    };
  }
  return names;
}

function configuration({ names = namesFixture(), terminals = terminalsFixture(), allow = [staffAllowed] } = {}) {
  return {
    env: 'playground', kioskVenueId: '50871', allowLegacyKioskTerminalAlias: false,
    kioskInstallations: contract.normalizeKioskInstallationMap({
      [kioskB.installationId]: { active: true, allowedProfileIds: ['nacka-forum-kiosk-2'], venueId: '50871' },
    }),
    kioskProfiles: contract.normalizeKioskProfileMap({
      'nacka-forum-kiosk-2': { active: true, paymentTerminalAlias: 'primary', venueId: '50871' },
    }),
    kioskNames: contract.normalizeKioskNameMap(names),
    kioskPairingStaffIdentityIds: contract.normalizeKioskPairingStaffIdentityIds(allow),
    paymentTerminalNames: contract.normalizePaymentTerminalNameMap(terminals),
    paymentTerminals: contract.normalizePaymentTerminalMap(terminals),
  };
}

const pairing = (who, kioskNameId, extra = {}) => ({
  installationId: who.installationId, kioskNameId, status: 'active', venueId: '50871', ...extra,
});
const kioskRequest = (who, extra = {}) => ({
  channel: 'kiosk', kioskInstallationId: who.installationId, kioskCapability: who.capability, ...extra,
});

test('Names are offered in label order with their terminal labels, only while the terminal can pay', () => {
  const directory = contract.kioskNameDirectory(configuration());
  assert.deepEqual(directory.map((entry) => entry.name), ['Nacka K1', 'Nacka K2', 'Nacka K3', 'Nacka K4', 'Nacka K5', 'Test K1']);
  assert.deepEqual(directory[2], { id: 'nacka-k3', kind: 'operational', name: 'Nacka K3', terminalName: 'Nacka T3' });
  assert.equal(directory[5].kind, 'test');

  const names = namesFixture();
  names['nacka-k2'].active = false;
  names['Nacka K6'] = { ...names['nacka-k1'], displayName: 'Nacka K6' };
  names['nacka-k7'] = { ...names['nacka-k1'], kind: 'pilot' };
  names['nacka-k8'] = { ...names['nacka-k1'], displayName: '<b>K8</b>' };
  names['nacka-k9'] = { ...names['nacka-k1'], venueId: 'elsewhere' };
  const terminals = terminalsFixture();
  delete terminals['nacka-t3'];
  terminals.duplicate = { ...terminals['nacka-t4'], lockId: lock(7) };
  const filtered = contract.kioskNameDirectory(configuration({ names, terminals }));
  assert.deepEqual(filtered.map((entry) => entry.id), ['nacka-k1', 'nacka-k5', 'test-k1']);
  assert.deepEqual(contract.kioskNameDirectory({ ...configuration(), kioskVenueId: 'elsewhere' }), []);
});

test('A paired installation pays only on its name\'s terminal; labels never reach ROLLER', () => {
  const config = configuration();
  const result = contract.resolveKioskPaymentTerminal(config, kioskRequest(kioskA), pairing(kioskA, 'nacka-k3'));
  assert.deepEqual(result.paymentTerminal, { deviceId: kioskA.installationId, promptForTip: false, terminalId: 'synthetic-p630-3' });
  assert.deepEqual(result.reservationKeys, [`jykb_install_${kioskA.installationId}`, `jykb_terminal_${lock(3)}`].sort());
  assert.equal(result.kioskNameId, 'nacka-k3');
  assert.equal(result.installationId, kioskA.installationId);
  for (const mapping of Object.values(config.paymentTerminals)) assert.equal(Object.hasOwn(mapping, 'displayName'), false);

  const withStaleProfile = contract.resolveKioskPaymentTerminal(
    config, kioskRequest(kioskA, { kioskProfileId: 'nacka-forum-kiosk-1' }), pairing(kioskA, 'nacka-k3'),
  );
  assert.equal(withStaleProfile.paymentTerminal.terminalId, 'synthetic-p630-3', 'a stale native profile is ignored');
});

test('Paired resolution fails closed on tampering, revocation, venue mismatch and alias mixing', () => {
  const cases = [
    [kioskRequest(kioskA, { kioskCapability: kioskB.capability }), pairing(kioskA, 'nacka-k1')],
    [kioskRequest(kioskA), pairing(kioskB, 'nacka-k1')],
    [kioskRequest(kioskA), pairing(kioskA, 'nacka-k1', { status: 'revoked' })],
    [kioskRequest(kioskA), pairing(kioskA, 'nacka-k1', { venueId: 'elsewhere' })],
    [kioskRequest(kioskA, { venueId: 'elsewhere' }), pairing(kioskA, 'nacka-k1')],
    [kioskRequest(kioskA, { paymentTerminalAlias: 'primary' }), pairing(kioskA, 'nacka-k1')],
    [kioskRequest(kioskA), pairing(kioskA, 'nacka-k6')],
  ];
  for (const [request, row] of cases) {
    assert.equal(contract.resolveKioskPaymentTerminal(configuration(), request, row).error?.code, 'kiosk_installation_not_authorized');
  }
  const names = namesFixture();
  names['nacka-k1'].active = false;
  assert.ok(contract.resolveKioskPaymentTerminal(configuration({ names }), kioskRequest(kioskA), pairing(kioskA, 'nacka-k1')).error);
  const terminals = terminalsFixture();
  delete terminals['nacka-t1'];
  assert.equal(
    contract.resolveKioskPaymentTerminal(configuration({ terminals }), kioskRequest(kioskA), pairing(kioskA, 'nacka-k1')).error.code,
    'kiosk_payment_terminal_not_configured',
  );
});

test('An unpaired kiosk without a profile must pair; the office kiosk keeps its legacy profile', () => {
  const config = configuration();
  assert.equal(contract.resolveKioskPaymentTerminal(config, kioskRequest(kioskA), null).error.code, 'kiosk_installation_not_paired');
  const legacy = contract.resolveKioskPaymentTerminal(config, kioskRequest(kioskB, { kioskProfileId: 'nacka-forum-kiosk-2' }), null);
  assert.equal(legacy.paymentTerminal.terminalId, 'synthetic-p400');
  assert.deepEqual(contract.resolveKioskPaymentTerminal(config, { channel: 'phone' }, null), { enabled: false, paymentTerminal: null });
});

test('Status shows the own pairing, taken names and the legacy flag, never other ids or terminals', () => {
  const config = configuration();
  const rows = [
    { installationId: kioskA.installationId, kioskNameId: 'nacka-k1' },
    { installationId: kioskB.installationId, kioskNameId: 'nacka-k2' },
  ];
  const mine = contract.buildKioskStatus(config, kioskA.installationId, rows);
  assert.deepEqual(mine.kiosk, { id: 'nacka-k1', kind: 'operational', name: 'Nacka K1', paired: true, terminalName: 'Nacka T1' });
  assert.deepEqual(mine.names.find((entry) => entry.id === 'nacka-k1'), {
    id: 'nacka-k1', kind: 'operational', mine: true, name: 'Nacka K1', taken: false, terminalName: 'Nacka T1',
  });
  assert.equal(mine.names.find((entry) => entry.id === 'nacka-k2').taken, true);
  assert.deepEqual(contract.buildKioskStatus(config, kioskC.installationId, rows).kiosk, { legacy: false, paired: false });
  assert.deepEqual(contract.buildKioskStatus(config, kioskB.installationId, []).kiosk, { legacy: true, paired: false });
  const names = namesFixture();
  names['nacka-k1'].active = false;
  assert.equal(contract.buildKioskStatus(configuration({ names }), kioskA.installationId, rows).kiosk.paired, false);
  const text = JSON.stringify(mine);
  for (const secret of [kioskA.installationId, kioskB.installationId, 'synthetic-p630', lock(1), kioskA.capability]) {
    assert.ok(!text.includes(secret), `status must not expose ${secret.slice(0, 12)}`);
  }
});

test('Pairing details are validated and the allowlist is explicit', () => {
  const valid = { kioskInstallationId: kioskA.installationId, kioskCapability: kioskA.capability, kioskNameId: 'nacka-k3', staffIdentityId: staffAllowed };
  assert.deepEqual(contract.normalizeKioskPairingDetail({ ...valid, replace: true, wrapperVersion: '8', webVersion: '5717b34' }), {
    capability: kioskA.capability, installationId: kioskA.installationId, kioskNameId: 'nacka-k3', replace: true,
    staffIdentityId: staffAllowed, webVersion: '5717b34', wrapperVersion: '8',
  });
  assert.equal(contract.normalizeKioskPairingDetail({ ...valid, wrapperVersion: '8; DROP' }).wrapperVersion, null);
  for (const change of [
    { kioskCapability: kioskB.capability }, { kioskNameId: 'Nacka K3' }, { kioskNameId: '__proto__' },
    { staffIdentityId: '' }, { staffIdentityId: 'bad id' }, { replace: 'yes' },
  ]) {
    assert.equal(contract.normalizeKioskPairingDetail({ ...valid, ...change }), null, JSON.stringify(change));
  }
  assert.equal(contract.isKioskPairingStaffAllowed(configuration(), staffAllowed), true);
  assert.equal(contract.isKioskPairingStaffAllowed(configuration(), staffOther), false);
  assert.equal(contract.isKioskPairingStaffAllowed(configuration({ allow: [] }), staffAllowed), false);
  assert.deepEqual(contract.normalizeKioskPairingStaffIdentityIds('jystaff_allowed'), []);
});

test('The migration keeps one active holder per name, stores no secrets and grants only the Booking role', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS jumpyard\.kiosk_installations/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS kiosk_installations_one_active_name\s+ON jumpyard\.kiosk_installations \(venue_id, kiosk_name_id\)\s+WHERE status = 'active'/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON jumpyard\.kiosk_installations TO jumpyard_booking_runtime;/);
  assert.equal((migration.match(/^GRANT /gm) ?? []).length, 1, 'no other role gets access');
  assert.doesNotMatch(migration.replace(/--.*$/gm, ''), /capability|terminal_id|pin_|DELETE/i);
});

function rowsResult(rows) {
  if (rows.length === 0) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  const field = (value) => value === null ? { isNull: true } : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? { longValue: value } : { stringValue: String(value) };
  return { columnMetadata: columns.map((name) => ({ label: name, name })), records: rows.map((row) => columns.map((name) => field(row[name]))) };
}

function loadBooking(overrides = {}, env = {}) {
  const module = { exports: {} };
  const fakeAws = new Proxy({}, { get: () => class {
    constructor(input) { this.input = input; }
    async send() { throw new Error('No AWS calls allowed in GH488 tests'); }
  } });
  const sandbox = { Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, crypto, module, overrides,
    console: { error() {}, info() {}, log() {}, warn() {} }, exports: module.exports,
    process: { env: { JUMPYARD_EMERGENCY_STOP: 'false', ...env } }, setTimeout, clearTimeout,
    fetch: () => { throw new Error('No network allowed'); },
    require(name) {
      if (name.startsWith('@aws-sdk/')) return fakeAws;
      if (name === 'crypto') return crypto;
      if (name === './server-diagnostics') return require('../infra/lambda/lookup/server-diagnostics');
      if (name === './package-contents') return require('../infra/lambda/shared/package-contents');
      if (name.startsWith('./')) return require(path.join(root, 'infra/lambda/booking', name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(bookingSource + '\n' + Object.keys(overrides).map((name) => `${name} = overrides.${name};`).join('\n') +
    '\nmodule.exports.tests = { handleDraft, handleAddProductDraft, handleKioskStatus, handleKioskPairing, kioskPaymentKeysBusy, readKioskPairing };', sandbox);
  return { handler: module.exports.handler, ...module.exports.tests };
}

// A tiny SQL double: it answers the statements GH-488 issues and records every call.
function fakeDatabase({ activeRows = [], ownPairing = null, busy = false, uniqueViolation = false } = {}) {
  const calls = [];
  const executeStatement = async (sql, parameters = []) => {
    calls.push({ sql, parameters });
    const value = (name) => parameters.find((p) => p.name === name)?.value?.stringValue ?? null;
    if (/FROM jumpyard\.kiosk_installations\s+WHERE installation_id = :installationId AND status = 'active'/.test(sql)) {
      return rowsResult(ownPairing && ownPairing.installationId === value('installationId')
        ? [{ installation_id: ownPairing.installationId, kiosk_name_id: ownPairing.kioskNameId, status: 'active', venue_id: '50871' }]
        : []);
    }
    if (/FROM jumpyard\.kiosk_installations\s+WHERE venue_id = :venueId AND status = 'active'/.test(sql)) {
      return rowsResult(activeRows.map((row) => ({ installation_id: row.installationId, kiosk_name_id: row.kioskNameId })));
    }
    if (/FROM jumpyard\.idempotency_records AS existing/.test(sql)) {
      return rowsResult(busy ? [{ idempotency_key: JSON.parse(value('keys'))[0] }] : []);
    }
    if (/INSERT INTO jumpyard\.kiosk_installations/.test(sql) && uniqueViolation) {
      throw Object.assign(new Error('ERROR: duplicate key value violates unique constraint "kiosk_installations_one_active_name"'), { name: 'BadRequestException' });
    }
    if (/INSERT INTO jumpyard\.idempotency_records AS existing/.test(sql)) {
      const keys = JSON.parse(value('keys'));
      return { columnMetadata: [{ name: 'idempotency_key' }], records: keys.map((key) => [{ stringValue: key }]) };
    }
    return rowsResult([]);
  };
  return { calls, executeStatement };
}

function draftFixture(database, extra = {}) {
  const calls = [];
  const customer = { firstName: 'Test', lastName: 'Fixture', email: 'test@example.invalid', phone: '+46000000000' };
  const jwt = `header.${Buffer.from(JSON.stringify({ currency: 'SEK', merchantReference: 'synthetic' })).toString('base64url')}.signature`;
  const overrides = {
    getRollerConfig: async () => configuration(), getRollerAccessToken: async () => 'synthetic-access',
    reserveIdempotencyKey: async () => ({ ok: true }), completeIdempotencyKey: async () => {},
    isNewBookingDraftWriteEnabled: () => true, isAddProductDraftWriteEnabled: () => true,
    validateT0176FullFlowRequestItemDates: () => ({ ok: true }), validateT0162AddOnSmokeAccess: () => ({ ok: true }),
    validateT0176FullFlowOriginalBookingAccess: () => ({ ok: true }), verifyGuestAccessForBooking: async () => ({ ok: true }),
    getBookingReferenceFromPath: () => 'original-fixture',
    resolveOriginalBookingContext: async () => ({ ok: true, venueId: '50871', bookingReference: 'original-fixture', rollerUniqueId: 'original-id', customer }),
    getRollerJson: async () => { throw new Error('Draft creation must not look up a customer'); },
    executeStatement: database.executeStatement,
    postRollerJson: async (_config, _token, endpoint, payload) => {
      calls.push({ endpoint, payload });
      return { ok: true, status: 200, body: { uniqueId: 'synthetic-draft', costs: { total: 10, amountOwing: 10 }, currency: 'SEK', paymentJwt: jwt } };
    },
    getVenuePaymentConfig: async () => ({ available: true, apiUrl: 'https://example.invalid' }),
    persistPrepaymentDraft: async ({ request: saved }) => ({ paymentAttemptId: saved.reservedPaymentAttemptId, prepaymentDraftId: 'synthetic-prepayment' }),
    persistAddOnBookingLink: async () => ({}), writeBookingEventLog: async () => {},
    ...extra,
  };
  const body = kioskRequest(kioskA, { confirmDraft: true, idempotencyKey: 'fixture-request', customer,
    items: [{ productId: 101, quantity: 1, bookingDate: '2026-10-12', startTime: '12:00' }] });
  return { calls, body, backend: loadBooking(overrides) };
}

for (const method of ['handleDraft', 'handleAddProductDraft']) {
  test(`${method}: a paired kiosk without a profile creates its draft on the paired terminal`, async () => {
    const database = fakeDatabase({ ownPairing: pairing(kioskA, 'nacka-k4') });
    const { calls, body, backend } = draftFixture(database);
    const result = await backend[method]({}, body, 'test-correlation');
    assert.equal(result.statusCode, 201, result.body);
    assert.equal(calls.find((c) => c.endpoint === '/bookings/draft').payload.paymentTerminal.terminalId, 'synthetic-p630-4');
    const reservation = database.calls.find((c) => /INSERT INTO jumpyard\.idempotency_records AS existing/.test(c.sql));
    assert.ok(reservation.parameters.find((p) => p.name === 'keys').value.stringValue.includes(lock(4)));
    for (const secret of [kioskA.capability, 'synthetic-p630-4', lock(4)]) assert.ok(!result.body.includes(secret));
  });

  test(`${method}: an unpaired kiosk without a profile is refused before any provider call`, async () => {
    const { calls, body, backend } = draftFixture(fakeDatabase());
    const result = await backend[method]({}, body, 'test');
    assert.equal(result.statusCode, 409);
    assert.equal(JSON.parse(result.body).error.code, 'kiosk_installation_not_paired');
    assert.equal(calls.length, 0);
  });

  test(`${method}: a tampered capability never queries the registry`, async () => {
    const database = fakeDatabase({ ownPairing: pairing(kioskA, 'nacka-k4') });
    const { calls, body, backend } = draftFixture(database);
    const result = await backend[method]({}, { ...body, kioskCapability: kioskB.capability }, 'test');
    assert.equal(result.statusCode, 409);
    assert.ok(!database.calls.some((c) => /kiosk_installations/.test(c.sql)));
    assert.equal(calls.length, 0);
  });
}

test('Status: invalid proof is refused, a paired kiosk records last seen, unknown callers never write', async () => {
  let database = fakeDatabase({ activeRows: [{ installationId: kioskA.installationId, kioskNameId: 'nacka-k2' }] });
  let backend = loadBooking({ executeStatement: database.executeStatement, getRollerConfig: async () => configuration() });
  const invalid = await backend.handleKioskStatus({ kioskInstallationId: kioskA.installationId, kioskCapability: kioskB.capability }, 'test');
  assert.equal(invalid.statusCode, 400);
  assert.equal(database.calls.length, 0);

  const paired = await backend.handleKioskStatus({ kioskInstallationId: kioskA.installationId, kioskCapability: kioskA.capability,
    wrapperVersion: '8', webVersion: 'not valid!' }, 'test');
  assert.equal(paired.statusCode, 200);
  const body = JSON.parse(paired.body);
  assert.equal(body.status, 'ok');
  assert.equal(body.kiosk.name, 'Nacka K2');
  assert.equal(body.names.length, 6);
  const update = database.calls.find((c) => /UPDATE jumpyard\.kiosk_installations/.test(c.sql));
  assert.equal(update.parameters.find((p) => p.name === 'wrapperVersion').value.stringValue, '8');
  assert.equal(update.parameters.find((p) => p.name === 'webVersion').value.isNull, true);

  database = fakeDatabase({ activeRows: [{ installationId: kioskA.installationId, kioskNameId: 'nacka-k2' }] });
  backend = loadBooking({ executeStatement: database.executeStatement, getRollerConfig: async () => configuration() });
  const unknown = await backend.handleKioskStatus({ kioskInstallationId: kioskC.installationId, kioskCapability: kioskC.capability }, 'test');
  assert.deepEqual(JSON.parse(unknown.body).kiosk, { legacy: false, paired: false });
  assert.ok(!database.calls.some((c) => /UPDATE/.test(c.sql)));
});

const pairingDetail = (extra = {}) => ({
  kioskInstallationId: kioskA.installationId, kioskCapability: kioskA.capability, kioskNameId: 'nacka-k3',
  staffIdentityId: staffAllowed, wrapperVersion: '8', webVersion: '5717b34', correlationId: 'test', ...extra,
});

async function pair(detail, databaseOptions = {}, env = {}) {
  const database = fakeDatabase(databaseOptions);
  const events = [];
  const backend = loadBooking({
    executeStatement: database.executeStatement, getRollerConfig: async () => configuration(),
    writeBookingEventLog: async (event) => { events.push(event); },
  }, env);
  const response = await backend.handleKioskPairing(detail, 'test');
  const writes = database.calls.filter((c) => /^\s*(INSERT|UPDATE)/.test(c.sql));
  return { body: JSON.parse(response.body), database, events, response, writes };
}

test('Pairing: only allowlisted staff, only offered names, never over a held name without replace', async () => {
  let result = await pair(pairingDetail({ staffIdentityId: staffOther }));
  assert.equal(result.response.statusCode, 403);
  assert.equal(result.body.error.code, 'kiosk_pairing_not_allowed');
  assert.equal(result.database.calls.length, 0);

  result = await pair(pairingDetail({ kioskNameId: 'nacka-k9' }));
  assert.equal(result.response.statusCode, 404);
  assert.equal(result.body.error.code, 'kiosk_name_unknown');

  result = await pair(pairingDetail(), { activeRows: [{ installationId: kioskB.installationId, kioskNameId: 'nacka-k3' }] });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.body.error.code, 'kiosk_name_taken');
  assert.deepEqual(result.writes, []);

  result = await pair(pairingDetail({ kioskCapability: kioskB.capability }));
  assert.equal(result.response.statusCode, 400);
  assert.equal(result.body.error.code, 'kiosk_pairing_invalid');
});

test('Pairing: an unresolved payment on the kiosk, the replaced kiosk or the terminal blocks the change', async () => {
  const result = await pair(pairingDetail({ replace: true }), {
    activeRows: [{ installationId: kioskB.installationId, kioskNameId: 'nacka-k3' }], busy: true,
  });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.body.error.code, 'kiosk_payment_busy');
  const keys = JSON.parse(result.database.calls.find((c) => /idempotency_records/.test(c.sql))
    .parameters.find((p) => p.name === 'keys').value.stringValue);
  assert.deepEqual(keys.sort(), [`jykb_install_${kioskA.installationId}`, `jykb_install_${kioskB.installationId}`, `jykb_terminal_${lock(3)}`].sort());
  assert.deepEqual(result.writes, []);
});

test('Pairing: replace revokes the previous holder, then pairs and audits without secrets', async () => {
  const result = await pair(pairingDetail({ replace: true }), { activeRows: [{ installationId: kioskB.installationId, kioskNameId: 'nacka-k3' }] });
  assert.equal(result.response.statusCode, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.kiosk, { id: 'nacka-k3', kind: 'operational', name: 'Nacka K3', paired: true, terminalName: 'Nacka T3' });
  assert.equal(result.writes.length, 2);
  assert.match(result.writes[0].sql, /SET status = 'revoked'/);
  assert.equal(result.writes[0].parameters.find((p) => p.name === 'installationId').value.stringValue, kioskB.installationId);
  assert.match(result.writes[1].sql, /INSERT INTO jumpyard\.kiosk_installations/);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].payload.replacedInstallationId, kioskB.installationId);
  assert.equal(result.events[0].payload.staffIdentityId, staffAllowed);
  const everything = JSON.stringify([result.body, result.events, result.writes]);
  for (const secret of [kioskA.capability, 'synthetic-p630-3', lock(3)]) assert.ok(!everything.includes(secret));
});

test('Pairing: a lost race on the one-holder index becomes a taken name; an emergency stop blocks pairing', async () => {
  let result = await pair(pairingDetail(), { uniqueViolation: true });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.body.error.code, 'kiosk_name_taken');
  assert.equal(result.events.length, 0);

  result = await pair(pairingDetail(), {}, { JUMPYARD_EMERGENCY_STOP: 'true' });
  assert.equal(result.body.error.code, 'emergency_stop_active');
  assert.equal(result.database.calls.length, 0);
});

test('Only a direct invocation can carry a staff identity; an HTTP event with the same source is not a pairing', async () => {
  const database = fakeDatabase();
  const backend = loadBooking({ executeStatement: database.executeStatement, getRollerConfig: async () => configuration(),
    writeBookingEventLog: async () => {} });
  const spoofed = await backend.handler({ source: 'jumpyard.kiosk-pairing', detail: pairingDetail(), rawPath: '/v1/unknown',
    requestContext: { http: { method: 'POST', path: '/v1/unknown' } }, routeKey: 'POST /v1/unknown', headers: {} });
  assert.equal(spoofed.statusCode, 404);
  assert.equal(database.calls.length, 0);
  const direct = await backend.handler({ source: 'jumpyard.kiosk-pairing', detail: pairingDetail() });
  assert.equal(direct.statusCode, 200);
});

function pinVerifier(pin = staffPin) {
  const salt = Buffer.from('0123456789abcdef', 'utf8');
  const material = crypto.createHmac('sha256', pepper)
    .update(['staff-pin-verify-v1', 'park-test', '50871', pin].join('\u0000')).digest();
  const derived = crypto.scryptSync(material, salt, 32, { N: 32768, p: 1, r: 8, maxmem: 64 * 1024 * 1024 });
  return `scrypt-v1$32768$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function loadSession({ identity = {}, limited = false, bookingResult, env = {} } = {}) {
  const state = { sql: [], invokes: [], params: [] };
  const fakeAws = new Proxy({}, { get: (_target, property) => class {
    constructor(input) { this.input = input; this.kind = String(property); }
    async send(command) {
      if (property === 'LambdaClient') {
        state.invokes.push(JSON.parse(Buffer.from(command.input.Payload).toString('utf8')));
        if (bookingResult === 'error') return { FunctionError: 'Unhandled', Payload: Buffer.from('{}') };
        return { StatusCode: 200, Payload: Buffer.from(JSON.stringify(bookingResult ?? { statusCode: 200, body: { status: 'paired' } })) };
      }
      if (property !== 'RDSDataClient') throw new Error(`Unexpected AWS client ${String(property)}`);
      const statement = String(command.input?.sql ?? '');
      state.sql.push(statement);
      state.params.push(JSON.stringify(command.input?.parameters ?? []));
      if (/FROM jumpyard\.staff_pin_auth_limits/.test(statement)) {
        return limited ? rowsResult([{ scope_type: 'venue', blocked_until: new Date(Date.now() + 600000).toISOString() }]) : rowsResult([]);
      }
      if (/INSERT INTO jumpyard\.staff_pin_auth_limits/.test(statement)) return rowsResult([{ source_blocked_until: null, venue_blocked_until: null }]);
      if (/pin_lookup_hash = :pinLookupHash/.test(statement)) {
        return rowsResult([{ active: true, display_name: 'Synthetic Technician', environment: 'park-test', family_name: 'Technician',
          given_name: 'Synthetic', identity_revoked_at: null, pin_verifier: pinVerifier(), pin_pepper_version: 1,
          pin_reenrollment_required_at: null, provider_subject: staffAllowed, role: 'staff_operator',
          staff_identity_id: staffAllowed, tokens_valid_after: null, venue_id: '50871', ...identity }]);
      }
      throw new Error(`Unexpected SQL in the kiosk pairing PIN proof: ${statement.slice(0, 120)}`);
    }
  } });
  const module = { exports: {} };
  const sandbox = { AbortController, Buffer, TextDecoder, TextEncoder, URL, URLSearchParams, clearTimeout, setTimeout,
    console: { error() {}, info() {}, log() {}, warn() {} }, exports: module.exports, module,
    fetch: () => { throw new Error('No network allowed'); },
    process: { env: { DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:gh488', DATABASE_SECRET_ARN: 'arn:gh488',
      ENABLE_STAFF_AUTH: 'true', ENABLE_T0176_FULL_FLOW_REHEARSAL: 'true', JUMPYARD_EMERGENCY_STOP: 'false',
      JUMPYARD_ENVIRONMENT: 'park-test', KIOSK_PAIRING_FUNCTION_NAME: 'jumpyard-check-in-park-test-stack-booking',
      STAFF_IDENTITY_ENVIRONMENT: 'park-test', STAFF_IDENTITY_MODE: 'pin', STAFF_IDENTITY_VENUE_ID: '50871',
      STAFF_PIN_PEPPER: pepper, ...env } },
    require(name) {
      if (name.startsWith('@aws-sdk/')) return fakeAws;
      if (name === 'crypto' || name === 'node:crypto') return crypto;
      if (name === './staff-board') return require('../infra/lambda/session/staff-board');
      if (name === './staff-handout') return require('../infra/lambda/shared/staff-handout');
      if (name.startsWith('./')) return require(path.join(root, 'infra/lambda/session', name));
      throw new Error(`Unexpected dependency ${name}`);
    },
  };
  vm.runInNewContext(sessionSource, sandbox);
  const call = (body) => module.exports.handler({
    body: JSON.stringify(body), headers: {}, rawPath: '/v1/staff/kiosk-pairing',
    requestContext: { http: { method: 'POST', path: '/v1/staff/kiosk-pairing', sourceIp: '192.0.2.88' } },
    routeKey: 'POST /v1/staff/kiosk-pairing',
  });
  return { call, state };
}

const pairingBody = (extra = {}) => ({ staffPin, kioskInstallationId: kioskA.installationId, kioskCapability: kioskA.capability,
  kioskNameId: 'nacka-k3', replace: false, wrapperVersion: '8', webVersion: '5717b34', ...extra });

test('A valid PIN reaches the Booking Lambda as a staff id only and creates no staff session', async () => {
  const { call, state } = loadSession({ bookingResult: { statusCode: 200, body: { correlationId: 'booking-side', status: 'paired' } } });
  const response = await call(pairingBody({ replace: true }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.status, 'paired');
  assert.notEqual(body.correlationId, 'booking-side');
  assert.equal(state.invokes.length, 1);
  assert.equal(state.invokes[0].source, 'jumpyard.kiosk-pairing');
  assert.equal(state.invokes[0].detail.staffIdentityId, staffAllowed);
  assert.equal(state.invokes[0].detail.replace, true);
  assert.equal(state.invokes[0].detail.staffPin, undefined);
  assert.ok(!state.sql.some((statement) => /staff_auth_sessions/.test(statement)), 'no staff session is created or replaced');
  assert.ok(!(JSON.stringify(state.invokes) + state.params.join('')).includes(staffPin), 'the PIN never leaves the verification');
});

test('Wrong, limited or malformed PIN proofs never reach the Booking Lambda', async () => {
  let loaded = loadSession({ identity: { pin_verifier: pinVerifier('739164') } });
  let response = await loaded.call(pairingBody());
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, 'staff_pin_invalid');
  assert.equal(loaded.state.invokes.length, 0);

  loaded = loadSession({ limited: true });
  response = await loaded.call(pairingBody());
  assert.equal(response.statusCode, 429);
  assert.equal(loaded.state.invokes.length, 0);

  for (const change of [{ kioskNameId: 'Nacka K3' }, { kioskCapability: 'short' }, { replace: 'true' }]) {
    loaded = loadSession();
    response = await loaded.call(pairingBody(change));
    assert.equal(JSON.parse(response.body).error.code, 'kiosk_pairing_invalid', JSON.stringify(change));
    assert.deepEqual(loaded.state.sql, []);
  }
  loaded = loadSession();
  response = await loaded.call(pairingBody({ staffPin: '12345' }));
  assert.equal(JSON.parse(response.body).error.code, 'staff_pin_format_invalid');
  assert.deepEqual(loaded.state.sql, []);
});

test('Pairing needs PIN mode, stops during an emergency stop and reports a failed Booking call safely', async () => {
  let loaded = loadSession({ env: { STAFF_IDENTITY_MODE: 'legacy' } });
  assert.equal((await loaded.call(pairingBody())).statusCode, 404);
  loaded = loadSession({ env: { JUMPYARD_EMERGENCY_STOP: 'true' } });
  assert.equal(JSON.parse((await loaded.call(pairingBody())).body).error.code, 'emergency_stop_active');
  assert.equal(loaded.state.invokes.length, 0);
  loaded = loadSession({ bookingResult: 'error' });
  const response = await loaded.call(pairingBody());
  assert.equal(response.statusCode, 502);
  assert.equal(JSON.parse(response.body).error.code, 'kiosk_pairing_failed');
});

test('PostgreSQL: one active holder per name, replace and rename, payment locks and runtime grants', {
  skip: process.env.GH488_DATABASE_TEST !== 'true',
}, async () => {
  const { Pool } = require('../infra/node_modules/pg');
  const port = Number(process.env.GH488_PGPORT || 55488);
  assert.ok([55488, 55435].includes(port), 'Only disposable loopback test databases are allowed.');
  const connection = { host: '127.0.0.1', port, database: 'jumpyard_cloud',
    user: port === 55488 ? 'gh488_test' : 'gh345_test', password: '', ssl: false };
  const admin = new Pool(connection);
  const runtime = new Pool({ ...connection, max: 10, options: '-c role=jumpyard_booking_runtime' });
  const venue = `gh488_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const executeStatement = async (sql, parameters = []) => {
    const indexes = new Map(parameters.map((p, i) => [p.name, i + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (m, name) => indexes.has(name) ? `$${indexes.get(name)}` : m);
    const result = await runtime.query(prepared, parameters.map((p) => p.value.stringValue ?? null));
    return { columnMetadata: result.fields.map((f) => ({ name: f.name })), records: result.rows.map((r) => result.fields.map((f) => ({ stringValue: r[f.name] === null ? null : String(r[f.name]) }))) };
  };
  const config = () => ({ ...configuration(), kioskVenueId: '50871' });
  const backend = loadBooking({ executeStatement, getRollerConfig: async () => config(), writeBookingEventLog: async () => {} });
  const devices = Array.from({ length: 8 }, (_, index) => proof(String.fromCharCode(68 + index)));
  const ids = devices.map((device) => device.installationId);
  try {
    await admin.query('DELETE FROM jumpyard.kiosk_installations WHERE installation_id = ANY($1)', [ids]);
    // Eight devices race for one name: the partial unique index lets exactly one become active.
    const racing = await Promise.all(devices.map((device) => backend.handleKioskPairing(pairingDetail({
      kioskInstallationId: device.installationId, kioskCapability: device.capability, kioskNameId: 'nacka-k1',
    }), 'race')));
    assert.equal(racing.filter((response) => response.statusCode === 200).length, 1);
    assert.ok(racing.every((response) => [200, 409].includes(response.statusCode)));
    const winner = devices[racing.findIndex((response) => response.statusCode === 200)];
    const loser = devices.find((device) => device !== winner);

    // Replace: the previous holder is revoked; the new one is active; status reflects both.
    const replaced = await backend.handleKioskPairing(pairingDetail({
      kioskInstallationId: loser.installationId, kioskCapability: loser.capability, kioskNameId: 'nacka-k1', replace: true,
    }), 'replace');
    assert.equal(replaced.statusCode, 200);
    const rows = (await admin.query('SELECT installation_id, status, revoked_reason FROM jumpyard.kiosk_installations WHERE installation_id = ANY($1)', [ids])).rows;
    assert.equal(rows.find((row) => row.installation_id === winner.installationId).status, 'revoked');
    assert.equal(rows.find((row) => row.installation_id === winner.installationId).revoked_reason, 'replaced');
    assert.equal(rows.filter((row) => row.status === 'active').length, 1);
    const status = JSON.parse((await backend.handleKioskStatus({ kioskInstallationId: winner.installationId, kioskCapability: winner.capability }, 's')).body);
    assert.equal(status.kiosk.paired, false);
    assert.equal(status.names.find((entry) => entry.id === 'nacka-k1').taken, true);

    // Rename: the holder moves to another name and frees the first one in the same row.
    const renamed = await backend.handleKioskPairing(pairingDetail({
      kioskInstallationId: loser.installationId, kioskCapability: loser.capability, kioskNameId: 'nacka-k2',
    }), 'rename');
    assert.equal(renamed.statusCode, 200);
    assert.equal((await backend.readKioskPairing(kioskRequest(loser))).kioskNameId, 'nacka-k2');

    // An unresolved attempt on the terminal blocks a pairing change until a definitive outcome.
    const attempt = `jytp_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
    const key = `jykb_terminal_${lock(3)}`;
    await admin.query(`INSERT INTO jumpyard.idempotency_records (idempotency_key, operation, request_hash, status, result_ref, expires_at)
      VALUES ($1, 'kiosk_terminal_binding', $2, 'started', $2, 'infinity')
      ON CONFLICT (idempotency_key) DO UPDATE SET status = 'started', result_ref = EXCLUDED.result_ref`, [key, attempt]);
    const third = devices[2];
    const blocked = await backend.handleKioskPairing(pairingDetail({
      kioskInstallationId: third.installationId, kioskCapability: third.capability, kioskNameId: 'nacka-k3',
    }), 'busy');
    assert.equal(JSON.parse(blocked.body).error.code, 'kiosk_payment_busy');
    await admin.query(`INSERT INTO jumpyard.prepayment_booking_drafts
      (prepayment_draft_id, external_id, idempotency_key, roller_env, payment_channel, payment_attempt_id, payment_attempt_status)
      VALUES ($1, $1, $1, 'playground', 'card_present', $2, 'cancelled')`, [`${venue}_draft`, attempt]);
    assert.equal(await backend.kioskPaymentKeysBusy([key]), false);

    await assert.rejects(runtime.query('DELETE FROM jumpyard.kiosk_installations WHERE installation_id = $1', [loser.installationId]), /permission denied/);
    await assert.rejects(admin.query(`UPDATE jumpyard.kiosk_installations SET status = 'revoked' WHERE installation_id = $1`, [loser.installationId]), /check constraint/);
  } finally {
    await admin.query('DELETE FROM jumpyard.kiosk_installations WHERE installation_id = ANY($1)', [ids]);
    await admin.query('DELETE FROM jumpyard.prepayment_booking_drafts WHERE prepayment_draft_id = $1', [`${venue}_draft`]);
    await admin.query(`DELETE FROM jumpyard.idempotency_records WHERE idempotency_key = $1`, [`jykb_terminal_${lock(3)}`]);
    await runtime.end();
    await admin.end();
  }
});
