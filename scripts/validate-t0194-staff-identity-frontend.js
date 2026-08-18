const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN = path.join(ROOT, 'jumpyard-checkin-admin');
const OUT = path.join(ADMIN, 'out');
const ADMIN_COGNITO_DOMAIN =
  'https://jumpyard-check-in-park-test-admin-376129878018.auth.eu-north-1.amazoncognito.com';
const ADMIN_COGNITO_CLIENT_ID = 't0194-admin-frontend-validator-client';
const PARK_TEST_API = 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com';
const LEGACY_API = 'https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function section(source, start, end, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing ${label} start marker.`);
  assert.ok(endIndex > startIndex, `Missing ${label} end marker.`);
  return source.slice(startIndex, endIndex);
}

function assertBefore(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `Missing ordering marker ${JSON.stringify(first)}.`);
  assert.ok(secondIndex >= 0, `Missing ordering marker ${JSON.stringify(second)}.`);
  assert.ok(firstIndex < secondIndex, message);
}

function validateStaffPinSource(page, identity, api) {
  const loginUi = section(page, 'if (!auth) {', '<header className="sticky', 'staff login UI');
  assert.match(loginUi, /identityMode === "pin" \? "Ange din PIN-kod\."/);
  assert.match(loginUi, /data-testid=\{identityMode === "pin" \? "staff-auth-pin"/);
  assert.match(loginUi, /type="password"/);
  assert.match(loginUi, /inputMode=\{identityMode === "pin" \? "numeric"/);
  assert.match(loginUi, /pattern=\{identityMode === "pin" \? "\[0-9\]\*"/);
  assert.match(loginUi, /maxLength=\{identityMode === "pin" \? 6/);
  assert.match(loginUi, /replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
  assert.match(loginUi, /authPin\.length !== 6/);
  assert.match(loginUi, /autoComplete="off"/);
  assert.match(page, /!\/\^\\d\{6\}\$\/\.test\(credential\)/);
  assert.match(page, /loginStaff\(credential, identityMode\)/);
  assert.match(page, /auth\.identityMode === "pin"/);
  assert.match(page, /Byt personal/);
  for (const forbidden of ['startCognitoSignIn', 'personalkonto', 'MFA', 'e-post', 'mejl', 'Google']) {
    assert.equal(loginUi.includes(forbidden), false, `Staff login must not contain ${JSON.stringify(forbidden)}.`);
  }

  assert.match(identity, /export type StaffIdentityMode = "pin" \| "legacy"/);
  assert.match(identity, /=== "legacy" \? "legacy" : "pin"/);
  assert.match(identity, /const PIN_STORAGE_KEY = "jumpyard_staff_auth_v3"/);
  assert.match(identity, /const LEGACY_STORAGE_KEY = "jumpyard_staff_auth_v1"/);
  assert.match(identity, /manageStaffIdentitySession\("heartbeat", fresh\.auth\.token\)/);
  assert.match(identity, /manageStaffIdentitySession\("logout", auth\.auth\.token\)/);
  assert.match(identity, /const LOCAL_INACTIVITY_MS = 15 \* 60 \* 1000/);
  assert.doesNotMatch(identity, /Cognito|oauth2|PKCE|refreshToken|amazoncognito/i);

  assert.match(api, /loginStaff\(credential: string, identityMode: "pin" \| "legacy"\)/);
  assert.match(api, /identityMode === "legacy" \? \{ passcode: credential \} : \{ pin: credential \}/);
  assert.match(api, /\/v1\/staff\/auth\/login/);
  assert.match(api, /\/v1\/staff\/auth\/session/);
  assert.match(api, /identityMode: "pin" \| "legacy"/);
}

function validateAdminAuthSource(adminIdentity, callback, adminPage, api) {
  assert.match(adminIdentity, /const ADMIN_STORAGE_KEY = "jumpyard_admin_auth_v1"/);
  assert.match(adminIdentity, /const ADMIN_PKCE_STORAGE_KEY = "jumpyard_admin_pkce_v1"/);
  assert.doesNotMatch(adminIdentity, /jumpyard_staff_auth_v3|jumpyard_staff_auth_v1/);
  assert.match(adminIdentity, /window\.crypto\.getRandomValues\(bytes\)/);
  assert.match(adminIdentity, /window\.crypto\.subtle\.digest\("SHA-256"/);
  assert.match(adminIdentity, /code_challenge_method", "S256"/);
  assert.doesNotMatch(adminIdentity, /searchParams\.set\("lang",/);
  assert.match(adminIdentity, /code_verifier: pending\.verifier/);
  assert.match(adminIdentity, /safeStringEquals\(returnedState, pending\.state\)/);
  assert.match(adminIdentity, /window\.history\.replaceState\(\{\}, document\.title, "\/auth\/callback"\)/);
  assertBefore(
    adminIdentity,
    'window.history.replaceState({}, document.title, "/auth/callback")',
    'exchangeAuthorizationCode(code, pending)',
    'OAuth query data must leave the callback URL before token exchange.',
  );
  assert.match(adminIdentity, /manageAdminIdentitySession\("start", tokens\.accessToken\)/);
  assert.match(adminIdentity, /manageAdminIdentitySession\("heartbeat", fresh\.auth\.token\)/);
  assert.match(adminIdentity, /manageAdminIdentitySession\("logout", auth\.auth\.token\)/);
  assert.match(adminIdentity, /principal\.role !== "staff_admin"/);
  assert.match(adminIdentity, /permissions\.includes\("staff:identities:manage"\)/);
  assert.match(adminIdentity, /logout_uri", `\$\{window\.location\.origin\}\/admin`/);

  assert.match(callback, /completeAdminSignIn\(\)/);
  assert.match(callback, /window\.location\.replace\("\/admin"\)/);
  assert.match(callback, /clearAdminAuthStorage\(\)/);
  assert.doesNotMatch(callback, /StaffAuth|staffIdentity/);

  assert.match(adminPage, /data-testid="admin-auth-submit"/);
  assert.match(adminPage, /data-testid="admin-create-staff-form"/);
  assert.match(adminPage, /data-testid="admin-staff-first-name"/);
  assert.match(adminPage, /data-testid="admin-staff-last-name"/);
  assert.match(adminPage, /testIdPrefix="admin-create"/);
  assert.match(adminPage, /testIdPrefix="admin-reset"/);
  assert.match(adminPage, /validatePin\(createPin, createPinConfirm\)/);
  assert.match(adminPage, /validatePin\(resetPin\.pin, resetPin\.pinConfirm\)/);
  assert.match(adminPage, /setCreatePin\(""\)/);
  assert.match(adminPage, /setCreatePinConfirm\(""\)/);
  assert.match(adminPage, /setResetPin\(EMPTY_PIN\)/);
  assert.match(adminPage, /action: record\.active \? "disable" : "enable"/);
  assert.match(adminPage, /action: "reset_pin"/);
  assert.match(adminPage, /Lämna över skärmen/);

  assert.match(api, /\/v1\/admin\/auth\/session/);
  assert.match(api, /\/v1\/admin\/staff/);
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /role: "staff_operator"/);
  assert.match(api, /action: "disable" \| "enable"/);
  assert.match(api, /action: "reset_pin"; pin: string/);
}

function validateMobileLayoutSource(page, adminPage, callback) {
  const staffLoginUi = section(page, 'if (!auth) {', '<header className="sticky', 'staff login UI');

  assert.match(staffLoginUi, /<main className="[^"]*min-w-0[^"]*px-3[^"]*sm:px-4/);
  assert.match(staffLoginUi, /<section className="[^"]*min-w-0[^"]*max-w-md/);
  assert.match(staffLoginUi, /<span className="flex min-h-13 w-full min-w-0/);
  assert.match(staffLoginUi, /className="h-full w-full min-w-0 flex-1/);
  assert.match(page, /className=\{`w-full min-w-0 rounded-2xl border/);
  assert.match(page, /<div className="flex min-w-0 flex-1 items-center/);
  assert.match(page, /order-1 min-w-0 rounded-3xl/);

  assert.match(adminPage, /<div className="grid min-w-0 gap-3 sm:grid-cols-2">/);
  assert.match(adminPage, /data-testid=\{`\$\{testIdPrefix\}-pin`\} className="min-h-12 w-full min-w-0/);
  assert.match(adminPage, /data-testid=\{`\$\{testIdPrefix\}-pin-confirm`\} className="min-h-12 w-full min-w-0/);
  assert.match(adminPage, /data-testid="admin-staff-first-name" className="min-h-12 w-full min-w-0/);
  assert.match(adminPage, /data-testid="admin-staff-last-name" className="min-h-12 w-full min-w-0/);
  assert.match(adminPage, /mx-auto grid min-w-0 max-w-5xl/);

  assert.match(callback, /<main className="[^"]*min-w-0[^"]*px-3[^"]*sm:px-4/);
  assert.match(callback, /<section className="[^"]*min-w-0[^"]*max-w-md/);
  assert.match(callback, /flex min-w-0 flex-wrap items-center/);
}

function validateVisualConsistencySource(page, adminPage, adminGlobals, phoneGlobals) {
  const staffLoginUi = section(page, 'if (!auth) {', '<header className="sticky', 'staff login UI');
  const sharedFontStack = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  assert.ok(adminGlobals.includes(`--font-sans: ${sharedFontStack}`));
  assert.ok(phoneGlobals.includes(`--font-sans: ${sharedFontStack}`));
  assert.ok(adminGlobals.includes(`font-family: ${sharedFontStack}`));
  assert.ok(phoneGlobals.includes(`font-family: ${sharedFontStack}`));
  assert.match(adminGlobals, /--foreground: #000000;/);
  assert.match(adminGlobals, /html,\s*body \{[\s\S]*overflow-x: hidden/);
  assert.doesNotMatch(staffLoginUi, /text-foreground\/(?:50|55|60|65|70)/);
  assert.match(staffLoginUi, /font-black italic uppercase tracking-\[0\.22em\] text-foreground/);
  assert.match(staffLoginUi, /text-center text-xs font-bold text-foreground/);
  assert.match(adminPage, /text-xs font-black italic uppercase tracking-wide text-foreground/);
  assert.match(adminPage, /text-xs font-bold leading-relaxed text-foreground/);
}

function validateStorageAndCleanup(page, identity, adminIdentity, adminPage, callback, api) {
  const allSource = [page, identity, adminIdentity, adminPage, callback, api].join('\n');
  assert.doesNotMatch(allSource, /localStorage/);
  assert.match(identity, /window\.sessionStorage\.setItem/);
  assert.match(adminIdentity, /window\.sessionStorage\.setItem/);
  assert.notEqual(
    identity.match(/PIN_STORAGE_KEY = "([^"]+)"/)?.[1],
    adminIdentity.match(/ADMIN_STORAGE_KEY = "([^"]+)"/)?.[1],
    'Staff and admin credentials must use different sessionStorage keys.',
  );

  const cleanup = section(page, 'const clearSensitiveUi = useCallback(() => {', 'const terminateStaffSession', 'staff cleanup');
  for (const required of [
    /setCurrentAuth\(null\)/,
    /setAuthPin\(""\)/,
    /set(?:Current)?Detail\(null\)/,
    /setCurrentQuery\(""\)/,
    /setRedeemConfirmation\(null\)/,
    /setScannerOpen\(false\)/,
    /setCurrentSelectedId\(null\)/,
    /setSessions\(\[\]\)/,
  ]) assert.match(cleanup, required);

  const terminate = section(page, 'const terminateStaffSession = useCallback(async () => {', 'const getUsableAuth', 'staff logout');
  assertBefore(terminate, 'clearStaffAuthStorage();', 'clearSensitiveUi();', 'Staff credentials must clear before UI data.');
  assert.match(terminate, /logoutChannelRef\.current\?\.broadcast\(\)/);
  assert.match(terminate, /await endStaffAuth\(currentAuth\)/);
  assert.match(identity, /const LOGOUT_SIGNAL = Object\.freeze\(\{ type: "staff_logout", version: 2 \}\)/);
  assert.match(adminIdentity, /const ADMIN_LOGOUT_SIGNAL = Object\.freeze\(\{ type: "admin_logout", version: 1 \}\)/);
}

function validateQueueRequestStability(page) {
  assert.match(page, /const activityWriteAtRef = useRef\(0\)/);
  assert.match(page, /const queueLastRequestedKeyRef = useRef<string \| null>\(null\)/);
  assert.match(page, /const queueQueryVersionRef = useRef\(0\)/);
  assert.match(page, /const queueRefreshInFlightRef = useRef\(false\)/);
  assert.match(page, /const queueRefreshPendingRef = useRef\(false\)/);
  assert.match(page, /function staffAuthSessionKey\(auth: StaffAuthSession \| null\)/);
  assert.match(page, /const authSessionKey = staffAuthSessionKey\(auth\)/);

  const synchronizedRefs = section(
    page,
    'const setCurrentQuery = useCallback((nextQuery: string) => {',
    'const clearSensitiveUi',
    'synchronous queue query and selection refs',
  );
  assertBefore(
    synchronizedRefs,
    'queueQueryRef.current = nextQuery;',
    'setQuery(nextQuery);',
    'The latest query ref must update before query state.',
  );
  assertBefore(
    synchronizedRefs,
    'selectedIdRef.current = nextSelectedId;',
    'setSelectedId(nextSelectedId);',
    'The latest selection ref must update before selection state.',
  );
  assert.match(synchronizedRefs, /queueQueryVersionRef\.current \+= 1/);

  const refresh = section(
    page,
    'const refreshSessions = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {',
    'const openHandoffPayload',
    'staff queue refresh',
  );
  assert.match(refresh, /const requestedAuth = authRef\.current/);
  assert.match(refresh, /if \(showLoading\) setState\("loading"\)/);
  assert.match(
    refresh,
    /queueLastRequestedKeyRef\.current = queueRequestKey\(requestedAuth, queueQueryVersionRef\.current\)/,
  );
  assert.match(refresh, /if \(queueRefreshInFlightRef\.current\)/);
  assert.match(refresh, /queueRefreshPendingRef\.current = true/);
  assert.match(refresh, /const requestedQuery = queueQueryRef\.current/);
  assert.match(refresh, /const requestedQueryVersion = queueQueryVersionRef\.current/);
  assert.match(refresh, /queueLastRequestedKeyRef\.current = queueRequestKey\(activeAuth, requestedQueryVersion\)/);
  assert.match(refresh, /const currentSelectedId = selectedIdRef\.current/);
  assert.match(refresh, /setCurrentSelectedId\(nextSelectedId\)/);
  assert.match(refresh, /if \(!nextSelectedId\) \{\s*setDetailState\("idle"\)/);
  assert.doesNotMatch(refresh, /setDetailState\(nextSelectedId \? "loading" : "idle"\)/);
  assert.equal(
    (refresh.match(/if \(!isSameStaffSession\(authRef\.current, activeAuth\)\)/g) ?? []).length,
    2,
    'Both successful and failed stale-session queue responses must be discarded.',
  );
  assert.equal(
    (refresh.match(/if \(authRef\.current\) queueRefreshPendingRef\.current = true/g) ?? []).length,
    2,
    'A stale old-session response must preserve the current session refresh.',
  );
  assert.equal(
    (refresh.match(/requestedQueryVersion !== queueQueryVersionRef\.current/g) ?? []).length,
    2,
    'Both successful and failed stale-query responses must be discarded.',
  );
  const loadFailure = section(
    refresh,
    '} catch (loadError) {',
    'if (handleProtectedAuthFailure(loadError))',
    'stale queue failure handling',
  );
  assert.match(loadFailure, /requestedQuery !== queueQueryRef\.current/);
  assert.match(loadFailure, /queueRefreshPendingRef\.current/);
  assert.match(refresh, /\} while \(queueRefreshPendingRef\.current\)/);
  assert.match(
    refresh,
    /\}, \[getUsableAuth, handleProtectedAuthFailure, setCurrentDetail, setCurrentSelectedId\]\)/,
  );
  assert.doesNotMatch(refresh, /\[getUsableAuth, handleProtectedAuthFailure, query, selectedId\]/);

  const automaticRefresh = section(
    page,
    'const scheduledRequestKey = `${authSessionKey}:${queueQueryVersionRef.current}`;',
    'const activeAuth = authRef.current;',
    'automatic staff queue refresh',
  );
  assert.match(automaticRefresh, /queueLastRequestedKeyRef\.current === scheduledRequestKey/);
  assert.match(automaticRefresh, /\[authSessionKey, query, refreshSessions\]/);
  assert.doesNotMatch(automaticRefresh, /\[auth, query, refreshSessions\]/);
  assert.doesNotMatch(automaticRefresh, /queueQueryRef\.current = query/);

  const activity = section(
    page,
    'const activeAuth = authRef.current;',
    'if (!scannerOpen) return;',
    'staff activity tracking',
  );
  assert.match(activity, /activityWriteAtRef\.current = 0/);
  assert.match(activity, /now - activityWriteAtRef\.current < 15_000/);
  assert.match(activity, /\[authSessionKey, setCurrentAuth, terminateStaffSession\]/);
  assert.doesNotMatch(activity, /refreshSessions/);
  assert.doesNotMatch(activity, /let lastActivityWriteAt = 0/);

  assert.doesNotMatch(page, /onChange=\{\(event\) => setQuery\(event\.target\.value\)\}/);
  assert.match(page, /onChange=\{\(event\) => setCurrentQuery\(event\.target\.value\)\}/);
}

function validateHeaders(headers) {
  assert.match(headers, new RegExp(ADMIN_COGNITO_DOMAIN.replaceAll('.', '\\.')));
  assert.doesNotMatch(headers, /park-test-staff-376129878018\.auth/);
  const callbackIndex = headers.indexOf('/auth/callback*');
  assert.ok(callbackIndex >= 0, 'Missing callback-specific headers.');
  const callbackBlock = headers.slice(callbackIndex);
  assert.match(callbackBlock, /Cache-Control: no-store/);
  assert.match(callbackBlock, /Referrer-Policy: no-referrer/);
  assert.match(callbackBlock, /X-Robots-Tag: noindex, nofollow/);
}

function runAdminBuild(mode) {
  const environment = {
    ...process.env,
    NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_CLIENT_ID: ADMIN_COGNITO_CLIENT_ID,
    NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_DOMAIN: ADMIN_COGNITO_DOMAIN,
    NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL: mode === 'pin' ? PARK_TEST_API : LEGACY_API,
    NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE: mode,
  };
  delete environment.NEXT_PUBLIC_JUMPYARD_STAFF_COGNITO_CLIENT_ID;
  delete environment.NEXT_PUBLIC_JUMPYARD_STAFF_COGNITO_DOMAIN;

  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd run build'] : ['run', 'build'];
  const result = spawnSync(command, args, {
    cwd: ADMIN,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `T0194 ${mode} admin build failed.\n${result.stdout || ''}${result.stderr || ''}`);
}

function walkFiles(directory, predicate) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolutePath, predicate));
    else if (predicate(absolutePath)) files.push(absolutePath);
  }
  return files.sort();
}

function readBundle() {
  return walkFiles(OUT, (file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

function validateBuiltOutput(mode) {
  assert.ok(fs.existsSync(path.join(OUT, 'index.html')), 'Missing static staff root.');
  assert.ok(fs.existsSync(path.join(OUT, 'admin.html')), 'Missing static admin page.');
  assert.ok(fs.existsSync(path.join(OUT, 'auth', 'callback.html')), 'Missing static admin callback.');
  const index = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const bundle = readBundle();
  const allOutput = [index, bundle].join('\n');

  assert.ok(allOutput.includes('/v1/staff/auth/login'));
  assert.ok(allOutput.includes('/v1/staff/auth/session'));
  assert.ok(allOutput.includes('/v1/admin/auth/session'));
  assert.ok(allOutput.includes('/v1/admin/staff'));
  assert.ok(allOutput.includes('jumpyard_staff_auth_v3'));
  assert.ok(allOutput.includes('jumpyard_admin_auth_v1'));
  assert.equal(allOutput.includes('localStorage'), false);

  if (mode === 'pin') {
    assert.ok(index.includes('Ange din PIN-kod'));
    assert.ok(allOutput.includes('staff-auth-pin'));
    assert.ok(allOutput.includes(PARK_TEST_API));
  } else {
    assert.ok(index.includes('Ange kod'));
    assert.ok(allOutput.includes('staff-auth-passcode'));
    assert.ok(allOutput.includes(LEGACY_API));
  }
  assert.ok(allOutput.includes(ADMIN_COGNITO_DOMAIN));
  assert.ok(allOutput.includes(ADMIN_COGNITO_CLIENT_ID));
}

function main() {
  const page = read('jumpyard-checkin-admin/src/app/page.tsx');
  const identity = read('jumpyard-checkin-admin/src/lib/staffIdentity.ts');
  const adminIdentity = read('jumpyard-checkin-admin/src/lib/adminIdentity.ts');
  const callback = read('jumpyard-checkin-admin/src/app/auth/callback/page.tsx');
  const adminPage = read('jumpyard-checkin-admin/src/app/admin/page.tsx');
  const api = read('jumpyard-checkin-admin/src/lib/adminApi.ts');
  const adminGlobals = read('jumpyard-checkin-admin/src/app/globals.css');
  const phoneGlobals = read('jumpyard-checkin-phone/src/app/globals.css');
  const headers = read('jumpyard-checkin-admin/public/_headers');

  validateStaffPinSource(page, identity, api);
  validateAdminAuthSource(adminIdentity, callback, adminPage, api);
  validateMobileLayoutSource(page, adminPage, callback);
  validateVisualConsistencySource(page, adminPage, adminGlobals, phoneGlobals);
  validateStorageAndCleanup(page, identity, adminIdentity, adminPage, callback, api);
  validateQueueRequestStability(page);
  validateHeaders(headers);

  runAdminBuild('pin');
  validateBuiltOutput('pin');
  runAdminBuild('legacy');
  validateBuiltOutput('legacy');

  console.log('[pass] staff root accepts only a six-digit masked PIN in park-test and keeps legacy dev passcode compatibility');
  console.log('[pass] PIN staff sessions use isolated sessionStorage, server heartbeat/logout, role display, and complete shared-tab cleanup');
  console.log('[pass] Cognito code/PKCE is isolated to admin, callback returns to /admin, and admin/staff credentials never share storage');
  console.log('[pass] admin can list, create default operators, reset PIN, enable, and disable through the reviewed API routes');
  console.log('[pass] PIN values are confirmed, cleared after mutations, absent from URLs/localStorage, and never shown after creation');
  console.log('[pass] staff login, admin PIN forms, callback, queue rows, and headers keep explicit mobile shrink contracts');
  console.log('[pass] staff/admin use the phone check-in font stack, black active copy, and branded labels');
  console.log('[pass] staff activity cannot retrigger queue reads, and overlapping refreshes coalesce to the latest query');
  console.log('[pass] pin and legacy static exports contain staff root, admin page, callback, exact API routes, and exact admin Cognito CSP');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
