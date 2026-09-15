#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lib = require('./lib');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function planUpgrade(source, target) {
  const root = path.resolve(target); lib.assert(fs.existsSync(root), 'Target does not exist.');
  const configPath = path.join(root, '.wrlds.json');
  let version = null; let selectedModules = [];
  if (fs.existsSync(configPath)) {
    const config = lib.loadConfig(root); version = config.templateVersion; selectedModules = config.modules;
  }
  const candidates = [...lib.CORE_DOCS, 'README.md', '.wrlds.json', '.gitignore',
    '.github/ISSUE_TEMPLATE/implementation.yml', '.github/pull_request_template.md', '.github/workflows/workflow-validation.yml'];
  for (const directory of ['.agents', 'scripts/wrlds', 'references']) candidates.push(...lib.files(path.join(source, directory)).map(file => path.relative(source, file)));
  const sourceFiles = new Map([...new Set(candidates)].map(relative => [relative, path.join(source, relative)]));
  for (const module of selectedModules) {
    const moduleRoot = path.join(source, 'modules', module);
    for (const file of lib.files(moduleRoot)) sourceFiles.set(path.relative(moduleRoot, file), file);
  }
  return { sourceVersion: lib.loadConfig(source).templateVersion, targetVersion: version, target: root, readOnly: true,
    selectedModules, availableModules: Object.keys(lib.MODULES),
    legacySkills: fs.existsSync(path.join(root, 'skills')) ? fs.readdirSync(path.join(root, 'skills')) : [],
    files: [...sourceFiles].map(([relative, sourceFile]) => {
      const file = path.join(root, relative); const existing = fs.existsSync(file);
      return { file: relative, action: !existing ? 'add after review' : hash(fs.readFileSync(file)) === hash(fs.readFileSync(sourceFile)) ? 'unchanged' : 'merge semantically; preserve project changes' };
    }), note: 'Inventory local AGENTS, legacy skills, module policies, CI and git status before applying. Never overwrite package.json, secrets, project facts or unrelated edits.' };
}
function main(args = process.argv.slice(2)) {
  lib.assert(args.length === 2 && args[0] === '--target', 'Usage: plan-upgrade.js --target <existing project>');
  console.log(JSON.stringify(planUpgrade(lib.findRoot(), args[1]), null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { planUpgrade, main };
