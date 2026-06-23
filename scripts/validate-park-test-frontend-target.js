#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const DEV_API = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';
const PARK_TEST_API = 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com';
const DEV_PHONE_ORIGIN = 'https://jumpyard-check-in.pages.dev';
const DEV_ADMIN_ORIGIN = 'https://jumpyard-checkin-admin.pages.dev';
const PARK_TEST_PHONE_ORIGIN = 'https://jumpyard-check-in-park-test.pages.dev';
const PARK_TEST_ADMIN_ORIGIN = 'https://jumpyard-checkin-admin-park-test.pages.dev';

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function readJson(relativePath) {
  const text = read(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function expectIncludes(relativePath, text, expected) {
  if (!text.includes(expected)) {
    fail(`${relativePath} must include ${expected}`);
  }
}

function expectNotIncludes(relativePath, text, blocked) {
  if (text.includes(blocked)) {
    fail(`${relativePath} must not include ${blocked}`);
  }
}

function expectArrayIncludes(relativePath, array, expected) {
  if (!Array.isArray(array) || !array.includes(expected)) {
    fail(`${relativePath} must include ${expected}`);
  }
}

const phoneClient = read('jumpyard-checkin-phone/src/flow/cloudClient.ts');
expectIncludes('jumpyard-checkin-phone/src/flow/cloudClient.ts', phoneClient, DEV_API);
expectIncludes('jumpyard-checkin-phone/src/flow/cloudClient.ts', phoneClient, 'NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL');
expectNotIncludes('jumpyard-checkin-phone/src/flow/cloudClient.ts', phoneClient, PARK_TEST_API);

const adminApi = read('jumpyard-checkin-admin/src/lib/adminApi.ts');
expectIncludes('jumpyard-checkin-admin/src/lib/adminApi.ts', adminApi, DEV_API);
expectIncludes('jumpyard-checkin-admin/src/lib/adminApi.ts', adminApi, 'NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL');
expectNotIncludes('jumpyard-checkin-admin/src/lib/adminApi.ts', adminApi, PARK_TEST_API);

const adminHeaders = read('jumpyard-checkin-admin/public/_headers');
expectIncludes('jumpyard-checkin-admin/public/_headers', adminHeaders, DEV_API);
expectIncludes('jumpyard-checkin-admin/public/_headers', adminHeaders, PARK_TEST_API);

const phoneReadme = read('jumpyard-checkin-phone/README.md');
for (const expected of [DEV_API, PARK_TEST_API, DEV_PHONE_ORIGIN, PARK_TEST_PHONE_ORIGIN, 'jumpyard-check-in-park-test']) {
  expectIncludes('jumpyard-checkin-phone/README.md', phoneReadme, expected);
}

const adminReadme = read('jumpyard-checkin-admin/README.md');
for (const expected of [DEV_API, PARK_TEST_API, DEV_ADMIN_ORIGIN, PARK_TEST_ADMIN_ORIGIN, 'jumpyard-checkin-admin-park-test']) {
  expectIncludes('jumpyard-checkin-admin/README.md', adminReadme, expected);
}

const devConfig = readJson('infra/config/dev.json');
const devOrigins = devConfig?.api?.allowedCorsOrigins;
expectArrayIncludes('infra/config/dev.json', devOrigins, DEV_PHONE_ORIGIN);
expectArrayIncludes('infra/config/dev.json', devOrigins, DEV_ADMIN_ORIGIN);
if (Array.isArray(devOrigins)) {
  if (devOrigins.includes(PARK_TEST_PHONE_ORIGIN) || devOrigins.includes(PARK_TEST_ADMIN_ORIGIN)) {
    fail('infra/config/dev.json must not include park-test Cloudflare origins');
  }
}

const parkTestConfig = readJson('infra/config/park-test.json');
const parkTestOrigins = parkTestConfig?.api?.allowedCorsOrigins;
expectArrayIncludes('infra/config/park-test.json', parkTestOrigins, PARK_TEST_PHONE_ORIGIN);
expectArrayIncludes('infra/config/park-test.json', parkTestOrigins, PARK_TEST_ADMIN_ORIGIN);
if (Array.isArray(parkTestOrigins)) {
  for (const blocked of ['https://park-test.jumpyard.example', 'https://park-test-admin.jumpyard.example']) {
    if (parkTestOrigins.includes(blocked)) {
      fail(`infra/config/park-test.json must replace placeholder origin ${blocked}`);
    }
  }
}

if (parkTestConfig?.bookingTimeSms?.checkinBaseUrl !== `${PARK_TEST_PHONE_ORIGIN}/`) {
  fail('infra/config/park-test.json bookingTimeSms.checkinBaseUrl must point to the park-test phone Pages URL');
}

if (parkTestConfig?.guestEmail?.checkinBaseUrl !== `${PARK_TEST_PHONE_ORIGIN}/`) {
  fail('infra/config/park-test.json guestEmail.checkinBaseUrl must point to the park-test phone Pages URL');
}

const report = read('docs/t0156-park-test-frontend-target.md');
for (const expected of [PARK_TEST_API, PARK_TEST_PHONE_ORIGIN, PARK_TEST_ADMIN_ORIGIN]) {
  expectIncludes('docs/t0156-park-test-frontend-target.md', report, expected);
}

if (failures > 0) {
  console.error(`Park-test frontend target validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Park-test frontend target validation passed.');
