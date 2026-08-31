import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const buySource = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const addonsSource = fs.readFileSync(new URL('../components/AddonsOffer.tsx', import.meta.url), 'utf8');
const pageSource = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const confirmationSource = fs.readFileSync(
  new URL('../components/PhonePaymentConfirmation.tsx', import.meta.url),
  'utf8'
);

test('new-entry approval starts booking preparation immediately and waits for the guest to navigate', () => {
  assert.match(
    buySource,
    /onApproved=\{\(\) => \{[\s\S]*setStep\('APPROVED'\);[\s\S]*resolvePaidDraftBooking\(undefined, true\)/
  );
  assert.match(buySource, /paymentResolutionStartedRef\.current/);
  assert.match(buySource, /paymentContinuationRef\.current = continueToSafety/);
  assert.match(buySource, /onContinueToSafety=\{continueAfterApprovedPayment\}/);
  assert.doesNotMatch(confirmationSource, /setTimeout|setInterval|useEffect/);
});

test('existing-booking add-on approval persists safety immediately without timed navigation', () => {
  assert.match(addonsSource, /onApproved=\{handlePaymentApproved\}/);
  assert.match(addonsSource, /onPaymentApproved\?\.\(getCompletionResult\(true\)\)/);
  assert.match(addonsSource, /onContinueToSafety=\{\(\) => completeAddons\(true\)\}/);
  assert.doesNotMatch(addonsSource, /setTimeout\(\(\) => completeAddons/);
  assert.match(pageSource, /startCheckInSession\(booking, 'safety'\)/);
  assert.match(pageSource, /onPaymentApproved=\{preparePaidAddonsForSafety\}/);
});

test('only definitive approval mounts the receipt confirmation', () => {
  assert.match(buySource, /step === 'APPROVED'/);
  assert.match(addonsSource, /step === 'APPROVED'/);
  assert.match(confirmationSource, /Kvittot skickas via e-post\./);
  assert.match(confirmationSource, /name="receipt"/);
  assert.doesNotMatch(confirmationSource, /RollerPaymentDropIn|cloudClient|ecom-payments|fetch\(/);
});
