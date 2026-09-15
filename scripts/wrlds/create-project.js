#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const lib = require('./lib');

function createProject({ source, target, repository, projectUrl = null, modules = [] }) {
  const destination = path.resolve(target);
  lib.assert(!fs.existsSync(destination), 'Destination already exists. Use the selective upgrade guide; nothing was written.');
  lib.assert(lib.loadConfig(source).mode === 'template', 'Create a project from the template checkout, which contains the optional module catalog.');
  const config = lib.validateConfig({ ...lib.loadConfig(source), mode: 'project', repository, projectUrl, modules });
  const selections = ['AGENTS.md', 'CODEX_TASK.md', 'FOLLOWUPS.md',
    'TEST_PLAN.md', '.agents', 'scripts/wrlds', 'references', '.github/ISSUE_TEMPLATE', '.github/pull_request_template.md',
    '.github/workflows/workflow-validation.yml', 'docs/roadmap'];
  const payload = new Map();
  const add = (from, to) => {
    lib.assert(!payload.has(to), `Payload collision at ${to}; refusing overwrite.`);
    payload.set(to, fs.readFileSync(from));
  };
  for (const relative of selections) {
    const full = path.join(source, relative);
    const list = fs.statSync(full).isDirectory() ? lib.files(full) : [full];
    for (const file of list) add(file, path.relative(source, file));
  }
  for (const module of modules) {
    const moduleRoot = path.join(source, 'modules', module);
    for (const file of lib.files(moduleRoot)) add(file, path.relative(moduleRoot, file));
  }
  const write = (relative, data) => {
    const full = path.join(destination, relative);
    lib.assert(full.startsWith(destination + path.sep), 'Payload escaped destination.');
    fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, data, { flag: 'wx' });
  };
  for (const [relative, data] of payload) write(relative, data);
  write('.wrlds.json', JSON.stringify(config, null, 2) + '\n');
  write('.gitignore', '.wrlds-local/\nnode_modules/\n');
  write('PROJECT_CONTEXT.md', `# Project context\n\n## Must know\n\n- Repository: ${repository}\n- Objective and hard constraints: TBD; establish the facts needed for the first implementation.\n- GitHub Project: ${projectUrl || 'TBD; null in .wrlds.json until verified.'}\n\n## Commands\n\n- Workflow checks: node scripts/wrlds/validate.js\n- Application install/dev/test/build: TBD; document verified commands before using them.\n\n## Project detail\n\nUse references/project-intake-template.md only for relevant categories. Keep confirmed facts here and decisions in DECISIONS.md.\n`);
  write('DECISIONS.md', '# Project decisions\n\nNo project-specific product or architecture decisions have been recorded by scaffolding. Record confirmed decisions, rationale, impact and revisit triggers here.\n\n## Inherited workflow\n\nWorkflow 0.2 uses GitHub issues for scope, Projects for planning, native skills and task-directed reading. These are template defaults; they do not imply approval for any project implementation or external action.\n');
  write('REPO_CURRENT_STATE.md', `# Repository current state\n\n## Verified mainline\n\nNo Git mainline, product release or deployment was inspected or created by scaffolding. Record verified merged facts here after repository setup.\n\nRepository identity: ${repository}. Project: ${projectUrl || 'not configured'}. Selected domain modules: ${modules.join(', ') || 'none'}.\n\n## Workflow commands\n\n- node scripts/wrlds/validate.js\n- node --test scripts/wrlds/tests/*.test.js\n\nThese require no application package.json. Add verified application commands to PROJECT_CONTEXT.md. GitHub owns operational status; docs/history preserves useful evidence.\n`);
  // Historical template evidence is not customer history. Supply empty, linked archive entry points only.
  for (const file of ['followups-done', 'completed-tickets', 'ticket-history', 'validation-log']) write(`docs/history/${file}.md`, `# ${file.replaceAll('-', ' ')}\n\nPreserve useful project evidence here when archiving it; link the originating issue and PR.\n`);
  write('README.md', `# ${repository.split('/')[1]}\n\nWRLDS workflow ${config.templateVersion}. Start with AGENTS.md and confirmed PROJECT_CONTEXT.md facts.\n\nRun local workflow checks with node scripts/wrlds/validate.js. Application commands belong in PROJECT_CONTEXT.md.\n\nInstallation adds no application dependencies, deployment or Git remote. Initialize those according to the approved project scope.\n`);
  return destination;
}
function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) { console.log('create-project.js --target <NEW directory> --repository owner/name [--project-url URL] [--modules aws,react-native,amplify,ble]\nRefuses existing destinations. Does not create GitHub resources or an application package.json.'); return; }
  const options = { source: lib.findRoot() };
  for (let i = 0; i < args.length; i += 2) {
    const key = { '--target': 'target', '--repository': 'repository', '--project-url': 'projectUrl', '--modules': 'modules' }[args[i]];
    lib.assert(key && args[i + 1], `Invalid option: ${args[i]}`); options[key] = key === 'modules' ? args[i + 1].split(',').filter(Boolean) : args[i + 1];
  }
  lib.assert(options.target && options.repository, '--target and --repository are required.');
  console.log(`Created ${createProject(options)}`);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { createProject, main };
