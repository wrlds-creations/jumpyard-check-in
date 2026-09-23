const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const APPROVAL = 'GH437_PAID_ONLY_EMAIL_MARKETING_APPROVED';

// D0225: the choice travels with the draft, so no profile enables the
// after-payment worker. Re-enabling it needs a new decision.
test('no profile approves after-payment phone email delivery', () => {
  const configDir = path.join(root, 'infra/config');
  for (const file of fs.readdirSync(configDir).filter((name) => name.endsWith('.json'))) {
    const config = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
    assert.equal(config.safetyGates?.phoneEmailMarketingDeliveryApproval, undefined,
      `${file} must keep after-payment phone email delivery closed`);
  }
});

test('the Booking worker is enabled only through the exact approval phrase', () => {
  const config = read('infra/lib/config.ts');
  assert.match(config, new RegExp(`PHONE_EMAIL_MARKETING_DELIVERY_APPROVAL = '${APPROVAL}'`));
  assert.match(config, /phoneEmailMarketingDeliveryApproval must be exactly/);
  const stack = read('infra/lib/jumpyard-cloud-stack.ts');
  assert.match(stack, /environment\.PHONE_EMAIL_MARKETING_PROVIDER_APPROVED = String\(\s*resources\.safetyGates\.phoneEmailMarketingDeliveryApproval === PHONE_EMAIL_MARKETING_DELIVERY_APPROVAL,\s*\)/);
  const handler = read('infra/lambda/booking/index.js');
  assert.match(handler, /process\.env\.PHONE_EMAIL_MARKETING_PROVIDER_APPROVED !== 'true'/);
});
