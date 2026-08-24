const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sessionPath = path.join(root, 'infra', 'lambda', 'session', 'index.js');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const phonePageSource = fs.readFileSync(path.join(root, 'jumpyard-checkin-phone', 'src', 'app', 'page.tsx'), 'utf8');
const phoneClientSource = fs.readFileSync(path.join(root, 'jumpyard-checkin-phone', 'src', 'flow', 'cloudClient.ts'), 'utf8');
const contractSource = fs.readFileSync(path.join(root, 'JUMPYARD_CLOUD_CONTRACT.md'), 'utf8');
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

function fakeAwsModule(send) {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }

  class FakeClient {
    send(command) {
      return send(command.input);
    }
  }

  return new Proxy({}, {
    get(_target, property) {
      return String(property).endsWith('Client') ? FakeClient : FakeCommand;
    },
  });
}

function loadSessionInternals(names, send = async () => rdsResult([])) {
  const module = { exports: {} };
  const localDirectory = path.dirname(sessionPath);
  const sandbox = {
    Buffer,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: async () => {
      throw new Error('Unexpected network call during GH-305 validation.');
    },
    module,
    process: {
      env: {
        DATABASE_CLUSTER_ARN: 'arn:aws:rds:eu-north-1:000000000000:cluster:synthetic',
        DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:eu-north-1:000000000000:secret:synthetic',
      },
    },
    require(moduleId) {
      if (moduleId === 'crypto' || moduleId === 'node:crypto') return crypto;
      if (moduleId.startsWith('@aws-sdk/')) return fakeAwsModule(send);
      if (moduleId.startsWith('./')) return require(path.join(localDirectory, moduleId));
      throw new Error(`Unexpected require(${JSON.stringify(moduleId)}) during GH-305 validation.`);
    },
    setTimeout,
  };

  vm.runInNewContext(
    `${sessionSource}\nmodule.exports.__gh305 = { ${names.join(', ')} };`,
    sandbox,
    { filename: sessionPath },
  );
  return module.exports.__gh305;
}

function rdsResult(rows) {
  if (rows.length === 0) return { columnMetadata: [], records: [] };
  const columns = Object.keys(rows[0]);
  return {
    columnMetadata: columns.map((name) => ({ name })),
    records: rows.map((row) => columns.map((name) => {
      const value = row[name];
      if (value === null || value === undefined) return { isNull: true };
      if (typeof value === 'number') return { longValue: value };
      if (typeof value === 'boolean') return { booleanValue: value };
      return { stringValue: String(value) };
    })),
  };
}

function sessionRow(overrides = {}) {
  return {
    booking_reference: 'synthetic-booking',
    checkin_session_id: 'synthetic-session',
    completed_at: null,
    created_at: '2026-08-24T08:00:00.000Z',
    expires_at: '2026-08-24T12:00:00.000Z',
    guest_resume_step: 'safety',
    handoff_code: null,
    handoff_status: 'not_ready',
    ready_for_staff_at: null,
    roller_unique_id: 'synthetic-roller-id',
    safety_status: 'not_started',
    selected_ticket_ids: JSON.stringify(['synthetic-ticket']),
    status: 'guest_in_progress',
    updated_at: '2026-08-24T08:00:00.000Z',
    visit_date: '2026-08-24',
    ...overrides,
  };
}

async function validateBoundedRequestContract() {
  const { normalizeStartRequest, validateStartRequest } = loadSessionInternals([
    'normalizeStartRequest',
    'validateStartRequest',
  ]);
  const event = { headers: {} };
  const base = {
    bookingReference: 'synthetic-booking',
    idempotencyKey: 'synthetic-key',
  };

  const safe = normalizeStartRequest(event, { ...base, guestResumeStep: 'safety' });
  assert.equal(safe.guestResumeStep, 'safety');
  assert.equal(validateStartRequest(safe), null);

  const arbitrary = normalizeStartRequest(event, { ...base, guestResumeStep: 'APP_PAYMENT' });
  assert.equal(arbitrary.guestResumeStep, null);
  assert.deepEqual(JSON.parse(JSON.stringify(validateStartRequest(arbitrary))), {
    code: 'guest_resume_step_invalid',
    message: 'guestResumeStep must be safety when provided.',
  });

  const absent = normalizeStartRequest(event, base);
  assert.equal(absent.guestResumeStepProvided, false);
  assert.equal(validateStartRequest(absent), null);
}

async function validateMonotonicSessionUpdate() {
  const calls = [];
  const { markGuestResumeStep } = loadSessionInternals(
    ['markGuestResumeStep'],
    async (input) => {
      calls.push(input);
      return rdsResult([sessionRow()]);
    },
  );

  const updated = JSON.parse(JSON.stringify(
    await markGuestResumeStep('synthetic-session', 'safety'),
  ));
  assert.equal(updated.guestResumeStep, 'safety');
  assert.equal(updated.status, 'guest_in_progress');
  assert.equal(updated.safetyStatus, 'not_started');
  assert.equal(updated.handoffStatus, 'not_ready');

  const sql = calls[0].sql;
  assert.match(sql, /jsonb_build_object\('guestResumeStep', :guestResumeStep\)/);
  assert.match(sql, /status = 'guest_in_progress'/);
  assert.match(sql, /expires_at > now\(\)/);
  assert.doesNotMatch(sql, /status = 'ready_for_staff'/);
  assert.doesNotMatch(sql, /safety_status\s*=/);
  assert.doesNotMatch(sql, /handoff_status\s*=/);
}

async function main() {
  await validateBoundedRequestContract();
  await validateMonotonicSessionUpdate();

  assert.match(sessionSource, /const resumedSession = request\.guestResumeStep[\s\S]*markGuestResumeStep/);
  assert.match(sessionSource, /guestResumeStep: request\.guestResumeStep/);
  assert.match(sessionSource, /session_summary ->> 'guestResumeStep' AS guest_resume_step/);
  assert.match(phoneClientSource, /startCheckInSession\([\s\S]*guestResumeStep\?: 'safety'/);
  assert.match(phoneClientSource, /\.\.\.\(guestResumeStep \? \{ guestResumeStep \} : \{\}\)/);
  assert.match(phonePageSource, /startCheckInSession\(booking, 'safety'\)/);
  assert.match(phonePageSource, /session\.guestResumeStep === 'safety'[\s\S]*APP_SAFETY_VIDEO/);
  assert.match(phonePageSource, /state !== 'APP_SAFETY_VIDEO'[\s\S]*startCheckInSession\(ctx\.booking, 'safety'\)/);
  assert.match(contractSource, /guestResumeStep/);
  assert.match(contractSource, /only accepted value is `safety`/);
  assert.match(packageSource, /validate:gh305-cross-device-safety-resume/);

  console.log('GH-305 cross-device safety resume validation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
