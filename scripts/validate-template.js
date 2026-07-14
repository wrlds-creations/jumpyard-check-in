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
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/implementation.yml',
  'references/aws-tagging-standard.md',
  'references/aws-resource-naming-standard.md',
  'references/aws-cicd-standard.md',
  'references/skill-naming-standard.md',
  'references/project-intake-questions.md',
  'references/codex-working-model.md',
  'references/github-collaboration-workflow.md',
  'docs/history/completed-tickets.md',
  'docs/history/validation-log.md',
  'docs/history/sprint-1-ticket-history.md',
  'docs/history/followups-done.md',
  'docs/history/github-project-migration-2026-07-14.md',
  'docs/gh-192-github-collaboration-migration-audit.md',
  'docs/roadmap/backlog.md',
  'scripts/validate-template.js',
  'scripts/validate-current-ticket.js',
  'scripts/validate-followups.js',
  'scripts/validate-history-archives.js',
  'scripts/validate-github-project-migration.js',
  'scripts/validate-skills.js',
  'scripts/validate-aws-tags.js',
];

const optionalFiles = [
  'TEST_PLAN.md',
  'references/ui-library-selection.md',
  'references/reddit-stack-evaluation.md',
];

const coreSkills = [
  'project-intake',
  'skill-creator',
  'skill-candidate-capture',
  'project-context-hygiene',
  'github-collaboration',
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
  const skillDir = path.join('skills', skill);
  const hasSkillDir = exists(skillDir);
  if (!hasSkillDir) {
    if (required) fail(`missing skills/${skill}/SKILL.md`);
    return;
  }

  if (!fs.statSync(path.join(root, skillDir)).isDirectory()) {
    fail(`skills/${skill} should be a directory`);
    return;
  }

  if (!exists(path.join(skillDir, 'SKILL.md'))) {
    fail(`missing skills/${skill}/SKILL.md`);
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
  validateSkillShape(skill, false);
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
    'CODEX_TASK.md',
    'REPO_CURRENT_STATE.md',
    'project-context-hygiene',
    'github-collaboration',
    'docs/history/',
    'docs/roadmap/backlog.md',
    'codex/gh-<issue-number>-<short-slug>',
    'gh issue view',
    'Do not push directly to `main`',
    'Do not commit unless explicitly asked',
  ]) {
    if (!agentsText.includes(requiredPhrase)) {
      fail(`AGENTS.md missing required phrase: ${requiredPhrase}`);
    }
  }
}

const issueFormPath = path.join(root, '.github', 'ISSUE_TEMPLATE', 'implementation.yml');
if (fs.existsSync(issueFormPath)) {
  const issueForm = fs.readFileSync(issueFormPath, 'utf8');
  for (const id of ['goal', 'context', 'requirements', 'non_goals', 'acceptance_criteria', 'dependencies', 'validation']) {
    if (!issueForm.includes(`id: ${id}`)) fail(`implementation issue form missing field: ${id}`);
  }
}

const collaborationPath = path.join(root, 'references', 'github-collaboration-workflow.md');
if (fs.existsSync(collaborationPath)) {
  const collaboration = fs.readFileSync(collaborationPath, 'utf8');
  for (const phrase of [
    'Project draft issue',
    'gh project item-create',
    'codex/gh-<issue-number>-<short-slug>',
    'Closes #42',
    'Stacked Work',
    'Permanent Integration Rule',
    'Semantic Conflict Resolution',
    'Duplicate Legacy Ticket IDs',
    'Backlog Migration',
  ]) {
    if (!collaboration.includes(phrase)) fail(`GitHub collaboration reference missing phrase: ${phrase}`);
  }
}

const prTemplatePath = path.join(root, '.github', 'pull_request_template.md');
if (fs.existsSync(prTemplatePath)) {
  const prTemplate = fs.readFileSync(prTemplatePath, 'utf8');
  for (const phrase of ['Closes #', 'Base And Dependencies', 'Validation', 'Risks And Unresolved Questions']) {
    if (!prTemplate.includes(phrase)) fail(`PR template missing required phrase: ${phrase}`);
  }
}

if (failures > 0) {
  console.error(`Template validation failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('Template validation passed.');
