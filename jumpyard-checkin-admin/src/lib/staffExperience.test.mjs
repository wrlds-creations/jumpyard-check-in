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
const { default: StaffExperience, Detail, ProductRow, BookingRow } = load('../components/staff/StaffExperience.tsx', '\nexport { Detail, ProductRow, BookingRow };');
const { nextPass, stageOf, activeClaim, boardPollDelay } = load('../components/staff/flow.ts');
const { createSelectionBuffer, mergeHandoutSummary } = load('../components/staff/selection.ts');
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
  return text(tree?.props?.children ?? '');
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

test('Ready guests can collect coffee before admission; each counter only changes its own goods', () => {
  let tree = Detail({ props: props(session()), area: 'cafe' });
  assert.equal(buttons(tree).find((button) => button.props['aria-label'] === 'Kaffe, 2 kvar').props.disabled, false);
  assert.equal(buttons(tree).some((button) => button.props['aria-label'] === 'Besöksband, 3 kvar'), false);
  assert.equal(nodes(tree, (node) => node.props?.role === 'group' && node.props['aria-label'] === 'Besöksband, 3 kvar').length, 1);
  tree = Detail({ props: props(session()), area: 'entrance' });
  assert.equal(buttons(tree).some((button) => button.props['aria-label'] === 'Kaffe, 2 kvar'), false);
  const readOnly = nodes(tree, (node) => node.props?.role === 'group' && node.props['aria-label'] === 'Kaffe, 2 kvar')[0];
  assert.ok(readOnly);
  assert.equal(nodes(readOnly, (node) => node.props?.['aria-pressed'] !== undefined || /rounded-full/.test(node.props?.className || '')).length, 0);
  for (const notReady of [{safetyStatus:'not_started'}, {bookingSyncStatus:'pending'}, {status:'upcoming'}]) {
    tree = Detail({ props: props(session(notReady)), area:'cafe' });
    assert.equal(buttons(tree).find((button)=>button.props['aria-label']==='Kaffe, 2 kvar').props.disabled, true);
  }
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

test('Entrance selects all socks without steppers; completed products have a green outline without zero counts', () => {
  const socks = {...band, id:'socks', kind:'socks', name:'Strumpor', quantity:4, available:4};
  let selected;
  let tree = ProductRow({ item:socks, quantity:0, disabled:false, onQuantity:value=>{selected=value;} });
  buttons(tree)[0].props.onClick();
  assert.equal(selected, 4);
  tree = ProductRow({ item:socks, quantity:4, disabled:false, onQuantity(){} });
  assert.equal(buttons(tree).length, 1);
  tree = ProductRow({ item:{...socks,collected:4,available:0}, quantity:0, disabled:false, onQuantity(){} });
  assert.equal(tree.props['data-state'], 'completed');
  assert.match(tree.props.className, /border-success.*shadow/);
  assert.doesNotMatch(text(tree), /0|4|utlämna|kvar|st\b/);
  assert.equal(buttons(tree)[0].props['aria-label'], 'Strumpor, utlämnat');
});

test('Unacknowledged selections show immediately, permit the next tap and block final confirmation', () => {
  const changes = [];
  const draft = {checkinSessionId:'s1',area:'entrance',selection:[{id:'b',quantity:3}]};
  const socks = {...band,id:'socks',kind:'socks',name:'Strumpor'};
  const detail = session({handout:{items:[band,socks,coffee],claims:[],receipts:[]}});
  const tree = Detail({props:{...props(detail,changes),busy:true,draft},area:'entrance'});
  assert.equal(buttons(tree).find(button=>button.props['aria-label']==='Besöksband, 3 kvar').props['aria-pressed'], true);
  const next = buttons(tree).find(button=>button.props['aria-label']==='Strumpor, 3 kvar');
  assert.equal(next.props.disabled, false);
  next.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(changes[0].selection)), [{id:'b',quantity:3},{id:'socks',quantity:3}]);
  assert.equal(buttons(tree).find(button=>text(button)==='Sparar…').props.disabled, true);
  assert.equal(buttons(tree).find(button=>text(button)==='Sparar…').props['aria-busy'], true);
  assert.equal(nodes(tree,node=>node.props?.['data-state']==='completed').length, 0);
});

test('Queue and detail label actual admissions and never substitute product ticket totals', () => {
  for (const count of [1, 2, 0, undefined]) {
    const detail = session({ counts: { admission: count, selectedTickets: 6, tickets: 6 } });
    for (const tree of [BookingRow({session:detail,area:'entrance'}), Detail({props:props(detail),area:'entrance'})]) {
      const labels = nodes(tree, node => node.type === 'span').map(text);
      assert.equal(labels.includes(`${count} ${count === 1 ? 'entré' : 'entréer'}`), Boolean(count));
      assert.ok(!labels.some(label => /6.*(?:entré|gäst)|gäster/.test(label)));
    }
  }
});

test('Stage order follows the guest journey while Ready remains the operational default', () => {
  const tree = StaffExperience(props(session()));
  const tabs = buttons(tree).filter(button => /^(Kommande|Påbörjade|Redo|Incheckade)\d+$/.test(text(button)));
  assert.deepEqual(tabs.map(button => text(button).replace(/\d+$/, '')), ['Kommande','Påbörjade','Redo','Incheckade']);
  assert.deepEqual(tabs.map(button => Boolean(button.props['aria-pressed'])), [false,false,true,false]);
  let switched = false;
  const header = StaffExperience({...props(session()),onLogout(){switched=true;}});
  buttons(header).find(button=>button.props['aria-label']==='Byt personal').props.onClick();
  assert.equal(switched, true);
});

test('Select all only selects this counter, indicates full selection and can clear it', () => {
  const socks = {...band,id:'socks',kind:'socks',name:'Strumpor'};
  const detail = session({handout:{items:[band,socks,coffee],claims:[],receipts:[]}});
  const changes=[];
  let tree = Detail({props:props(detail,changes),area:'entrance'});
  let all = buttons(tree).find(button=>button.props['aria-label']==='Välj alla');
  assert.equal(all.props['aria-pressed'], false);
  all.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(changes[0].selection)),[{id:'b',quantity:3},{id:'socks',quantity:3}]);
  tree = Detail({props:{...props(detail,changes),draft:{checkinSessionId:'s1',area:'entrance',selection:changes[0].selection}},area:'entrance'});
  all = buttons(tree).find(button=>button.props['aria-label']==='Rensa alla val');
  assert.equal(all.props['aria-pressed'], true);
  assert.equal(text(all), 'Alla valda');
  all.props.onClick();
  assert.equal(changes[1].selection.length, 0);
});

test('Café includes upcoming purchases and preserves exact search candidates; date picker and continuation banner are absent', () => {
  const render = load('../components/staff/StaffExperience.tsx','',{states:['cafe']}).default;
  const detail = session({status:'upcoming',cafeQuantity:2,cafeRemaining:2});
  const tree = render(props(detail));
  assert.ok(buttons(tree).some(button=>text(button).includes('Testgäst')));
  assert.equal(nodes(tree,node=>node.type==='input'&&node.props.type==='date').length, 0);
  assert.doesNotMatch(text(tree), /Fortsätt med/);
  const search = load('../components/staff/StaffExperience.tsx','',{states:['cafe']}).default;
  const first = session({checkinSessionId:'first',cafeSession:{checkinSessionId:'admitted',status:'redeemed'}});
  const second = session({checkinSessionId:'second',cafeSession:first.cafeSession});
  const retargeted = load('../components/staff/StaffExperience.tsx','',{states:['cafe']}).default;
  const earlier = retargeted(props({...first,cafeQuantity:2,cafeRemaining:2}));
  assert.ok(!nodes(earlier,node=>node.type==='span').map(text).includes('3 entréer'), 'do not label an earlier café group with the newer group entrance count');
  const opened = [];
  const searched = search({...props(first),sessions:[first,second],query:'7777',onOpen:id=>opened.push(id)});
  for(const button of buttons(searched).filter(button=>text(button).includes('Testgäst'))) button.props.onClick();
  assert.deepEqual(opened,['first','second']);
});

const plain = value => JSON.parse(JSON.stringify(value));
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
