#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const followupsPath = path.join(root, 'FOLLOWUPS.md');
const archivePath = path.join(root, 'docs/history/followups-done.md');

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function readRequired(relativePath, filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing ${relativePath}`);
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeCell(value) {
  return value.replace(/`/g, '').trim().replace(/\s+/g, ' ');
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
    .filter(line => !/^\|\s*(ID|Ticket)/i.test(line.trim()))
    .map(line => line.split('|').slice(1, -1).map(normalizeCell))
    .filter(cells => cells.length > 0 && cells[0]);
}

function collectFollowupIds(rows) {
  return rows
    .map(row => row[0])
    .filter(value => /^FU-\d{3}$/.test(value));
}

function validateNoDuplicateIds(label, ids) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${label} contains duplicate followup id ${id}`);
    seen.add(id);
  }
}

const followupsText = readRequired('FOLLOWUPS.md', followupsPath);
const archiveText = readRequired('docs/history/followups-done.md', archivePath);

const openRows = extractTableRows(extractSection(followupsText, 'Open Followups'));
if (openRows.length === 0) {
  fail('FOLLOWUPS.md Open Followups table has no rows');
}

validateNoDuplicateIds('FOLLOWUPS.md', collectFollowupIds(openRows));

for (const row of openRows) {
  if (row.length < 7) {
    fail(`FOLLOWUPS.md open followup ${row[0] || '(unknown)'} is missing required columns`);
    continue;
  }
  const status = row[6];
  if (/^(Done|Closed)$/i.test(status)) {
    fail(`FOLLOWUPS.md open followup ${row[0]} has closed status ${status}`);
  }
}

const archivedRows = extractTableRows(extractSection(archiveText, 'Archived Done Followups'));
if (archivedRows.length === 0) {
  fail('docs/history/followups-done.md Archived Done Followups table has no rows');
}

validateNoDuplicateIds('docs/history/followups-done.md Archived Done Followups', collectFollowupIds(archivedRows));

for (const row of archivedRows) {
  const [id, previousId, sourceTicket, type, description, priority, owner, status, archiveNote] = row;
  if (!/^FU-\d{3}$/.test(id || '')) {
    fail(`archived done followup has invalid id ${id || '(blank)'}`);
  }
  if (previousId && !/^FU-\d{3}$/.test(previousId)) {
    fail(`archived done followup ${id} has invalid previous id ${previousId}`);
  }
  for (const [label, value] of [
    ['Source Ticket', sourceTicket],
    ['Type', type],
    ['Description', description],
    ['Priority', priority],
    ['Owner', owner],
    ['Status', status],
    ['Archive Note', archiveNote],
  ]) {
    if (!value) fail(`archived done followup ${id || '(unknown)'} is missing ${label}`);
  }
  if (status && !/^(Done|Closed)$/i.test(status)) {
    fail(`archived done followup ${id} has unexpected status ${status}`);
  }
}

if (!archiveText.includes('## Legacy Resolved Followups')) {
  fail('docs/history/followups-done.md missing Legacy Resolved Followups section');
}

if (failures > 0) {
  console.error(`Followup validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Followup validation passed.');
