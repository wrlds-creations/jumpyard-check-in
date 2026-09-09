const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'infra/migrations/0023_lookup_event_log_conflict_key.sql'), 'utf8');
const source = fs.readFileSync(path.join(root, 'infra/lambda/lookup/index.js'), 'utf8');
const names = ['recordPrepaymentDraftPublishedEvent', 'recordBookingLinkPublishedEvent'];

// Exercise the real audit functions without loading AWS clients or calling ROLLER.
function loadAuditFunctions(executeStatement) {
  const functions = names.map((name) => {
    const match = source.match(new RegExp(`async function ${name}\\([\\s\\S]*?(?=\\n(?:async )?function )`));
    assert.ok(match, `Missing lookup audit function: ${name}`);
    return match[0];
  }).join('\n');
  return vm.runInNewContext(`${functions}\n({ ${names.join(', ')} })`, {
    executeStatement,
    stringOrNull: (value) => value == null ? null : String(value),
    stringParameter: (name, value) => ({ name, value }),
    createCorrelationId: randomUUID,
  });
}

const booking = { bookingReference: 'gh403-synthetic-booking', rollerUniqueId: 'gh403-synthetic-unique' };
const draft = { prepayment_draft_id: 'gh403-synthetic-draft', flow_type: 'new_booking' };
const link = { linkId: 'gh403-synthetic-link', originalBookingReference: booking.bookingReference };
const invoke = (audit, index) => index === 0
  ? audit.recordPrepaymentDraftPublishedEvent(booking, draft, 'gh403_native_test')
  : audit.recordBookingLinkPublishedEvent(booking, link, 'gh403_native_test');

test('GH-403 migration expands only the lookup event-ID read permission', () => {
  const sql = migration.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(sql, 'GRANT SELECT (event_id) ON jumpyard.event_log TO jumpyard_lookup_runtime;');
});

test('Both production lookup audit paths retain their duplicate-safe event-ID insert', async () => {
  const calls = [];
  const audit = loadAuditFunctions(async (sql, parameters) => calls.push({ sql, parameters }));
  for (let index = 0; index < names.length; index++) await invoke(audit, index);
  assert.equal(calls.length, 2);
  for (const { sql, parameters } of calls) {
    assert.match(sql, /INSERT INTO jumpyard\.event_log\s*\(/);
    assert.match(sql, /ON CONFLICT \(event_id\) DO NOTHING/);
    assert.ok(parameters.some(({ name }) => name === 'eventId'));
  }
});

// Opt-in is restricted to disposable loopback PostgreSQL: our local instance or
// CI's existing test service. No AWS credentials, remote URL or guest data is used.
test('Native PostgreSQL reproduces the error, fixes both audit paths and preserves restricted access', {
  skip: process.env.GH403_DATABASE_TEST !== 'true',
}, async (t) => {
  const port = Number(process.env.GH403_PGPORT || 55403);
  assert.ok([55403, 55435].includes(port), 'Use only the disposable local/CI database port.');
  const { Client } = require('../infra/node_modules/pg');
  const client = new Client({
    host: '127.0.0.1', port, user: port === 55403 ? 'gh403_test' : 'gh345_test',
    password: '', database: 'jumpyard_cloud', ssl: false, connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const rowCounts = [];
  const audit = loadAuditFunctions(async (sql, parameters) => {
    const indexes = new Map(parameters.map(({ name }, index) => [name, index + 1]));
    const prepared = sql.replace(/(?<!:):([a-zA-Z][a-zA-Z0-9_]*)\b/g,
      (match, name) => indexes.has(name) ? `$${indexes.get(name)}` : match);
    const result = await client.query(prepared, parameters.map(({ value }) => value));
    rowCounts.push(result.rowCount);
  });
  const permissionDenied = async (operation) => {
    await client.query('SAVEPOINT permission_probe');
    try {
      await assert.rejects(operation, (error) => error.code === '42501' && /event_log/.test(error.message));
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT permission_probe');
      await client.query('RELEASE SAVEPOINT permission_probe');
    }
  };
  const privileges = async () => (await client.query(`
    SELECT grantee, column_name, privilege_type FROM information_schema.column_privileges
    WHERE table_schema = 'jumpyard' AND table_name = 'event_log'
    ORDER BY grantee, column_name, privilege_type`)).rows;

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 5000');
    // Recreate the deployed pre-fix state even when CI applied all migrations.
    await client.query('REVOKE SELECT (event_id) ON jumpyard.event_log FROM jumpyard_lookup_runtime');
    const before = await privileges();

    await t.test('Both real audit INSERTs fail with the original missing permission', async () => {
      await client.query('SET LOCAL ROLE jumpyard_lookup_runtime');
      for (let index = 0; index < names.length; index++) {
        await permissionDenied(() => invoke(audit, index));
      }
      await client.query('RESET ROLE');
    });

    await client.query(migration);
    await client.query(migration); // Safe to reapply; existing migration checksums remain untouched.
    await t.test('The only new privilege is lookup SELECT on event_id', async () => {
      const expected = [...before, {
        grantee: 'jumpyard_lookup_runtime', column_name: 'event_id', privilege_type: 'SELECT',
      }];
      const canonical = (rows) => rows.map((row) => JSON.stringify(row)).sort();
      assert.deepEqual(canonical(await privileges()), canonical(expected));
    });

    await t.test('Both production audit paths insert once and ignore duplicate IDs', async () => {
      await client.query('SET LOCAL ROLE jumpyard_lookup_runtime');
      for (let index = 0; index < names.length; index++) {
        await invoke(audit, index);
        await invoke(audit, index);
      }
      assert.deepEqual(rowCounts, [1, 0, 1, 0]);
      await client.query('RESET ROLE');
      const rows = (await client.query(`SELECT event_type, count(*)::int AS count
        FROM jumpyard.event_log WHERE event_id IN ($1, $2) GROUP BY event_type ORDER BY event_type`,
      ['prepayment-draft-published:gh403-synthetic-draft', 'booking-link-published:gh403-synthetic-link'])).rows;
      assert.deepEqual(rows, [
        { event_type: 'booking_link.published', count: 1 },
        { event_type: 'prepayment_draft.published', count: 1 },
      ]);
    });

    await t.test('Event contents, whole-table reads, update and delete remain denied', async () => {
      await client.query('SET LOCAL ROLE jumpyard_lookup_runtime');
      await client.query('SELECT event_id FROM jumpyard.event_log LIMIT 0');
      for (const column of ['event_payload', 'subject_ref', 'summary', 'correlation_id', 'event_type', 'created_at', '*']) {
        await permissionDenied(() => client.query(`SELECT ${column} FROM jumpyard.event_log LIMIT 0`));
      }
      await permissionDenied(() => client.query("UPDATE jumpyard.event_log SET summary = 'gh403' WHERE false"));
      await permissionDenied(() => client.query('DELETE FROM jumpyard.event_log WHERE false'));
    });
  } finally {
    // All synthetic rows and temporary permission changes are rolled back.
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
});
