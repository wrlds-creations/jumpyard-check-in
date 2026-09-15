#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib');

function requiredFile(root, file, errors) {
  try {
    lib.assert(fs.statSync(path.join(root, file)).isFile(), `Expected file: ${file}`);
    lib.assert(lib.substantive(lib.read(root, file).replace(/^#+[^\n]*$/gm, '')), `Empty document: ${file}`);
  } catch (error) { errors.push(`${file}: ${error.message}`); }
}
function validateAws(root) {
  const errors = [];
  for (const file of ['AWS_RESOURCES.md', 'references/aws-tagging-standard.md', 'references/aws-resource-naming-standard.md', 'references/aws-cicd-standard.md']) requiredFile(root, file, errors);
  const policyPath = path.join(root, 'references', 'aws-tagging-standard.md');
  if (fs.existsSync(policyPath)) {
    const required = ['Client', 'Project', 'Environment', 'Owner', 'Repository', 'ManagedBy', 'DataClassification', 'Exportable', 'CostCenter', 'CreatedBy'];
    const policy = fs.readFileSync(policyPath, 'utf8');
    for (const tag of required) if (!policy.includes(`WRLDS:${tag}`)) errors.push(`AWS policy missing WRLDS:${tag}.`);
  }
  errors.push(...lib.skillErrors(root, [lib.MODULES.aws.skill]));
  return errors;
}
function validate(root, only = 'all') {
  const errors = []; let config;
  try { config = lib.loadConfig(root); } catch (error) { return [error.message]; }
  if (only === 'all' || only === 'template') {
    for (const file of lib.CORE_DOCS) requiredFile(root, file, errors);
    for (const file of lib.CORE_DOCS.filter(f => fs.existsSync(path.join(root, f)))) errors.push(...lib.referenceErrors(root, path.join(root, file)));
    for (const file of ['.github/ISSUE_TEMPLATE/implementation.yml', '.github/pull_request_template.md', 'scripts/wrlds/resolve-issue.js']) requiredFile(root, file, errors);
    const formPath = path.join(root, '.github', 'ISSUE_TEMPLATE', 'implementation.yml');
    if (fs.existsSync(formPath)) {
      const form = fs.readFileSync(formPath, 'utf8');
      const fields = [...form.matchAll(/^\s*- type:\s*(\S+)([^]*?)(?=^\s*- type:|$(?![^]))/gm)].map(m => ({ type: m[1], text: m[2] }));
      for (const id of ['goal', 'requirements', 'non_goals', 'acceptance_criteria', 'validation']) {
        const matching = fields.filter(field => new RegExp(`^\\s*id:\\s*${id}\\s*$`, 'm').test(field.text));
        if (matching.length !== 1 || !/^\s*required:\s*true\s*$/m.test(matching[0].text)) errors.push(`Issue form requires exactly one mandatory ${id} field.`);
      }
    }
    if (config.mode === 'template') {
      for (const [name, module] of Object.entries(lib.MODULES)) {
        const moduleRoot = path.join(root, 'modules', name);
        errors.push(...lib.skillErrors(moduleRoot, [module.skill]).map(error => `${name} catalog: ${error}`));
      }
      errors.push(...validateAws(path.join(root, 'modules', 'aws')).map(error => `AWS catalog: ${error}`));
    }
  }
  if (only === 'all' || only === 'current-ticket') {
    requiredFile(root, 'CODEX_TASK.md', errors);
    // The static resolver is tested as executable code. Prose does not grant approval or mirror status.
    for (const name of ['lib.js', 'resolve-issue.js']) requiredFile(root, `scripts/wrlds/${name}`, errors);
    const legacy = path.join(root, 'CODEX_TASK.md');
    if (fs.existsSync(legacy) && /^## (?:Ticket ID|Status)\s*$/m.test(fs.readFileSync(legacy, 'utf8'))) errors.push('CODEX_TASK.md still contains mutable ticket fields.');
  }
  if (only === 'all' || only === 'followups') {
    for (const file of ['FOLLOWUPS.md', 'docs/roadmap/backlog.md']) requiredFile(root, file, errors);
    // Catch a second operational table, while preserving historical IDs and durable gates in prose.
    for (const file of ['FOLLOWUPS.md', 'docs/roadmap/backlog.md', 'REPO_CURRENT_STATE.md']) {
      if (!fs.existsSync(path.join(root, file))) continue;
      for (const line of lib.read(root, file).split(/\r?\n/).filter(l => l.trim().startsWith('|'))) {
        const cells = line.split('|').map(c => c.replace(/[`*]/g, '').trim().toLowerCase());
        if (cells.includes('status') && (cells.includes('priority') || cells.includes('ticket'))) errors.push(`${file} contains a duplicate operational queue; keep it in GitHub.`);
      }
    }
  }
  if (only === 'all' || only === 'skills') {
    errors.push(...lib.skillErrors(root, lib.CORE_SKILLS));
    for (const [name, module] of Object.entries(lib.MODULES)) {
      const active = fs.existsSync(path.join(root, '.agents', 'skills', module.skill));
      if (config.modules.includes(name)) errors.push(...lib.skillErrors(root, [module.skill]));
      else if (active) errors.push(`${module.skill} is active but module ${name} is not configured.`);
    }
  }
  if ((only === 'all' || only === 'aws') && config.modules.includes('aws')) errors.push(...validateAws(root));
  return [...new Set(errors)];
}
function main(only = 'all') {
  const errors = validate(lib.findRoot(), only);
  if (errors.length) { errors.forEach(error => console.error(`FAIL: ${error}`)); process.exitCode = 1; }
  else console.log(`WRLDS ${only} validation passed (local structure/contracts only).`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { validate, validateAws, main };
