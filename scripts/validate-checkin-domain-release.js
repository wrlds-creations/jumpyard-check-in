const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED = Object.freeze({
  apiBaseUrl: 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com',
  appleAssociationSha256: '8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6',
  checkinOrigin: 'https://checkin.jumpyard.se',
  configPath: 'infra/runtime/config/park-test-full-flow-rehearsal.json',
  messageOrigin: 'https://jumpyard-check-in-park-test.pages.dev/',
  origins: [
    'https://jumpyard-check-in-park-test.pages.dev',
    'https://jumpyard-checkin-admin-park-test.pages.dev',
    'https://jumpyard-check-in-kiosk.pages.dev',
    'https://checkin.jumpyard.se',
  ],
});

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}.`);
    values[key.slice(2)] = value;
  }
  if (!values.release || !values['expected-sha']) {
    throw new Error('Usage: validate-checkin-domain-release.js --release <path> --expected-sha <40-char sha>');
  }
  return values;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedSha = args['expected-sha'];
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('Expected SHA must contain 40 lowercase hex characters.');

  const releaseRoot = path.resolve(args.release);
  const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'manifest.json'), 'utf8'));
  assertEqual(manifest.source?.sha, expectedSha, 'Release source SHA');
  assertEqual(manifest.target?.apiBaseUrl, EXPECTED.apiBaseUrl, 'Frontend API target');
  assertEqual(manifest.target?.environment, 'park-test', 'Release environment');
  assertEqual(manifest.target?.fullFlow?.venueId, '50871', 'Roller Live venue');
  assertEqual(manifest.target?.fullFlow?.gates?.guestMessagingSendsEnabled, false, 'General guest messaging gate');

  const config = JSON.parse(fs.readFileSync(path.join(releaseRoot, EXPECTED.configPath), 'utf8'));
  assertEqual(JSON.stringify(config.api?.allowedCorsOrigins), JSON.stringify(EXPECTED.origins), 'Park-test CORS origins');
  assertEqual(config.bookingTimeSms?.checkinBaseUrl, EXPECTED.messageOrigin, 'Scheduled-message link origin');
  assertEqual(config.guestEmail?.checkinBaseUrl, EXPECTED.messageOrigin, 'Email link origin');
  assertEqual(config.safetyGates?.guestMessagingSendsEnabled, false, 'Copied general guest messaging gate');
  assertEqual(config.safetyGates?.fullFlowRehearsalVenueId, '50871', 'Copied venue boundary');

  const associationPath = path.join(
    releaseRoot,
    'phone',
    'out',
    '.well-known',
    'apple-developer-merchantid-domain-association',
  );
  if (!fs.existsSync(associationPath)) throw new Error('Phone output is missing the Apple Pay domain-association file.');
  assertEqual(sha256(associationPath), EXPECTED.appleAssociationSha256, 'Apple Pay association SHA256');

  console.log(`Validated controlled check-in domain release ${expectedSha}.`);
  console.log(`Allowed alias: ${EXPECTED.checkinOrigin}`);
  console.log('General guest messaging remains closed and message links remain on park-test.');
}

main();
