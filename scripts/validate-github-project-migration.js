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
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start === -1) return '';
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section.join('\n');
}

function parseRows(section) {
  return section
    .split(/\r?\n/)
    .filter(line => line.trim().startsWith('|'))
    .filter(line => !/^\|\s*-+/.test(line.trim()))
    .filter(line => !/^\|\s*Legacy references/.test(line.trim()))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
}

const expectedFollowups = [
  'FU-009', 'FU-010', 'FU-011', 'FU-013', 'FU-014', 'FU-015', 'FU-018', 'FU-020',
  'FU-021', 'FU-022', 'FU-026', 'FU-027', 'FU-029', 'FU-032', 'FU-035', 'FU-037',
  'FU-038', 'FU-041', 'FU-043', 'FU-044', 'FU-045', 'FU-049', 'FU-051', 'FU-055',
  'FU-056', 'FU-057', 'FU-058', 'FU-059', 'FU-060', 'FU-063', 'FU-066', 'FU-068',
  'FU-069', 'FU-070', 'FU-071', 'FU-072', 'FU-081', 'FU-084', 'FU-086', 'FU-088',
  'FU-091', 'FU-092', 'FU-093', 'FU-094', 'FU-095', 'FU-098', 'FU-099',
];

const projectFollowups = [
  'FU-010', 'FU-011', 'FU-013', 'FU-014', 'FU-015', 'FU-018', 'FU-020', 'FU-021',
  'FU-022', 'FU-026', 'FU-027', 'FU-029', 'FU-032', 'FU-035', 'FU-037', 'FU-038',
  'FU-041', 'FU-043', 'FU-044', 'FU-049', 'FU-051', 'FU-055', 'FU-056', 'FU-057',
  'FU-058', 'FU-059', 'FU-060', 'FU-066', 'FU-068', 'FU-070', 'FU-084', 'FU-086',
  'FU-088', 'FU-091', 'FU-093', 'FU-095', 'FU-098',
];

const externalGateFollowups = ['FU-009', 'FU-045', 'FU-063', 'FU-069', 'FU-071', 'FU-072', 'FU-081', 'FU-094'];
const archivedFollowups = ['FU-092', 'FU-099'];

const projectLegacyRows = [
  'T0195', 'T0196', 'T0197', 'T0198', 'T0199', 'T0200', 'T0201', 'T0202', 'T0203', 'T0204', 'T0205',
  'TBD-02', 'TBD-03', 'TBD-05', 'TBD-07', 'TBD-11', 'TBD-12', 'TBD-13', 'TBD-16',
  'TBD-17', 'TBD-18', 'TBD-19', 'TBD-20', 'TBD-21', 'TBD-22', 'TBD-26', 'Park-05', 'Park-12',
];
const reconciledLegacyRows = ['TBD-01', 'TBD-04', 'Park-09', 'Park-10', 'Park-11'];
const externalGateRows = ['Gate-01', 'Gate-02', 'Gate-03', 'Gate-04', 'Gate-05', 'Gate-06', 'Gate-07'];

const migration = readRequired('docs/history/github-project-migration-2026-07-14.md');
const doneFollowups = readRequired('docs/history/followups-done.md');
const migrationAudit = readRequired('docs/gh-192-github-collaboration-migration-audit.md');
const draftRows = parseRows(extractSection(migration, 'Draft Mapping'));
const draftSection = extractSection(migration, 'Draft Mapping');
const reconciledSection = extractSection(migration, 'Reconciled Legacy Rows Without Independent Drafts');
const externalGateSection = extractSection(migration, 'Durable External Gates');

if (!migration.includes('https://github.com/orgs/wrlds-creations/projects/5')) fail('migration record missing Project #5 link');
if (!migration.includes('https://github.com/wrlds-creations/jumpyard-check-in/issues/192')) fail('migration record missing issue #192 link');
if (!migration.includes('wrlds-creations/wrlds-template@954c66cd311b')) fail('migration record missing exact WRLDS template reference');

for (const phrase of [
  'Default repository',
  'Love manually confirmed',
  'each formerly open follow-up ID has one canonical Legacy ID owner',
  'No application, API, UI, AWS, Roller, Aurora, secret, messaging, Cloudflare, deployment, CI/CD, OIDC, branch-protection, or ruleset behavior changes',
]) {
  if (!migrationAudit.includes(phrase)) fail(`migration audit missing required evidence phrase: ${phrase}`);
}

if (draftRows.length !== 29) fail(`migration record must contain exactly 29 draft rows, found ${draftRows.length}`);

const titles = [];
const itemIds = [];
const nodeIds = [];
const statusCounts = new Map();
const allowedStatuses = new Set(['Backlog', 'Blocked', 'Parked']);
const allowedPriorities = new Set(['P0', 'P1', 'P2', 'P3']);
const allowedWorkTypes = new Set(['Implementation', 'Investigation', 'Decision', 'Maintenance', 'UI/UX', 'Rehearsal', 'Release']);
const allowedTracks = new Set(['Phone', 'Staff/Admin', 'Cloud/API', 'Operations', 'Cross-cutting']);
const allowedOwners = new Set(['WRLDS', 'Love', 'Shared', 'External', 'TBD']);

for (const [rowIndex, row] of draftRows.entries()) {
  if (row.length !== 8) {
    fail(`draft row ${rowIndex + 1} must have 8 cells, found ${row.length}`);
    continue;
  }
  const [legacy, linkedTitle, status, priority, workType, track, owner, nodeIdCell] = row;
  if (!legacy) fail(`draft row ${rowIndex + 1} is missing legacy references`);

  const linkMatch = linkedTitle.match(/^\[([^\]]+)\]\(https:\/\/github\.com\/orgs\/wrlds-creations\/projects\/5\?pane=issue&itemId=(\d+)\)$/);
  if (!linkMatch) {
    fail(`draft row ${rowIndex + 1} has an invalid Project item link`);
  } else {
    titles.push(linkMatch[1]);
    itemIds.push(linkMatch[2]);
  }

  if (!allowedStatuses.has(status)) fail(`draft row ${rowIndex + 1} has invalid status ${status}`);
  if (!allowedPriorities.has(priority)) fail(`draft row ${rowIndex + 1} has invalid priority ${priority}`);
  if (!allowedWorkTypes.has(workType)) fail(`draft row ${rowIndex + 1} has invalid work type ${workType}`);
  if (!allowedTracks.has(track)) fail(`draft row ${rowIndex + 1} has invalid track ${track}`);
  if (!allowedOwners.has(owner)) fail(`draft row ${rowIndex + 1} has invalid owner ${owner}`);
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

  const nodeMatch = nodeIdCell.match(/^`(PVTI_[A-Za-z0-9_-]+)`$/);
  if (!nodeMatch) fail(`draft row ${rowIndex + 1} has an invalid Project node id`);
  else nodeIds.push(nodeMatch[1]);
}

for (const [label, values] of [['title', titles], ['item id', itemIds], ['node id', nodeIds]]) {
  if (new Set(values).size !== values.length) fail(`migration record contains duplicate Project ${label} values`);
  if (values.length !== 29) fail(`migration record must contain 29 valid Project ${label} values, found ${values.length}`);
}

for (const [status, expected] of [['Backlog', 16], ['Blocked', 10], ['Parked', 3]]) {
  const actual = statusCounts.get(status) || 0;
  if (actual !== expected) fail(`draft ${status} count must be ${expected}, found ${actual}`);
}

const foundFollowups = new Set(migration.match(/FU-\d{3}/g) || []);
const expectedSet = new Set(expectedFollowups);
for (const id of expectedFollowups) {
  if (!foundFollowups.has(id)) fail(`migration record does not account for ${id}`);
}
for (const id of foundFollowups) {
  if (!expectedSet.has(id)) fail(`migration record contains unexpected formerly-open followup ${id}`);
}
if (foundFollowups.size !== 47) fail(`migration record must account for 47 unique followups, found ${foundFollowups.size}`);

const draftFollowupOccurrences = draftRows.flatMap(row => row[0].match(/FU-\d{3}/g) || []);
for (const id of projectFollowups) {
  const count = draftFollowupOccurrences.filter(candidate => candidate === id).length;
  if (count !== 1) fail(`Project Legacy ID ownership for ${id} must occur exactly once, found ${count}`);
}
for (const id of [...externalGateFollowups, ...archivedFollowups]) {
  const count = draftFollowupOccurrences.filter(candidate => candidate === id).length;
  if (count !== 0) fail(`${id} belongs to a gate/archive and must not be owned by a Project draft`);
}
if (draftFollowupOccurrences.length !== 37) {
  fail(`draft mapping must contain exactly 37 canonical followup owners, found ${draftFollowupOccurrences.length}`);
}

for (const id of projectLegacyRows) {
  const count = (draftSection.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length;
  if (count !== 1) fail(`draft mapping must preserve ${id} exactly once, found ${count}`);
}
for (const id of reconciledLegacyRows) {
  const count = (reconciledSection.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length;
  if (count !== 1) fail(`reconciled legacy section must preserve ${id} exactly once, found ${count}`);
}
for (const id of externalGateRows) {
  const count = (externalGateSection.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length;
  if (count !== 1) fail(`durable external gates must preserve ${id} exactly once, found ${count}`);
}
for (const id of externalGateFollowups) {
  const count = (externalGateSection.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length;
  if (count !== 1) fail(`durable external gates must own ${id} exactly once, found ${count}`);
}

const gates = externalGateSection
  .split(/\r?\n/)
  .filter(line => /^\| (Roller|SMS|SES|Payment|Adyen|Multi-visit)/.test(line.trim()));
if (gates.length !== 7) fail(`migration record must contain 7 durable external gate rows, found ${gates.length}`);

for (const id of ['FU-092', 'FU-099']) {
  const row = doneFollowups.split(/\r?\n/).find(line => line.startsWith(`| \`${id}\``));
  if (!row) fail(`done followup archive missing ${id}`);
  else if (!/\| Done \|/.test(row)) fail(`${id} archive row must have Done status`);
}

if (failures > 0) {
  console.error(`GitHub Project migration validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('GitHub Project migration validation passed: 29 unique drafts, 47 exact-once followup dispositions, 40 legacy backlog IDs, 7 gates, and 2 archive rows.');
