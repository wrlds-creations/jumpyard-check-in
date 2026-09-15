'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MODULES = {
  aws: { requires: [], skill: 'aws-project-infrastructure' },
  'react-native': { requires: [], skill: 'react-native-ui-system' },
  amplify: { requires: ['aws', 'react-native'], skill: 'react-native-amplify' },
  ble: { requires: [], skill: 'berg-airhive-ble-imu' },
};
const CORE_SKILLS = ['project-intake', 'wrlds-skill-creator', 'skill-candidate-capture',
  'project-context-hygiene', 'github-collaboration', 'codex-repo-audit',
  'github-ci-fix', 'github-pr-review', 'release-notes'];
const CORE_DOCS = ['AGENTS.md', 'CODEX_TASK.md', 'PROJECT_CONTEXT.md', 'DECISIONS.md',
  'REPO_CURRENT_STATE.md', 'FOLLOWUPS.md', 'TEST_PLAN.md',
  'references/github-collaboration-workflow.md', 'docs/roadmap/backlog.md'];
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/;

function findRoot(start = __dirname) {
  let current = path.resolve(start);
  while (!fs.existsSync(path.join(current, '.wrlds.json'))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error('No .wrlds.json found; configure this repository first.');
    current = parent;
  }
  return current;
}
function read(root, file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function sameRepository(a, b) { return a.toLowerCase() === b.toLowerCase(); }
function validateRepository(value) {
  assert(typeof value === 'string' && REPOSITORY.test(value) && !value.endsWith('.git'), 'Expected repository owner/name.');
  return value;
}
function validateConfig(config) {
  assert(config && config.schemaVersion === 1, 'Unsupported or missing workflow schemaVersion.');
  assert(/^\d+\.\d+\.\d+$/.test(config.templateVersion || ''), 'Missing templateVersion.');
  assert(['template', 'project'].includes(config.mode), 'mode must be template or project.');
  validateRepository(config.repository);
  assert(config.projectUrl === null || /^https:\/\/github\.com\/(orgs|users)\/[A-Za-z0-9-]+\/projects\/[1-9]\d*$/.test(config.projectUrl || ''), 'Invalid projectUrl; use a verified URL or null.');
  assert(Array.isArray(config.modules), 'modules must be an array.');
  assert(new Set(config.modules).size === config.modules.length, 'Duplicate module selection.');
  for (const module of config.modules) {
    assert(Object.hasOwn(MODULES, module), `Unknown module: ${module}`);
    for (const dependency of MODULES[module].requires) assert(config.modules.includes(dependency), `${module} requires ${dependency}.`);
  }
  return config;
}
function loadConfig(root) { return validateConfig(JSON.parse(read(root, '.wrlds.json'))); }
function parseBranch(branch) {
  const match = /^codex\/gh-([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(branch || '');
  assert(match && Number.isSafeInteger(Number(match[1])), 'Expected codex/gh-<positive issue number>-<short-slug>.');
  return Number(match[1]);
}
function parseIssueReference(value, repository) {
  validateRepository(repository);
  let match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)\/?$/.exec(value || '');
  if (!match) match = /^([^#\s]+)#([1-9]\d*)$/.exec(value || '');
  assert(match && !/\s/.test(value), 'Use a full GitHub issue URL or owner/repository#number.');
  validateRepository(match[1]);
  assert(sameRepository(match[1], repository), `Issue repository does not match ${repository}.`);
  const number = Number(match[2]);
  assert(Number.isSafeInteger(number), 'Issue number is too large.');
  return { repository, number, url: `https://github.com/${repository}/issues/${number}` };
}
function repositoryFromRemote(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec((remote || '').trim());
  assert(match, 'Origin must be a GitHub repository URL; credentials in URLs are unsupported.');
  return validateRepository(match[1]);
}
function sections(body) {
  const result = new Map(); let key;
  for (const line of (body || '').replace(/\r/g, '').split('\n')) {
    const heading = /^#{1,6}\s+(.+?)\s*#*$/.exec(line);
    if (heading) { key = heading[1].trim().toLowerCase(); result.set(key, ''); }
    else if (key) result.set(key, `${result.get(key)}${line}\n`);
  }
  return result;
}
function substantive(text) {
  const value = (text || '').replace(/<!--[^]*?-->/g, '').replace(/^[\s>*\-\[\]`]+/gm, '').trim();
  return value.length > 0 && !/^(tbd|todo|n\/a|none|_no response_)[.!\s]*$/i.test(value);
}
function validateIssue(issue, identity) {
  assert(issue && typeof issue === 'object', 'Missing issue snapshot.');
  assert(issue.number === identity.number, 'Issue number does not match branch/reference.');
  parseIssueReference(issue.url, identity.repository);
  assert(Number(/\/issues\/(\d+)\/?$/.exec(issue.url)[1]) === identity.number, 'Issue URL and number disagree.');
  assert(issue.state === 'OPEN', 'Implementation issue must be open.');
  assert(substantive(issue.title), 'Issue title is missing.');
  const content = sections(issue.body);
  for (const field of ['goal', 'acceptance criteria', 'validation']) {
    assert(substantive(content.get(field)), `Issue needs substantive ${field}.`);
  }
  assert(Number.isFinite(Date.parse(issue.updatedAt)), 'Issue updatedAt is missing or invalid.');
  return issue;
}
function validateSnapshot(snapshot, identity, now = Date.now()) {
  assert(snapshot && snapshot.schemaVersion === 1, 'Unsupported offline snapshot.');
  assert(snapshot.repository && sameRepository(snapshot.repository, identity.repository), 'Offline repository mismatch.');
  const fetched = Date.parse(snapshot.fetchedAt);
  assert(Number.isFinite(fetched) && fetched <= now, 'Invalid offline fetchedAt timestamp.');
  validateIssue(snapshot.issue, identity);
  assert(Date.parse(snapshot.issue.updatedAt) <= fetched, 'Offline issue timestamp is newer than its fetch.');
  return { ...snapshot, source: 'offline snapshot; GitHub state is unverified', ageSeconds: Math.floor((now - fetched) / 1000) };
}
function files(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(root, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symlink in workflow payload: ${full}`);
    return entry.isDirectory() ? files(full) : [full];
  });
}
function frontmatter(text) {
  const match = /^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  assert(match, 'Missing YAML frontmatter.');
  const field = name => {
    const result = new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(match[1]);
    if (!result) return '';
    const value = result[1].trim();
    if (/^[>|][-+]?$/.test(value)) {
      const tail = match[1].slice(result.index + result[0].length);
      return (tail.match(/^(?:\r?\n[ \t]+[^\r\n]*)+/) || [''])[0].trim().replace(/\s+/g, ' ');
    }
    return value.replace(/^(['"])([^]*)\1$/, '$2');
  };
  return { name: field('name'), description: field('description') };
}
function referenceErrors(root, file) {
  const text = fs.readFileSync(file, 'utf8').replace(/```[^]*?```/g, '');
  const errors = []; const refs = new Set();
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) refs.add(match[1].replace(/^<|>$/g, ''));
  for (const match of text.matchAll(/`((?:\.\.?\/|references\/|scripts\/|assets\/)[^`]+)`/g)) {
    // Inline commands and glob examples are not literal file references.
    if (!/[\s*?]/.test(match[1])) refs.add(match[1]);
  }
  for (const reference of refs) {
    if (/^(?:https?:|mailto:|#)/i.test(reference) || /[<>]/.test(reference)) continue;
    const clean = decodeURIComponent(reference.split('#')[0]);
    const target = path.resolve(path.dirname(file), clean);
    if (!(target === root || target.startsWith(root + path.sep))) errors.push(`Reference escapes package: ${reference}`);
    else if (!fs.existsSync(target)) errors.push(`Missing reference ${reference} in ${path.relative(root, file)}`);
  }
  return errors;
}
function skillErrors(root, required = []) {
  const errors = []; const skillRoot = path.join(root, '.agents', 'skills');
  const directories = fs.existsSync(skillRoot) ? fs.readdirSync(skillRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  for (const name of required) if (!directories.includes(name)) errors.push(`Missing native skill: ${name}`);
  const names = new Set();
  for (const folder of directories) {
    const directory = path.join(skillRoot, folder);
    try {
      const data = frontmatter(fs.readFileSync(path.join(directory, 'SKILL.md'), 'utf8'));
      assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) && data.name.length < 64, `Invalid skill name in ${folder}.`);
      assert(data.name === folder, `Skill folder/name mismatch: ${folder}.`);
      assert(substantive(data.description), `Missing skill description: ${folder}.`);
      assert(!names.has(data.name), `Duplicate skill name: ${data.name}.`); names.add(data.name);
      for (const file of files(directory).filter(f => f.endsWith('.md'))) errors.push(...referenceErrors(root, file));
      const metadata = path.join(directory, 'agents', 'openai.yaml');
      if (fs.existsSync(metadata)) {
        const text = fs.readFileSync(metadata, 'utf8');
        const prompt = /^\s*default_prompt:\s*(.+)$/m.exec(text);
        if (prompt && !prompt[1].includes(`$${data.name}`)) errors.push(`Wrong invocation name in ${folder}/agents/openai.yaml`);
      }
      if (fs.existsSync(path.join(root, 'skills', folder))) errors.push(`Duplicate legacy skills/${folder}; migrate the original rather than keeping two copies.`);
    } catch (error) { errors.push(error.message); }
  }
  return errors;
}

module.exports = { MODULES, CORE_SKILLS, CORE_DOCS, findRoot, read, assert,
  validateRepository, validateConfig, loadConfig, parseBranch, parseIssueReference,
  repositoryFromRemote, sameRepository, sections, substantive, validateIssue,
  validateSnapshot, files, frontmatter, referenceErrors, skillErrors };
