/* GH-345: pure entitlement checks plus opt-in, isolated PostgreSQL concurrency tests.
 * GH345_PSQL must name a local psql executable; no AWS/provider calls are made.
 * Run only against the disposable database on 127.0.0.1:55435 created for this issue.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const { buildManifest } = require('../infra/lambda/shared/staff-handout');
const { createHandoutStore } = require('../infra/lambda/redeem/staff-handout-write');
const { createStaffBoard } = require('../infra/lambda/session/staff-board');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const item = (overrides = {}) => ({ rollerUniqueId: 'b1', bookingItemId: 'i1', productId: 'coffee',
  productName: 'Kaffe', quantity: 2, bookingDate: day, summary: { type: 'food' }, ...overrides });

test('Only explicit purchased lines and the verified Combo create entitlements', () => {
  assert.equal(buildManifest([item()], day)[0].quantity, 2);
  const combo = buildManifest([item({ productId: '1242136', parentProductId: '1242135', productName: 'Weekday Combo', quantity: 2 })], day);
  assert.deepEqual(combo.map(({ kind, quantity, area }) => ({ kind, quantity, area })), [
    { kind: 'admission', quantity: 4, area: 'entrance' }, { kind: 'pizza', quantity: 2, area: 'cafe' },
  ]);
  assert.match(combo[0].detail, /^60 min/);
  assert.equal(buildManifest([item({ productId: 'unknown-combo', productName: 'Combo with coffee', summary: {} })], day).length, 1);
  assert.equal(buildManifest([item({ quantity: 0 }), item({ quantity: 1.5 }), item({ bookingItemId: null }), item({ bookingDate: '2000-01-01' })], day).length, 0);
  assert.equal(buildManifest([item({ summary: { type: 'giftcard' } })], day).length, 0);
});
test('Item identity survives renaming and separates two purchases of the same product', () => {
  const first = buildManifest([item()], day)[0];
  assert.equal(first.id, buildManifest([item({ productName: 'Coffee, renamed' })], day)[0].id);
  assert.equal(first.id, buildManifest([item({ productName: 'Warm drink' })], day)[0].id);
  assert.notEqual(first.id, buildManifest([item({ bookingItemId: 'i2' })], day)[0].id);
  assert.notEqual(first.id, buildManifest([item({ rollerUniqueId: 'linked' })], day)[0].id);
});
test('Deployed shared modules are byte-identical to their canonical source', () => {
  for (const name of ['staff-handout.js', 'package-contents.js']) for (const target of ['session', 'redeem']) {
    assert.equal(fs.readFileSync(path.join(root, 'infra/lambda', target, name), 'utf8'), fs.readFileSync(path.join(root, 'infra/lambda/shared', name), 'utf8'));
  }
});

const psql = process.env.GH345_PSQL;
const pgPool = process.env.GH345_PG_MODULE ? new (require(process.env.GH345_PG_MODULE).Pool)({
  host: '127.0.0.1', port: 55435, user: 'gh345_test', database: 'jumpyard_cloud',
}) : null;
async function sql(query, role) {
  const pending = run(psql, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '55435', '-U', 'gh345_test',
    '-d', 'jumpyard_cloud', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
  });
  pending.child.stdin.end(Buffer.from((role ? `SET ROLE ${role}; ` : '') + query, 'utf8'));
  const result = await pending;
  return result.stdout.trim();
}
const literal = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const fixture = `gh345_${Date.now()}`;
const venue = `${fixture}_park`;
const id = (suffix) => `${fixture}_${suffix}`;
async function seed(suffix, park = venue) {
  await sql(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id,
    booking_status, payment_status, amount_owing_cents, total_cents, booking_date, start_time, freshness_status, normalized_summary)
    VALUES (${literal(id(suffix))}, ${literal(id(suffix))}, 'playground', ${literal(park)}, 'confirmed', 'paid', 0, 10000,
      ${literal(day)}, '10:00', 'fresh', '{"bookingName":"Test Guest"}');
    INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, expires_at)
    VALUES (${literal(id(`s_${suffix}`))}, ${literal(id(suffix))}, ${literal(id(suffix))}, ${literal(day)}, now() + interval '2 hours');`);
  return id(`s_${suffix}`);
}
async function ready(sessionId, role = 'jumpyard_session_runtime') {
  return JSON.parse(await sql(`SELECT json_build_object('code', handoff_code, 'day', handoff_day, 'status', status)
    FROM jumpyard.ready_staff_session(${literal(sessionId)}, 'completed')`, role));
}
const manifest = [
  { id: 'bands', area: 'entrance', kind: 'admission', name: 'Besöksband', quantity: 3 },
  { id: 'socks', area: 'entrance', kind: 'socks', name: 'Strumpor', quantity: 3 },
  { id: 'coffee', area: 'cafe', kind: 'coffee', name: 'Kaffe', quantity: 2 },
];
async function change(sessionId, actor, area, action, revision, selection = [], park = venue) {
  return JSON.parse(await sql(`SELECT jumpyard.change_staff_handout(${literal(sessionId)}, ${literal(park)},
    ${literal(actor)}, ${literal(actor)}, ${literal(area)}, ${literal(action)}, ${revision},
    ${literal(JSON.stringify(selection))}::jsonb, ${literal(JSON.stringify(manifest))}::jsonb)`, 'jumpyard_redeem_runtime'));
}
function adapter(role) {
  return {
    stringParameter: (name, value) => ({ name, value }),
    mappedRows: (result) => result,
    executeStatement: async (query, parameters) => {
      if (pgPool) {
        const values = parameters.map((parameter) => parameter.value);
        const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
        const prepared = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
        const client = await pgPool.connect();
        try { await client.query(`SET ROLE ${role}`); return (await client.query(prepared, values)).rows; }
        finally { await client.query('RESET ROLE'); client.release(); }
      }
      const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
      const prepared = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
      const output = await sql(`PREPARE gh345_bound_query AS SELECT COALESCE(json_agg(gh345_query_row), '[]'::json) FROM (${prepared}) gh345_query_row;
        EXECUTE gh345_bound_query(${parameters.map((parameter) => literal(parameter.value)).join(',')});`, role);
      return JSON.parse(output);
    },
  };
}

test('PostgreSQL: concurrent daily numbers, claims, partial receipts, recovery and least privilege', { skip: !psql }, async (t) => {
  if (pgPool) t.after(() => pgPool.end());
  const sessions = await Promise.all(Array.from({ length: 24 }, (_, i) => seed(`group${i}`)));
  await t.test('24 groups becoming ready concurrently get unique four-digit codes', async () => {
    const numbers = await Promise.all(sessions.map((session) => ready(session)));
    assert.equal(new Set(numbers.map((value) => value.code)).size, 24);
    assert.ok(numbers.every((value) => /^\d{4}$/.test(value.code) && value.day === day));
    assert.deepEqual(numbers.map((value) => Number(value.code)).sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => i + 1));
  });
  await t.test('Concurrent retries keep one allocation; different parks start independently', async () => {
    const previous = await ready(sessions[0]);
    assert.ok((await Promise.all(Array.from({ length: 10 }, () => ready(sessions[0])))).every((value) => value.code === previous.code));
    assert.equal(await sql(`SELECT last_number FROM jumpyard.handoff_day_counters WHERE venue_id = ${literal(venue)}`), '24');
    const secondPark = await seed('otherPark', `${venue}_other`);
    assert.equal((await ready(secondPark)).code, '0001');
  });
  await t.test('9999 is the last daily number; exhaustion retains stable session identity', async () => {
    const park = `${venue}_full`;
    const a = await seed('capacity1', park);
    const b = await seed('capacity2', park);
    await sql(`INSERT INTO jumpyard.handoff_day_counters VALUES (${literal(park)}, ${literal(day)}, 9998)`);
    assert.equal((await ready(a)).code, '9999');
    assert.deepEqual(await ready(b), { code: null, day: null, status: 'ready_for_staff' });
    assert.equal((await ready(a)).code, '9999');
    assert.equal(await sql(`SELECT last_number FROM jumpyard.handoff_day_counters WHERE venue_id = ${literal(park)}`), '9999');
  });
  await t.test('A new Stockholm day starts at 0001 and preserves the previous day, independently of database timezone', async () => {
    const park = `${venue}_midnight`;
    const previous = await seed('yesterday', park);
    await sql(`INSERT INTO jumpyard.handoff_day_counters VALUES (${literal(park)}, CAST(${literal(day)} AS date) - 1, 9999);
      UPDATE jumpyard.checkin_sessions SET handoff_code = '9999', handoff_day = CAST(${literal(day)} AS date) - 1,
        handoff_venue_id = ${literal(park)} WHERE checkin_session_id = ${literal(previous)}`);
    const next = await seed('nextday', park);
    const actual = JSON.parse(await sql(`SET TIME ZONE 'Pacific/Honolulu'; SELECT json_build_object('code', handoff_code, 'day', handoff_day)
      FROM jumpyard.ready_staff_session(${literal(next)}, 'completed')`, 'jumpyard_session_runtime'));
    assert.deepEqual(actual, { code: '0001', day });
    assert.equal((await ready(previous)).code, '9999');
    assert.equal(await sql(`SELECT ('2026-09-08 21:59:59Z'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date::text || ',' ||
      ('2026-09-08 22:00:00Z'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date::text`), '2026-09-08,2026-09-09');
    assert.equal(await sql(`SELECT ('2026-12-08 22:59:59Z'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date::text || ',' ||
      ('2026-12-08 23:00:00Z'::timestamptz AT TIME ZONE 'Europe/Stockholm')::date::text`), '2026-12-08,2026-12-09');
  });
  await t.test('Completed sessions and legacy JY codes never reopen/reallocate on retry', async () => {
    const legacy = await seed('legacy');
    await sql(`UPDATE jumpyard.checkin_sessions SET handoff_code = ${literal(`JY${Date.now()}`)} WHERE checkin_session_id = ${literal(legacy)}`);
    assert.match((await ready(legacy)).code, /^JY/);
    await sql(`UPDATE jumpyard.checkin_sessions SET status = 'redeemed', handoff_status = 'completed' WHERE checkin_session_id = ${literal(legacy)}`);
    assert.equal((await ready(legacy)).status, 'redeemed');
  });
  const session = sessions[0];
  let revision;
  await t.test('Opening is read-only; first product tap wins the claim across phones', async () => {
    const store = createHandoutStore(adapter('jumpyard_session_runtime'));
    const snapshot = await store.readState({ rollerUniqueId: id('group0'), visitDate: day }, venue);
    assert.deepEqual(snapshot.claims, []);
    const attempts = await Promise.all(['Anna', 'Bertil'].map((actor) => change(session, actor, 'entrance', 'select', 0, [{ id: 'bands', quantity: 3 }])));
    assert.equal(attempts.filter((result) => result.selected).length, 1);
    assert.equal(attempts.filter((result) => result.error === 'guest_claimed').length, 1);
    revision = attempts.find((result) => result.selected).revision;
  });
  const owner = await sql(`SELECT actor_id FROM jumpyard.staff_handout_claims WHERE checkin_session_id = ${literal(session)} AND area = 'entrance'`);
  await t.test('Saved selection survives refresh, stale revisions fail, one actor cannot take a second guest', async () => {
    assert.equal((await change(session, owner, 'entrance', 'select', 0, [{ id: 'socks', quantity: 3 }])).error, 'handout_changed');
    assert.equal((await change(sessions[1], owner, 'entrance', 'select', 0, [{ id: 'bands', quantity: 3 }])).error, 'staff_busy');
    const row = JSON.parse(await sql(`SELECT selection FROM jumpyard.staff_handout_claims WHERE checkin_session_id = ${literal(session)}`));
    assert.equal(row[0].id, 'bands');
    assert.equal((await change(session, owner, 'cafe', 'select', 0, [{ id: 'coffee', quantity: 1 }])).error, 'staff_busy');
    assert.equal((await change(session, 'Cafestaff', 'cafe', 'select', 0, [{ id: 'coffee', quantity: 1 }])).error, 'admission_not_confirmed');
  });
  let operationId;
  await t.test('A confirmation interrupted before admission retains the same immutable operation', async () => {
    const prepared = await change(session, owner, 'entrance', 'prepare', revision);
    operationId = prepared.operationId;
    assert.ok(prepared.needsAdmission);
    assert.equal((await change(session, owner, 'entrance', 'complete', revision)).error, 'admission_not_confirmed');
    assert.equal((await change(session, owner, 'entrance', 'release', revision)).error, 'handout_confirmation_pending');
    assert.equal((await change(session, owner, 'entrance', 'prepare', revision)).operationId, operationId);
    await sql(`UPDATE jumpyard.staff_handout_claims SET expires_at = now() - interval '1 second' WHERE checkin_session_id = ${literal(session)}`);
    assert.equal((await change(session, 'Recovery', 'entrance', 'prepare', revision)).operationId, operationId);
  });
  await t.test('After confirmed admission the receipt completes exactly once and keeps the original actor', async () => {
    await sql(`UPDATE jumpyard.checkin_sessions SET status = 'redeemed', handoff_status = 'completed', completed_at = now() WHERE checkin_session_id = ${literal(session)}`);
    assert.ok((await change(session, 'Recovery', 'entrance', 'complete', revision)).completed);
    assert.ok((await change(session, 'Recovery', 'entrance', 'complete', revision)).completed);
    assert.equal(await sql(`SELECT count(*) FROM jumpyard.staff_handout_operations WHERE operation_id = ${literal(operationId)} AND status = 'completed'`), '1');
    assert.equal(await sql(`SELECT actor_id FROM jumpyard.staff_handout_operations WHERE operation_id = ${literal(operationId)}`), owner);
  });
  await t.test('Coffee can be collected one at a time, with duplicate and over-collection prevention', async () => {
    let selected = await change(session, 'Cafe', 'cafe', 'select', 0, [{ id: 'coffee', quantity: 1 }]);
    assert.ok(selected.selected);
    let prepared = await change(session, 'Cafe', 'cafe', 'prepare', selected.revision);
    assert.equal(prepared.needsAdmission, false);
    assert.ok((await change(session, 'Cafe', 'cafe', 'complete', selected.revision)).completed);
    assert.ok((await change(session, 'Cafe', 'cafe', 'prepare', selected.revision)).completed);
    assert.equal((await change(session, 'Cafe', 'cafe', 'select', selected.revision + 1, [{ id: 'coffee', quantity: 2 }])).error, 'quantity_already_collected');
    selected = await change(session, 'Cafe', 'cafe', 'select', selected.revision + 1, [{ id: 'coffee', quantity: 1 }]);
    prepared = await change(session, 'Cafe', 'cafe', 'prepare', selected.revision);
    assert.ok(prepared.operationId);
    assert.ok((await change(session, 'Cafe', 'cafe', 'complete', selected.revision)).completed);
    assert.equal((await change(session, 'Cafe', 'cafe', 'select', selected.revision + 1, [{ id: 'coffee', quantity: 1 }])).error, 'quantity_already_collected');
    assert.equal(await sql(`SELECT sum((line ->> 'quantity')::integer) FROM jumpyard.staff_handout_operations op,
      jsonb_array_elements(op.items) line WHERE op.checkin_session_id = ${literal(session)} AND op.status = 'completed' AND line ->> 'id' = 'coffee'`), '2');
  });
  await t.test('Venue, role, invalid quantities and group admission are guarded', async () => {
    assert.equal((await change(sessions[2], 'Other', 'entrance', 'select', 0, [{ id: 'bands', quantity: 3 }], 'wrong-park')).error, 'session_not_found');
    assert.equal((await change(sessions[2], 'Other', 'entrance', 'select', 0, [{ id: 'bands', quantity: 1 }])).error, 'admission_requires_whole_group');
    assert.equal((await change(sessions[2], 'Other', 'entrance', 'select', 0, [{ id: 'fake-item', quantity: 1 }])).error, 'invalid_selection');
    await assert.rejects(sql(`SELECT jumpyard.change_staff_handout('x','x','x','x','cafe','select',0,'[]','[]')`, 'jumpyard_session_runtime'), /permission denied/);
    await assert.rejects(sql('UPDATE jumpyard.handoff_day_counters SET last_number = 1', 'jumpyard_redeem_runtime'), /permission denied/);
  });
  await t.test('A pending receipt reserves its item even if the catalog moves it to the other counter', async () => {
    const movedSession = await seed('movedproduct');
    await ready(movedSession);
    await sql(`UPDATE jumpyard.checkin_sessions SET status = 'redeemed', handoff_status = 'completed'
      WHERE checkin_session_id = ${literal(movedSession)}`);
    const store = createHandoutStore(adapter('jumpyard_redeem_runtime'));
    const context = { checkinSessionId: movedSession };
    const actor = { actorId: 'MovedEntrance', displayName: 'Entrance', venueId: venue };
    const original = [{ id: 'moving-item', area: 'entrance', kind: 'other', quantity: 2, name: 'Purchased item' }];
    const moved = [{ ...original[0], area: 'cafe', kind: 'coffee', name: 'Coffee' }];
    const selected = await store.change(context, actor,
      { area: 'entrance', action: 'select', revision: 0, selection: [{ id: 'moving-item', quantity: 2 }] }, original);
    assert.ok((await store.change(context, actor,
      { area: 'entrance', action: 'prepare', revision: selected.revision }, original)).operationId);
    const conflict = await store.change(context, { ...actor, actorId: 'MovedCafe', displayName: 'Café' },
      { area: 'cafe', action: 'select', revision: 0, selection: [{ id: 'moving-item', quantity: 1 }] }, moved);
    assert.equal(conflict.error, 'handout_resume_required');
    assert.equal(conflict.checkinSessionId, movedSession);
    assert.equal(conflict.area, 'entrance');
  });
  await t.test('Board query executes with the restricted session principal; booked/not-started and completed remain visible', async () => {
    const board = createStaffBoard({ ...adapter('jumpyard_session_runtime'), mapSession: (row) => row });
    const result = await board.list({ venueId: venue, day, search: null, cursor: null });
    assert.ok(result.sessions.some((row) => row.checkin_session_id === session && row.status === 'redeemed'));
    assert.equal((await board.list({ venueId: 'other-venue', day, search: null, cursor: null })).sessions.length, 0);
    assert.equal((await board.list({ venueId: venue, day, search: 'test guest', cursor: null })).sessions.length, result.sessions.length);
  });
  await t.test('Existing retention removes all guest handout state but never rewinds the daily counter', async () => {
    const before = await sql(`SELECT last_number FROM jumpyard.handoff_day_counters WHERE venue_id = ${literal(venue)}`);
    await sql(`DELETE FROM jumpyard.roller_bookings WHERE roller_unique_id = ${literal(id('group0'))}`);
    assert.equal(await sql(`SELECT count(*) FROM jumpyard.staff_handout_operations WHERE checkin_session_id = ${literal(session)}`), '0');
    assert.equal(await sql(`SELECT last_number FROM jumpyard.handoff_day_counters WHERE venue_id = ${literal(venue)}`), before);
  });
  await t.test('Authoritative items preserve selected-ticket limits and exact linked-payment semantics', async () => {
    const testSession = sessions[6];
    const booking = id('group6');
    await seed('linked');
    const linked = id('linked');
    const productId = id('bands');
    const selectedTickets = [id('ticket1'), id('ticket2')];
    await sql(`INSERT INTO jumpyard.roller_booking_items
      (booking_item_key, booking_item_id, roller_unique_id, product_id, product_name, quantity, booking_date, item_summary)
      VALUES (${literal(id('bands-item'))}, ${literal(id('bands-item'))}, ${literal(booking)}, ${literal(productId)}, 'Entry', 3, ${literal(day)}, '{"type":"standardPass"}'),
        (${literal(id('coffee-item'))}, ${literal(id('coffee-item'))}, ${literal(linked)}, 'coffee', 'Kaffe', 2, ${literal(day)}, '{"type":"food"}');
      INSERT INTO jumpyard.roller_booking_tickets (ticket_id, roller_unique_id, booking_item_key, booking_item_id)
        SELECT ${literal(id('ticket'))} || n, ${literal(booking)}, ${literal(id('bands-item'))}, ${literal(id('bands-item'))} FROM generate_series(1,3) n;
      INSERT INTO jumpyard.booking_links (link_id, link_type, original_roller_unique_id, linked_roller_unique_id)
        VALUES (${literal(id('link'))}, 'add_product_draft', ${literal(booking)}, ${literal(linked)});
      UPDATE jumpyard.checkin_sessions SET selected_ticket_ids = ${literal(JSON.stringify(selectedTickets))}::jsonb WHERE checkin_session_id = ${literal(testSession)};`);
    const testContext = { checkinSessionId: testSession, rollerUniqueId: booking, visitDate: day, selectedTicketIds: selectedTickets };
    const store = createHandoutStore(adapter('jumpyard_redeem_runtime'));
    const operator = { venueId: venue, actorId: 'limited-group', displayName: 'Limited Group' };
    let state = await store.readState(testContext, venue);
    const admission = state.items.find((item) => item.kind === 'admission');
    assert.equal(admission.quantity, 3);
    assert.equal(admission.available, 2);
    assert.equal(state.items.find((item) => item.kind === 'coffee').quantity, 2);
    assert.equal((await store.change(testContext, operator, { area: 'entrance', action: 'select', revision: 0, selection: [{ id: admission.id, quantity: 3 }] }, state.items)).error, 'admission_requires_whole_group');
    const selected = await store.change(testContext, operator, { area: 'entrance', action: 'select', revision: 0, selection: [{ id: admission.id, quantity: 2 }] }, state.items);
    assert.ok(selected.selected);
    await store.change(testContext, operator, { area: 'entrance', action: 'prepare', revision: selected.revision }, state.items);
    await sql(`UPDATE jumpyard.checkin_sessions SET status = 'redeemed', handoff_status = 'completed' WHERE checkin_session_id = ${literal(testSession)}`);
    const replacement = id('replacement-session');
    await sql(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date, expires_at)
      VALUES (${literal(replacement)}, ${literal(booking)}, ${literal(booking)}, ${literal(day)}, now() + interval '2 hours')`);
    const wrongSession = await store.change({ ...testContext, checkinSessionId: replacement }, operator,
      { area: 'entrance', action: 'prepare', revision: selected.revision }, state.items);
    assert.equal(wrongSession.error, 'handout_resume_required');
    assert.equal(wrongSession.checkinSessionId, testSession);
    await sql(`UPDATE jumpyard.checkin_sessions SET status = 'redeemed', handoff_status = 'completed' WHERE checkin_session_id = ${literal(testSession)}`);
    assert.ok((await store.change(testContext, operator, { area: 'entrance', action: 'complete', revision: selected.revision }, state.items)).completed);
    state = await store.readState(testContext, venue);
    assert.equal(state.items.find((item) => item.kind === 'admission').available, 0);
    const board = createStaffBoard({ ...adapter('jumpyard_session_runtime'), mapSession: (row) => row });
    const priorCode = await sql(`SELECT handoff_code FROM jumpyard.checkin_sessions WHERE checkin_session_id = ${literal(testSession)}`);
    const priorGuest = await board.list({ venueId: venue, day, search: priorCode, cursor: null });
    assert.equal(priorGuest.sessions[0].checkin_session_id, testSession, 'earlier group code still resolves after a new session starts');
    const currentBooking = await board.list({ venueId: venue, day, search: null, cursor: null, bookingId: booking });
    assert.equal(currentBooking.sessions[0].cafeSession.checkinSessionId, testSession, 'café can open the admitted group while the next group is preparing');
    for (const [payment, bookingStatus, owing, visible] of [
      ['Paid', 'Confirmed', 'NULL', true], ['', 'Fully Paid', 'NULL', true],
      ['Paid', 'Unpaid', '0', false], ['Unpaid', 'Confirmed', '0', false],
      ['Partially Paid', 'Confirmed', '0', false], ['Paid', 'Confirmed', '1', false],
      ['', 'Confirmed', 'NULL', false], ['Paid', 'Refunded', '0', false], ['Paid', 'Confirmed', '0', true],
    ]) {
      await sql(`UPDATE jumpyard.roller_bookings SET payment_status = ${literal(payment)}, booking_status = ${literal(bookingStatus)}, amount_owing_cents = ${owing} WHERE roller_unique_id = ${literal(linked)}`);
      const items = await store.readManifest(testContext, venue);
      assert.equal(items.some((item) => item.kind === 'coffee'), visible, `${payment}/${bookingStatus}/${owing}`);
      const listing = await board.list({ venueId: venue, day, search: null, cursor: null, bookingId: booking });
      assert.equal(listing.sessions[0].cafeQuantity, visible ? 2 : 0, 'queue and detail must agree');
    }
  });
  await t.test('Whole-day pagination returns every booking, including not started; search finds a guest beyond page one', async () => {
    const park = `${venue}_pagination`;
    await sql(`INSERT INTO jumpyard.roller_bookings (roller_unique_id, booking_reference, roller_env, venue_id, booking_date, start_time, normalized_summary)
      SELECT ${literal(id('page'))} || lpad(n::text, 3, '0'), ${literal(id('ref'))} || n, 'playground', ${literal(park)}, ${literal(day)}, '10:00',
        jsonb_build_object('bookingName', 'Guest ' || n) FROM generate_series(1, 205) n;`);
    const board = createStaffBoard({ ...adapter('jumpyard_session_runtime'), mapSession: (row) => row });
    const rows = []; let cursor = null;
    do { const page = await board.list({ venueId: park, day, search: null, cursor }); rows.push(...page.sessions); cursor = page.nextCursor; } while (cursor);
    assert.equal(rows.length, 205);
    assert.equal(new Set(rows.map((row) => row.checkin_session_id)).size, 205);
    assert.ok(rows.every((row) => row.status === 'upcoming'));
    const found = await board.list({ venueId: park, day, search: 'guest 205', cursor: null });
    assert.equal(found.sessions.length, 1);
    assert.equal(found.sessions[0].booking_reference, id('ref205'));
  });
});
