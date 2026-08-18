const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const bookingSource = read('infra', 'lambda', 'booking', 'index.js');
const sessionSource = read('infra', 'lambda', 'session', 'index.js');
const adminSource = read('jumpyard-checkin-admin', 'src', 'app', 'page.tsx');
const adminApiSource = read('jumpyard-checkin-admin', 'src', 'lib', 'adminApi.ts');

assert.match(bookingSource, /buildPrepaymentItemsSummary/);
assert.match(bookingSource, /loadProductDisplayMetadata/);
assert.match(bookingSource, /enrichKioskReadbackItems/);
assert.match(bookingSource, /parent_product_name = EXCLUDED\.parent_product_name/);

assert.match(sessionSource, /authoritativeItems\.length > 0[\s\S]*findProvisionalStaffBookingItems/);
assert.match(sessionSource, /session\.bookingSyncStatus === 'pending'/);
assert.match(sessionSource, /product_catalog_cache AS pc/);
assert.match(sessionSource, /booking\.venue_id = :staffVenueId/);
assert.match(sessionSource, /fulfillment_source: 'provisional'/);

assert.match(adminSource, /window\.setTimeout\([\s\S]*5_000/);
assert.match(adminSource, /document\.visibilityState !== "visible"/);
assert.match(adminSource, /detailRefreshInFlightRef/);
assert.match(adminSource, /detailRefreshPendingRef/);
assert.match(adminSource, /detail\?\.bookingSyncStatus !== "pending"/);
assert.match(adminSource, /Synkar bokningen…/);
assert.doesNotMatch(adminSource, /ROLLER-bokningen och biljetterna synkas fortfarande/);
assert.match(adminSource, /detail\.bookingSyncStatus === "confirmed"/);
assert.match(adminSource, /\["admission", "combo", "entry", "family", "jump", "pass", "ticket"\]/);
assert.doesNotMatch(adminSource, /label: "Övrigt"/);

for (const field of ['durationMinutes', 'parentType', 'productSubType', 'productType', 'summary']) {
  assert.match(adminApiSource, new RegExp(`${field}\\?`));
}

console.log('GH-253 Handoff sync and product validation passed.');
