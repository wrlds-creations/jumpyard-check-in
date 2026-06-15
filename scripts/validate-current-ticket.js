#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const codeTaskPath = path.join(root, 'CODEX_TASK.md');
const repoStatePath = path.join(root, 'REPO_CURRENT_STATE.md');

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

function extractCodeTaskTicket(text) {
  const ticketSection = text.match(/^## Ticket ID\s*\r?\n+([^\r\n]+)/mi);
  if (ticketSection) {
    return parseTickets(ticketSection[1])[0] || null;
  }
  return null;
}

const codeTaskText = readRequired('CODEX_TASK.md', codeTaskPath);
const repoStateText = readRequired('REPO_CURRENT_STATE.md', repoStatePath);

const codeTaskTicket = extractCodeTaskTicket(codeTaskText);
const snapshotCurrentTicket = extractSnapshotValue(repoStateText, 'Current ticket');
const snapshotCompletedTickets = parseTickets(extractSnapshotValue(repoStateText, 'Completed tickets') || '');
const snapshotRecommendedNext = extractSnapshotValue(repoStateText, 'Recommended next step') || '';
const completedSet = new Set(snapshotCompletedTickets);
const activeTickets = parseActiveTicketIds(snapshotCurrentTicket || '');

if (!snapshotCurrentTicket) {
  fail('REPO_CURRENT_STATE.md snapshot is missing Current ticket');
}

if (activeTickets.length === 0 && codeTaskTicket) {
  fail(`REPO_CURRENT_STATE.md says no active ticket, but CODEX_TASK.md points to ${codeTaskTicket}`);
}

if (activeTickets.length > 0) {
  if (!codeTaskTicket) {
    fail(`REPO_CURRENT_STATE.md active ticket is ${activeTickets.join(', ')}, but CODEX_TASK.md has no Ticket ID`);
  } else if (!activeTickets.includes(codeTaskTicket) || activeTickets.length !== 1) {
    fail(
      `REPO_CURRENT_STATE.md active ticket (${activeTickets.join(', ')}) does not match CODEX_TASK.md (${codeTaskTicket})`
    );
  }
}

if (codeTaskTicket && completedSet.has(codeTaskTicket)) {
  fail(`CODEX_TASK.md points to completed ticket ${codeTaskTicket}`);
}

for (const ticket of parseTickets(snapshotRecommendedNext)) {
  if (completedSet.has(ticket)) {
    fail(`REPO_CURRENT_STATE.md recommended next ticket ${ticket} is already listed as completed`);
  }
}

if (failures > 0) {
  console.error(`Current ticket validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Current ticket validation passed.');
