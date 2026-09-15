#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const lib = require('./lib');

function resolve({ root, branch, reference, offline = false, saveCache = false, run, now = () => new Date() }) {
  const config = lib.loadConfig(root);
  const execute = run || ((program, args) => execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim());
  const origin = lib.repositoryFromRemote(execute('git', ['remote', 'get-url', 'origin']));
  lib.assert(lib.sameRepository(origin, config.repository), 'Git origin and .wrlds.json repository disagree.');
  const currentBranch = branch === undefined ? execute('git', ['branch', '--show-current']) : branch;
  let number;
  if (reference) {
    number = lib.parseIssueReference(reference, config.repository).number;
    if (currentBranch.startsWith('codex/gh-')) lib.assert(lib.parseBranch(currentBranch) === number, 'Explicit issue and branch disagree.');
  } else number = lib.parseBranch(currentBranch);
  const identity = { repository: config.repository, number };
  const cachePath = path.join(root, '.wrlds-local', 'issue.json');
  if (offline) {
    lib.assert(!saveCache, '--offline and --save-cache cannot be combined.');
    return lib.validateSnapshot(JSON.parse(fs.readFileSync(cachePath, 'utf8')), identity, now().getTime());
  }
  const issue = JSON.parse(execute('gh', ['issue', 'view', String(number), '--repo', config.repository, '--json', 'number,title,body,state,url,updatedAt']));
  lib.validateIssue(issue, identity);
  const snapshot = { schemaVersion: 1, repository: config.repository, fetchedAt: now().toISOString(), issue };
  if (saveCache) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(snapshot, null, 2) + '\n');
  }
  return { ...snapshot, source: 'GitHub read; authorization comes from the user task' };
}
function main(args = process.argv.slice(2)) {
  const options = { root: lib.findRoot() };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--issue') { lib.assert(args[i + 1], '--issue needs a repository-qualified reference.'); options.reference = args[++i]; }
    else if (args[i] === '--offline') options.offline = true;
    else if (args[i] === '--save-cache') options.saveCache = true;
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  console.log(JSON.stringify(resolve(options), null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(`Issue resolution failed: ${error.message}`); process.exitCode = 1; } }
module.exports = { resolve, main };
