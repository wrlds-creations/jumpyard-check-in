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
    assert.strictEqual(config.bookingTimeSms.confirmSend, false, `${file} must keep confirmed sends disabled.`);
    assert.strictEqual(config.bookingTimeSms.scheduleEnabled, false, `${file} must keep the booking-time schedule disabled.`);
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
    'sendingEnabled: false',
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
    "const subject = 'Dags att checka in inför ditt besök hos JumpYard Nacka'",
    'Svara på det här mejlet',
  ]) {
    assert.ok(sessionSource.includes(expected), `Session email implementation must include ${expected}.`);
  }
}

function validateDocumentation() {
  const doc = read('docs/t0200-email-sender-readiness.md');
  for (const expected of [
    'GuestEmailDkimRecordName1',
    'GuestEmailDkimRecordValue3',
    '3,000 recipients in the most extreme operating day',
    '5,000 recipients per 24 hours and 5 recipients per second',
    'separate explicit confirmation immediately before sending',
    'T0201, not T0200',
  ]) {
    assert.ok(doc.includes(expected), `T0200 documentation must include ${expected}.`);
  }
}

validateParkTestConfigs();
validateDevBaseline();
validateImplementation();
validateDocumentation();
console.log('[pass] T0200 email sender contract, fail-closed gates, SES telemetry, and handoff documentation');
