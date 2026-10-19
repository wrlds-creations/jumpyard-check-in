'use strict';
// Real Lambda orchestration + native PostgreSQL. Only identity verification and
// ROLLER's network boundary are synthetic; no AWS/provider traffic is possible.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test('Handout HTTP contract: authoritative database, ROLLER receipt recovery and café reuse', { skip: !process.env.GH345_PSQL }, async (t) => {
  const { Pool } = require('../infra/node_modules/pg');
  const pool = new Pool({ host: '127.0.0.1', port: 55435, user: 'gh345_test', database: 'jumpyard_cloud' });
  t.after(() => pool.end());
  const prefix = `gh345_api_${Date.now()}`;
  const venue = `${prefix}_park`;
  const actor = { actorId: `${prefix}_sara`, staffIdentityId: `${prefix}_sara`, displayName: 'Sara', venueId: venue,
    environment: 'dev', role: 'staff_operator', permissions: ['staff:sessions:read', 'staff:sessions:redeem'] };
  const provider = { bookings: new Map(), calls: 0, fault: null, databaseFault: null, denied: false, statements: 0 };
  const env = { JUMPYARD_ENVIRONMENT: 'dev', JUMPYARD_EMERGENCY_STOP: 'false', ENABLE_ROLLER_REDEEM_WRITES: 'true' };
  const field = (value) => value == null ? { isNull: true } : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? { longValue: value } : { stringValue: typeof value === 'object' ? JSON.stringify(value) : String(value) };
  async function executeStatement(query, parameters = []) {
    provider.statements += 1;
    const values = parameters.map((parameter) => parameter.value?.isNull ? null : Object.values(parameter.value)[0]);
    const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
    const text = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
    const completion = query.includes('jumpyard.change_staff_handout(') && values[indexes.get('action') - 1] === 'complete';
    if (completion && provider.databaseFault === 'before-commit') { provider.databaseFault = null; throw new Error('Synthetic database disconnect before receipt'); }
    const client = await pool.connect();
    try {
      await client.query('SET ROLE jumpyard_redeem_runtime');
      const result = await client.query({ text, values, rowMode: 'array' });
      if (completion && provider.databaseFault === 'after-commit') { provider.databaseFault = null; throw new Error('Synthetic response loss after receipt'); }
      return { records: result.rows.map((row) => row.map(field)), columnMetadata: result.fields.map((column) => ({ name: column.name })), numberOfRecordsUpdated: result.rowCount };
    } finally { await client.query('RESET ROLE'); client.release(); }
  }
  const module = { exports: {} };
  const directory = path.join(root, 'infra/lambda/redeem');
  const fakeAws = new Proxy({}, { get: () => class { async send() { throw new Error('AWS is forbidden in this test'); } } });
  const context = vm.createContext({ module, exports: module.exports, Buffer, URL, URLSearchParams, console: { error() {}, warn() {}, log() {} },
    process: { env }, setTimeout, clearTimeout, __db: executeStatement, __actor: actor, __provider: provider,
    fetch: async () => { throw new Error('Network is forbidden in this test'); },
    require: (name) => name.startsWith('@aws-sdk/') ? fakeAws : name.startsWith('./') ? require(path.join(directory, name)) : require(name),
  });
  vm.runInContext(fs.readFileSync(path.join(directory, 'index.js'), 'utf8') + `
    executeStatement = __db;
    authorizeStaffRedeemRequest = async () => __provider.denied
      ? { ok:false, statusCode:403, code:'staff_permission_denied' } : { ok:true, staff:__actor };
    getRollerConfig = async () => ({ env:'playground' });
    getRollerAccessToken = async () => ({ accessToken:'synthetic' });
    getProductCatalogBestEffort = async () => ({ byId:new Map() });
    getBookingDetail = async (config, token, id) => ({ ok:true, status:200, body:__provider.bookings.get(id) });
    redeemRollerTickets = async (config, token, tickets) => {
      __provider.calls += 1;
      for (const booking of __provider.bookings.values()) for (const item of booking.items) for (const ticket of item.tickets || []) {
        if (tickets.includes(ticket.ticketId)) ticket.redeemStatus = 'Redeemed';
      }
      if (__provider.fault === 'lost-provider-response') { __provider.fault = null; throw new Error('Synthetic connection lost after ROLLER accepted'); }
      return { ok:true, status:200, body:{} };
    };
    module.exports.seedBooking = async (booking) => upsertLiveBooking(normalizeBooking(booking,{byId:new Map()}),'playground');
  `, context, { filename: 'redeem-native-integration.js' });

  async function seed(suffix) {
    const bookingId = `${prefix}_${suffix}`;
    const tickets = Array.from({ length: 3 }, (_, n) => `${bookingId}_ticket${n}`);
    const booking = { uniqueId: bookingId, bookingReference: `${bookingId}_ref`, status: 'Confirmed', paymentStatus: 'Paid',
      amountOwing: 0, total: 1000, venueId: venue, items: [
        { bookingItemId: `${bookingId}_bands`, productId: 900001, productName: 'Entry', productType: 'standardPass', quantity: 3,
          bookingDate: day, startTime: '10:00', endTime: '11:00', tickets: tickets.map((ticketId) => ({ ticketId, redeemStatus: 'Unredeemed' })) },
        { bookingItemId: `${bookingId}_coffee`, productId: 900002, productName: 'Kaffe', productType: 'food', quantity: 2, bookingDate: day, tickets: [] },
      ] };
    provider.bookings.set(bookingId, booking);
    await module.exports.seedBooking(booking);
    const sessionId = `${bookingId}_session`;
    await pool.query(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id,roller_unique_id,booking_reference,visit_date,expires_at,selected_ticket_ids)
      VALUES ($1,$2,$3,$4,now()+interval '2 hours',$5)`, [sessionId,bookingId,booking.bookingReference,day,JSON.stringify(tickets)]);
    await pool.query(`SELECT * FROM jumpyard.ready_staff_session($1,'completed')`, [sessionId]);
    return { sessionId, bookingId, bands: `${bookingId}:${bookingId}_bands:${day}:purchased`, coffee: `${bookingId}:${bookingId}_coffee:${day}:purchased` };
  }
  async function request(fixture, body) {
    const response = await module.exports.handler({ routeKey: 'POST /v1/staff/check-in/sessions/{checkinSessionId}/handout',
      rawPath: `/v1/staff/check-in/sessions/${fixture.sessionId}/handout`, pathParameters: { checkinSessionId: fixture.sessionId },
      requestContext: { http: { method: 'POST' } }, body: JSON.stringify(body), headers: {} });
    return { status: response.statusCode, body: JSON.parse(response.body) };
  }
  const selectBands = (fixture) => request(fixture, { area:'entrance', action:'select', revision:0, selection:[{id:fixture.bands,quantity:3}] });

  await t.test('Permission, emergency stop, park and malformed input fail before a collection mutation', async () => {
    const fixture = await seed('gates');
    provider.denied = true;
    assert.equal((await selectBands(fixture)).status, 403);
    provider.denied = false;
    env.JUMPYARD_EMERGENCY_STOP = 'true';
    assert.equal((await selectBands(fixture)).body.error.code, 'emergency_stop_active');
    env.JUMPYARD_EMERGENCY_STOP = 'false';
    actor.venueId = 'wrong-park';
    assert.equal((await selectBands(fixture)).status, 404);
    actor.venueId = venue;
    assert.equal((await request(fixture, null)).status, 400);
    assert.equal((await request(fixture, { area:'entrance', action:'select', revision:0, selection:[{id:fixture.bands,quantity:-1}] })).status, 400);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM jumpyard.staff_handout_claims WHERE checkin_session_id=$1', [fixture.sessionId])).rows[0].count, 0);
  });
  await t.test('Lost ROLLER OK resumes from its ticket state, with one admission and one physical receipt', async () => {
    const fixture = await seed('provider-recovery');
    const selected = await selectBands(fixture);
    assert.equal(selected.status, 200, JSON.stringify(selected.body));
    provider.fault = 'lost-provider-response';
    const confirmation = { area:'entrance', action:'confirm', revision:selected.body.handout.claims[0].revision };
    assert.equal((await request(fixture, confirmation)).status, 500);
    assert.equal(provider.calls, 1);
    await pool.query(`UPDATE jumpyard.idempotency_records SET updated_at=now()-interval '31 seconds' WHERE idempotency_key=$1`, [`staff-redeem:${fixture.sessionId}`]);
    const recovered = await request(fixture, confirmation);
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    assert.equal(recovered.body.session.status, 'redeemed');
    assert.equal(recovered.body.handout.receipts.length, 1);
    assert.equal(provider.calls, 1);
    assert.equal((await request(fixture, confirmation)).body.handout.receipts.length, 1);
    const cafeSelect = await request(fixture, {area:'cafe',action:'select',revision:0,selection:[{id:fixture.coffee,quantity:1}]});
    const cafe = await request(fixture, {area:'cafe',action:'confirm',revision:cafeSelect.body.handout.claims.find((claim)=>claim.area==='cafe').revision});
    assert.equal(cafe.status, 200, JSON.stringify(cafe.body));
    assert.equal(cafe.body.handout.items.find((item)=>item.kind==='coffee').available, 1);
    assert.equal(provider.calls, 1, 'café must never call admission again');
  });
  for (const fault of ['before-commit','after-commit']) await t.test(`Receipt disconnect ${fault} is resumed without a second ROLLER write`, async () => {
    const fixture = await seed(fault);
    const selected = await selectBands(fixture);
    const confirmation = {area:'entrance',action:'confirm',revision:selected.body.handout.claims[0].revision};
    provider.databaseFault = fault;
    const priorCalls = provider.calls;
    assert.equal((await request(fixture, confirmation)).status, 500);
    const retried = await request(fixture, confirmation);
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    assert.equal(retried.body.handout.receipts.length, 1);
    assert.equal(provider.calls, priorCalls + 1);
  });

  await t.test('Ready guests collect one coffee before entrance; retry never redeems bands or collects twice', async () => {
    const fixture = await seed('cafe-before-entrance');
    const before = provider.calls;
    const selected = await request(fixture, {area:'cafe',action:'select',revision:0,selection:[{id:fixture.coffee,quantity:1}]});
    assert.equal(selected.status, 200, JSON.stringify(selected.body));
    const confirmation = {area:'cafe',action:'confirm',revision:selected.body.handout.claims.find((claim)=>claim.area==='cafe').revision};
    provider.databaseFault = 'after-commit';
    assert.equal((await request(fixture, confirmation)).status, 500);
    const coffee = await request(fixture, confirmation);
    assert.equal(coffee.status, 200, JSON.stringify(coffee.body));
    assert.equal(coffee.body.handout.receipts.length, 1);
    assert.equal(coffee.body.handout.receipts[0].area, 'cafe');
    assert.equal(coffee.body.handout.items.find((item)=>item.kind==='coffee').available, 1);
    assert.equal(coffee.body.handout.items.find((item)=>item.kind==='admission').collected, 0);
    assert.equal(coffee.body.session.status, 'ready_for_staff');
    assert.equal(provider.calls, before, 'coffee must not redeem admission');
    assert.equal((await pool.query('SELECT completed_at FROM jumpyard.checkin_sessions WHERE checkin_session_id=$1', [fixture.sessionId])).rows[0].completed_at, null);
    const bands = await selectBands(fixture);
    assert.equal(bands.status, 200, JSON.stringify(bands.body));
    const entrance = await request(fixture, {area:'entrance',action:'confirm',revision:bands.body.handout.claims.find((claim)=>claim.area==='entrance').revision});
    assert.equal(entrance.status, 200, JSON.stringify(entrance.body));
    assert.equal(entrance.body.session.status, 'redeemed');
    assert.equal(entrance.body.handout.items.find((item)=>item.kind==='coffee').available, 1);
    assert.equal(entrance.body.handout.receipts.length, 2);
    assert.equal(provider.calls, before + 1);
  });

  await t.test('Early café keeps safety, readiness, expiry, payment and counter boundaries', async () => {
    const fixture = await seed('cafe-guards');
    const before = provider.calls;
    const coffee = () => request(fixture, {area:'cafe',action:'select',revision:0,selection:[{id:fixture.coffee,quantity:1}]});
    for (const [column, value, code] of [
      ['safety_status','not_started','safety_not_completed'],
      ['status','guest_in_progress','session_not_ready_for_staff'],
      ['expires_at','2000-01-01T00:00:00Z','session_not_ready_for_staff'],
    ]) {
      const saved = (await pool.query(`SELECT ${column} FROM jumpyard.checkin_sessions WHERE checkin_session_id=$1`, [fixture.sessionId])).rows[0][column];
      await pool.query(`UPDATE jumpyard.checkin_sessions SET ${column}=$2 WHERE checkin_session_id=$1`, [fixture.sessionId,value]);
      assert.equal((await coffee()).body.error.code, code);
      await pool.query(`UPDATE jumpyard.checkin_sessions SET ${column}=$2 WHERE checkin_session_id=$1`, [fixture.sessionId,saved]);
    }
    await pool.query("UPDATE jumpyard.roller_bookings SET payment_status='Unpaid' WHERE roller_unique_id=$1", [fixture.bookingId]);
    assert.notEqual((await coffee()).status, 200);
    await pool.query("UPDATE jumpyard.roller_bookings SET payment_status='Paid' WHERE roller_unique_id=$1", [fixture.bookingId]);
    assert.equal((await request(fixture, {area:'entrance',action:'select',revision:0,selection:[{id:fixture.coffee,quantity:1}]})).body.error.code, 'invalid_selection');
    assert.equal((await request(fixture, {area:'cafe',action:'select',revision:0,selection:[{id:fixture.bands,quantity:3}]})).body.error.code, 'invalid_selection');
    assert.equal(provider.calls, before);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM jumpyard.staff_handout_operations WHERE checkin_session_id=$1', [fixture.sessionId])).rows[0].n, 0);
  });

  await t.test('GH-572: a pre-booked group keeps its name on the staff board after the check-in refresh', async () => {
    const { createStaffBoard } = require('../infra/lambda/session/staff-board');
    const board = createStaffBoard({ mapSession: (row) => row, mappedRows: (rows) => rows,
      stringParameter: (name, value) => ({ name, value }),
      executeStatement: async (query, parameters) => {
        const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
        const text = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
        const client = await pool.connect();
        try {
          await client.query('SET ROLE jumpyard_session_runtime');
          return (await client.query(text, parameters.map((parameter) => parameter.value))).rows;
        } finally { await client.query('RESET ROLE'); client.release(); }
      } });
    const summary = async (fixture) => (await pool.query('SELECT normalized_summary FROM jumpyard.roller_bookings WHERE roller_unique_id=$1',
      [fixture.bookingId])).rows[0].normalized_summary;
    const guestName = async (fixture) => (await board.list({ venueId: venue, day, search: null, cursor: null,
      bookingId: fixture.bookingId })).sessions[0].guest_name;
    const checkIn = async (fixture) => {
      const selected = await selectBands(fixture);
      const confirmed = await request(fixture, { area:'entrance', action:'confirm', revision:selected.body.handout.claims[0].revision });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    };
    const guest = async (customerId, firstName, lastName) => pool.query(`INSERT INTO jumpyard.guest_profiles
      (guest_profile_id, roller_customer_id, latest_booking_context) VALUES ($1, $2, $3)`,
      [`roller_customer:${customerId}`, customerId, JSON.stringify({ firstName, lastName })]);

    // A web-shop booking as the webhook and the nightly sync leave it: the owner is on the booking, never on its tickets.
    const kept = await seed('owner-kept');
    await guest(`${prefix}_owner_kept`, 'Anna', 'Andersson');
    await pool.query('UPDATE jumpyard.roller_bookings SET normalized_summary=$2 WHERE roller_unique_id=$1',
      [kept.bookingId, JSON.stringify({ bookingCustomerId: `${prefix}_owner_kept`, itemCount: 2, source: 'roller_bookingitems_data_sync' })]);
    assert.equal(await guestName(kept), 'Anna Andersson');
    await checkIn(kept);
    assert.equal((await summary(kept)).source, 'roller_redeem_final_refresh');
    assert.equal((await summary(kept)).bookingCustomerId, `${prefix}_owner_kept`, 'a refresh without the owner keeps the stored one');
    assert.equal(await guestName(kept), 'Anna Andersson');

    // ROLLER's live owner is written when the row has none.
    const set = await seed('owner-set');
    await guest(`${prefix}_owner_set`, 'Bo', 'Berg');
    assert.equal(await guestName(set), null);
    provider.bookings.get(set.bookingId).customerId = `${prefix}_owner_set`;
    await checkIn(set);
    assert.equal((await summary(set)).bookingCustomerId, `${prefix}_owner_set`);
    assert.equal(await guestName(set), 'Bo Berg');
  });

  await t.test('GH-582: a kiosk group keeps its goods until its tickets are attached, and a press from that minute counts after', async () => {
    // Group 0007 on 2026-10-18: the webhook stored ROLLER's paid booking, items and tickets at 09:52:22 and confirmed
    // the draft, but the session got the booking's tickets only on the webhook's retry at 09:53:26.
    const asRole = (role) => async (query, parameters = []) => {
      const indexes = new Map(parameters.map((parameter, index) => [parameter.name, index + 1]));
      const text = query.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g, (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
      const values = parameters.map((parameter) => parameter.value?.isNull ? null : parameter.value && typeof parameter.value === 'object'
        ? Object.values(parameter.value)[0] : parameter.value);
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${role}`);
        return await client.query({ text, values, rowMode: 'array' });
      } finally { await client.query('RESET ROLE'); client.release(); }
    };
    const session = asRole('jumpyard_session_runtime');
    const { createStaffBoard } = require('../infra/lambda/session/staff-board');
    const board = createStaffBoard({ mapSession: (row) => row, stringParameter: (name, value) => ({ name, value }),
      mappedRows: (result) => result.rows.map((row) => Object.fromEntries(result.fields.map((column, index) => [column.name, row[index]]))),
      executeStatement: session });
    const sessionModule = { exports: {} };
    const sessionDirectory = path.join(root, 'infra/lambda/session');
    vm.runInContext(fs.readFileSync(path.join(sessionDirectory, 'index.js'), 'utf8') + `
      executeStatement = async (query, parameters) => { const result = await __session(query, parameters);
        return { records: result.rows.map((row) => row.map(__field)), columnMetadata: result.fields.map((column) => ({ name: column.name })) }; };
      authorizeStaffRequest = async () => ({ ok:true, staff:__actor });
      module.exports.detail = handleStaffSessionDetail;
    `, vm.createContext({ module: sessionModule, exports: sessionModule.exports, Buffer, URL, URLSearchParams, Intl,
      console: { error() {}, warn() {}, log() {}, info() {} }, process: { env: {} }, setTimeout, clearTimeout,
      __session: session, __field: field, __actor: actor,
      require: (name) => name.startsWith('@aws-sdk/') ? fakeAws : name.startsWith('./') ? require(path.join(sessionDirectory, name)) : require(name),
    }), { filename: 'session-native-integration.js' });
    const bookingId = `${prefix}_kiosk_gap`;
    const sessionId = `${bookingId}_session`;
    const draftId = `${prefix}_draft`;
    const tickets = [0, 1, 2].map((n) => `${bookingId}_ticket${n}`);
    const booking = { uniqueId: bookingId, bookingReference: `${bookingId}_ref`, status: 'Confirmed', paymentStatus: 'Paid',
      amountOwing: 0, total: 1000, venueId: venue, items: [
        { bookingItemId: `${bookingId}_bands`, productId: 900001, productName: 'Entry', productType: 'standardPass', quantity: 3,
          bookingDate: day, startTime: '10:00', endTime: '11:00', tickets: tickets.map((ticketId) => ({ ticketId, redeemStatus: 'Unredeemed' })) },
        { bookingItemId: `${bookingId}_coffee`, productId: 900002, productName: 'Kaffe', productType: 'food', quantity: 2, bookingDate: day, tickets: [] },
      ] };
    provider.bookings.set(bookingId, booking);
    await module.exports.seedBooking(booking);
    // The kiosk's paid draft, in Cloud's own product types, and the session the approval started: no tickets yet.
    await pool.query(`INSERT INTO jumpyard.prepayment_booking_drafts (prepayment_draft_id, roller_draft_unique_id, external_id,
      idempotency_key, status, roller_env, booking_date, start_time, total_cents, amount_owing_cents, currency, item_count, items_summary,
      flow_type, payment_channel, payment_attempt_id, payment_attempt_status, booking_confirmation_status)
      VALUES ($1, $2, $3, $4, 'published', 'playground', $5, '10:00', 100000, 0, 'SEK', 2, $6, 'new_booking', 'card_present', $7,
        'reconciled', 'confirmed')`, [draftId, bookingId, `${prefix}_external`, `${prefix}_draft_key`, day, JSON.stringify([
      { productId: '900001', productName: 'Entry', productType: 'entry', quantity: 3, bookingDate: day, startTime: '10:00', endTime: '11:00' },
      { productId: '900002', productName: 'Kaffe', productType: 'addon', quantity: 2, bookingDate: day, startTime: '10:00' },
    ]), `${prefix}_attempt`]);
    await pool.query(`INSERT INTO jumpyard.checkin_sessions (checkin_session_id, roller_unique_id, booking_reference, visit_date,
      expires_at, selected_ticket_ids, source_lookup_ref, session_summary) VALUES ($1, $2, $2, $3, now() + interval '2 hours', '[]', $4, $5)`,
    [sessionId, bookingId, day, draftId, JSON.stringify({ bookingSyncStatus: 'pending', paymentAttemptId: `${prefix}_attempt`,
      prepaymentDraftId: draftId, source: 'kiosk_terminal_approved' })]);
    await pool.query(`SELECT * FROM jumpyard.ready_staff_session($1,'completed')`, [sessionId]);
    const sync = (status, ticketIds = null) => pool.query(`UPDATE jumpyard.checkin_sessions SET session_summary = session_summary
      || jsonb_build_object('bookingSyncStatus', $2::text), selected_ticket_ids = COALESCE($3::jsonb, selected_ticket_ids)
      WHERE checkin_session_id = $1`, [sessionId, status, ticketIds && JSON.stringify(ticketIds)]);
    const row = async () => (await board.list({ venueId: venue, day, search: null, cursor: null, bookingId })).sessions[0];
    const detail = async () => JSON.parse((await sessionModule.exports.detail({ pathParameters: { checkinSessionId: sessionId },
      rawPath: `/v1/staff/check-in/sessions/${sessionId}`, headers: {} }, 'jy_gh582')).body).session;
    const lines = (found) => found.handout.items.map((item) => [item.kind, item.area, item.productId, item.quantity, item.collected,
      item.provisional === true]);

    // 1. The minute before the tickets are attached: the draft's goods stand in, once, on the board and in the detail.
    const gap = await row();
    assert.equal(gap.booking_sync_status, 'pending');
    assert.equal(gap.counts.admission, 3, 'the bands stay');
    assert.deepEqual([gap.cafeQuantity, gap.cafeRemaining], [2, 2], 'the coffee counts once');
    const gapDetail = await detail();
    assert.deepEqual(lines(gapDetail), [['admission', 'entrance', '900001', 3, 0, true], ['coffee', 'cafe', '900002', 2, 0, true]]);
    assert.equal(gapDetail.counts.admission, 3);
    // The issue's first reading of the minute, a booking row not yet paid, shows the same goods.
    await pool.query("UPDATE jumpyard.roller_bookings SET payment_status='Unpaid', amount_owing_cents=100000 WHERE roller_unique_id=$1", [bookingId]);
    assert.deepEqual([(await row()).counts.admission, (await row()).cafeQuantity], [3, 2]);
    assert.deepEqual(lines(await detail()), lines(gapDetail));
    await pool.query("UPDATE jumpyard.roller_bookings SET payment_status='Paid', amount_owing_cents=0 WHERE roller_unique_id=$1", [bookingId]);
    assert.equal((await request({ sessionId }, { area: 'entrance', action: 'select', revision: 0,
      selection: [{ id: gapDetail.handout.items[0].id, quantity: 3 }] })).body.error.code, 'booking_sync_pending',
    'Cloud takes the press only after the switch; the device keeps it (D0265)');

    // 2. The tickets are attached: ROLLER's lines replace the draft's, with the same counts and band colour.
    await sync('confirmed', tickets);
    const attached = await row();
    assert.equal(attached.counts.admission, 3);
    assert.deepEqual(attached.bandColours, gap.bandColours);
    assert.deepEqual([attached.cafeQuantity, attached.cafeRemaining], [2, 2]);
    assert.deepEqual(lines(await detail()), [['admission', 'entrance', '900001', 3, 0, false], ['coffee', 'cafe', '900002', 2, 0, false]]);

    // 3. The press kept from the gap is confirmed like the staff app does it: bands whole, other goods by kind and product.
    const press = (found, area) => found.handout.items.filter((item) => item.area === area).flatMap((item) => {
      const kept = gapDetail.handout.items.find((line) => line.kind === item.kind && line.productId === item.productId);
      return kept && item.available > 0 ? [{ id: item.id, quantity: item.kind === 'admission' ? item.available : Math.min(item.available, 1) }] : [];
    });
    const confirmPress = async (area) => {
      const selected = await request({ sessionId }, { area, action: 'select', revision: 0, selection: press(await detail(), area) });
      assert.equal(selected.status, 200, JSON.stringify(selected.body));
      const confirmed = await request({ sessionId }, { area, action: 'confirm',
        revision: selected.body.handout.claims.find((claim) => claim.area === area).revision });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    };
    await confirmPress('cafe');
    assert.equal((await row()).cafeRemaining, 1);

    // 4. A later kiosk add-on makes the group pending again with its tickets kept: the draft never stands in again.
    await sync('pending');
    assert.deepEqual([(await row()).counts.admission, (await row()).cafeRemaining], [3, 1]);
    assert.deepEqual(lines(await detail()), [['admission', 'entrance', '900001', 3, 0, false], ['coffee', 'cafe', '900002', 2, 1, false]]);

    // 5. Back to confirmed, the kept band press checks the group in and counts the bands.
    await sync('confirmed');
    await confirmPress('entrance');
    const counted = await detail();
    assert.deepEqual(lines(counted), [['admission', 'entrance', '900001', 3, 3, false], ['coffee', 'cafe', '900002', 2, 1, false]]);
    assert.equal(counted.status, 'redeemed');
  });
});
