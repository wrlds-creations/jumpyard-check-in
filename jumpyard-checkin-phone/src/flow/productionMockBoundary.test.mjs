import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { initialContext, nextState } from './machine.ts';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const mockFile = path.join(sourceRoot, 'flow/mockClient.ts');
const compile = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

const operations = {
  validateToken: ['preview'],
  lookupBooking: ['preview'],
  getCapacityForSlots: [['14:00']],
  buyWalkIn: [1, null, null, { id: 'E60', label: 'Preview', type: 'entry', durationMinutes: 60 }, '14:00'],
  submitSafety: ['preview'],
  submitAddons: ['preview', [], false],
  submitPayment: ['preview', 50],
  submitConnectedProfiles: ['preview', []],
  commitCheckin: ['preview'],
  validateExtensionToken: ['preview'],
  submitExtensionPayment: ['preview', 50],
};

function loadMocks(environment) {
  const exports = {};
  let timers = 0;
  vm.runInNewContext(compile(mockFile), {
    exports, process: { env: { NODE_ENV: environment } },
    setTimeout: (callback) => { timers += 1; callback(); },
  });
  return { exports, timerCount: () => timers };
}

for (const environment of ['production', 'test', undefined]) {
  test(`every simulated operation rejects before work in ${environment ?? 'an unset environment'}`, async () => {
    const mock = loadMocks(environment);
    assert.deepEqual(Object.keys(mock.exports).sort(), Object.keys(operations).sort(), 'Cover every exported mock operation.');
    for (const [name, args] of Object.entries(operations)) {
      await assert.rejects(mock.exports[name](...args), /only available in local development/, name);
    }
    assert.equal(mock.timerCount(), 0);
  });
}

test('explicit local development still supports the existing previews', async () => {
  const mock = loadMocks('development');
  for (const [name, args] of Object.entries(operations)) await mock.exports[name](...args);
  assert.equal(mock.timerCount(), Object.keys(operations).length);
  const extension = await mock.exports.validateExtensionToken('preview');
  assert.equal(extension.price, 50);
  assert.equal(extension.newEnd, '16:00');
  assert.match((await mock.exports.submitExtensionPayment('preview', 50)).qrToken, /^EXT:/);
});

test('unhandled balances stay in real add-ons payment instead of simulated payment or safety', () => {
  for (const state of ['APP_ADDONS', 'APP_SKYRIDER_ATTEST', 'APP_CONNECTED', 'APP_PAYMENT']) {
    for (const paymentCompleted of [false, true]) {
      const ctx = { ...initialContext('park-qr'), paymentTotal: 50, paymentCompleted };
      assert.equal(nextState(state, ctx), 'APP_ADDONS', `${state}, completed=${paymentCompleted}`);
    }
  }
});

test('real completed payment and free paths retain their direct transition to safety', () => {
  for (const channel of ['sms', 'park-qr', 'kiosk']) {
    for (const paymentCompleted of [false, true]) {
      const ctx = { ...initialContext(channel), paymentTotal: 0, paymentCompleted };
      for (const state of ['APP_ADDONS', 'APP_SKYRIDER_ATTEST', 'APP_CONNECTED']) {
        assert.equal(nextState(state, ctx), 'APP_SAFETY_VIDEO');
      }
    }
  }
  assert.equal(nextState('APP_PAYMENT', initialContext('park-qr')), 'APP_ADDONS');
});

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : [filename];
  });
}

function localImports(filename) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly)
      || (ts.isExportDeclaration(node) && !node.isTypeOnly)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) names.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) names.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return names.flatMap(name => {
    const base = name.startsWith('@/') ? path.join(sourceRoot, name.slice(2))
      : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null;
    if (!base) return [];
    const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
      .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    return resolved && /\.[jt]sx?$/.test(resolved) ? [resolved] : [];
  });
}

function reachesMock(filename, visited = new Set()) {
  if (filename === mockFile) return true;
  if (visited.has(filename)) return false;
  visited.add(filename);
  return localImports(filename).some(imported => reachesMock(imported, visited));
}

function renderRouteBoundary(filename, environment) {
  const exports = {};
  const notFound = Symbol('not-found');
  const imports = () => null;
  let rendered = false;
  vm.runInNewContext(compile(filename), {
    exports, process: { env: { NODE_ENV: environment } },
    require: name => name === 'next/navigation' ? { notFound: () => { throw notFound; } }
      : name === 'react/jsx-runtime' ? { jsx: () => { rendered = true; return 'preview'; } }
        : { default: imports },
  });
  try { return { result: exports.default(), rendered }; }
  catch (error) {
    if (error !== notFound) throw error;
    return { result: 'not-found', rendered };
  }
}

test('no normal public entry or transitive import reaches the mock client', () => {
  const entries = sourceFiles(path.join(sourceRoot, 'app'))
    .filter(filename => /(?:page|layout|route)\.[jt]sx?$/.test(path.basename(filename)));
  assert.equal(reachesMock(path.join(sourceRoot, 'app/page.tsx')), false);
  const mockEntries = entries.filter(filename => reachesMock(filename));
  assert.deepEqual(mockEntries.map(filename => path.relative(sourceRoot, filename).replaceAll('\\', '/')), ['app/extend/page.tsx']);
  for (const entry of mockEntries) {
    for (const environment of ['production', 'test', undefined]) {
      assert.deepEqual(renderRouteBoundary(entry, environment), { result: 'not-found', rendered: false });
    }
    assert.equal(renderRouteBoundary(entry, 'development').result, 'preview');
  }
});

test('payment and safety previews remain explicitly development-only', () => {
  for (const preview of ['payment', 'safety']) {
    const entry = path.join(sourceRoot, `app/preview/${preview}/page.tsx`);
    assert.deepEqual(renderRouteBoundary(entry, 'production'), { result: 'not-found', rendered: false });
    assert.equal(renderRouteBoundary(entry, 'development').result, 'preview');
  }
});
