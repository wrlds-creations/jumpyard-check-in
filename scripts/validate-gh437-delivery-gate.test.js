const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const APPROVAL = 'GH437_PAID_ONLY_EMAIL_MARKETING_APPROVED';

test('only the Nacka release profile approves paid-only phone email delivery', () => {
  const configDir = path.join(root, 'infra/config');
  for (const file of fs.readdirSync(configDir).filter((name) => name.endsWith('.json'))) {
    const config = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
    const approval = config.safetyGates?.phoneEmailMarketingDeliveryApproval;
    if (file === 'park-test-full-flow-rehearsal.json') assert.equal(approval, APPROVAL, file);
    else assert.equal(approval, undefined, `${file} must keep phone email delivery closed`);
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
