import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const instant = Date.parse('2026-09-08T07:40:00Z');
class TestDate extends Date {
  constructor(value = instant) { super(value); }
  static now() { return instant; }
}
function load(relative, extra = '') {
  const filename = new URL(relative, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, Date: TestDate, Intl,
    require(id) {
      if (id === 'react') return { ...React, useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}] };
      if (id === 'next/image') return { __esModule: true, default: (props) => React.createElement('img', props) };
      if (id === './flow') return load('../components/staff/flow.ts');
      if (id === './ui') return load('../components/staff/ui.tsx');
      return require(id);
    },
  }, { filename: filename.pathname });
  return loadedModule.exports;
}
const { default: StaffExperience, Detail, ProductRow } = load('../components/staff/StaffExperience.tsx', '\nexport { Detail, ProductRow };');
const { nextPass, stageOf, activeClaim, boardPollDelay } = load('../components/staff/flow.ts');
const { ROUTE_LIMITS, TokenBucket } = require('../../../scripts/validate-t0193-capacity.js');
const { STAFF_BOARD_PAGE_INTERVAL_MS } = load('./adminApi.ts');
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props), predicate);
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return text(tree?.props?.children || '');
}
const band = { id: 'b', area: 'entrance', kind: 'admission', name: 'Besöksband', quantity: 3, collected: 0, available: 3 };
const coffee = { id: 'c', area: 'cafe', kind: 'coffee', name: 'Kaffe', quantity: 2, collected: 0, available: 2 };
function session(overrides = {}) {
  return { checkinSessionId: 's1', status: 'ready_for_staff', handoffStatus: 'ready_for_staff',
    safetyStatus: 'completed', bookingSyncStatus: 'confirmed', visitDate: '2026-09-08',
    guest: { name: 'Testgäst' }, counts: { admission: 3 }, booking: { startTime: '10:00' },
    handout: { items: [band, coffee], claims: [], receipts: [] }, ...overrides };
}
function props(detail, changes = []) {
  return { auth: { staff: { actorId: 'sara', displayName: 'Sara', role: 'staff_operator' } },
    detail, error: '', day: '2026-09-08', sessions: [detail], query: '',
    onHandout: async (request) => { changes.push(request); return true; }, onClose() {} };
}
function buttons(tree) { return nodes(tree, (node) => node.type === 'button'); }

test('Opening a ready guest is read-only; the first product tap selects and claims without an extra button', () => {
  const changes = [];
  const tree = Detail({ props: props(session(), changes), area: 'entrance' });
  assert.equal(changes.length, 0);
  const bandButton = buttons(tree).find((button) => button.props['aria-label'] === 'Besöksband, 3 kvar');
  assert.equal(bandButton.props.disabled, false);
  bandButton.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [{ area: 'entrance', action: 'select', revision: 0, selection: [{ id: 'b', quantity: 3 }] }]);
  assert.ok(!buttons(tree).some((button) => /Jag tar hand om/.test(text(button))));
});

test('Reopened selection is checked; a colleague cannot edit or confirm it', () => {
  const claim = { area: 'entrance', actorId: 'sara', actorName: 'Sara', expiresAt: '2026-09-08T07:42:00Z', revision: 4, selection: [{ id: 'b', quantity: 3 }] };
  const detail = session({ handout: { items: [band], claims: [claim], receipts: [] } });
  let tree = Detail({ props: props(detail), area: 'entrance' });
  assert.equal(buttons(tree).find((button) => button.props['aria-label'] === 'Besöksband, 3 kvar').props['aria-pressed'], true);
  assert.equal(buttons(tree).find((button) => text(button) === 'Checka in').props.disabled, false);
  const colleague = props(detail); colleague.auth.staff.actorId = 'maja';
  tree = Detail({ props: colleague, area: 'entrance' });
  assert.ok(buttons(tree).filter((button) => button.props['aria-label'] === 'Besöksband, 3 kvar' || text(button) === 'Lämna ut').every((button) => button.props.disabled));
  assert.match(text(tree), /Sara hjälper gästen/);
});

test('Café requires admission, allows partial quantities, and excludes already collected coffee', () => {
  let tree = Detail({ props: props(session()), area: 'cafe' });
  assert.equal(buttons(tree).find((button) => button.props['aria-label'] === 'Kaffe, 2 kvar').props.disabled, true);
  tree = Detail({ props: props(session({ status: 'redeemed', handoffStatus: 'completed', checkedInBy: { displayName: 'Sara' } })), area: 'cafe' });
  assert.equal(buttons(tree).find((button) => button.props['aria-label'] === 'Kaffe, 2 kvar').props.disabled, false);
  assert.equal(nodes(tree, (node) => node.type === 'details')[0].props.open, false);
  assert.match(text(tree), /Sara/);
  let selected;
  tree = ProductRow({ item: coffee, quantity: 2, disabled: false, onQuantity: (value) => { selected = value; } });
  buttons(tree).find((button) => button.props['aria-label'] === 'Minska Kaffe').props.onClick();
  assert.equal(selected, 1);
  tree = ProductRow({ item: { ...coffee, collected: 1, available: 1 }, quantity: 0, disabled: false, onQuantity: (value) => { selected = value; } });
  buttons(tree)[0].props.onClick();
  assert.equal(selected, 1);
});

test('Pending confirmation offers the same operation, and explicit recovery opens its own session', () => {
  const changes = [];
  const detail = session({ handout: { items: [band], receipts: [], claims: [{ actorId: 'sara', area: 'entrance', revision: 8, selection: [{ id: 'b', quantity: 3 }], pendingOperation: 'saved-operation' }] } });
  const tree = Detail({ props: props(detail, changes), area: 'entrance' });
  assert.ok(buttons(tree).find((button) => button.props['aria-label'] === 'Besöksband, 3 kvar').props.disabled);
  buttons(tree).find((button) => text(button) === 'Fortsätt bekräfta').props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(changes)), [{ area: 'entrance', action: 'confirm', revision: 8 }]);
  const recovery = props(detail); let opened; let area;
  recovery.recoveryTarget = { checkinSessionId: 'previous-session', area: 'cafe' };
  recovery.onOpen = (id) => { opened = id; };
  const retry = Detail({ props: recovery, area: 'entrance', onArea: (value) => { area = value; } });
  buttons(retry).find((button) => text(button) === 'Öppna pågående utlämning').props.onClick();
  assert.equal(opened, 'previous-session'); assert.equal(area, 'cafe');
});

test('At 09:40 the default is the next actual 10:00 pass; safety and synchronization do not count as ready', () => {
  const rows = [session({ booking: { startTime: '09:30' } }), session(), session({ booking: { startTime: '10:30' } })];
  assert.equal(nextPass(rows), '10:00');
  assert.equal(stageOf(session({ safetyStatus: 'not_started' })), 'started');
  assert.equal(stageOf(session({ bookingSyncStatus: 'pending' })), 'started');
  assert.equal(stageOf(session({ status: 'upcoming' })), 'upcoming');
  assert.equal(activeClaim([{ area: 'cafe', actorId: 'maja', expiresAt: '2026-09-08T07:39:00Z' }], 'cafe'), null);
  const tree = StaffExperience({ ...props(session()), sessions: rows });
  assert.ok(buttons(tree).some((button) => text(button).startsWith('Redo')));
  assert.match(text(tree), /Nästa pass · 10:00/);
});

test('Five staff phones polling large days and confirming guests fit the shared route budgets', () => {
  for (const bookings of [205, 500, 3000, 5000]) {
    const events = [];
    const pages = Math.ceil(bookings / 100);
    const delay = boardPollDelay(bookings);
    for (let phone = 0; phone < 5; phone += 1) {
      // Every phone starts together. Use the client's minimum page spacing,
      // zero network latency and no cached preflights.
      for (let start = 0; start < 60_000; start += delay + (pages - 1) * STAFF_BOARD_PAGE_INTERVAL_MS) {
        for (let page = 0; page < pages; page += 1) {
          events.push({ at: start + page * STAFF_BOARD_PAGE_INTERVAL_MS, route: 'staff_list' });
        }
      }
      for (let at = 0; at < 60_000; at += 2_000) events.push({ at, route: 'staff_detail' });
      // Two selections and one confirmation per guest, every ten seconds.
      for (let start = 0; start < 60_000; start += 10_000) {
        for (const offset of [0, 1000, 2000]) events.push({ at: start + offset, route: 'staff_handout' });
      }
    }
    const withPreflights = events.flatMap((event) => [event, { ...event, route: 'OPTIONS' }]);
    const buckets = new Map();
    for (const { at, route } of withPreflights.sort((a, b) => a.at - b.at)) {
      if (!buckets.has(route)) buckets.set(route, new TokenBucket(ROUTE_LIMITS[route]));
      assert.ok(buckets.get(route).take(at), `${bookings} bookings: ${route} throttled at ${at}ms`);
    }
  }
});
