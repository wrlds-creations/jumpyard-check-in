const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED = Object.freeze({
  accountId: '376129878018',
  adminProject: 'jumpyard-checkin-admin-park-test',
  adminUrl: 'https://jumpyard-checkin-admin-park-test.pages.dev',
  apiBaseUrl: 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com',
  cloudflareAccountId: 'dc0a3855bc8a0b1db8fc27ee62bf7d40',
  configPath: 'infra/config/park-test-full-flow-rehearsal.json',
  environment: 'park-test',
  businessRole: 'nacka-pilot-production',
  phoneProject: 'jumpyard-check-in-park-test',
  phoneUrl: 'https://jumpyard-check-in-park-test.pages.dev',
  publicAdminProject: 'jumpyard-checkin-admin-production',
  publicAdminUrl: 'https://staff-checkin.jumpyard.se',
  publicPhoneProject: 'jumpyard-check-in-production',
  publicPhoneUrl: 'https://checkin.jumpyard.se',
  region: 'eu-north-1',
  repository: 'wrlds-creations/jumpyard-check-in',
  stackName: 'jumpyard-check-in-park-test-stack',
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
    throw new Error('Usage: validate-park-test-release.js --release <path> --expected-sha <40-char sha>');
  }
  return values;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release may not contain a symlink: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  visit(root);
  return files;
}

function treeHash(root) {
  const hash = crypto.createHash('sha256');
  for (const filePath of listFiles(root)) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}.`);
}

function directoryContains(root, text) {
  const needle = Buffer.from(text, 'utf8');
  return listFiles(root).some((filePath) => fs.readFileSync(filePath).includes(needle));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const releaseRoot = path.resolve(args.release);
  const expectedSha = args['expected-sha'].toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('Expected SHA must contain 40 lowercase hex characters.');
  const manifestPath = path.join(releaseRoot, 'manifest.json');
  const checksumsPath = path.join(releaseRoot, 'checksums.sha256');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(checksumsPath)) {
    throw new Error('Release is missing manifest.json or checksums.sha256.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assertEqual(manifest.schemaVersion, 1, 'Manifest schema');
  assertEqual(manifest.releaseId, `park-test-${expectedSha}`, 'Release id');
  assertEqual(manifest.artifactName, `park-test-release-${expectedSha}`, 'Artifact name');
  assertEqual(manifest.source?.repository, EXPECTED.repository, 'Repository');
  assertEqual(manifest.source?.sha, expectedSha, 'Source SHA');
  assertEqual(manifest.target?.environment, EXPECTED.environment, 'Environment');
  assertEqual(manifest.target?.businessRole, EXPECTED.businessRole, 'Business role');
  assertEqual(manifest.target?.aws?.accountId, EXPECTED.accountId, 'AWS account');
  assertEqual(manifest.target?.aws?.region, EXPECTED.region, 'AWS region');
  assertEqual(manifest.target?.aws?.stackName, EXPECTED.stackName, 'AWS stack');
  assertEqual(manifest.target?.cloudflare?.accountId, EXPECTED.cloudflareAccountId, 'Cloudflare account');
  assertEqual(manifest.target?.cloudflare?.phoneProject, EXPECTED.phoneProject, 'Phone project');
  assertEqual(manifest.target?.cloudflare?.phoneUrl, EXPECTED.phoneUrl, 'Phone URL');
  assertEqual(manifest.target?.cloudflare?.adminProject, EXPECTED.adminProject, 'Admin project');
  assertEqual(manifest.target?.cloudflare?.adminUrl, EXPECTED.adminUrl, 'Admin URL');
  assertEqual(manifest.target?.cloudflare?.publicPhoneProject, EXPECTED.publicPhoneProject, 'Public phone project');
  assertEqual(manifest.target?.cloudflare?.publicPhoneUrl, EXPECTED.publicPhoneUrl, 'Public phone URL');
  assertEqual(manifest.target?.cloudflare?.publicAdminProject, EXPECTED.publicAdminProject, 'Public admin project');
  assertEqual(manifest.target?.cloudflare?.publicAdminUrl, EXPECTED.publicAdminUrl, 'Public admin URL');
  assertEqual(manifest.target?.apiBaseUrl, EXPECTED.apiBaseUrl, 'API target');
  assertEqual(manifest.target?.configPath, EXPECTED.configPath, 'Config path');
  assertEqual(manifest.target?.fullFlow?.venueId, '50871', 'Full-flow venue');
  assertEqual(manifest.target?.fullFlow?.lastOperatingDate, '2026-09-30', 'Full-flow end date');

  const expectedGates = {
    emergencyStop: false,
    guestMessagingSendsEnabled: false,
    rollerBookingDraftWritesEnabled: true,
    rollerRedeemWritesEnabled: true,
    rollerWebhookProcessingEnabled: true,
    staffAuthEnabled: true,
  };
  for (const [key, expected] of Object.entries(expectedGates)) {
    assertEqual(manifest.target?.fullFlow?.gates?.[key], expected, `Full-flow gate ${key}`);
  }

  const expectedChecksumEntries = new Map();
  for (const line of fs.readFileSync(checksumsPath, 'utf8').trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})  ([^\\].*)$/);
    if (!match || match[2].includes('..') || path.isAbsolute(match[2])) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    if (expectedChecksumEntries.has(match[2])) throw new Error(`Duplicate checksum path: ${match[2]}`);
    expectedChecksumEntries.set(match[2], match[1]);
  }
  const actualFiles = listFiles(releaseRoot)
    .map((filePath) => path.relative(releaseRoot, filePath).split(path.sep).join('/'))
    .filter((relative) => relative !== 'checksums.sha256');
  if (actualFiles.length !== expectedChecksumEntries.size) {
    throw new Error(`Checksum file count mismatch: ${expectedChecksumEntries.size} listed, ${actualFiles.length} present.`);
  }
  for (const relative of actualFiles) {
    const expectedHash = expectedChecksumEntries.get(relative);
    if (!expectedHash) throw new Error(`Unlisted release file: ${relative}`);
    assertEqual(sha256File(path.join(releaseRoot, relative)), expectedHash, `Checksum ${relative}`);
  }

  const phoneRoot = path.join(releaseRoot, 'phone', 'out');
  const adminRoot = path.join(releaseRoot, 'admin', 'out');
  const assemblyRoot = path.join(releaseRoot, 'infra', 'cdk.out');
  const runtimeRoot = path.join(releaseRoot, 'infra', 'runtime');
  assertEqual(treeHash(phoneRoot), manifest.components?.phoneOutputSha256, 'Phone tree');
  assertEqual(treeHash(adminRoot), manifest.components?.adminOutputSha256, 'Admin tree');
  assertEqual(treeHash(assemblyRoot), manifest.components?.cdkAssemblySha256, 'CDK assembly tree');
  assertEqual(treeHash(runtimeRoot), manifest.components?.migrationRuntimeSha256, 'Migration runtime tree');

  if (!directoryContains(phoneRoot, EXPECTED.apiBaseUrl) || !directoryContains(adminRoot, EXPECTED.apiBaseUrl)) {
    throw new Error('A frontend output is missing the exact park-test API target.');
  }
  const copiedConfigPath = path.join(runtimeRoot, 'config', 'park-test-full-flow-rehearsal.json');
  assertEqual(sha256File(copiedConfigPath), manifest.target.configSha256, 'Config checksum');
  const copiedConfig = JSON.parse(fs.readFileSync(copiedConfigPath, 'utf8'));
  for (const [key, expected] of Object.entries(expectedGates)) {
    assertEqual(copiedConfig.safetyGates?.[key], expected, `Copied config gate ${key}`);
  }

  const assembly = JSON.parse(fs.readFileSync(path.join(assemblyRoot, 'manifest.json'), 'utf8'));
  const stackArtifact = assembly.artifacts?.[EXPECTED.stackName];
  if (stackArtifact?.type !== 'aws:cloudformation:stack') {
    throw new Error(`CDK assembly does not contain ${EXPECTED.stackName}.`);
  }
  const environment = stackArtifact.environment ?? '';
  if (!environment.includes(EXPECTED.accountId) || !environment.includes(EXPECTED.region)) {
    throw new Error(`CDK assembly target mismatch: ${environment}`);
  }
  const templatePath = path.join(assemblyRoot, stackArtifact.properties?.templateFile ?? '');
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  if (!template.Resources || Object.keys(template.Resources).length < 100) {
    throw new Error('CDK assembly template is unexpectedly small.');
  }

  console.log(`Validated ${manifest.artifactName}`);
  console.log(`Manifest SHA256: ${sha256File(manifestPath)}`);
  console.log(`Files verified: ${actualFiles.length}`);
}

main();
