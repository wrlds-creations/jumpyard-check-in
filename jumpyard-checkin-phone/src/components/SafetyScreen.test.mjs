import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// #458: one safety screen. The approval sits under the film and is only usable after a genuine end.
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

const t = {
  safetyVideo: { replay: 'Se videon igen' },
  safetyAttest: {
    safetyRulesTitle: 'Säkerhetsregler',
    shortRules: {
      ageRules: ['3–5 år', '6–10 år', '11 år och uppåt'],
      onePerTrampoline: 'En person per trampolin',
      avoidEdgePadding: 'Undvik kantskydden',
      landOnBackOrBottom: 'Landa på rumpa eller rygg',
      tricksWithinAbility: 'Bara tricks du klarar',
      noRunning: 'Spring inte i parken',
    },
    attestLead: 'Jag intygar',
    attestRest: 'att samtliga i min bokning har tagit del av reglerna och förstått dem.',
    readyForStaffProcessing: 'Gör redo för personal...',
    readyForStaffFailed: 'Fel',
  },
};

function loadApproval() {
  const output = ts.transpileModule(source('components/SafetyApproval.tsx'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const overrides = {
    '@/context/LanguageContext': { useTranslation: () => ({ t }) },
    '@/components/JumpyardIcon': { JumpyardIcon: ({ name }) => React.createElement('i', { 'data-icon': name }) },
    'lucide-react': { Loader2: () => null, RotateCcw: () => null },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => overrides[id] ?? require(id), mod, mod.exports);
  return mod.exports.SafetyApproval;
}

const SafetyApproval = loadApproval();

test('the approval shows the rules as short lines and one action carrying the attestation', () => {
  const markup = renderToStaticMarkup(React.createElement(SafetyApproval, { onApprove: () => {} }));
  assert.equal((markup.match(/<li /g) || []).length, 6);
  for (const icon of ['age-limit', 'trampoline-jump', 'no-edge-bounce', 'foam-pit-landing', 'safe-tricks', 'no-running']) {
    assert.match(markup, new RegExp(`data-icon="${icon}"`));
  }
  assert.equal((markup.match(/<button/g) || []).length, 1, 'the docked film is the replay control');
  assert.match(markup, /Jag intygar<\/span><span[^>]*>att samtliga i min bokning/);
});

test('a busy approval stays in full colour and cannot be sent twice', () => {
  const markup = renderToStaticMarkup(React.createElement(SafetyApproval, { isSubmitting: true, onApprove: () => {} }));
  assert.match(markup, /disabled=""/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /cursor-wait/);
  assert.doesNotMatch(markup, /disabled:opacity-40/);
  assert.match(markup, /Gör redo för personal/);
});

test('only the playback controller\'s genuine end reveals the approval; the layout never moves', () => {
  const video = source('components/SafetyVideo.tsx');
  assert.match(video, /if \(state\.phase === 'done'\) onWatchedRef\.current\?\.\(/);
  assert.match(video, /const done = phase === 'done';/);
  // Variant A (Love 2026-09-30): the approval is in the layout from the start, hidden and inert until done,
  // and the finished film docks with a transform.
  assert.equal((video.match(/data-visible=\{String\(done\)\}\s+aria-hidden=\{!done\}\s+inert=\{!done\}/g) || []).length, 1);
  assert.match(video, /const docked = done;/);
  assert.match(video, /docked \? `translateY\(0px\) scale\(\$\{dockScale\}\)`/);
  assert.doesNotMatch(video, /onComplete|sheet/);
  const css = source('app/globals.css');
  assert.match(css, /\.safety-film \{\s*transform-origin: 50% 0;\s*transition: transform/);
  assert.doesNotMatch(css.slice(css.indexOf('#458')), /transition:[^;]*\b(height|max-height|top)\b/);
});

test('the separate rules screen is gone and the flow goes from the film to completion', async () => {
  assert.equal(fs.existsSync(new URL('./SafetyAttest.tsx', import.meta.url)), false);
  const { nextState, initialContext } = await import('../flow/machine.ts');
  assert.equal(nextState('APP_SAFETY_VIDEO', initialContext('park-qr')), 'APP_CONFIRM');
  assert.equal(nextState('APP_SAFETY_ATTEST', initialContext('park-qr')), 'APP_CONFIRM', 'a saved legacy step still completes');
  const page = source('app/page.tsx');
  assert.doesNotMatch(page, /<SafetyAttest[ >]|components\/SafetyAttest/);
  assert.match(page, /\(state === 'APP_SAFETY_VIDEO' \|\| state === 'APP_SAFETY_ATTEST'\) && \(\s*<SafetyVideo/);
  assert.match(page, /onApprove=\{completeSafetyAndReadyForStaff\}/);
});

test('safety comes before payment in both live phone paths (D0231)', () => {
  const buy = source('components/BuyTickets.tsx');
  assert.match(buy, /setStep\(safetyBeforePayment && !safetyApprovedAt \? 'SAFETY' : 'CONTACT'\)/);
  assert.match(buy, /if \(safetyBeforePayment && !safetyApprovedAt\) \{\s*setStep\('SAFETY'\);\s*return;\s*\}\s*void createDraft\(\);/);
  assert.match(buy, /step === 'SAFETY' \|\| step === 'CONTACT'\) setStep\('REVIEW'\)/);
  // Existing booking (Love 2026-09-30): safety after the add-ons and before the add-on payment.
  const addons = source('components/AddonsOffer.tsx');
  assert.match(addons, /if \(safetyBeforePayment && !approvedAt\) \{\s*setStep\('SAFETY'\);\s*return;\s*\}/);
  assert.match(addons, /setSafetyApprovedAt\(attestedAt\);\s*void createDraft\(attestedAt\);/);
  assert.match(addons, /if \(step === 'SAFETY'\) \{\s*setStep\('REVIEW'\);\s*return;\s*\}\s*if \(backRule !== 'select'\) return;\s*returnToSelect\(\);/);
  const page = source('app/page.tsx');
  assert.match(page, /const SAFETY_BEFORE_PAYMENT = true;/);
  assert.equal((page.match(/safetyBeforePayment=\{SAFETY_BEFORE_PAYMENT\}/g) || []).length, 2, 'purchase and existing booking');
});

test('the approval travels with the purchase and an approved payment goes straight to completion', async () => {
  const { buildSafetyAttestation, SAFETY_ATTESTATION_COPY_VERSION } = await import('../flow/safetyAttestation.ts');
  assert.equal(buildSafetyAttestation(null, 'sv'), undefined, 'no approval, nothing sent (old order)');
  assert.equal(buildSafetyAttestation('not a time', 'sv'), undefined);
  assert.deepEqual(buildSafetyAttestation('2026-09-30T08:15:00Z', 'en'),
    { attestedAt: '2026-09-30T08:15:00.000Z', copyVersion: SAFETY_ATTESTATION_COPY_VERSION, locale: 'en' });
  assert.match(source('flow/cloudClient.ts'), /\.\.\.\(safetyAttestation \? \{ safetyAttestation \} : \{\}\)/);

  const buy = source('components/BuyTickets.tsx');
  assert.match(buy, /pendingEmailMarketingConsent\(emailMarketingChecked, lang\),\s*draftSafetyAttestation\s*\)/);
  assert.match(buy, /void \(draftSafetyAttestation \? confirmAttestedPurchase\(\) : resolvePaidDraftBooking\(undefined, true\)\)/);
  // Calm wait with the existing sparse schedule; never a new payment and never a safety step.
  assert.match(buy, /const confirmAttestedPurchase = async[\s\S]*resolvePaidConfirmation\(lookupBooking, identifier, \{ wait \}\)[\s\S]*getPaidConfirmationRetryDelay\(retryIndex\)[\s\S]*setPaidConfirmState\('delayed'\)/);
  assert.match(buy, /preparationState=\{draftSafetyAttestation\s*\? paidConfirmState/);
  assert.match(buy, /safetyAttestedAt: draftSafetyAttestation\.attestedAt/, 'a reload keeps the approval');
  // Love 2026-09-30: done at approval. Cloud's provisional session comes first; the wait is only a fallback.
  assert.match(source('flow/cloudClient.ts'), /action: 'phone_approved'/);
  assert.match(buy, /await finalizePhonePayment\(prepaymentDraftId, rollerDraftUniqueId\)\.catch\(\(\) => null\)/);
  assert.match(buy, /provisionalSession: provisional\.checkinSession/);
  assert.match(buy, /await completeApprovedPurchase\(\);\s*scheduleRollerConfirmationNudges\(lookupBooking, identifier\);\s*return;/);

  const page = source('app/page.tsx');
  assert.match(page, /if \(!booking\.paid && paymentApproved && safetyAttestedAt\) throw/);
  assert.match(page, /const startedSession = provisionalSession \?\? \(paymentApproved/);
  assert.match(page, /safetyAttestedAt && !isReadyForStaffSession\(startedSession\) && !isCompletedSession\(startedSession\)\s*\? await markSessionReadyForStaff\(startedSession, 'completed'\)/);
  assert.equal((page.match(/safetyAttestedAt: snapshot\.safetyAttestedAt \?\? null/g) || []).length, 2, 'both recovery paths');

  const addons = source('components/AddonsOffer.tsx');
  assert.match(addons, /if \(safetyBeforePayment && safetyApprovedAt\) void confirmAttestedAddons\(\);/);
  assert.match(addons, /preparationState=\{safetyBeforePayment && safetyApprovedAt \? paidConfirmState : 'ready'\}/);
  assert.match(page, /onContinue=\{\(result\) => result\.safetyAttestedAt\s*\? completeAttestedAddons\(result\)/);
  assert.match(page, /const completeAttestedAddons = async[\s\S]*markSessionReadyForStaff\(session, 'completed'\)[\s\S]*setState\('APP_CONFIRM'\)/);
});

test('the progress bar shows Safety before Payment in both phone paths', () => {
  const page = source('app/page.tsx');
  assert.match(page, /\[t\.progress\.booking, t\.progress\.extras, t\.progress\.safety, t\.progress\.payment, t\.progress\.done\]/);
  assert.match(page, /\[t\.buyProgress\.entry, t\.buyProgress\.addons, t\.buyProgress\.safety, t\.buyProgress\.payment, t\.buyProgress\.done\]/);
  // The add-on flow's own safety and payment steps light up their columns while the page is on APP_ADDONS.
  assert.match(page, /state === 'APP_ADDONS' && addonsStep === 'SAFETY'\) return 2;/);
  assert.match(page, /state === 'APP_ADDONS' && \(addonsStep === 'PAYMENT' \|\| addonsStep === 'APPROVED' \|\| addonsStep === 'PENDING'\)\) return 3;/);
  assert.match(page, /addonsStep=\{addonsStep\}\s*safetyFirst=\{SAFETY_BEFORE_PAYMENT\}/);
});

test('two late lookups nudge Cloud to attach the paid ROLLER booking; nothing waits on them', async () => {
  const { scheduleRollerConfirmationNudges, ROLLER_CONFIRMATION_NUDGE_DELAYS_MS } = await import('../flow/provisionalConfirmation.ts');
  assert.deepEqual([...ROLLER_CONFIRMATION_NUDGE_DELAYS_MS], [15_000, 60_000]);
  const scheduled = [];
  const lookups = [];
  scheduleRollerConfirmationNudges(async (id) => { lookups.push(id); throw new Error('offline'); }, 'draft-1',
    (callback, delayMs) => scheduled.push([delayMs, callback]));
  assert.deepEqual(scheduled.map(([delayMs]) => delayMs), [15_000, 60_000]);
  for (const [, callback] of scheduled) callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(lookups, ['draft-1', 'draft-1'], 'a failed lookup is ignored');
  scheduleRollerConfirmationNudges(async () => undefined, '', (callback, delayMs) => scheduled.push([delayMs, callback]));
  assert.equal(scheduled.length, 2, 'no identifier, no lookups');
});
