#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function readRequired(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

const followups = readRequired('FOLLOWUPS.md');
const backlog = readRequired('docs/roadmap/backlog.md');

for (const phrase of ['GitHub Project draft issues', 'Durable External Gates', 'docs/history/followups-done.md']) {
  if (!followups.includes(phrase)) fail(`FOLLOWUPS.md missing policy phrase: ${phrase}`);
}

for (const forbidden of [/^## Open Followups\s*$/m, /\bFU-\d{3,}\b/i]) {
  if (forbidden.test(followups)) fail(`FOLLOWUPS.md contains legacy operational ledger marker: ${forbidden}`);
}

for (const phrase of [
  'Operational work is managed',
  'https://github.com/orgs/wrlds-creations/projects/5',
  'Durable Product Guardrails',
  'External Gates',
  'Migration Record',
  'Park-09',
  'Park-10',
  'Park-11',
  'technical source-contract gate',
  'product-boundary gate',
]) {
  if (!backlog.includes(phrase)) fail(`docs/roadmap/backlog.md missing policy phrase: ${phrase}`);
}

for (const forbidden of [/^## Now\s*$/m, /^## Next\s*$/m, /^## Later\s*$/m, /^## Parking Lot\s*$/m]) {
  if (forbidden.test(backlog)) fail(`docs/roadmap/backlog.md contains legacy operational section: ${forbidden}`);
}

if (failures > 0) {
  console.error(`GitHub follow-up policy validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('GitHub follow-up and backlog policy validation passed.');
