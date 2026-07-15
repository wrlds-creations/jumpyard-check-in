const crypto = require('crypto');
const fs = require('fs');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument near ${key ?? '<end>'}.`);
    values[key.slice(2)] = value;
  }
  for (const required of ['current', 'output', 'release']) {
    if (!values[required]) throw new Error(`Missing --${required}.`);
  }
  return values;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function summarizeResources(current, release) {
  const currentResources = current.Resources ?? {};
  const releaseResources = release.Resources ?? {};
  const currentIds = new Set(Object.keys(currentResources));
  const releaseIds = new Set(Object.keys(releaseResources));
  const added = [...releaseIds].filter((id) => !currentIds.has(id)).sort();
  const removed = [...currentIds].filter((id) => !releaseIds.has(id)).sort();
  const changed = [...releaseIds]
    .filter((id) => currentIds.has(id) && stableJson(currentResources[id]) !== stableJson(releaseResources[id]))
    .sort();
  return { added, changed, removed };
}

function listSectionChanges(current, release, section) {
  const currentValue = current[section] ?? {};
  const releaseValue = release[section] ?? {};
  const keys = new Set([...Object.keys(currentValue), ...Object.keys(releaseValue)]);
  return [...keys].filter((key) => stableJson(currentValue[key]) !== stableJson(releaseValue[key])).sort();
}

function formatList(values) {
  return values.length === 0 ? 'None' : values.map((value) => `\`${value}\``).join(', ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = JSON.parse(fs.readFileSync(args.current, 'utf8'));
  const release = JSON.parse(fs.readFileSync(args.release, 'utf8'));
  const resourceChanges = summarizeResources(current, release);
  const sectionChanges = Object.fromEntries(
    ['Parameters', 'Outputs', 'Rules', 'Conditions', 'Mappings'].map((section) => [
      section,
      listSectionChanges(current, release, section),
    ]),
  );
  const plan = {
    schemaVersion: 1,
    currentTemplateSha256: sha256(current),
    releaseTemplateSha256: sha256(release),
    currentResourceCount: Object.keys(current.Resources ?? {}).length,
    releaseResourceCount: Object.keys(release.Resources ?? {}).length,
    resources: resourceChanges,
    sections: sectionChanges,
  };
  fs.writeFileSync(args.output, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  console.log('## Park-test CloudFormation plan');
  console.log('');
  console.log(`- Current template: \`${plan.currentTemplateSha256}\``);
  console.log(`- Release template: \`${plan.releaseTemplateSha256}\``);
  console.log(`- Resources: ${plan.currentResourceCount} current, ${plan.releaseResourceCount} in release`);
  console.log(`- Added: ${formatList(resourceChanges.added)}`);
  console.log(`- Removed: ${formatList(resourceChanges.removed)}`);
  console.log(`- Changed: ${formatList(resourceChanges.changed)}`);
  for (const [section, values] of Object.entries(sectionChanges)) {
    console.log(`- ${section}: ${formatList(values)}`);
  }
}

main();
