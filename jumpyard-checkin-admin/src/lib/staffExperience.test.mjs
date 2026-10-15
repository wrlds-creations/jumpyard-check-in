import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
function load(relative, extra = '', { states = [], globals = {} } = {}) {
  const filename = new URL(relative, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, Date: TestDate, Intl, ...globals,
    require(id) {
      if (id === 'react') return { ...React, useState: (initial) => [states.length ? states.shift() : typeof initial === 'function' ? initial() : initial, () => {}] };
      if (id === 'next/image') return { __esModule: true, default: (props) => React.createElement('img', props) };
      if (id === './flow') return load('../components/staff/flow.ts');
      if (id === './ui') return load('../components/staff/ui.tsx');
      return require(id);
    },
  }, { filename: filename.pathname });
  return loadedModule.exports;
}
const panels = '\nexport { Row, EntrancePanel, CafePanel, ProductRow };';
const board = (states = []) => load('../components/staff/StaffExperience.tsx', panels, { states });
const { default: StaffExperience, Row, EntrancePanel, CafePanel, ProductRow } = board();
const { nextPass, stageOf, activeClaim, boardPollDelay, boardTab, checkedInLabel, jumpTime } = load('../components/staff/flow.ts');
const { createSelectionBuffer, mergeHandoutSummary } = load('../components/staff/selection.ts');
const remembered = (globals = {}) => load('../components/staff/remembered.ts', '', { globals });
const { ROUTE_LIMITS, TokenBucket } = require('../../../scripts/validate-t0193-capacity.js');
const { STAFF_BOARD_PAGE_INTERVAL_MS } = load('./adminApi.ts');
const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props), predicate);
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (tree && typeof tree.type === 'function') return text(tree.type(tree.props));
  return text(tree?.props?.children ?? '');
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const band = { id: 'b', area: 'entrance', kind: 'admission', name: 'Besöksband', quantity: 3, collected: 0, available: 3 };
const socks = { id: 'socks', area: 'entrance', kind: 'socks', name: 'JumpSocks', quantity: 4, collected: 0, available: 4 };
const coffee = { id: 'c', area: 'cafe', kind: 'coffee', name: 'Bryggkaffe', quantity: 2, collected: 0, available: 2 };
const automatic = { actorId: 'system:auto-checkin', displayName: 'automatiskt', role: 'system' };
function session(overrides = {}) {
  return { checkinSessionId: 's1', status: 'ready_for_staff', handoffStatus: 'ready_for_staff',
    safetyStatus: 'completed', bookingSyncStatus: 'confirmed', visitDate: '2026-09-08',
    guest: { name: 'Testgäst' }, counts: { admission: 3 }, booking: { startTime: '10:00' },
    handout: { items: [band, coffee], claims: [], receipts: [] }, ...overrides };
}
const admitted = (overrides = {}) => session({ status: 'redeemed', handoffStatus: 'completed', completedAt: '2026-09-08T07:31:00Z',
  checkedInBy: automatic, handoffCode: '0042', ...overrides });
function props(detail, calls = []) {
  return { auth: { staff: { actorId: 'sara', displayName: 'Sara', role: 'staff_operator' } },
    detail, selectedId: detail?.checkinSessionId ?? null, error: '', day: '2026-09-08', sessions: detail ? [detail] : [], query: '',
    onHandout: async (request, options) => { calls.push(options ? { request, options } : { request }); return true; },
    onOpen(id) { calls.push(`open:${id}`); }, onClose() {}, onQuery() {}, onSearch() {}, onRefresh() {}, onLogout() {} };
}
// GH-547: a kiosk group right after payment. ROLLER has not confirmed the purchase, so Cloud lists the
// paid draft's goods (provisional lines) and the session waits with bookingSyncStatus "pending".
const provisional = (line) => ({ ...line, id: `draft:provisional:${line.id}`, provisional: true });
const kioskGroup = (overrides = {}) => session({ checkinSessionId: 'kiosk', handoffCode: '0061', guest: { name: 'Kioskgäst' },
  bookingSyncStatus: 'pending', readyForStaffAt: '2026-09-08T07:38:00Z', completedAt: null, booking: { startTime: '10:00', endTime: null },
  handout: { items: [provisional({ ...band, productId: 'e60' }), provisional({ ...socks, productId: 'socks', quantity: 2, available: 2 }),
    provisional({ ...coffee, productId: 'coffee', quantity: 1, available: 1 })], claims: [], receipts: [] }, ...overrides });
function buttons(tree) { return nodes(tree, (node) => node.type === 'button'); }
const button = (tree, label) => buttons(tree).find((node) => text(node) === label || node.props['aria-label'] === label);
const groups = (tree) => nodes(tree, (node) => node.props?.role === 'group').map((node) => node.props['aria-label']);

test('The entrance has only Kommande and Incheckade; a guest who is done is Incheckad at once', () => {
  const rows = [session({ checkinSessionId: 'started', status: 'guest_in_progress', safetyStatus: 'not_started' }),
    session({ checkinSessionId: 'ready' }), session({ checkinSessionId: 'upcoming', status: 'upcoming' }),
    admitted({ checkinSessionId: 'in' }), kioskGroup()];
  assert.deepEqual(rows.map(boardTab), ['upcoming', 'completed', 'upcoming', 'completed', 'completed']);
  const tree = StaffExperience({ ...props(null), sessions: rows });
  const tabs = buttons(tree).filter((node) => /^(Kommande|Påbörjade|Redo|Incheckade)\d+$/.test(text(node)));
  assert.deepEqual(tabs.map((node) => text(node)), ['Kommande2', 'Incheckade3']);
  assert.deepEqual(tabs.map((node) => Boolean(node.props['aria-pressed'])), [true, false]);
  assert.match(text(tree), /Påbörjad/);
  assert.doesNotMatch(text(tree), /Redo|Bekräftas|Checka in/);
  let switched = false;
  button(StaffExperience({ ...props(null), onLogout() { switched = true; } }), 'Byt personal').props.onClick();
  assert.equal(switched, true);
});

test('GH-547: a kiosk group still pending in ROLLER is under Incheckade with its goods and a Lämna ut', () => {
  const group = kioskGroup({ counts: { admission: 3 }, bandColours: [{ ...require('../../../infra/lambda/shared/band-colours.js')
    .bandColourForAdmission({ startTime: '10:00', durationMinutes: 60 }), quantity: 3 }], cafeQuantity: 1, cafeRemaining: 1 });
  const listed = board(['entrance', 'all', 'completed']).default({ ...props(null), sessions: [group, admitted({ checkinSessionId: 'in' })] });
  const row = text(listed);
  assert.match(row, /Kioskgäst/);
  assert.match(row, /Incheckad 09:38/, 'the time the guest finished on the kiosk');
  assert.match(row, /3 entréer/);
  assert.doesNotMatch(row, /Bekräftas|Redo|Checka in|Behöver personal/);
  // Folded out: the purchase's goods, read-only, and Lämna ut is pressable at once.
  const calls = [];
  const panel = EntrancePanel({ detail: group, summary: group, props: props(group, calls) });
  assert.deepEqual(groups(panel), ['Besöksband, 3 kvar', 'JumpSocks, 2 kvar']);
  assert.match(text(panel), /Caféet: 1 Bryggkaffe/);
  assert.doesNotMatch(text(panel), /bekräftas|Checka in/i);
  const handOut = button(panel, 'Lämna ut');
  assert.equal(handOut.props.disabled, false);
  handOut.props.onClick();
  assert.deepEqual(plain(calls), [{ request: { area: 'entrance', action: 'select', revision: 0,
    selection: [{ id: 'draft:provisional:b', quantity: 3 }, { id: 'draft:provisional:socks', quantity: 2 }] }, options: { confirm: true } }]);
  // The café computer lists it among Kvar att hämta with its coffee.
  const cafe = board(['cafe']).default({ ...props(null), sessions: [group] });
  assert.match(text(nodes(cafe, (node) => node.type === 'section')[0]), /0061.*Kioskgäst.*1 kvar/);
  const cafePanel = CafePanel({ detail: group, props: props(group) });
  assert.deepEqual(groups(cafePanel), ['Bryggkaffe, 1 kvar']);
  assert.equal(button(cafePanel, 'Lämna ut').props.disabled, false);
});

test('No red box and no Checka in: a group Cloud could not check in is Incheckad like the others', () => {
  const failed = session({ checkinSessionId: 'failed', guest: { name: 'Ali Hassan' }, booking: { startTime: '16:00' },
    readyForStaffAt: '2026-09-08T07:20:00Z', autoCheckin: { status: 'needs_staff', reason: 'roller_rejected', attempts: 3 },
    handout: { items: [band, socks], claims: [], receipts: [] } });
  for (const states of [[], ['entrance', 'all', 'completed'], ['entrance', '16:00', 'upcoming']]) {
    const tree = board(states).default({ ...props(null), sessions: [failed, admitted({ checkinSessionId: 'in' })] });
    assert.equal(nodes(tree, (node) => node.type === 'section' && node.props['aria-labelledby'] === 'staff-needs-staff').length, 0);
    assert.doesNotMatch(text(tree), /Behöver personal/);
  }
  const all = board(['entrance', 'all', 'completed']).default({ ...props(null), sessions: [failed, admitted({ checkinSessionId: 'in' })] });
  const tabs = buttons(all).filter((node) => /^(Kommande|Incheckade)\d+$/.test(text(node))).map((node) => text(node));
  assert.deepEqual(tabs, ['Kommande0', 'Incheckade2']);
  assert.match(text(all), /Ali Hassan.*Incheckad 09:20/);
  const open = StaffExperience({ ...props(failed), sessions: [failed] });
  assert.equal(button(open, 'Checka in'), undefined);
  assert.ok(button(EntrancePanel({ detail: failed, props: props(failed) }), 'Lämna ut'));
  const source = read('../components/staff/StaffExperience.tsx');
  assert.doesNotMatch(source, /Behöver personal|staff-needs-staff|onCheckIn|Checka in|Bokningen bekräftas|"Bekräftas"|"Redo"/);
  assert.doesNotMatch(read('../components/staff/flow.ts'), /needsStaff|Bokningen bekräftas fortfarande/);
});

test('An open row stays in the list it was opened from while the guest finishes, then moves when closed', () => {
  const done = session({ checkinSessionId: 'finishing', guest: { name: 'Lisa Holm' }, handout: { items: [band], claims: [], receipts: [] } });
  const open = board(['entrance', 'all', 'upcoming', false, { id: 'finishing', place: 'upcoming' }]).default({ ...props(done), sessions: [done] });
  assert.match(text(open), /Lisa Holm/);
  assert.ok(button(open, 'Lämna ut'));
  const closed = board(['entrance', 'all', 'upcoming', false, { id: 'finishing', place: 'upcoming' }]).default({ ...props(done), selectedId: null, sessions: [done] });
  assert.doesNotMatch(text(closed), /Lisa Holm/);
});

test('The check-in line keeps the time and never says "automatiskt"; a colleague keeps the name', () => {
  assert.equal(checkedInLabel(admitted()), 'Incheckad 09:31');
  assert.equal(checkedInLabel(admitted({ checkedInBy: { actorId: 'maja', displayName: 'Maja' } })), 'Incheckad 09:31 · Maja');
  assert.equal(checkedInLabel(admitted({ checkedInBy: null })), 'Incheckad 09:31');
  // GH-547: the time the guest finished, before and after Cloud checks the group in in ROLLER.
  assert.equal(checkedInLabel(kioskGroup()), 'Incheckad 09:38');
  assert.equal(checkedInLabel(admitted({ readyForStaffAt: '2026-09-08T07:30:00Z' })), 'Incheckad 09:30');
  const row = Row({ session: admitted(), area: 'entrance', props: props(null) });
  assert.match(text(row), /Incheckad 09:31/);
  assert.doesNotMatch(text(row), /automatiskt/);
  const open = board(['entrance', null, 'completed']).default({ ...props(admitted()), sessions: [admitted()] });
  assert.match(text(open), /Incheckad 09:31/);
  assert.doesNotMatch(text(open), /automatiskt/);
});

test('The QR scanner is gone: no button, no camera, no scanner dependency', () => {
  const tree = StaffExperience({ ...props(null), sessions: [session()] });
  assert.equal(buttons(tree).some((node) => /skanna|scanna|qr/i.test(`${text(node)} ${node.props['aria-label'] || ''}`)), false);
  assert.equal(nodes(tree, (node) => node.type === 'video').length, 0);
  assert.ok(nodes(tree, (node) => node.type === 'input' && node.props.placeholder === 'Namn, bokning eller nummer').length);
  const page = read('../app/page.tsx');
  assert.doesNotMatch(page, /zxing|scanner|getUserMedia|Skanna QR|Scanna ny QR|<video/i);
  const manifest = JSON.parse(read('../../package.json'));
  assert.equal(manifest.dependencies['@zxing/browser'], undefined);
  assert.equal(JSON.stringify(JSON.parse(read('../../package-lock.json'))).includes('@zxing'), false);
  assert.match(read('../../public/_headers'), /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/);
});

test('One tap on Lämna ut hands out everything left at the entrance; goods are read-only', () => {
  const calls = [];
  const detail = admitted({ handout: { items: [band, { ...socks, collected: 1, available: 3 }, coffee], claims: [], receipts: [] } });
  const tree = EntrancePanel({ detail, props: props(detail, calls) });
  assert.deepEqual(groups(tree), ['Besöksband, 3 kvar', 'JumpSocks, 3 kvar']);
  assert.equal(nodes(tree, (node) => node.props?.['aria-pressed'] !== undefined).length, 0, 'no ticks or selection at the entrance');
  assert.match(text(tree), /Caféet: 2 Bryggkaffe/);
  button(tree, 'Lämna ut').props.onClick();
  assert.deepEqual(plain(calls), [{ request: { area: 'entrance', action: 'select', revision: 0,
    selection: [{ id: 'b', quantity: 3 }, { id: 'socks', quantity: 3 }] }, options: { confirm: true } }]);
  // Done: a check per line and who handed it out, no button.
  const done = admitted({ handout: { items: [{ ...band, collected: 3, available: 0 }], claims: [],
    receipts: [{ operationId: 'op', area: 'entrance', actorId: 'sara', actorName: 'Sara', completedAt: '2026-09-08T07:35:00Z', items: [] }] } });
  const finished = EntrancePanel({ detail: done, props: props(done) });
  assert.deepEqual(groups(finished), ['Besöksband, utlämnat']);
  assert.equal(button(finished, 'Lämna ut'), undefined);
  assert.match(text(finished), /Utlämnat 09:35 · Sara/);
});

test('Not checked in: Kommande shows the goods without a button; a guest who is done gets Lämna ut', () => {
  for (const [overrides, note] of [[{ status: 'upcoming' }, 'Check-in inte påbörjad'],
    [{ status: 'guest_in_progress', safetyStatus: 'not_started' }, 'Gästen slutför check-in i mobilen eller kiosken'],
    [{ status: 'guest_in_progress', safetyStatus: 'not_started', bookingSyncStatus: 'pending' }, 'Gästen slutför check-in i mobilen eller kiosken']]) {
    const detail = session(overrides);
    const tree = EntrancePanel({ detail, props: props(detail) });
    assert.match(text(tree), new RegExp(note));
    assert.equal(buttons(tree).some((node) => /Lämna ut|Checka in/.test(text(node))), false);
  }
  for (const detail of [session(), session({ bookingSyncStatus: 'pending' }), session({ bookingSyncStatus: 'needs_staff' })]) {
    const calls = [];
    const ready = EntrancePanel({ detail, props: props(detail, calls) });
    assert.equal(button(ready, 'Checka in'), undefined);
    assert.doesNotMatch(text(ready), /bekräftas/i);
    button(ready, 'Lämna ut').props.onClick();
    assert.equal(calls[0].request.action, 'select');
  }
});

test('A colleague, a reader or another day blocks the button; a pending confirmation resumes it', () => {
  const claim = { area: 'entrance', actorId: 'maja', actorName: 'Maja', expiresAt: '2026-09-08T07:42:00Z', revision: 4, selection: [] };
  let detail = admitted({ handout: { items: [band], claims: [claim], receipts: [] } });
  let tree = EntrancePanel({ detail, props: props(detail) });
  assert.equal(button(tree, 'Lämna ut').props.disabled, true);
  assert.match(text(tree), /Maja hjälper gästen/);
  const reader = props(admitted()); reader.auth.staff.role = 'staff_reader';
  tree = EntrancePanel({ detail: admitted(), props: reader });
  assert.equal(button(tree, 'Lämna ut').props.disabled, true);
  assert.match(text(tree), /Du har läsbehörighet/);
  tree = EntrancePanel({ detail: admitted({ visitDate: '2026-09-07' }), props: props(admitted()) });
  assert.equal(button(tree, 'Lämna ut').props.disabled, true);
  const calls = [];
  detail = admitted({ handout: { items: [band], receipts: [], claims: [{ ...claim, actorId: 'sara', actorName: 'Sara', revision: 8, pendingOperation: 'saved' }] } });
  tree = EntrancePanel({ detail, props: props(detail, calls) });
  button(tree, 'Fortsätt bekräfta').props.onClick();
  assert.deepEqual(plain(calls), [{ request: { area: 'entrance', action: 'confirm', revision: 8 } }]);
  const recovery = props(detail); let opened; let area;
  recovery.recoveryTarget = { checkinSessionId: 'previous-session', area: 'cafe' };
  recovery.onOpen = (id) => { opened = id; };
  button(EntrancePanel({ detail, props: recovery, onArea: (value) => { area = value; } }), 'Öppna pågående utlämning').props.onClick();
  assert.equal(opened, 'previous-session'); assert.equal(area, 'cafe');
});

test('Café: quantities start at everything left, minus keeps some for later, Lämna ut confirms the choice', async () => {
  const pizza = { id: 'p', area: 'cafe', kind: 'pizza', name: 'Pizza', quantity: 1, collected: 0, available: 1 };
  const detail = session({ handout: { items: [band, coffee, pizza], claims: [], receipts: [] } });
  let calls = [];
  let tree = CafePanel({ detail, props: props(detail, calls) });
  assert.deepEqual(groups(tree), ['Bryggkaffe, 2 kvar', 'Pizza, 1 kvar'], 'only café goods, even before admission');
  assert.equal(button(tree, 'Minska Bryggkaffe').props.disabled, false);
  assert.equal(button(tree, 'Öka Bryggkaffe').props.disabled, true);
  button(tree, 'Lämna ut').props.onClick();
  await Promise.resolve();
  assert.deepEqual(plain(calls), [{ request: { area: 'cafe', action: 'select', revision: 0,
    selection: [{ id: 'c', quantity: 2 }, { id: 'p', quantity: 1 }] }, options: { confirm: true } }]);
  calls = [];
  tree = load('../components/staff/StaffExperience.tsx', panels, { states: [{ c: 1, p: 0 }] }).CafePanel({ detail, props: props(detail, calls) });
  button(tree, 'Lämna ut').props.onClick();
  await Promise.resolve();
  assert.deepEqual(plain(calls[0].request.selection), [{ id: 'c', quantity: 1 }]);
  for (const notReady of [{ safetyStatus: 'not_started' }, { status: 'guest_in_progress', safetyStatus: 'not_started' }, { status: 'upcoming' }]) {
    tree = CafePanel({ detail: session(notReady), props: props(session(notReady)) });
    assert.equal(button(tree, 'Lämna ut').props.disabled, true);
    assert.equal(button(tree, 'Minska Bryggkaffe').props.disabled, true);
  }
  // GH-547: a guest who is done collects at once, also while ROLLER confirms the purchase.
  tree = CafePanel({ detail: session({ bookingSyncStatus: 'pending' }), props: props(session({ bookingSyncStatus: 'pending' })) });
  assert.equal(button(tree, 'Lämna ut').props.disabled, false);
  assert.equal(button(tree, 'Minska Bryggkaffe').props.disabled, false);
});

test('The café is built for a computer: two wide lists with big numbers, and a toggle on a phone', () => {
  const rows = [admitted({ checkinSessionId: 'waiting', handoffCode: '0031', cafeQuantity: 2, cafeRemaining: 2 }),
    admitted({ checkinSessionId: 'served', handoffCode: '0029', guest: { name: 'Viktor' }, cafeQuantity: 1, cafeRemaining: 0 }),
    session({ checkinSessionId: 'later', status: 'upcoming', cafeQuantity: 2, cafeRemaining: 2 })];
  const tree = board(['cafe']).default({ ...props(null), sessions: rows });
  const sections = nodes(tree, (node) => node.type === 'section');
  assert.deepEqual(sections.map((node) => node.props['aria-label']), ['Kvar att hämta', 'Utlämnat']);
  const columns = nodes(tree, (node) => /lg:grid-cols-\[minmax\(0,1\.6fr\)_minmax\(0,1fr\)\]/.test(node.props?.className || ''));
  assert.equal(columns.length, 1);
  assert.match(text(sections[0]), /0031.*Testgäst.*2 kvar/);
  assert.match(text(sections[0]), /—.*Testgäst/, 'a purchase before check-in is listed too');
  assert.match(text(sections[1]), /0029.*Viktor.*Utlämnat/);
  const number = nodes(sections[0], (node) => node.type === 'span' && node.props.children === '0031')[0];
  assert.match(number.props.className, /text-4xl.*@2xl:text-6xl/);
  assert.ok(nodes(tree, (node) => node.type === 'article' && /@container/.test(node.props.className)).length >= 3);
  const toggle = buttons(tree).filter((node) => /^(Kvar att hämta|Utlämnat) \d+$/.test(text(node)));
  assert.equal(toggle.length, 2);
  assert.ok(nodes(tree, (node) => /lg:hidden/.test(node.props?.className || '') && node.type === 'div').length >= 1);
  assert.equal(nodes(tree, (node) => node.type === 'select').length, 0, 'the café has no pass picker');
});

test('Café search keeps exact candidates and opens each one', () => {
  const first = session({ checkinSessionId: 'first', cafeSession: { checkinSessionId: 'admitted', status: 'redeemed' } });
  const second = session({ checkinSessionId: 'second', cafeSession: first.cafeSession });
  const calls = [];
  const searched = board(['cafe']).default({ ...props(first, calls), selectedId: null, sessions: [first, second], query: '7777' });
  for (const node of buttons(searched).filter((node) => text(node).includes('Testgäst'))) node.props.onClick();
  assert.deepEqual(calls, ['open:first', 'open:second']);
  assert.equal(nodes(searched, (node) => node.type === 'input' && node.props.type === 'date').length, 0);
});

test('Rows and goods label actual admissions and Cloud band colours only', () => {
  for (const count of [1, 2, 0, undefined]) {
    const detail = admitted({ counts: { admission: count, selectedTickets: 6, tickets: 6 } });
    const labels = nodes(Row({ session: detail, area: 'entrance', props: props(null) }), (node) => node.type === 'span').map(text);
    assert.equal(labels.includes(`${count} ${count === 1 ? 'entré' : 'entréer'}`), Boolean(count));
    assert.ok(!labels.some((label) => /6.*(?:entré|gäst)|gäster/.test(label)));
  }
});

// GH-459: band colours come from JumpYard Cloud's scheme; the staff app only shows them.
const { bandColourForAdmission } = require('../../../infra/lambda/shared/band-colours.js');
const cloudBand = (startTime, durationMinutes) => bandColourForAdmission({ startTime, durationMinutes });
const bandChips = (tree) => nodes(tree, (node) => Boolean(node.props?.['data-band-colour']));

test('Entrance rows and the band line show the Cloud band colour; café rows and other goods never do', () => {
  const morkbla = cloudBand('11:30', 90);
  const detail = admitted({ bandColours: [{ ...morkbla, quantity: 3 }],
    handout: { items: [{ ...band, detail: '90 min · Entré 90 min', bandColour: morkbla }, { ...coffee, bandColour: morkbla }], claims: [], receipts: [] } });
  const row = Row({ session: detail, area: 'entrance', props: props(null) });
  assert.deepEqual(bandChips(row).map((chip) => [chip.props['data-band-colour'], text(chip)]), [['morkbla', 'Bandfärg Mörkblå']]);
  assert.equal(nodes(row, (node) => node.props?.style?.background === '#1F3A93').length, 1);
  assert.equal(bandChips(Row({ session: detail, area: 'cafe', props: props(null) })).length, 0);
  const tree = EntrancePanel({ detail, props: props(detail) });
  const line = nodes(tree, (node) => node.props?.role === 'group' && node.props['aria-label'] === 'Besöksband Mörkblå, 3 kvar')[0];
  assert.ok(line, 'the band line names its colour');
  assert.deepEqual(bandChips(line).map(text), ['Bandfärg Mörkblå']);
  assert.ok(text(line).includes('90 min'));
  assert.equal(bandChips(tree).length, 1, 'coffee never shows a band colour');
});

test('Several colours are counted, two-tone bands draw both halves, and nothing shows without a valid colour', () => {
  const mixed = session({ counts: { admission: 3 }, bandColours: [{ ...cloudBand('11:30', 90), quantity: 2 }, { ...cloudBand('11:30', 60), quantity: 1 }] });
  assert.deepEqual(bandChips(Row({ session: mixed, area: 'entrance', props: props(null) })).map(text), ['Bandfärg 2 × Mörkblå', 'Bandfärg 1 × Röd']);
  const twoTone = session({ counts: { admission: 1 }, bandColours: [{ ...cloudBand('14:00', 60), quantity: 1 }] });
  const row = Row({ session: twoTone, area: 'entrance', props: props(null) });
  assert.equal(nodes(row, (node) => node.props?.style?.background === 'linear-gradient(90deg, #141414 50%, #E2231A 50%)').length, 1);
  assert.deepEqual(bandChips(row).map(text), ['Bandfärg Svart/Röd']);
  for (const bandColours of [undefined, [], [{ id: 'x', name: { sv: 'X', en: 'X' }, swatch: ['red'], quantity: 3 }]]) {
    assert.equal(bandChips(Row({ session: session({ bandColours }), area: 'entrance', props: props(null) })).length, 0);
  }
  assert.equal(cloudBand('19:30', 60), null, 'an end time off the chart has no colour');
  const plainBand = ProductRow({ item: band });
  assert.equal(bandChips(plainBand).length, 0);
  assert.equal(plainBand.props['aria-label'], 'Besöksband, 3 kvar');
});

test('Entrance rows show the jump time from start to end; a folded-out Kommande row shows its bands like a checked-in one', () => {
  assert.equal(jumpTime({ booking: { startTime: '14:30:00', endTime: '16:00:00' } }), '14:30–16:00');
  assert.equal(jumpTime({ booking: { startTime: '14:30:00', endTime: null },
    bandColours: [{ ...cloudBand('14:30', 60), quantity: 1 }, { ...cloudBand('14:30', 90), quantity: 2 }] }), '14:30–16:00', 'the latest band end stands in');
  assert.equal(jumpTime({ booking: { startTime: '14:30:00', endTime: null } }), '14:30');
  const timed = session({ booking: { startTime: '14:30:00', endTime: '16:00:00' } });
  assert.match(text(Row({ session: timed, area: 'entrance', props: props(null) })), /14:30–16:00/);
  // Before check-in Cloud lists no bands (only chosen tickets count); the row's colours stand in, read-only.
  const gron = cloudBand('14:30', 90);
  const upcoming = session({ checkinSessionId: 'booking:R1', status: 'upcoming', booking: { startTime: '14:30:00', endTime: '16:00:00' },
    counts: { admission: 3 }, bandColours: [{ ...gron, quantity: 2 }], handout: { items: [socks], claims: [], receipts: [] } });
  const tree = EntrancePanel({ detail: upcoming, summary: upcoming, props: props(upcoming) });
  assert.deepEqual(groups(tree), ['Besöksband Grön, 2 kvar', 'Besöksband, 1 kvar', 'JumpSocks, 4 kvar']);
  const line = nodes(tree, (node) => node.props?.role === 'group' && node.props['aria-label'] === 'Besöksband Grön, 2 kvar')[0];
  assert.match(text(line), /90 min/);
  assert.deepEqual(bandChips(line).map(text), ['Bandfärg Grön']);
  assert.match(text(tree), /Check-in inte påbörjad/);
  assert.equal(buttons(tree).some((node) => /Lämna ut|Checka in/.test(text(node))), false);
  // Once Cloud lists the bands (chosen at check-in), only its own lines show.
  const checkedIn = admitted({ bandColours: [{ ...gron, quantity: 2 }], handout: { items: [{ ...band, bandColour: gron }], claims: [], receipts: [] } });
  assert.deepEqual(groups(EntrancePanel({ detail: checkedIn, summary: checkedIn, props: props(checkedIn) })), ['Besöksband Grön, 3 kvar']);
  const started = session({ status: 'guest_in_progress', safetyStatus: 'not_started', bandColours: [{ ...gron, quantity: 3 }],
    handout: { items: [band], claims: [], receipts: [] } });
  assert.deepEqual(groups(EntrancePanel({ detail: started, summary: started, props: props(started) })), ['Besöksband, 3 kvar'], 'no doubled bands');
});

test('The staff app uses the check-in font: the same Acumin file and roles as the phone (D0247)', () => {
  const sha = (relative) => crypto.createHash('sha256').update(fs.readFileSync(new URL(relative, import.meta.url))).digest('hex');
  assert.equal(sha('../../public/fonts/AcuminVariableConcept.woff2'), sha('../../../jumpyard-checkin-phone/public/fonts/AcuminVariableConcept.woff2'));
  const phone = read('../../../jumpyard-checkin-phone/src/app/globals.css');
  const staff = read('../app/globals.css');
  const start = '@font-face {\n  font-family: "JumpYard Acumin";';
  const roles = phone.slice(phone.indexOf(start), phone.indexOf('/* The component classes below')).trimEnd();
  assert.ok(roles.length > 2000 && staff.includes(roles), 'the staff app carries the phone\'s face and roles unchanged');
  assert.ok(staff.indexOf(roles) > staff.indexOf('font-family: ui-sans-serif'), 'Acumin comes after the shared fallback stack');
  assert.match(read('../app/layout.tsx'), /preload\("\/fonts\/AcuminVariableConcept\.woff2", \{ as: "font", type: "font\/woff2", crossOrigin: "anonymous" \}\)/);
  assert.match(read('../../public/_headers'), /font-src 'self'/);
});

test('Page wiring: no Checka in; Lämna ut before ROLLER is kept, otherwise it confirms the revision its choice got', () => {
  const page = read('../app/page.tsx');
  assert.doesNotMatch(page, /handleCheckIn|onCheckIn|urgentSessions|needsStaff/);
  const handout = page.slice(page.indexOf('const handleHandout = useCallback('), page.indexOf('const confirmNextRemembered'));
  assert.match(handout, /if \(keep && selected\.bookingSyncStatus !== "confirmed"\) return rememberPress\(selected, request\)/);
  assert.match(handout, /failure\.code === "booking_sync_pending"\) return rememberPress\(selected, request\)/);
  assert.match(handout, /if \(rememberedRunRef\.current\) await rememberedRunRef\.current/, 'a background confirmation finishes first');
  assert.match(handout, /if \(result && options\.confirm && request\.action === "select"\)/);
  assert.match(handout, /result = await send\(\{ area: request\.area, action: "confirm", revision: revision as number \}\)/);
  const engine = page.slice(page.indexOf('const confirmNextRemembered = useCallback('), page.indexOf('const shownSessions'));
  assert.match(engine, /row\.bookingSyncStatus === "confirmed"/, 'it waits for the board to show ROLLER\'s booking');
  assert.match(engine, /changeStaffHandout\(id, activeAuth\.auth\.token, request\)/);
  assert.match(page, /sessions=\{shownSessions\} detail=\{shownDetail\}/);
  // The legacy handoff page keeps its own redeem with the shared key (#333).
  assert.match(page, /idempotencyKey: `staff-redeem:\$\{detail\.checkinSessionId\}`/);
});

function deferred() { let resolve; let reject; const promise = new Promise((done,fail)=>{resolve=done;reject=fail;}); return {promise,resolve,reject}; }
const accepted = revision => ({session:{status:'ready_for_staff'},handout:{claims:[{area:'entrance',revision}],items:[],receipts:[]}});
test('Rapid selections are coalesced behind the first claim and use each accepted revision', {timeout:2000}, async () => {
  const replies = [deferred(),deferred()]; const sent = []; const secondSent = deferred();
  const buffer = createSelectionBuffer({area:'entrance',action:'select',revision:0,selection:[{id:'b',quantity:3}]});
  const draining = buffer.drain(request=>{sent.push(plain(request));if(sent.length===2)secondSent.resolve();return replies[sent.length-1].promise;});
  buffer.update([{id:'b',quantity:3},{id:'socks',quantity:3}]);
  buffer.update([{id:'socks',quantity:3}]);
  assert.equal(sent.length,1);
  replies[0].resolve(accepted(7));
  await secondSent.promise;
  assert.equal(sent.length,2);
  assert.equal(sent[1].revision,7);
  assert.deepEqual(sent[1].selection,[{id:'socks',quantity:3}]);
  replies[1].resolve(accepted(8));
  assert.equal((await draining).handout.claims[0].revision,8);
});
test('A failed or cancelled save never sends queued selections or claims completion', async () => {
  for(const cancel of [false,true]) {
    const reply=deferred(); let sends=0;
    const buffer=createSelectionBuffer({area:'entrance',action:'select',revision:0,selection:[]});
    const draining=buffer.drain(()=>{sends+=1;return reply.promise;});
    buffer.update([{id:'b',quantity:3}]);
    if(cancel) { reply.resolve(null); assert.equal(await draining,null); }
    else { reply.reject(new Error('Lost response')); await assert.rejects(draining,/Lost response/); }
    assert.equal(sends,1);
  }
});
test('Receipt updates preserve another group and never turn an early café collection into admission', () => {
  const selected=session({rollerUniqueId:'booking1'});
  const row={...selected,checkinSessionId:'newer-group',status:'guest_in_progress'};
  const result={session:{status:'ready_for_staff'},handout:{claims:[],items:[{...coffee,collected:1,available:1}],receipts:[]}};
  const updated=mergeHandoutSummary(row,selected,result);
  assert.equal(updated.status,'guest_in_progress');
  assert.equal(updated.checkinSessionId,'newer-group');
  assert.equal(updated.cafeRemaining,1);
  assert.equal(updated.cafeSession,undefined);
  const unrelated={...row,rollerUniqueId:'another-booking'};
  assert.equal(mergeHandoutSummary(unrelated,selected,result),unrelated);
});

test('Today-only API requests follow the server day, retain all pages and preserve older list callers', async () => {
  const urls=[];
  const api=load('./adminApi.ts','',{globals:{
    URLSearchParams, setTimeout:callback=>{callback();},
    process:{env:{NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL:'https://synthetic.invalid'}},
    fetch:async url=>{urls.push(new URL(url)); return {ok:true,status:200,text:async()=>JSON.stringify({status:'found',sessions:[{checkinSessionId:`row${urls.length}`}],nextCursor:urls.length===1?'next-group':null})};},
  }});
  const rows=await api.listReadyStaffSessions('synthetic',' 7777 ','2000-01-01');
  assert.equal(rows.length,2);
  assert.equal(urls[0].searchParams.get('scope'),'today');
  assert.equal(urls[0].searchParams.has('day'),false);
  assert.equal(urls[0].searchParams.get('q'),'7777');
  assert.equal(urls[1].searchParams.get('cursor'),'next-group');
  await api.listReadyStaffSessions('synthetic');
  assert.equal(urls[2].searchParams.has('view'),false);
});

test('At 09:40 the default is the next actual 10:00 pass; a finished guest is checked in whatever ROLLER says', () => {
  const rows = [session({ checkinSessionId: 'a', booking: { startTime: '09:30' } }), session(), session({ checkinSessionId: 'c', booking: { startTime: '10:30' } })];
  assert.equal(nextPass(rows), '10:00');
  assert.equal(stageOf(session({ safetyStatus: 'not_started' })), 'started');
  for (const bookingSyncStatus of ['confirmed', 'pending', 'needs_staff']) assert.equal(stageOf(session({ bookingSyncStatus })), 'completed');
  assert.equal(stageOf(session({ isExpired: true })), 'completed');
  assert.equal(stageOf(session({ status: 'upcoming' })), 'upcoming');
  assert.equal(activeClaim([{ area: 'cafe', actorId: 'maja', expiresAt: '2026-09-08T07:39:00Z' }], 'cafe'), null);
  const tree = StaffExperience({ ...props(null), sessions: rows });
  assert.ok(buttons(tree).some((node) => text(node) === 'Incheckade1'));
  assert.match(text(tree), /Nästa pass · 10:00/);
});

// GH-547 (D0265): "Lämna ut" before ROLLER confirmed the purchase is kept on the device and confirmed later.
const entrancePress = { area: 'entrance', action: 'select', revision: 0,
  selection: [{ id: 'draft:provisional:b', quantity: 3 }, { id: 'draft:provisional:socks', quantity: 2 }] };
const finalGoods = (overrides = {}) => session({ checkinSessionId: 'kiosk', bookingSyncStatus: 'confirmed', handout: { claims: [], receipts: [],
  items: [{ ...band, id: 'R1:i1', productId: 'e60' }, { ...socks, id: 'R1:i2', productId: 'socks', quantity: 2, available: 2 },
    { ...coffee, id: 'R1:i3', productId: 'coffee', quantity: 1, available: 1 }] }, ...overrides });

test('Lämna ut before ROLLER is kept on this device and shows as handed out, before and after ROLLER confirms', () => {
  const { rememberHandout, withRemembered } = remembered();
  const group = kioskGroup();
  const records = rememberHandout([], group, entrancePress, '2026-09-08', new Date('2026-09-08T07:40:00Z'));
  // Only the session, the counter and the product lines are kept: no guest or staff names (T0194).
  assert.deepEqual(plain(records), [{ checkinSessionId: 'kiosk', area: 'entrance',
    day: '2026-09-08', pressedAt: '2026-09-08T07:40:00.000Z', attempts: 0, nextAt: 0,
    lines: [{ kind: 'admission', productId: 'e60', name: 'Besöksband', quantity: 3 }, { kind: 'socks', productId: 'socks', name: 'JumpSocks', quantity: 2 }] }]);
  const shown = withRemembered(group, records, 'Sara');
  const panel = EntrancePanel({ detail: shown, summary: shown, props: props(shown) });
  assert.deepEqual(groups(panel), ['Besöksband, utlämnat', 'JumpSocks, utlämnat']);
  assert.match(text(panel), /Utlämnat 09:40 · Sara/);
  assert.match(text(panel), /Caféet: 1 Bryggkaffe/, 'the café goods stay for the café');
  assert.equal(button(panel, 'Lämna ut'), undefined);
  // ROLLER's booking replaces the draft's lines; the same goods still show as handed out until Cloud has them.
  assert.deepEqual(groups(EntrancePanel({ detail: withRemembered(finalGoods(), records, 'Sara'), props: props(finalGoods()) })),
    ['Besöksband, utlämnat', 'JumpSocks, utlämnat']);
  // A second press adds to the first; an empty press keeps nothing.
  const more = rememberHandout(records, group, { area: 'cafe', action: 'select', revision: 0, selection: [{ id: 'draft:provisional:c', quantity: 1 }] }, '2026-09-08');
  assert.deepEqual(plain(more.map((record) => record.area)), ['entrance', 'cafe']);
  assert.equal(rememberHandout(records, group, { ...entrancePress, selection: [] }, '2026-09-08'), records);
});

test('A kept press selects the final goods: the group\'s bands whole, the rest up to the pressed number', () => {
  const { rememberedSelection } = remembered();
  const lines = [{ kind: 'admission', productId: 'e60', name: 'Besöksband', quantity: 3 }, { kind: 'socks', productId: 'socks', name: 'JumpSocks', quantity: 2 }];
  const items = [{ ...band, id: 'a1', productId: 'e60', quantity: 2, available: 2 }, { ...band, id: 'a2', productId: 'e90', quantity: 2, available: 2 },
    { ...socks, id: 's1', productId: 'socks', quantity: 4, available: 4 }, { ...socks, id: 'p1', kind: 'padlock', name: 'Hänglås', productId: 'lock', quantity: 1, available: 1 }];
  assert.deepEqual(plain(rememberedSelection(lines, items)), [{ id: 'a1', quantity: 2 }, { id: 'a2', quantity: 2 }, { id: 's1', quantity: 2 }]);
  assert.deepEqual(plain(rememberedSelection([{ kind: 'coffee', productId: 'coffee', name: 'Bryggkaffe', quantity: 1 }],
    [{ ...coffee, productId: 'coffee' }])), [{ id: 'c', quantity: 1 }], 'a café press keeps the rest for later');
  assert.deepEqual(plain(rememberedSelection(lines, items.map((item) => ({ ...item, collected: item.quantity, available: 0 })))), []);
});

test('A kept press is confirmed once Cloud accepts it, also after booking_sync_pending, and never twice', async () => {
  const { confirmRemembered, afterAttempt, rememberHandout } = remembered();
  const [record] = rememberHandout([], kioskGroup(), entrancePress, '2026-09-08');
  const tools = (detail, replies = []) => {
    const sent = [];
    return { sent, actorId: 'sara', getDetail: async () => detail,
      change: async (_id, request) => { sent.push(plain(request)); const reply = replies.shift(); if (reply instanceof Error) throw reply; return reply; } };
  };
  const failure = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
  // ROLLER is not done: nothing is sent and the wait does not count as a try.
  let run = tools(kioskGroup());
  assert.equal((await confirmRemembered(record, run)).outcome, 'wait');
  assert.equal(run.sent.length, 0);
  assert.equal(afterAttempt(record, 'wait', 1000).attempts, 0);
  // Cloud still answers booking_sync_pending: try again later.
  run = tools(finalGoods(), [failure('booking_sync_pending')]);
  const pending = await confirmRemembered(record, run);
  assert.equal(pending.outcome, 'retry');
  const later = afterAttempt(record, pending.outcome, 1000);
  assert.deepEqual([later.attempts, later.nextAt], [1, 4000]);
  // Then the handout is the same selection and confirmation as a tap on Lämna ut.
  run = tools(finalGoods(), [{ status: 'ok', handout: { claims: [{ area: 'entrance', revision: 7 }], items: [], receipts: [] }, session: {} },
    { status: 'ok', completed: true, handout: { claims: [], items: [], receipts: [] }, session: { status: 'redeemed' } }]);
  assert.equal((await confirmRemembered(later, run)).outcome, 'done');
  assert.deepEqual(run.sent, [{ area: 'entrance', action: 'select', revision: 0, selection: [{ id: 'R1:i1', quantity: 3 }, { id: 'R1:i2', quantity: 2 }] },
    { area: 'entrance', action: 'confirm', revision: 7 }]);
  assert.equal(afterAttempt(later, 'done'), null);
  // A confirmation that timed out resumes as the same operation.
  const saved = finalGoods({ handout: { ...finalGoods().handout, claims: [{ area: 'entrance', actorId: 'sara', actorName: 'Sara',
    revision: 8, pendingOperation: 'op', expiresAt: '2026-09-08T07:42:00Z', selection: [] }] } });
  run = tools(saved, [{ status: 'ok', completed: true, handout: { claims: [], items: [], receipts: [] }, session: {} }]);
  assert.equal((await confirmRemembered(record, run)).outcome, 'done');
  assert.deepEqual(run.sent, [{ area: 'entrance', action: 'confirm', revision: 8 }]);
  // A colleague is handing out: wait for them without sending anything.
  const colleague = finalGoods({ handout: { ...finalGoods().handout, claims: [{ area: 'entrance', actorId: 'maja', actorName: 'Maja',
    revision: 3, pendingOperation: null, expiresAt: '2026-09-08T07:42:00Z', selection: [] }] } });
  run = tools(colleague);
  assert.equal((await confirmRemembered(record, run)).outcome, 'retry');
  assert.equal(run.sent.length, 0);
  // Handed out elsewhere already: nothing is left to do.
  const collected = finalGoods({ handout: { ...finalGoods().handout, items: finalGoods().handout.items.map((item) => ({ ...item, collected: item.quantity, available: 0 })) } });
  run = tools(collected);
  assert.equal((await confirmRemembered(record, run)).outcome, 'done');
  assert.equal(run.sent.length, 0);
  assert.equal((await confirmRemembered(record, tools(finalGoods(), [failure('quantity_already_collected')]))).outcome, 'done');
  // A staff session that ended keeps the press for the next login.
  assert.equal((await confirmRemembered(record, tools(finalGoods(), [failure('staff_auth_token_expired', { isAuthenticationFailure: true })]))).outcome, 'stop');
  assert.equal(afterAttempt(record, 'stop'), record);
  // Tries are bounded: about eight minutes of failures end it.
  let next = record;
  for (let tries = 0; next && tries < 30; tries += 1) next = afterAttempt(next, 'retry', 0);
  assert.equal(next, null);
});

test('A café press moves the row to Utlämnat on this device, and kept presses last the day in the tab (sessionStorage)', () => {
  const { rememberHandout, withRememberedCafe, readRemembered, storeRemembered, REMEMBERED_KEY } = (() => {
    const store = new Map();
    return remembered({ window: { sessionStorage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } } });
  })();
  const group = kioskGroup({ cafeQuantity: 1, cafeRemaining: 1 });
  const records = rememberHandout([], group, { area: 'cafe', action: 'select', revision: 0, selection: [{ id: 'draft:provisional:c', quantity: 1 }] }, '2026-09-08');
  assert.equal(withRememberedCafe(group, records).cafeRemaining, 0);
  const tree = board(['cafe']).default({ ...props(null), sessions: [withRememberedCafe(group, records)] });
  assert.match(text(nodes(tree, (node) => node.type === 'section')[1]), /0061.*Kioskgäst.*Utlämnat/);
  storeRemembered([...records, { ...records[0], checkinSessionId: 'yesterday', day: '2026-09-07' }]);
  assert.equal(REMEMBERED_KEY, 'jumpyard_staff_remembered_handouts_v1');
  assert.deepEqual(plain(readRemembered('2026-09-08').map((record) => record.checkinSessionId)), ['kiosk']);
  assert.deepEqual(plain(remembered().readRemembered('2026-09-08')), [], 'no storage, no presses, no error');
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
      // GH-541: one Lämna ut is a selection and its confirmation; a third call leaves headroom.
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
