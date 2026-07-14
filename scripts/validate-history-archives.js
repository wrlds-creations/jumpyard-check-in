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
    .filter(line => !/^\|\s*(Ticket|ID|Gate)/i.test(line.trim()))
    .map(line => line.split('|').slice(1, -1).map(normalizeCell))
    .filter(cells => cells.length > 0 && cells[0]);
}

function parseTicketIds(value) {
  return Array.from(new Set((value.match(/T\d{4}/g) || [])));
}

function assertIncludes(sourcePath, sourceText, target) {
  if (!sourceText.includes(target)) fail(`${sourcePath} must link to ${target}`);
}

const archivePaths = [
  'docs/history/completed-tickets.md',
  'docs/history/validation-log.md',
  'docs/history/sprint-1-ticket-history.md',
  'docs/history/followups-done.md',
  'docs/history/github-project-migration-2026-07-14.md',
  'docs/roadmap/backlog.md',
];

function validateRequiredArchives() {
  archivePaths.forEach(readRequired);
}

function validateActiveLinks() {
  const projectContext = readRequired('PROJECT_CONTEXT.md');
  const repoState = readRequired('REPO_CURRENT_STATE.md');
  const followups = readRequired('FOLLOWUPS.md');
  const testPlan = readRequired('TEST_PLAN.md');

  for (const target of archivePaths) {
    assertIncludes('PROJECT_CONTEXT.md', projectContext, target);
    assertIncludes('REPO_CURRENT_STATE.md', repoState, target);
  }

  for (const target of [
    'docs/history/followups-done.md',
    'docs/history/github-project-migration-2026-07-14.md',
  ]) {
    assertIncludes('FOLLOWUPS.md', followups, target);
  }

  assertIncludes('TEST_PLAN.md', testPlan, 'docs/history/validation-log.md');
  assertIncludes('TEST_PLAN.md', testPlan, 'docs/history/github-project-migration-2026-07-14.md');

  if (repoState.length > 12000) {
    fail('REPO_CURRENT_STATE.md should stay short; move historical detail into docs/history or docs/roadmap');
  }

  if (projectContext.length > 12000) {
    fail('PROJECT_CONTEXT.md should stay focused on stable current facts; move ticket narrative into docs/history');
  }
}

function validateCompletedTicketsArchive() {
  const archive = readRequired('docs/history/completed-tickets.md');
  const rows = extractTableRows(extractSection(archive, 'Completed Tickets'));
  const tickets = rows.flatMap(row => parseTicketIds(row[0]));
  const uniqueTickets = new Set(tickets);

  if (rows.length !== 192) fail(`docs/history/completed-tickets.md must preserve exactly 192 legacy ticket rows, found ${rows.length}`);
  if (tickets.length !== uniqueTickets.size) fail('docs/history/completed-tickets.md contains duplicate completed ticket ids');
  if (!uniqueTickets.has('T0127')) fail('docs/history/completed-tickets.md must preserve T0127');
  if (!uniqueTickets.has('T0194')) fail('docs/history/completed-tickets.md must preserve T0194');

  const countMatch = archive.match(/^Archived count:\s*(\d+)$/m);
  if (!countMatch) {
    fail('docs/history/completed-tickets.md is missing Archived count');
  } else if (Number(countMatch[1]) !== 192) {
    fail(`docs/history/completed-tickets.md Archived count must remain 192, found ${countMatch[1]}`);
  } else if (Number(countMatch[1]) !== rows.length) {
    fail(`docs/history/completed-tickets.md Archived count ${countMatch[1]} does not match ${rows.length} table rows`);
  }
}

function validateFollowupArchive() {
  const archive = readRequired('docs/history/followups-done.md');
  const archivedRows = extractTableRows(extractSection(archive, 'Archived Done Followups'));
  if (archivedRows.length === 0) fail('docs/history/followups-done.md has no archived done followups');

  const archivedIds = new Set();
  for (const row of archivedRows) {
    if (row.length !== 9) {
      fail(`archived done followup ${row[0] || '(unknown)'} must have 9 cells, found ${row.length}`);
      continue;
    }
    const [id, previousId, sourceTicket, type, description, priority, owner, status, archiveNote] = row;
    if (!/^FU-\d{3}$/.test(id)) fail(`archived done followup has invalid id ${id || '(blank)'}`);
    if (archivedIds.has(id)) fail(`archived done followups contain duplicate id ${id}`);
    archivedIds.add(id);
    if (previousId && !/^FU-\d{3}$/.test(previousId)) fail(`archived done followup ${id} has invalid previous id ${previousId}`);
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
    if (status && !/^(Done|Closed)$/i.test(status)) fail(`archived done followup ${id} has unexpected status ${status}`);
  }

  const legacySection = extractSection(archive, 'Legacy Resolved Followups');
  const legacyRows = extractTableRows(legacySection);
  if (!legacySection || legacyRows.length === 0) fail('docs/history/followups-done.md must preserve Legacy Resolved Followups');

  const legacyIds = new Set();
  for (const row of legacyRows) {
    if (row.length !== 4) {
      fail(`legacy resolved followup ${row[0] || '(unknown)'} must have 4 cells, found ${row.length}`);
      continue;
    }
    const [id, resolvedIn, resolution, date] = row;
    if (!/^FU-\d{3}$/.test(id)) fail(`legacy resolved followup has invalid id ${id || '(blank)'}`);
    if (legacyIds.has(id)) fail(`legacy resolved followups contain duplicate id ${id}`);
    legacyIds.add(id);
    if (!resolvedIn || !resolution || !date) fail(`legacy resolved followup ${id || '(unknown)'} is missing required evidence`);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`legacy resolved followup ${id} has invalid date ${date}`);
  }
}

function validateRoadmapPolicy() {
  const backlog = readRequired('docs/roadmap/backlog.md');
  const requiredHeadings = ['Source Of Truth', 'Durable Product Guardrails', 'External Gates', 'Migration Record'];
  for (const heading of requiredHeadings) {
    if (!backlog.includes(`## ${heading}`)) fail(`docs/roadmap/backlog.md missing ## ${heading}`);
  }

  for (const forbidden of ['Backlog Columns', 'Now', 'Next', 'Later', 'Parking Lot']) {
    if (backlog.includes(`## ${forbidden}`)) fail(`docs/roadmap/backlog.md still contains mutable ## ${forbidden} section`);
  }

  for (const target of [
    'https://github.com/orgs/wrlds-creations/projects/5',
    '../history/github-project-migration-2026-07-14.md',
  ]) {
    assertIncludes('docs/roadmap/backlog.md', backlog, target);
  }

  const gateSection = extractSection(backlog, 'External Gates');
  const gateRows = gateSection
    .split(/\r?\n/)
    .filter(line => /^\| Gate-\d{2}:/.test(line.trim()));
  if (gateRows.length !== 7) fail(`docs/roadmap/backlog.md must contain exactly 7 durable external gates, found ${gateRows.length}`);
  for (let index = 1; index <= 7; index += 1) {
    const id = `Gate-${String(index).padStart(2, '0')}`;
    if (!gateRows.some(row => row.includes(id))) fail(`docs/roadmap/backlog.md missing ${id}`);
  }
}

validateRequiredArchives();
validateActiveLinks();
validateCompletedTicketsArchive();
validateFollowupArchive();
validateRoadmapPolicy();

if (failures > 0) {
  console.error(`History archive validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('History archive and roadmap policy validation passed.');
