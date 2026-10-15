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
const { nextPass, stageOf, activeClaim, boardPollDelay, boardTab, needsStaff, checkedInLabel, jumpTime } = load('../components/staff/flow.ts');
const { createSelectionBuffer, mergeHandoutSummary } = load('../components/staff/selection.ts');
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
    onCheckIn: async () => { calls.push('check-in'); return true; },
    onOpen(id) { calls.push(`open:${id}`); }, onClose() {}, onQuery() {}, onSearch() {}, onRefresh() {}, onLogout() {} };
}
function buttons(tree) { return nodes(tree, (node) => node.type === 'button'); }
const button = (tree, label) => buttons(tree).find((node) => text(node) === label || node.props['aria-label'] === label);
const groups = (tree) => nodes(tree, (node) => node.props?.role === 'group').map((node) => node.props['aria-label']);

test('The entrance has only Kommande and Incheckade; Påbörjad and Redo are Kommande', () => {
  const rows = [session({ checkinSessionId: 'started', status: 'guest_in_progress', safetyStatus: 'not_started' }),
    session({ checkinSessionId: 'ready' }), session({ checkinSessionId: 'upcoming', status: 'upcoming' }),
    admitted({ checkinSessionId: 'in' })];
  assert.deepEqual(rows.map(boardTab), ['upcoming', 'upcoming', 'upcoming', 'completed']);
  const tree = StaffExperience({ ...props(null), sessions: rows });
  const tabs = buttons(tree).filter((node) => /^(Kommande|Påbörjade|Redo|Incheckade)\d+$/.test(text(node)));
  assert.deepEqual(tabs.map((node) => text(node)), ['Kommande3', 'Incheckade1']);
  assert.deepEqual(tabs.map((node) => Boolean(node.props['aria-pressed'])), [true, false]);
  assert.match(text(tree), /Påbörjad/);
  assert.match(text(tree), /Redo/);
  let switched = false;
  button(StaffExperience({ ...props(null), onLogout() { switched = true; } }), 'Byt personal').props.onClick();
  assert.equal(switched, true);
});

test('"Behöver personal" stays on top in its own red box whatever the tab, pass or search', () => {
  const failed = session({ checkinSessionId: 'failed', guest: { name: 'Ali Hassan' }, booking: { startTime: '16:00' },
    autoCheckin: { status: 'needs_staff', reason: 'roller_rejected', attempts: 3 } });
  const others = [admitted({ checkinSessionId: 'in' }), session({ checkinSessionId: 'ready' })];
  assert.equal(needsStaff(failed), true);
  assert.equal(needsStaff(admitted({ autoCheckin: { status: 'needs_staff' } })), false, 'a later admission ends it');
  const box = (tree) => nodes(tree, (node) => node.type === 'section' && node.props['aria-labelledby'] === 'staff-needs-staff')[0];
  for (const states of [[], ['entrance', null, 'completed'], ['entrance', '10:00', 'upcoming']]) {
    const tree = board(states).default({ ...props(null), sessions: [failed, ...others] });
    assert.match(text(box(tree)), /Behöver personal1Ali Hassan/);
    const tabs = buttons(tree).filter((node) => /^(Kommande|Incheckade)\d+$/.test(text(node))).map((node) => text(node));
    assert.deepEqual(tabs, ['Kommande1', 'Incheckade1'], 'the red row is not counted in the tabs');
  }
  // While searching, the whole-day list from before the search keeps it on screen.
  const searching = StaffExperience({ ...props(null), query: 'erik', sessions: [], urgent: [failed] });
  assert.match(text(box(searching)), /Ali Hassan/);
  // A search hit that no longer needs staff drops out of the box.
  const fixed = StaffExperience({ ...props(null), query: 'ali', sessions: [{ ...failed, autoCheckin: null, status: 'redeemed', handoffStatus: 'completed' }], urgent: [failed] });
  assert.equal(box(fixed), undefined);
  // The box offers one tap that checks the group in; nothing is handed out with it.
  const calls = [];
  const open = StaffExperience({ ...props(failed, calls), sessions: [failed] });
  button(box(open), 'Checka in').props.onClick();
  assert.deepEqual(calls, ['check-in']);
});

test('A row checked in from the red box stays there while it is open, then offers Lämna ut', () => {
  const nowIn = admitted({ checkinSessionId: 'failed', guest: { name: 'Ali Hassan' }, checkedInBy: { actorId: 'sara', displayName: 'Sara', role: 'staff_operator' },
    handout: { items: [band, socks], claims: [], receipts: [] } });
  const tree = board(['entrance', null, 'upcoming', false, { id: 'failed', place: 'urgent' }]).default({ ...props(nowIn), sessions: [nowIn] });
  const box = nodes(tree, (node) => node.type === 'section' && node.props['aria-labelledby'] === 'staff-needs-staff')[0];
  assert.match(text(box), /Ali Hassan/);
  assert.match(text(box), /Incheckad 09:31 · Sara/);
  assert.ok(button(box, 'Lämna ut'));
  // Closed, it moves to Incheckade.
  const closed = board(['entrance', null, 'completed', false, { id: 'failed', place: 'urgent' }]).default({ ...props(nowIn), selectedId: null, sessions: [nowIn] });
  assert.equal(nodes(closed, (node) => node.type === 'section' && node.props['aria-labelledby'] === 'staff-needs-staff').length, 0);
  assert.match(text(closed), /Ali Hassan/);
});

test('The check-in line keeps the time and never says "automatiskt"; a colleague keeps the name', () => {
  assert.equal(checkedInLabel(admitted()), 'Incheckad 09:31');
  assert.equal(checkedInLabel(admitted({ checkedInBy: { actorId: 'maja', displayName: 'Maja' } })), 'Incheckad 09:31 · Maja');
  assert.equal(checkedInLabel(admitted({ checkedInBy: null })), 'Incheckad 09:31');
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

test('Not checked in: Kommande shows the goods without a button; Redo offers Checka in', () => {
  for (const [overrides, note] of [[{ status: 'upcoming' }, 'Check-in inte påbörjad'],
    [{ status: 'guest_in_progress', safetyStatus: 'not_started' }, 'Gästen slutför check-in i mobilen eller kiosken'],
    [{ bookingSyncStatus: 'pending' }, 'Bokningen bekräftas']]) {
    const detail = session(overrides);
    const tree = EntrancePanel({ detail, props: props(detail) });
    assert.match(text(tree), new RegExp(note));
    assert.equal(buttons(tree).some((node) => /Lämna ut|Checka in/.test(text(node))), false);
  }
  const calls = [];
  const ready = EntrancePanel({ detail: session(), props: props(session(), calls) });
  button(ready, 'Checka in').props.onClick();
  assert.deepEqual(calls, ['check-in']);
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
  for (const notReady of [{ safetyStatus: 'not_started' }, { bookingSyncStatus: 'pending' }, { status: 'upcoming' }]) {
    tree = CafePanel({ detail: session(notReady), props: props(session(notReady)) });
    assert.equal(button(tree, 'Lämna ut').props.disabled, true);
    assert.equal(button(tree, 'Minska Bryggkaffe').props.disabled, true);
  }
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

test('Page wiring: Checka in only redeems with the shared key; Lämna ut confirms the revision its choice got', () => {
  const page = read('../app/page.tsx');
  const checkIn = page.slice(page.indexOf('const handleCheckIn = useCallback('), page.indexOf('const filteredSessions'));
  assert.match(checkIn, /redeemStaffSession\(\{/);
  assert.match(checkIn, /idempotencyKey: `staff-redeem:\$\{selected\.checkinSessionId\}`/);
  assert.doesNotMatch(checkIn, /changeStaffHandout/);
  const handout = page.slice(page.indexOf('const handleHandout = useCallback('), page.indexOf('const handleCheckIn'));
  assert.match(handout, /if \(result && options\.confirm && request\.action === "select"\)/);
  assert.match(handout, /result = await send\(\{ area: request\.area, action: "confirm", revision: revision as number \}\)/);
  assert.match(page, /if \(!requestedQuery\.trim\(\)\) setUrgentSessions\(nextSessions\.filter\(needsStaff\)\)/);
  assert.match(page, /urgent=\{urgentSessions\}/);
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

test('At 09:40 the default is the next actual 10:00 pass; safety and synchronization do not count as ready', () => {
  const rows = [session({ checkinSessionId: 'a', booking: { startTime: '09:30' } }), session(), session({ checkinSessionId: 'c', booking: { startTime: '10:30' } })];
  assert.equal(nextPass(rows), '10:00');
  assert.equal(stageOf(session({ safetyStatus: 'not_started' })), 'started');
  assert.equal(stageOf(session({ bookingSyncStatus: 'pending' })), 'started');
  assert.equal(stageOf(session({ status: 'upcoming' })), 'upcoming');
  assert.equal(activeClaim([{ area: 'cafe', actorId: 'maja', expiresAt: '2026-09-08T07:39:00Z' }], 'cafe'), null);
  const tree = StaffExperience({ ...props(null), sessions: rows });
  assert.ok(buttons(tree).some((node) => text(node) === 'Kommande1'));
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
