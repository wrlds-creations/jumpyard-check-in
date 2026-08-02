#!/usr/bin/env node
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const { buildCheckinEmailMessage } = require('../infra/lambda/session/email-template');

const EXPECTED_ACCOUNT = '376129878018';
const EXPECTED_REGION = 'eu-north-1';
const EXPECTED_CONFIGURATION_SET = 'jumpyard-check-in-park-test-email';
const EXPECTED_IDENTITY = 'jumpyard.se';
const EXPECTED_FROM_ADDRESS = 'nackaforum@jumpyard.se';
const EXPECTED_FROM_DISPLAY_NAME = 'JumpYard Nacka';
const EXPECTED_REPLY_TO = 'nackaforum@jumpyard.se';
const EXPECTED_SESSION_FUNCTION = 'jumpyard-check-in-park-test-stack-session';
const EXPECTED_CHECKIN_ORIGIN = 'https://jumpyard-check-in-park-test.pages.dev/';
const WRITE_ENVIRONMENT_VARIABLE = 'T0200_CONTROLLED_EMAIL_ALLOW_WRITE';
const WRITE_CONFIRMATIONS = Object.freeze({
  1: 'I_APPROVE_T0200_ONE_CONTROLLED_TEST_EMAIL',
  2: 'I_APPROVE_T0200_TWO_CONTROLLED_TEST_EMAILS',
});
const APPROVED_RECIPIENT_HASHES = Object.freeze([
  '3aef22d73443d92ef3bdeae82cab5103e32bd7cb2fb0ab3ce998a937346220da',
  'e3de46ff2113717fb533a0cd11a158454cbfb5ef283799c826a11ba4109789c1',
]);

function parseArgs(argv) {
  const args = {
    apply: false,
    confirm: '',
    json: false,
    profile: undefined,
    recipients: [],
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--confirm') args.confirm = argv[++index] || '';
    else if (arg === '--profile') args.profile = argv[++index] || undefined;
    else if (arg === '--recipient') args.recipients.push(argv[++index] || '');
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error('Every controlled recipient must be a valid email address.');
  }
  return normalized;
}

function recipientHash(value) {
  return crypto.createHash('sha256').update(normalizeEmail(value)).digest('hex');
}

function validateApprovedRecipients(recipients) {
  const normalized = recipients.map(normalizeEmail);
  if (normalized.length < 1 || normalized.length > 2 || new Set(normalized).size !== normalized.length) {
    throw new Error('The controlled proof requires one or two distinct approved recipients.');
  }

  const hashes = normalized.map(recipientHash);
  assert.ok(
    hashes.every((hash) => APPROVED_RECIPIENT_HASHES.includes(hash)),
    'Every recipient must match an approved T0200 test destination.',
  );
  return normalized;
}

function maskEmail(value) {
  const [local, domain] = normalizeEmail(value).split('@');
  const domainParts = domain.split('.');
  const topLevel = domainParts.pop();
  const domainName = domainParts.join('.') || '';
  return `${local.slice(0, 1)}***@${domainName.slice(0, 1)}***.${topLevel}`;
}

function assertWriteGuard(args, recipientCount, environment = process.env) {
  if (!args.apply) return;
  const writeConfirmation = WRITE_CONFIRMATIONS[recipientCount];
  if (
    !writeConfirmation ||
    args.confirm !== writeConfirmation ||
    environment[WRITE_ENVIRONMENT_VARIABLE] !== writeConfirmation
  ) {
    throw new Error(
      `Apply requires --confirm ${writeConfirmation || '<recipient-count-specific-confirmation>'} and ` +
        `${WRITE_ENVIRONMENT_VARIABLE}=${writeConfirmation || '<recipient-count-specific-confirmation>'}.`,
    );
  }
}

function awsJson(args, context, options = {}) {
  const globalArgs = ['--region', EXPECTED_REGION, '--output', 'json'];
  if (context.profile) globalArgs.push('--profile', context.profile);

  try {
    const output = execFileSync('aws', [...args, ...globalArgs], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return output.trim() ? JSON.parse(output) : {};
  } catch (error) {
    const stderr = String(error?.stderr || '');
    if (options.allowNotFound && stderr.includes('NotFoundException')) return null;
    const operation = `${args[0] || 'aws'} ${args[1] || ''}`.trim();
    throw new Error(`AWS ${operation} failed during the guarded T0200 proof.`);
  }
}

function getConfigurationSet(context) {
  return awsJson(
    [
      'sesv2',
      'get-configuration-set',
      '--configuration-set-name',
      EXPECTED_CONFIGURATION_SET,
    ],
    context,
  );
}

function setConfigurationSetSending(context, enabled) {
  awsJson(
    [
      'sesv2',
      'put-configuration-set-sending-options',
      '--configuration-set-name',
      EXPECTED_CONFIGURATION_SET,
      enabled ? '--sending-enabled' : '--no-sending-enabled',
    ],
    context,
  );
  const readback = getConfigurationSet(context);
  assert.strictEqual(
    readback?.SendingOptions?.SendingEnabled,
    enabled,
    `Configuration-set sending must read back as ${enabled}.`,
  );
}

function runPreflight(context, recipients) {
  const identity = awsJson(['sts', 'get-caller-identity'], context);
  assert.strictEqual(identity.Account, EXPECTED_ACCOUNT, 'AWS account mismatch.');

  const account = awsJson(['sesv2', 'get-account'], context);
  assert.strictEqual(account.SendingEnabled, true, 'SES account sending must be enabled.');
  assert.strictEqual(account.ProductionAccessEnabled, true, 'SES production access must be enabled.');

  const emailIdentity = awsJson(
    ['sesv2', 'get-email-identity', '--email-identity', EXPECTED_IDENTITY],
    context,
  );
  assert.strictEqual(emailIdentity.VerifiedForSendingStatus, true, 'SES identity must be verified.');
  assert.strictEqual(emailIdentity?.DkimAttributes?.Status, 'SUCCESS', 'SES DKIM must report SUCCESS.');
  assert.strictEqual(emailIdentity?.DkimAttributes?.SigningEnabled, true, 'SES DKIM signing must be enabled.');

  const configurationSet = getConfigurationSet(context);
  assert.strictEqual(
    configurationSet?.SendingOptions?.SendingEnabled,
    false,
    'The configuration set must start in its fail-closed state.',
  );
  assert.strictEqual(configurationSet?.DeliveryOptions?.TlsPolicy, 'REQUIRE', 'The configuration set must require TLS.');
  assert.deepStrictEqual(
    [...(configurationSet?.SuppressionOptions?.SuppressedReasons || [])].sort(),
    ['BOUNCE', 'COMPLAINT'],
    'The configuration set must suppress bounce and complaint destinations.',
  );

  const eventDestinations = awsJson(
    [
      'sesv2',
      'get-configuration-set-event-destinations',
      '--configuration-set-name',
      EXPECTED_CONFIGURATION_SET,
    ],
    context,
  );
  assert.ok(
    (eventDestinations.EventDestinations || []).some((destination) => destination.Enabled === true),
    'The SES event destination must be enabled.',
  );

  const lambda = awsJson(
    ['lambda', 'get-function-configuration', '--function-name', EXPECTED_SESSION_FUNCTION],
    context,
  );
  const variables = lambda?.Environment?.Variables || {};
  assert.strictEqual(variables.ENABLE_GUEST_MESSAGE_SENDS, 'false', 'Application guest sends must stay disabled.');
  assert.strictEqual(variables.EMAIL_CONFIGURATION_SET_NAME, EXPECTED_CONFIGURATION_SET);
  assert.strictEqual(variables.EMAIL_FROM_ADDRESS, EXPECTED_FROM_ADDRESS);
  assert.strictEqual(variables.EMAIL_FROM_DISPLAY_NAME, EXPECTED_FROM_DISPLAY_NAME);
  assert.strictEqual(variables.EMAIL_REPLY_TO_ADDRESSES, EXPECTED_REPLY_TO);
  assert.strictEqual(variables.CHECKIN_EMAIL_BASE_URL, EXPECTED_CHECKIN_ORIGIN);

  const simulation = awsJson(
    [
      'iam',
      'simulate-principal-policy',
      '--policy-source-arn',
      lambda.Role,
      '--action-names',
      'ses:SendEmail',
      'ses:SendRawEmail',
      '--resource-arns',
      `arn:aws:ses:${EXPECTED_REGION}:${EXPECTED_ACCOUNT}:identity/${EXPECTED_IDENTITY}`,
    ],
    context,
  );
  assert.ok(
    (simulation.EvaluationResults || []).every((result) => result.EvalDecision !== 'allowed'),
    'The application Lambda must not have SES send permission during the controlled proof.',
  );

  const rules = awsJson(
    ['events', 'list-rules', '--name-prefix', 'jumpyard-check-in-park-test'],
    context,
  );
  assert.ok(
    (rules.Rules || []).every((rule) => !/(email|message|sms)/i.test(rule.Name || '')),
    'No booking-time guest messaging rule may exist during the controlled proof.',
  );

  const alarms = awsJson(
    [
      'cloudwatch',
      'describe-alarms',
      '--alarm-name-prefix',
      'jumpyard-check-in-park-test-email',
      '--state-value',
      'ALARM',
    ],
    context,
  );
  assert.strictEqual((alarms.MetricAlarms || []).length, 0, 'No park-test email alarm may start in ALARM.');

  for (const recipient of recipients) {
    const suppressed = awsJson(
      ['sesv2', 'get-suppressed-destination', '--email-address', recipient],
      context,
      { allowNotFound: true },
    );
    assert.strictEqual(suppressed, null, `Approved recipient ${maskEmail(recipient)} is currently suppressed.`);
  }

  return {
    account: identity.Account,
    applicationGuestSendsEnabled: variables.ENABLE_GUEST_MESSAGE_SENDS,
    configurationSetSendingEnabled: configurationSet.SendingOptions.SendingEnabled,
    dkimStatus: emailIdentity.DkimAttributes.Status,
    max24HourSend: account.SendQuota?.Max24HourSend ?? null,
    maxSendRate: account.SendQuota?.MaxSendRate ?? null,
    productionAccessEnabled: account.ProductionAccessEnabled,
    recipientCount: recipients.length,
    recipients: recipients.map(maskEmail),
    region: EXPECTED_REGION,
    sessionLambdaSesPermission: 'denied',
  };
}

function buildControlledMessage() {
  return buildCheckinEmailMessage({
    booking: {
      bookingDate: '2026-07-22',
      bookingReference: 'T0200-TEST',
      startTime: '14:30:00',
    },
    checkinUrl: `${EXPECTED_CHECKIN_ORIGIN}?jy_token=t0200-preview-only-not-a-real-token`,
  });
}

function sendControlledMessage(context, recipient, message) {
  const input = {
    ConfigurationSetName: EXPECTED_CONFIGURATION_SET,
    Content: {
      Simple: {
        Body: {
          Html: { Charset: 'UTF-8', Data: message.html },
          Text: { Charset: 'UTF-8', Data: message.text },
        },
        Subject: { Charset: 'UTF-8', Data: message.subject },
      },
    },
    Destination: { ToAddresses: [recipient] },
    FromEmailAddress: `${EXPECTED_FROM_DISPLAY_NAME} <${EXPECTED_FROM_ADDRESS}>`,
    ReplyToAddresses: [EXPECTED_REPLY_TO],
  };
  const response = awsJson(
    ['sesv2', 'send-email', '--cli-input-json', JSON.stringify(input)],
    context,
  );
  assert.ok(response.MessageId, 'SES must return a provider message id.');
  return {
    messageId: response.MessageId,
    recipient: maskEmail(recipient),
  };
}

function selfTest() {
  assert.strictEqual(maskEmail('test@example.com'), 't***@e***.com');
  assert.strictEqual(recipientHash('Example@Example.com'), recipientHash(' example@example.com '));
  assert.throws(() => validateApprovedRecipients([]), /one or two distinct/);
  assert.throws(
    () => validateApprovedRecipients(['one@example.com', 'two@example.com', 'three@example.com']),
    /one or two distinct/,
  );
  assert.throws(
    () => validateApprovedRecipients(['one@example.com', 'two@example.com']),
    /Every recipient/,
  );
  assert.throws(
    () => assertWriteGuard({ apply: true, confirm: '' }, 1, {}),
    /Apply requires/,
  );
  assert.doesNotThrow(() =>
    assertWriteGuard(
      { apply: true, confirm: WRITE_CONFIRMATIONS[1] },
      1,
      { [WRITE_ENVIRONMENT_VARIABLE]: WRITE_CONFIRMATIONS[1] },
    ),
  );
  assert.doesNotThrow(() =>
    assertWriteGuard(
      { apply: true, confirm: WRITE_CONFIRMATIONS[2] },
      2,
      { [WRITE_ENVIRONMENT_VARIABLE]: WRITE_CONFIRMATIONS[2] },
    ),
  );
  const message = buildControlledMessage();
  assert.strictEqual(message.subject, 'Dags att checka in inför ditt besök hos JumpYard Nacka');
  assert.strictEqual((message.html.match(/>CHECKA IN<\/a>/g) || []).length, 1);
  assert.ok(message.html.includes('T0200-TEST'));
  assert.ok(message.html.includes('t0200-preview-only-not-a-real-token'));
  return {
    approvedRecipientCount: APPROVED_RECIPIENT_HASHES.length,
    awsCalls: false,
    configurationSetRestoredInFinally: true,
    writeGuard: 'pass',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    console.log(JSON.stringify({ mode: 'self-test', ...selfTest() }, null, 2));
    return;
  }

  const recipients = validateApprovedRecipients(args.recipients);
  assertWriteGuard(args, recipients.length);
  const context = { profile: args.profile };
  const preflight = runPreflight(context, recipients);
  if (!args.apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          preflight,
          sendCount: 0,
          sender: `${EXPECTED_FROM_DISPLAY_NAME} <${EXPECTED_FROM_ADDRESS}>`,
          replyTo: EXPECTED_REPLY_TO,
          subject: buildControlledMessage().subject,
          writeGuardRequired: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  let configurationSetOpened = false;
  const receipts = [];
  try {
    setConfigurationSetSending(context, true);
    configurationSetOpened = true;
    const message = buildControlledMessage();
    for (const recipient of recipients) {
      receipts.push(sendControlledMessage(context, recipient, message));
    }
  } finally {
    if (configurationSetOpened || getConfigurationSet(context)?.SendingOptions?.SendingEnabled === true) {
      setConfigurationSetSending(context, false);
    }
  }

  const finalState = getConfigurationSet(context)?.SendingOptions?.SendingEnabled;
  assert.strictEqual(finalState, false, 'The configuration set must finish fail-closed.');
  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        preflight,
        receipts,
        sendCount: receipts.length,
        configurationSetSendingEnabledAfter: finalState,
        applicationGuestSendsEnabledAfter: false,
        scheduleEnabledAfter: false,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(`[blocked] ${error.message}`);
  process.exitCode = 1;
}
