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

const task = readRequired('CODEX_TASK.md');
const agents = readRequired('AGENTS.md');
const reference = readRequired('references/github-collaboration-workflow.md');
const repoState = readRequired('REPO_CURRENT_STATE.md');

for (const phrase of [
  'This file is static',
  'codex/gh-<issue-number>-<short-slug>',
  'gh issue view',
  "^codex/gh-(\\d+)-[a-z0-9-]+$",
  'Draft Project items are ideas, not approved implementation scope',
]) {
  if (!task.includes(phrase)) fail(`CODEX_TASK.md missing static resolver phrase: ${phrase}`);
}

for (const forbidden of ['## Ticket ID', '## Ticket Template', 'codex/t0001-short-description', 'NO_ACTIVE_TICKET']) {
  if (task.includes(forbidden)) fail(`CODEX_TASK.md still contains mutable-ticket marker: ${forbidden}`);
}

for (const text of [agents, reference]) {
  if (!text.includes('codex/gh-<issue')) fail('GitHub workflow docs must contain a gh issue-backed branch example');
  if (!text.includes('gh issue view')) fail('GitHub workflow docs must instruct AI to read the issue');
}

if (!agents.includes('Do not rewrite it per branch')) {
  fail('AGENTS.md must keep CODEX_TASK.md static');
}

for (const forbidden of [/^## Current Ticket\s*$/m, /^## Confirmed Next Tickets\s*$/m, /NO_ACTIVE_TICKET/]) {
  if (forbidden.test(repoState)) fail(`REPO_CURRENT_STATE.md contains legacy mutable-ticket marker: ${forbidden}`);
}

if (!repoState.includes('no product implementation Issue is approved')) {
  fail('REPO_CURRENT_STATE.md must state approval without creating a Markdown next-work queue');
}

if (failures > 0) {
  console.error(`Issue-resolver validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Static GitHub issue resolver validation passed.');
