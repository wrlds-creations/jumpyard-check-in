#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const coreFiles = [
  'package.json',
  'README.md',
  'AGENTS.md',
  'PROJECT_CONTEXT.md',
  'DECISIONS.md',
  'AWS_RESOURCES.md',
  'CODEX_TASK.md',
  'REPO_CURRENT_STATE.md',
  'FOLLOWUPS.md',
  'references/aws-tagging-standard.md',
  'references/aws-resource-naming-standard.md',
  'references/aws-cicd-standard.md',
  'references/skill-naming-standard.md',
  'scripts/validate-template.js',
  'scripts/validate-skills.js',
  'scripts/validate-aws-tags.js',
];

const optionalFiles = [
  'TEST_PLAN.md',
  '.github/pull_request_template.md',
  'references/project-intake-questions.md',
  'references/ui-library-selection.md',
  'references/reddit-stack-evaluation.md',
  'references/codex-working-model.md',
];

const coreSkills = [
  'project-intake',
  'skill-creator',
  'skill-candidate-capture',
  'aws-project-infrastructure',
];

const optionalSkills = [
  'react-native-ui-system',
  'react-native-amplify',
  'berg-airhive-ble-imu',
  'github-ci-fix',
  'github-pr-review',
  'release-notes',
  'codex-repo-audit',
];

const forbiddenRootAssumptions = [
  /android apk/i,
  /android-only/i,
  /ios-only/i,
  /testflight-only/i,
  /react native-only/i,
  /amplify-only/i,
  /mobile-only/i,
];

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function normalizeCell(value) {
  return value.replace(/`/g, '').trim().replace(/\s+/g, ' ');
}

function parseTickets(value) {
  return Array.from(new Set((value.match(/T\d{4}/g) || [])));
}

function parseActiveTicketIds(value) {
  if (!value || /^None active\b/i.test(value)) return [];
  return parseTickets(value);
}

function extractSnapshotValue(text, label) {
  const pattern = new RegExp(`^- ${label}:\\s*(.+)$`, 'm');
  const match = text.match(pattern);
  return match ? normalizeCell(match[1]) : null;
}

function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (startIndex === -1) return '';

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    sectionLines.push(lines[index]);
  }
  return sectionLines.join('\n');
}

function extractTableRows(sectionText) {
  return sectionText
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith('|'))
    .filter(line => !/^\|\s*-+/.test(line.trim()))
    .filter(line => !/^\|\s*Ticket\s*\|/i.test(line.trim()))
    .map(line => line.split('|').slice(1, -1).map(normalizeCell))
    .filter(cells => cells.length > 0 && cells[0]);
}

function extractCompletedTickets(repoStateText) {
  const tickets = new Set(parseTickets(extractSnapshotValue(repoStateText, 'Completed tickets') || ''));
  const archivePath = path.join(root, 'docs', 'history', 'completed-tickets.md');

  if (fs.existsSync(archivePath)) {
    const archiveText = fs.readFileSync(archivePath, 'utf8');
    const archiveRows = extractTableRows(extractSection(archiveText, 'Completed Tickets'));
    for (const row of archiveRows) {
      for (const ticket of parseTickets(row[0])) tickets.add(ticket);
    }
  }

  return Array.from(tickets);
}

function validateRepoCurrentState() {
  const repoStatePath = path.join(root, 'REPO_CURRENT_STATE.md');
  if (!fs.existsSync(repoStatePath)) return;

  const text = fs.readFileSync(repoStatePath, 'utf8');
  const snapshotCurrentTicket = extractSnapshotValue(text, 'Current ticket');
  const snapshotCompletedTickets = extractCompletedTickets(text);
  const snapshotRecommendedNext = extractSnapshotValue(text, 'Recommended next step') || '';
  const completedSet = new Set(snapshotCompletedTickets);
  const completedArchivePath = path.join(root, 'docs', 'history', 'completed-tickets.md');
  const hasCompletedArchive = fs.existsSync(completedArchivePath);

  if (!snapshotCurrentTicket) {
    fail('REPO_CURRENT_STATE.md snapshot is missing Current ticket');
  }

  if (snapshotCompletedTickets.length === 0) {
    fail('completed ticket history is missing from REPO_CURRENT_STATE.md and docs/history/completed-tickets.md');
  }

  const completedRows = hasCompletedArchive
    ? extractTableRows(extractSection(fs.readFileSync(completedArchivePath, 'utf8'), 'Completed Tickets'))
    : extractTableRows(extractSection(text, 'Completed Tickets'));
  const completedTableTickets = completedRows.flatMap(row => parseTickets(row[0]));
  const completedTableSet = new Set(completedTableTickets);

  if (completedTableTickets.length !== completedTableSet.size) {
    fail('REPO_CURRENT_STATE.md Completed Tickets table contains duplicate ticket ids');
  }

  if (hasCompletedArchive && !text.includes('docs/history/completed-tickets.md')) {
    fail('REPO_CURRENT_STATE.md must link to docs/history/completed-tickets.md when completed tickets are archived');
  }

  for (const ticket of parseTickets(extractSnapshotValue(text, 'Completed tickets') || '')) {
    if (!completedTableSet.has(ticket)) {
      fail(`REPO_CURRENT_STATE.md snapshot mentions completed ticket ${ticket}, but the completed-ticket archive/table does not include it`);
    }
  }

  const currentRows = extractTableRows(extractSection(text, 'Current Ticket'));
  if (currentRows.length !== 1) {
    fail(`REPO_CURRENT_STATE.md Current Ticket table must contain exactly one data row, found ${currentRows.length}`);
  } else if (snapshotCurrentTicket && currentRows[0][0] !== snapshotCurrentTicket) {
    fail(`REPO_CURRENT_STATE.md snapshot Current ticket (${snapshotCurrentTicket}) does not match Current Ticket table (${currentRows[0][0]})`);
  }

  const currentTicketIds = parseActiveTicketIds(snapshotCurrentTicket || '');
  for (const ticket of currentTicketIds) {
    if (completedSet.has(ticket)) {
      fail(`REPO_CURRENT_STATE.md current ticket ${ticket} is already listed as completed`);
    }
  }

  const nextRows = extractTableRows(extractSection(text, 'Confirmed Next Tickets'));
  const nextTickets = nextRows.flatMap(row => parseTickets(row[0]));
  const nextSet = new Set(nextTickets);

  if (nextTickets.length !== nextSet.size) {
    fail('REPO_CURRENT_STATE.md Confirmed Next Tickets contains duplicate ticket ids');
  }

  for (const ticket of nextTickets) {
    if (completedSet.has(ticket)) {
      fail(`REPO_CURRENT_STATE.md confirmed next ticket ${ticket} is already listed as completed`);
    }
    if (currentTicketIds.includes(ticket)) {
      fail(`REPO_CURRENT_STATE.md current ticket ${ticket} must not also be in Confirmed Next Tickets`);
    }
  }

  const recommendedTickets = parseTickets(snapshotRecommendedNext);
  for (const ticket of recommendedTickets) {
    if (completedSet.has(ticket)) {
      fail(`REPO_CURRENT_STATE.md recommended next ticket ${ticket} is already listed as completed`);
    }
    if (!nextSet.has(ticket) && !currentTicketIds.includes(ticket)) {
      fail(`REPO_CURRENT_STATE.md recommended next ticket ${ticket} is not in Current Ticket or Confirmed Next Tickets`);
    }
  }
}

for (const file of coreFiles) {
  if (!exists(file)) fail(`missing ${file}`);
}

for (const file of optionalFiles) {
  const fullPath = path.join(root, file);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    fail(`optional path should be a file, not directory: ${file}`);
  }
}

function validateSkillShape(skill, required) {
  if (!exists(path.join('skills', skill, 'SKILL.md'))) {
    if (required) fail(`missing skills/${skill}/SKILL.md`);
    return;
  }
  if (!exists(path.join('skills', skill, 'agents', 'openai.yaml'))) {
    fail(`missing skills/${skill}/agents/openai.yaml`);
  }
}

for (const skill of coreSkills) {
  validateSkillShape(skill, true);
}

for (const skill of optionalSkills) {
  if (exists(path.join('skills', skill))) validateSkillShape(skill, false);
}

const agentsPath = path.join(root, 'AGENTS.md');
if (fs.existsSync(agentsPath)) {
  const agentsText = fs.readFileSync(agentsPath, 'utf8');
  for (const pattern of forbiddenRootAssumptions) {
    if (pattern.test(agentsText)) {
      fail(`AGENTS.md contains root-level project assumption matching ${pattern}`);
    }
  }

  for (const requiredPhrase of [
    'PROJECT_CONTEXT.md',
    'DECISIONS.md',
    'AWS_RESOURCES.md',
    'aws-project-infrastructure',
    'Do not push directly to `main`',
    'Do not commit unless explicitly asked',
  ]) {
    if (!agentsText.includes(requiredPhrase)) {
      fail(`AGENTS.md missing required phrase: ${requiredPhrase}`);
    }
  }
}

validateRepoCurrentState();

if (failures > 0) {
  console.error(`Template validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Template validation passed.');
