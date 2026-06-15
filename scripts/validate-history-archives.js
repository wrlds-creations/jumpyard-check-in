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
    .filter(line => !/^\|\s*(Ticket|ID)/i.test(line.trim()))
    .map(line => line.split('|').slice(1, -1).map(normalizeCell))
    .filter(cells => cells.length > 0 && cells[0]);
}

function parseTicketIds(value) {
  return Array.from(new Set((value.match(/T\d{4}/g) || [])));
}

function assertIncludes(sourcePath, sourceText, target) {
  if (!sourceText.includes(target)) {
    fail(`${sourcePath} must link to ${target}`);
  }
}

function validateRequiredArchives() {
  for (const file of [
    'docs/history/completed-tickets.md',
    'docs/history/validation-log.md',
    'docs/history/sprint-1-ticket-history.md',
    'docs/history/followups-done.md',
    'docs/roadmap/backlog.md',
  ]) {
    readRequired(file);
  }
}

function validateActiveLinks() {
  const projectContext = readRequired('PROJECT_CONTEXT.md');
  const repoState = readRequired('REPO_CURRENT_STATE.md');
  const followups = readRequired('FOLLOWUPS.md');
  const testPlan = readRequired('TEST_PLAN.md');

  for (const target of [
    'docs/history/completed-tickets.md',
    'docs/history/validation-log.md',
    'docs/history/sprint-1-ticket-history.md',
    'docs/history/followups-done.md',
    'docs/roadmap/backlog.md',
  ]) {
    assertIncludes('PROJECT_CONTEXT.md', projectContext, target);
    assertIncludes('REPO_CURRENT_STATE.md', repoState, target);
  }

  assertIncludes('FOLLOWUPS.md', followups, 'docs/history/followups-done.md');
  assertIncludes('TEST_PLAN.md', testPlan, 'docs/history/validation-log.md');

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

  if (rows.length === 0) {
    fail('docs/history/completed-tickets.md has no completed ticket rows');
  }

  if (tickets.length !== uniqueTickets.size) {
    fail('docs/history/completed-tickets.md contains duplicate completed ticket ids');
  }

  if (!uniqueTickets.has('T0127')) {
    fail('docs/history/completed-tickets.md must preserve T0127');
  }

  const countMatch = archive.match(/^Archived count:\s*(\d+)$/m);
  if (!countMatch) {
    fail('docs/history/completed-tickets.md is missing Archived count');
  } else if (Number(countMatch[1]) !== rows.length) {
    fail(`docs/history/completed-tickets.md Archived count ${countMatch[1]} does not match ${rows.length} table rows`);
  }
}

function validateRoadmapBacklog() {
  const backlog = readRequired('docs/roadmap/backlog.md');
  for (const heading of ['Backlog Columns', 'Now', 'Next', 'Later', 'External Gates', 'Parking Lot']) {
    if (!backlog.includes(`## ${heading}`)) {
      fail(`docs/roadmap/backlog.md missing ## ${heading}`);
    }
  }

  const expectedHeader = '| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |';
  if (!backlog.includes(expectedHeader)) {
    fail('docs/roadmap/backlog.md missing expected backlog table header');
  }
}

validateRequiredArchives();
validateActiveLinks();
validateCompletedTicketsArchive();
validateRoadmapBacklog();

if (failures > 0) {
  console.error(`History archive validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('History archive validation passed.');
