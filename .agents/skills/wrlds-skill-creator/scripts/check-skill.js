#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const directory = process.argv[2];
if (!directory) { console.error('Usage: node check-skill.js <skill-directory>'); process.exitCode = 1; }
else {
  try {
    const text = fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8');
    const header = /^---\r?\n([^]*?)\r?\n---/.exec(text);
    if (!header) throw new Error('Missing frontmatter');
    const name = /^name:\s*(.+)$/m.exec(header[1]);
    const description = /^description:\s*(.+)$/m.exec(header[1]);
    if (!name || name[1].trim() !== path.basename(path.resolve(directory))) throw new Error('Name/folder mismatch');
    if (!description || !description[1].trim()) throw new Error('Missing description');
    console.log('Skill identity present; run the repository validator for reference and discovery checks.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
