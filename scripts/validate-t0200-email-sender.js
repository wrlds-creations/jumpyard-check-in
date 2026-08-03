#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const parkTestConfigDirectory = path.join(root, 'infra', 'config');
const expectedGuestEmail = {
  provider: 'aws_ses',
  checkinBaseUrl: 'https://jumpyard-check-in-park-test.pages.dev/',
  configurationSetName: 'jumpyard-check-in-park-test-email',
  fromAddress: 'nackaforum@jumpyard.se',
  fromDisplayName: 'JumpYard Nacka',
  identityDomain: 'jumpyard.se',
  replyToAddresses: ['nackaforum@jumpyard.se'],
};
const { buildCheckinEmailMessage } = require('../infra/lambda/session/email-template');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function validateParkTestConfigs() {
  const parkTestFiles = fs
    .readdirSync(parkTestConfigDirectory)
    .filter((name) => /^park-test(?:-.+)?\.json$/.test(name))
    .sort();

  assert.ok(parkTestFiles.length >= 1, 'At least one park-test configuration is required.');
  for (const file of parkTestFiles) {
    const config = readJson(path.join('infra', 'config', file));
    assert.deepStrictEqual(config.guestEmail, expectedGuestEmail, `${file} must use the exact T0200 sender contract.`);
    assert.strictEqual(config.safetyGates.guestMessagingSendsEnabled, false, `${file} must keep guest sends disabled.`);
    if (file === 'park-test-full-flow-rehearsal.json') {
      assert.strictEqual(config.bookingTimeSms.confirmSend, true, `${file} must use the T0201 controlled send gate.`);
      assert.strictEqual(config.bookingTimeSms.scheduleEnabled, true, `${file} must run the bounded T0201 scheduler.`);
      assert.deepStrictEqual(config.bookingTimeSms.channels, ['email'], `${file} must remain email-only.`);
      assert.strictEqual(
        config.safetyGates.controlledT30EmailApproval,
        'T0201_SINGLE_BOOKING_T30_EMAIL_APPROVED',
        `${file} must use the exact T0201 approval.`,
      );
    } else {
      assert.strictEqual(config.bookingTimeSms.confirmSend, false, `${file} must keep confirmed sends disabled.`);
      assert.strictEqual(config.bookingTimeSms.scheduleEnabled, false, `${file} must keep the booking-time schedule disabled.`);
      assert.ok(!config.safetyGates.controlledT30EmailApproval, `${file} must keep the T0201 gate closed.`);
    }
  }
}

function validateDevBaseline() {
  const dev = readJson('infra/config/dev.json');
  assert.strictEqual(dev.guestEmail.fromAddress, 'love@wrlds.com');
  assert.deepStrictEqual(dev.guestEmail.replyToAddresses, ['love@wrlds.com']);
  assert.strictEqual(dev.guestEmail.identityDomain, '');
  assert.strictEqual(dev.guestEmail.configurationSetName, '');
  assert.strictEqual(dev.guestEmail.fromDisplayName, '');
}

function validateImplementation() {
  const configSource = read('infra/lib/config.ts');
  const stackSource = read('infra/lib/jumpyard-cloud-stack.ts');
  const sessionSource = read('infra/lambda/session/index.js');
  const templateSource = read('infra/lambda/session/email-template.js');

  for (const expected of [
    "PARK_TEST_EMAIL_IDENTITY_DOMAIN = 'jumpyard.se'",
    "PARK_TEST_EMAIL_FROM_ADDRESS = 'nackaforum@jumpyard.se'",
    "PARK_TEST_EMAIL_FROM_DISPLAY_NAME = 'JumpYard Nacka'",
    "PARK_TEST_EMAIL_CONFIGURATION_SET_NAME = 'jumpyard-check-in-park-test-email'",
  ]) {
    assert.ok(configSource.includes(expected), `Config contract must include ${expected}.`);
  }

  for (const expected of [
    "new ses.ConfigurationSet(this, 'GuestEmailConfigurationSet'",
    'sendingEnabled: controlledT30EmailEnabled',
    'ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS',
    'ses.ConfigurationSetTlsPolicy.REQUIRE',
    "new ses.EmailIdentity(this, 'GuestEmailIdentity'",
    'ses.DkimIdentity.easyDkim(ses.EasyDkimSigningKeyLength.RSA_2048_BIT)',
    "name: 'ses:configuration-set'",
    "'ses:FromAddress': resources.checkinEmailFromAddress",
    "environment.EMAIL_CONFIGURATION_SET_NAME = resources.checkinEmailConfigurationSetName",
    "environment.EMAIL_FROM_DISPLAY_NAME = resources.checkinEmailFromDisplayName",
  ]) {
    assert.ok(stackSource.includes(expected), `Infrastructure must include ${expected}.`);
  }

  for (const event of ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'RENDERING_FAILURE']) {
    assert.ok(stackSource.includes(`ses.EmailSendingEvent.${event}`), `SES telemetry must include ${event}.`);
  }

  for (const expected of [
    "const EMAIL_CONFIGURATION_SET_NAME = process.env.EMAIL_CONFIGURATION_SET_NAME || ''",
    "const EMAIL_FROM_DISPLAY_NAME = process.env.EMAIL_FROM_DISPLAY_NAME || ''",
    'commandInput.ConfigurationSetName = EMAIL_CONFIGURATION_SET_NAME',
    'FromEmailAddress: formatSesFromAddress(fromAddress)',
    "require('./email-template')",
  ]) {
    assert.ok(sessionSource.includes(expected), `Session email implementation must include ${expected}.`);
  }

  for (const expected of [
    "const subject = 'Dags att checka in inför ditt besök hos JumpYard Nacka'",
    'Svara på det här mejlet',
    'jumpyard_logo.png',
    'booking-confirmed-on-red-white-calendar.png',
    'color-scheme',
    'role="presentation"',
  ]) {
    assert.ok(templateSource.includes(expected), `Email template must include ${expected}.`);
  }
}

function validateEmailTemplate() {
  const checkinUrl = 'https://jumpyard-check-in-park-test.pages.dev/?jy_token=preview&source=email';
  const message = buildCheckinEmailMessage({
    booking: {
      bookingDate: '2026-07-22',
      bookingReference: 'JY-50<&871',
      startTime: '14:30:00',
    },
    checkinUrl,
  });

  assert.strictEqual(message.subject, 'Dags att checka in inför ditt besök hos JumpYard Nacka');
  assert.ok(message.text.includes(checkinUrl), 'Text fallback must contain the original check-in URL.');
  assert.ok(message.text.includes('22 juli 2026'), 'Text fallback must contain the Swedish booking date.');
  assert.ok(message.text.includes('14:30'), 'Text fallback must contain the booking time.');
  assert.ok(message.html.includes('JY-50&lt;&amp;871'), 'HTML must escape the booking reference.');
  assert.ok(message.html.includes('jy_token=preview&amp;source=email'), 'HTML must escape the check-in URL.');
  assert.strictEqual(
    (message.html.match(/>CHECKA IN<\/a>/g) ?? []).length,
    1,
    'Email HTML must offer one check-in action directly after the greeting.',
  );
  assert.ok(!message.html.includes('JY-50<&871'), 'HTML must not contain the raw unsafe booking reference.');
  assert.ok(!message.html.includes('<script'), 'Email HTML must not contain scripts.');
  assert.ok(!message.html.includes('@font-face'), 'Email HTML must not depend on remote fonts.');
  assert.ok(!message.html.includes('data:image'), 'Email HTML must use public image assets instead of data URIs.');
}

function validateDocumentation() {
  const doc = read('docs/t0200-email-sender-readiness.md');
  for (const expected of [
    'kufzx7xe4jqyotkcbvg3iw6hzci54cpw._domainkey.jumpyard.se',
    'd33aqoyuxzkydfrmpgck2v7enhjpmi3y.dkim.amazonses.com',
    '29568860560',
    '29569173836',
    '3,000 recipients in the most extreme operating day',
    '5,000 recipients per 24 hours and 5 recipients per second',
    'Love explicitly approved two separate test messages',
    'Send=3',
    'recipient count',
    'configuration-set sending false',
    'T0201, not T0200',
  ]) {
    assert.ok(doc.includes(expected), `T0200 documentation must include ${expected}.`);
  }
}

validateParkTestConfigs();
validateDevBaseline();
validateImplementation();
validateEmailTemplate();
validateDocumentation();
console.log('[pass] T0200 email sender contract, fail-closed gates, SES telemetry, and handoff documentation');
