'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('../lib');
const { resolve } = require('../resolve-issue');
const { validate } = require('../validate');
const { createProject } = require('../create-project');
const { planUpgrade } = require('../plan-upgrade');

const root = lib.findRoot(__dirname);
const repository = 'example/project';
const identity = { repository, number: 42 };
const now = () => new Date('2026-09-15T12:00:00.000Z');
const issue = () => ({ number: 42, url: 'https://github.com/example/project/issues/42', title: 'Correct a workflow regression',
  state: 'OPEN', body: '## Goal\nResolve the active issue correctly.\n## Acceptance criteria\nReject identities from another repository.\n## Validation\nRun the isolated regression cases.\n', updatedAt: '2026-09-15T11:00:00.000Z' });
const config = () => ({ schemaVersion: 1, templateVersion: '0.2.0', mode: 'project', repository, projectUrl: null, modules: [] });
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrlds-workflow-test-'));
  t.after(() => {
    const target = fs.realpathSync(dir);
    const base = fs.realpathSync(os.tmpdir());
    assert.ok(target.startsWith(base + path.sep) && path.basename(target).startsWith('wrlds-workflow-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return dir;
}
function minimal(t) { const dir = temporary(t); fs.writeFileSync(path.join(dir, '.wrlds.json'), JSON.stringify(config())); return dir; }
function runner(data = issue(), origin = 'https://github.com/example/project.git') {
  const calls = [];
  const run = (program, args) => {
    calls.push([program, args]);
    if (program === 'git' && args[0] === 'remote') return origin;
    if (program === 'git') return 'codex/gh-42-repair-workflow';
    if (program === 'gh') return JSON.stringify(data);
    throw new Error('Unexpected external operation');
  };
  return { run, calls };
}

test('accepts full issue identities and GitHub remote formats', () => {
  assert.equal(lib.parseIssueReference('example/project#42', repository).number, 42);
  assert.equal(lib.parseIssueReference('https://github.com/Example/Project/issues/42', repository).number, 42);
  for (const remote of ['git@github.com:example/project.git', 'https://github.com/example/project.git', 'ssh://git@github.com/example/project.git']) assert.equal(lib.repositoryFromRemote(remote), repository);
});
test('rejects bare, legacy, mismatching, malformed and unsafe issue references', () => {
  for (const value of ['#42', '42', 'T0042', '', 'example/other#42', 'example/project#0', 'example/project#042', 'example/project #42', 'https://github.com/example/project/pull/42', 'https://github.com/example/project/issues/42?x=1']) assert.throws(() => lib.parseIssueReference(value, repository), value);
});
test('branch identities reject zero, malformed slugs and legacy formats', () => {
  assert.equal(lib.parseBranch('codex/gh-42-repair-workflow'), 42);
  for (const value of ['main', '', 'codex/t0042-repair', 'codex/gh-0-fix', 'codex/gh-042-fix', 'codex/gh-42-', 'codex/gh-42-fix--scope']) assert.throws(() => lib.parseBranch(value), value);
});
test('issue validation checks URL, number, open state and content', () => {
  assert.equal(lib.validateIssue(issue(), identity).number, 42);
  for (const change of [{ number: 43 }, { url: 'https://github.com/example/project/issues/43' }, { url: 'https://github.com/example/other/issues/42' }, { state: 'CLOSED' }, { body: '' }, { title: '' }, { updatedAt: 'yesterday' }]) assert.throws(() => lib.validateIssue({ ...issue(), ...change }, identity));
});
test('empty or placeholder required sections are rejected', () => {
  for (const heading of ['Goal', 'Acceptance criteria', 'Validation']) {
    const content = issue();
    content.body = content.body.replace(new RegExp(`(## ${heading}\\n)[^]*?(?=## |$)`), '$1TBD\n');
    assert.throws(() => lib.validateIssue(content, identity), heading);
  }
});
test('resolver uses the configured repository in a read-only GitHub call', t => {
  const local = minimal(t); const fake = runner();
  const result = resolve({ root: local, run: fake.run, now });
  assert.equal(result.issue.number, 42);
  const command = fake.calls.find(([program]) => program === 'gh');
  assert.deepEqual(command[1].slice(0, 6), ['issue', 'view', '42', '--repo', repository, '--json']);
  assert.equal(fs.existsSync(path.join(local, '.wrlds-local')), false);
});
test('resolver refuses origin/config disagreement before reading GitHub', t => {
  const local = minimal(t); const fake = runner(issue(), 'https://github.com/example/other.git');
  assert.throws(() => resolve({ root: local, run: fake.run, now }), /origin/);
  assert.equal(fake.calls.some(([program]) => program === 'gh'), false);
});
test('different branch and explicit GitHub issue IDs are not treated as no active work', t => {
  const local = minimal(t); const fake = runner();
  assert.throws(() => resolve({ root: local, reference: 'example/project#43', run: fake.run, now }), /disagree/);
});
test('explicit identity can be resolved before creating its issue branch', t => {
  const local = minimal(t); const fake = runner();
  assert.equal(resolve({ root: local, branch: 'main', reference: 'example/project#42', run: fake.run, now }).issue.number, 42);
});
test('online snapshots support offline reads without a GitHub call or implied fresh state', t => {
  const local = minimal(t); const fake = runner();
  resolve({ root: local, saveCache: true, run: fake.run, now });
  const offlineRunner = (program, args) => { assert.notEqual(program, 'gh'); return fake.run(program, args); };
  const result = resolve({ root: local, offline: true, run: offlineRunner, now: () => new Date('2026-09-15T13:00:00.000Z') });
  assert.equal(result.ageSeconds, 3600); assert.match(result.source, /unverified/);
});
test('offline reads reject mismatched identity, closed scope and future timestamps', () => {
  const snapshot = { schemaVersion: 1, repository, fetchedAt: now().toISOString(), issue: issue() };
  for (const change of [{ repository: 'example/other' }, { fetchedAt: '2027-01-01' }, { issue: { ...issue(), state: 'CLOSED' } }, { issue: { ...issue(), number: 43 } }]) assert.throws(() => lib.validateSnapshot({ ...snapshot, ...change }, identity, now().getTime()));
});
test('offline mode does not silently fall back to a network call', t => {
  const local = minimal(t); const fake = runner();
  assert.throws(() => resolve({ root: local, offline: true, run: fake.run, now }));
  assert.equal(fake.calls.some(([program]) => program === 'gh'), false);
});
test('configuration separates project identity and selected module dependencies', () => {
  assert.equal(lib.validateConfig(config()).modules.length, 0);
  assert.throws(() => lib.validateConfig({ ...config(), repository: 'TBD' }));
  assert.throws(() => lib.validateConfig({ ...config(), modules: ['amplify'] }), /requires/);
  assert.throws(() => lib.validateConfig({ ...config(), modules: ['aws', 'aws'] }), /Duplicate/);
  assert.throws(() => lib.validateConfig({ ...config(), modules: ['unknown'] }), /Unknown/);
  assert.throws(() => lib.validateConfig({ ...config(), projectUrl: 'https://github.com/example/project' }));
  assert.equal(lib.validateConfig({ ...config(), modules: ['aws', 'react-native', 'amplify'] }).modules.length, 3);
});
test('empty source documents cannot pass structural validation', t => {
  const local = minimal(t);
  fs.writeFileSync(path.join(local, 'CODEX_TASK.md'), '');
  fs.writeFileSync(path.join(local, 'REPO_CURRENT_STATE.md'), '');
  const result = validate(local);
  assert.ok(result.some(error => error.includes('Empty document: CODEX_TASK.md')));
  assert.ok(result.some(error => error.includes('Empty document: REPO_CURRENT_STATE.md')));
});
test('skill descriptions have no minimum word count; metadata is optional', t => {
  const local = minimal(t); const skill = path.join(local, '.agents', 'skills', 'sql-migrations'); fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: sql-migrations\ndescription: Review SQL migration rollouts.\n---\n\nCheck rollout safety.\n');
  assert.deepEqual(lib.skillErrors(local, ['sql-migrations']), []);
});
test('skill checks reject broken references and mismatched invocation metadata', t => {
  const local = minimal(t); const skill = path.join(local, '.agents', 'skills', 'sql-migrations'); fs.mkdirSync(path.join(skill, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: sql-migrations\ndescription: Review SQL migration rollouts.\n---\n\nRead [rollout](references/missing.md).\n');
  fs.writeFileSync(path.join(skill, 'agents', 'openai.yaml'), 'interface:\n  default_prompt: "Use $wrong-name to review."\n');
  const errors = lib.skillErrors(local);
  assert.ok(errors.some(error => error.includes('Missing reference')));
  assert.ok(errors.some(error => error.includes('Wrong invocation')));
});
test('native and legacy duplicate skills are surfaced', t => {
  const local = minimal(t); const native = path.join(local, '.agents', 'skills', 'example'); fs.mkdirSync(native, { recursive: true });
  fs.mkdirSync(path.join(local, 'skills', 'example'), { recursive: true });
  fs.writeFileSync(path.join(native, 'SKILL.md'), '---\nname: example\ndescription: Review schema migrations.\n---\n');
  assert.ok(lib.skillErrors(local).some(error => error.includes('Duplicate legacy')));
});
test('local current package validates without reading GitHub or app secrets', () => assert.deepEqual(validate(root), []));

const isTemplate = lib.loadConfig(root).mode === 'template';

test('workflow CLI and skill helper run inside an ES-module application', { skip: !isTemplate }, t => {
  const parent = temporary(t); const target = path.join(parent, 'esm');
  createProject({ source: root, target, repository });
  fs.writeFileSync(path.join(target, 'package.json'), '{"type":"module"}');
  for (const args of [['scripts/wrlds/validate.js'],
    ['.agents/skills/wrlds-skill-creator/scripts/check-skill.js', '.agents/skills/github-collaboration']]) {
    const result = spawnSync(process.execPath, args, { cwd: target, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
test('plain new project contains native core skills and no AWS payload or app package', { skip: !isTemplate }, t => {
  const parent = temporary(t); const target = path.join(parent, 'plain');
  createProject({ source: root, target, repository });
  assert.deepEqual(validate(target), []);
  assert.equal(fs.existsSync(path.join(target, 'AWS_RESOURCES.md')), false);
  assert.equal(fs.existsSync(path.join(target, 'package.json')), false);
  assert.equal(fs.existsSync(path.join(target, '.agents', 'skills', 'github-collaboration', 'SKILL.md')), true);
  assert.match(lib.read(target, 'REPO_CURRENT_STATE.md'), /example\/project/);
  assert.match(lib.read(target, 'REPO_CURRENT_STATE.md'), /node scripts\/wrlds\/validate.js/);
  assert.doesNotMatch(lib.read(target, 'DECISIONS.md'), /user approved the Astra audit/i);
});
test('selected AWS, React Native, Amplify and BLE packages remain valid after relocation', { skip: !isTemplate }, t => {
  const parent = temporary(t); const target = path.join(parent, 'domain');
  createProject({ source: root, target, repository, modules: Object.keys(lib.MODULES) });
  assert.deepEqual(validate(target), []);
  for (const module of Object.values(lib.MODULES)) assert.ok(fs.existsSync(path.join(target, '.agents', 'skills', module.skill, 'SKILL.md')));
  assert.equal(fs.readFileSync(path.join(target, '.agents/skills/berg-airhive-ble-imu/references/sensor-protocol.md'), 'utf8'), fs.readFileSync(path.join(root, 'modules/ble/.agents/skills/berg-airhive-ble-imu/references/sensor-protocol.md'), 'utf8'));
});
test('new project installation refuses existing destinations without touching their files', { skip: !isTemplate }, t => {
  const target = temporary(t); const sentinel = path.join(target, 'package.json'); const original = '{"name":"customer-app","scripts":{"test":"customer-tests"}}'; fs.writeFileSync(sentinel, original);
  assert.throws(() => createProject({ source: root, target, repository }), /already exists/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(target), ['package.json']);
});
test('invalid module selection fails before creating any destination', { skip: !isTemplate }, t => {
  const parent = temporary(t); const target = path.join(parent, 'invalid');
  assert.throws(() => createProject({ source: root, target, repository, modules: ['amplify'] }), /requires/);
  assert.equal(fs.existsSync(target), false);
});
test('upgrade planning reads without changing application content', { skip: !isTemplate }, t => {
  const target = temporary(t); const original = 'Project-owned hard constraints'; fs.writeFileSync(path.join(target, 'AGENTS.md'), original);
  const result = planUpgrade(root, target);
  assert.equal(result.readOnly, true);
  assert.match(result.files.find(file => file.file === 'AGENTS.md').action, /merge semantically/);
  assert.equal(fs.readFileSync(path.join(target, 'AGENTS.md'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(target), ['AGENTS.md']);
});

test('upgrade planning includes CI, config, references and configured domain files', { skip: !isTemplate }, t => {
  const target = minimal(t);
  fs.writeFileSync(path.join(target, '.wrlds.json'), JSON.stringify({ ...config(), modules: ['aws'] }));
  const plan = planUpgrade(root, target);
  for (const file of ['.wrlds.json', '.github/workflows/workflow-validation.yml',
    'references/github-collaboration-workflow.md', 'AWS_RESOURCES.md']) {
    assert.ok(plan.files.some(item => item.file.replaceAll('\\', '/') === file), file);
  }
  assert.deepEqual(fs.readdirSync(target), ['.wrlds.json']);
});

test('reference checks distinguish commands and globs from literal missing files', t => {
  const local = minimal(t); const file = path.join(local, 'TEST_PLAN.md');
  fs.writeFileSync(file, 'Run `scripts/check.js --local` and inspect `scripts/*.js`. See [missing](scripts/missing.js).');
  const errors = lib.referenceErrors(local, file);
  assert.equal(errors.length, 1); assert.match(errors[0], /scripts\/missing.js/);
});

test('issue forms cannot omit or disable an acceptance field', { skip: !isTemplate }, t => {
  const parent = temporary(t); const target = path.join(parent, 'form');
  createProject({ source: root, target, repository });
  const file = path.join(target, '.github/ISSUE_TEMPLATE/implementation.yml');
  const valid = fs.readFileSync(file, 'utf8');
  for (const invalid of [valid.replace('id: acceptance_criteria', 'id: wrong_field'),
    valid.replace(/(id: acceptance_criteria[^]*?required:) true/, '$1 false')]) {
    fs.writeFileSync(file, invalid);
    assert.ok(validate(target).some(error => error.includes('mandatory acceptance_criteria')));
  }
});
