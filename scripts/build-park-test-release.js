const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONTRACT = Object.freeze({
  accountId: '376129878018',
  adminProject: 'jumpyard-checkin-admin-park-test',
  adminUrl: 'https://jumpyard-checkin-admin-park-test.pages.dev',
  apiBaseUrl: 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com',
  cloudflareAccountId: 'dc0a3855bc8a0b1db8fc27ee62bf7d40',
  configPath: 'infra/config/park-test-full-flow-rehearsal.json',
  environment: 'park-test',
  phoneProject: 'jumpyard-check-in-park-test',
  phoneUrl: 'https://jumpyard-check-in-park-test.pages.dev',
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
  for (const required of ['created-at', 'output-root', 'sha', 'source-root']) {
    if (!values[required]) throw new Error(`Missing --${required}.`);
  }
  return values;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(root) {
  const files = [];
  function visit(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release input may not contain a symlink: ${fullPath}`);
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

function copyFile(sourceRoot, outputRoot, sourceRelativePath, destinationRelativePath = sourceRelativePath) {
  const source = path.join(sourceRoot, sourceRelativePath);
  const destination = path.join(outputRoot, destinationRelativePath);
  if (!fs.existsSync(source)) throw new Error(`Required release input is missing: ${sourceRelativePath}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Required release directory is missing: ${source}`);
  }
  fs.cpSync(source, destination, { recursive: true, force: false });
}

function directoryContains(root, text) {
  const needle = Buffer.from(text, 'utf8');
  return listFiles(root).some((filePath) => fs.readFileSync(filePath).includes(needle));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(args['source-root']);
  const outputRoot = path.resolve(args['output-root']);
  const sourceSha = args.sha.toLowerCase();
  const createdAt = new Date(args['created-at']);

  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('Release SHA must be a full 40-character commit SHA.');
  if (Number.isNaN(createdAt.getTime())) throw new Error('Release created-at value must be an ISO date.');
  if (outputRoot === sourceRoot || outputRoot.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error('Release output must be outside the source checkout.');
  }

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const phoneOutput = path.join(sourceRoot, 'jumpyard-checkin-phone', 'out');
  const adminOutput = path.join(sourceRoot, 'jumpyard-checkin-admin', 'out');
  const cdkOutput = path.join(sourceRoot, 'infra', 'cdk.out');
  copyDirectory(phoneOutput, path.join(outputRoot, 'phone', 'out'));
  copyDirectory(adminOutput, path.join(outputRoot, 'admin', 'out'));
  copyDirectory(cdkOutput, path.join(outputRoot, 'infra', 'cdk.out'));

  const runtimeRoot = path.join(outputRoot, 'infra', 'runtime');
  for (const relativePath of [
    'infra/package.json',
    'infra/package-lock.json',
    'infra/tsconfig.json',
    'infra/scripts/run-migrations.ts',
    CONTRACT.configPath,
  ]) {
    copyFile(sourceRoot, runtimeRoot, relativePath, relativePath.replace(/^infra\//, ''));
  }
  copyDirectory(path.join(sourceRoot, 'infra', 'migrations'), path.join(runtimeRoot, 'migrations'));

  const sourceConfigPath = path.join(sourceRoot, CONTRACT.configPath);
  const config = JSON.parse(fs.readFileSync(sourceConfigPath, 'utf8'));
  const expectedGates = {
    emergencyStop: false,
    guestMessagingSendsEnabled: false,
    rollerBookingDraftWritesEnabled: true,
    rollerRedeemWritesEnabled: true,
    rollerWebhookProcessingEnabled: true,
    staffAuthEnabled: true,
  };
  for (const [key, expected] of Object.entries(expectedGates)) {
    if (config.safetyGates?.[key] !== expected) {
      throw new Error(`The release config changed approved gate ${key}; expected ${expected}.`);
    }
  }
  if (
    config.awsAccount !== CONTRACT.accountId ||
    config.awsRegion !== CONTRACT.region ||
    config.resourcePrefix !== 'jumpyard-check-in-park-test' ||
    config.roller?.environment !== 'live' ||
    config.roller?.baseUrl !== 'https://api.roller.app'
  ) {
    throw new Error('The release config does not match the exact park-test AWS/Roller target.');
  }
  if (config.safetyGates?.fullFlowRehearsalVenueId !== '50871') {
    throw new Error('The release config does not preserve the approved Nacka venue boundary.');
  }

  if (!directoryContains(phoneOutput, CONTRACT.apiBaseUrl)) {
    throw new Error('Phone output does not contain the park-test API target.');
  }
  if (!directoryContains(adminOutput, CONTRACT.apiBaseUrl)) {
    throw new Error('Admin output does not contain the park-test API target.');
  }

  const manifest = {
    schemaVersion: 1,
    releaseId: `park-test-${sourceSha}`,
    artifactName: `park-test-release-${sourceSha}`,
    source: {
      repository: CONTRACT.repository,
      sha: sourceSha,
      committedAt: createdAt.toISOString(),
    },
    target: {
      environment: CONTRACT.environment,
      aws: {
        accountId: CONTRACT.accountId,
        region: CONTRACT.region,
        stackName: CONTRACT.stackName,
      },
      cloudflare: {
        accountId: CONTRACT.cloudflareAccountId,
        adminProject: CONTRACT.adminProject,
        adminUrl: CONTRACT.adminUrl,
        phoneProject: CONTRACT.phoneProject,
        phoneUrl: CONTRACT.phoneUrl,
      },
      apiBaseUrl: CONTRACT.apiBaseUrl,
      configPath: CONTRACT.configPath,
      configSha256: sha256File(sourceConfigPath),
      fullFlow: {
        gates: expectedGates,
        venueId: config.safetyGates.fullFlowRehearsalVenueId,
        firstOperatingDate: config.safetyGates.fullFlowRehearsalAllowedOperatingDates?.[0],
        lastOperatingDate: config.safetyGates.fullFlowRehearsalAllowedOperatingDates?.at(-1),
      },
    },
    components: {
      adminOutputSha256: treeHash(path.join(outputRoot, 'admin', 'out')),
      cdkAssemblySha256: treeHash(path.join(outputRoot, 'infra', 'cdk.out')),
      migrationRuntimeSha256: treeHash(runtimeRoot),
      phoneOutputSha256: treeHash(path.join(outputRoot, 'phone', 'out')),
    },
  };

  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const checksumLines = listFiles(outputRoot)
    .filter((filePath) => path.basename(filePath) !== 'checksums.sha256')
    .map((filePath) => {
      const relative = path.relative(outputRoot, filePath).split(path.sep).join('/');
      return `${sha256File(filePath)}  ${relative}`;
    });
  fs.writeFileSync(path.join(outputRoot, 'checksums.sha256'), `${checksumLines.join('\n')}\n`, 'utf8');

  console.log(`Built ${manifest.artifactName}`);
  console.log(`Manifest SHA256: ${sha256File(path.join(outputRoot, 'manifest.json'))}`);
  console.log(`Files: ${checksumLines.length + 1}`);
}

main();
