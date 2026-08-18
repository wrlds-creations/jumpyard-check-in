const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'jumpyard-checkin-admin', 'src', 'app', 'page.tsx'), 'utf8');

function section(source, start, end, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing ${label} start marker.`);
  assert.ok(endIndex > startIndex, `Missing ${label} end marker.`);
  return source.slice(startIndex, endIndex);
}

const queueRefresh = section(
  page,
  'const refreshSessions = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {',
  'const refreshSelectedDetail',
  'queue refresh',
);
assert.match(queueRefresh, /if \(showLoading\) setState\("loading"\)/);
assert.match(queueRefresh, /if \(queueRefreshInFlightRef\.current\)/);
assert.match(queueRefresh, /queueRefreshPendingRef\.current = true/);
assert.match(queueRefresh, /requestedQueryVersion !== queueQueryVersionRef\.current/);
assert.match(queueRefresh, /setCurrentSelectedId\(nextSelectedId\)/);

const queuePolling = section(
  page,
  'useEffect(() => {\n    if (!authSessionKey) return;\n\n    let stopped = false;',
  'const handleRedeem = useCallback',
  'visible queue polling',
);
assert.match(queuePolling, /document\.visibilityState !== "visible"/);
assert.match(queuePolling, /refreshSessions\(\{ showLoading: false \}\)\.finally\(scheduleRefresh\)/);
assert.match(queuePolling, /}, 5_000\)/);
assert.match(queuePolling, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
assert.match(queuePolling, /document\.removeEventListener\("visibilitychange", handleVisibility\)/);
assert.match(queuePolling, /\[authSessionKey, refreshSessions\]/);
assert.doesNotMatch(queuePolling, /setState\("loading"\)/);

assert.match(page, /data-testid="handoff-sync-pending"/);
assert.match(page, /Synkar bokningen…/);
assert.doesNotMatch(page, /ROLLER-bokningen och biljetterna synkas fortfarande/);
assert.match(page, /detail\.bookingSyncStatus === "confirmed"/);
assert.match(page, /Boolean\(auth\?\.auth\.token\)/);
assert.match(page, /detail\?\.bookingSyncStatus !== "pending"/);

console.log('GH-263 live Handoff queue validation passed.');
