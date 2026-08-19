const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs
  .readFileSync(path.join(root, 'jumpyard-checkin-admin', 'src', 'app', 'page.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

function section(source, start, end, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing ${label} start marker.`);
  assert.ok(endIndex > startIndex, `Missing ${label} end marker.`);
  return source.slice(startIndex, endIndex);
}

const mobileDetail = section(
  page,
  '{(selectedId || (redeemState === "success" && Boolean(redeemConfirmation))) && (',
  '<div className={`mx-auto max-w-7xl',
  'mobile detail and redeem confirmation',
);
assert.match(mobileDetail, /<DetailPanel/);
assert.match(mobileDetail, /redeemConfirmation=\{redeemConfirmation\}/);
assert.match(mobileDetail, /redeemState=\{redeemState\}/);
assert.doesNotMatch(mobileDetail, /setTimeout|setInterval/);

const detailPanel = section(page, 'function DetailPanel({', 'function Home()', 'detail panel');
assert.match(
  detailPanel,
  /if \(redeemState === "success" && redeemConfirmation\) \{[\s\S]*<RedeemSuccessPanel/,
);

for (const [start, end, label] of [
  ['const clearSensitiveUi = useCallback(() => {', 'const terminateStaffSession', 'sensitive cleanup'],
  ['const selectSession = useCallback(', 'const closeSelectedSession', 'new selection'],
  ['const closeSelectedSession = useCallback(', 'const returnToQueueAfterRedeem', 'detail close'],
  ['const returnToQueueAfterRedeem = useCallback(', 'const scanNextAfterRedeem', 'explicit queue return'],
]) {
  const cleanup = section(page, start, end, label);
  assert.match(cleanup, /setRedeemConfirmation\(null\)/);
  assert.match(cleanup, /setRedeemState\("idle"\)/);
}

const scanNext = section(page, 'const scanNextAfterRedeem = useCallback(', 'const refreshSessions', 'scan next');
assert.match(scanNext, /returnToQueueAfterRedeem\(\)/);
assert.match(scanNext, /setScannerOpen\(true\)/);

const queueRefresh = section(page, 'const refreshSessions = useCallback(', 'const refreshSelectedDetail', 'queue refresh');
assert.match(queueRefresh, /setCurrentSelectedId\(nextSelectedId\)/);
assert.match(queueRefresh, /if \(!nextSelectedId\)/);

console.log('GH-274 persistent redeem success validation passed.');
