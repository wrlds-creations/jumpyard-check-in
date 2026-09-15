#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const requiredTags = [
  'WRLDS:Client',
  'WRLDS:Project',
  'WRLDS:Environment',
  'WRLDS:Owner',
  'WRLDS:Repository',
  'WRLDS:ManagedBy',
  'WRLDS:DataClassification',
  'WRLDS:Exportable',
  'WRLDS:CostCenter',
  'WRLDS:CreatedBy',
];

const filesToCheck = [
  'AWS_RESOURCES.md',
  'references/aws-tagging-standard.md',
  'references/aws-cicd-standard.md',
  'skills/aws-project-infrastructure/SKILL.md',
  'skills/aws-project-infrastructure/references/tagging.md',
];

const activeConfigDirectory = path.join(root, 'infra', 'config');
const expectedJumpYardTags = {
  'WRLDS:Client': 'JumpYard',
  'WRLDS:CostCenter': 'JumpYard',
  'WRLDS:ManagedBy': 'cdk',
};

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

for (const relativePath of filesToCheck) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${relativePath}`);
    continue;
  }

  const text = fs.readFileSync(fullPath, 'utf8');
  for (const tag of requiredTags) {
    if (!text.includes(tag)) {
      fail(`${relativePath} missing ${tag}`);
    }
  }
}

for (const filename of fs.readdirSync(activeConfigDirectory)) {
  if (!filename.endsWith('.json') || filename === 'dev.example.json') {
    continue;
  }

  const relativePath = path.join('infra', 'config', filename);
  const config = JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

  for (const [tagKey, expectedValue] of Object.entries(expectedJumpYardTags)) {
    if (config.tags?.[tagKey] !== expectedValue) {
      fail(`${relativePath} must set ${tagKey}=${expectedValue}`);
    }
  }
}

const deploymentAccessStackPath = path.join(root, 'infra', 'lib', 'github-deployment-access-stack.ts');
const deploymentAccessStack = fs.readFileSync(deploymentAccessStackPath, 'utf8');
if (!deploymentAccessStack.includes("'WRLDS:CostCenter': 'JumpYard'")) {
  fail('infra/lib/github-deployment-access-stack.ts must set WRLDS:CostCenter=JumpYard');
}

if (failures > 0) {
  console.error(`AWS tag validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('AWS tag validation passed.');
