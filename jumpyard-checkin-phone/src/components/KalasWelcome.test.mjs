import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// GH-571 (D0281): ROLLER's API never checks in a kalas, so the phone shows a kalas guest a glad screen that
// sends them to the staff (Love, 2026-10-18: "Hej kalasgäst, fråga personalen så hjälper dom dig vidare").
const require = createRequire(import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const compiled = ts.transpileModule(read('./KalasWelcome.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function render(onDone) {
  const exports = {};
  const copy = { lookup: { kalasTitle: 'TITLE', kalasBody: 'BODY', kalasDone: 'DONE' } };
  new Function('require', 'exports', compiled)((id) => {
    if (id === '@/components/FlowTransition') return { FlowScreen: 'div' };
    if (id === '@/components/JumpyardIcon') return { JumpyardIcon: 'jumpyard-icon' };
    if (id === '@/context/LanguageContext') return { useTranslation: () => ({ t: copy }) };
    if (id === './KalasWelcome.module.css') return new Proxy({}, { get: (_, key) => String(key) });
    return require(id);
  }, exports);
  return exports.KalasWelcome({ onDone });
}
function nodes(tree, predicate, found = []) {
  if (!tree || typeof tree !== 'object') return found;
  if (predicate(tree)) found.push(tree);
  for (const child of [tree.props?.children].flat(Infinity)) nodes(child, predicate, found);
  return found;
}
const text = (tree) => nodes(tree, () => true).flatMap((node) => [node.props?.children].flat(Infinity))
  .filter((value) => typeof value === 'string').join(' ');

test('the kalas screen greets the guest, sends them to the staff and has one Klar button', () => {
  let done = 0;
  const screen = render(() => { done += 1; });
  assert.equal(screen.props['data-testid'], 'kalas-welcome');
  assert.equal(screen.props.role, 'status');
  assert.match(text(screen), /TITLE.*BODY.*DONE/s);
  const icon = nodes(screen, (node) => node.type === 'jumpyard-icon')[0];
  assert.equal(icon.props.name, 'reward-gift', 'the JumpYard present icon');
  const buttons = nodes(screen, (node) => node.type === 'button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props['data-testid'], 'kalas-welcome-done');
  buttons[0].props.onClick();
  assert.equal(done, 1);
});

test('the kalas copy is Love\'s, in Swedish and English', () => {
  const language = read('../context/LanguageContext.tsx');
  assert.match(language, /kalasTitle: 'Hej kalasgäst!',/);
  assert.match(language, /kalasBody: 'Fråga personalen, så hjälper de dig vidare\.',/);
  assert.match(language, /kalasDone: 'Klar',/);
  assert.match(language, /kalasTitle: 'Hi, party guest!',/);
  assert.match(language, /kalasBody: "Ask our staff and they'll help you from here\.",/);
  assert.match(language, /kalasDone: 'Done',/);
});

test('Cloud answers party_package for a kalas at lookup and check-in start; the phone treats both', () => {
  const client = read('../flow/cloudClient.ts');
  assert.match(client, /\| 'party_package'\n/);
  assert.match(client, /value === 'party_package' \|\|/, 'a session start or link refusal keeps the reason');
  const page = read('../app/page.tsx').replace(/\r\n/g, '\n');
  assert.match(page, /initialIssue=\{sessionStartError === 'party_package' \? 'party_package' : null\}/);
  assert.match(page, /onBack=\{\(\) => \{ setSessionStartError\(null\); setState\('KIOSK_CHOICE'\); \}\}/);
  assert.match(read('./BookingSummary.tsx'), /if \(error === 'party_package'\) return `\$\{t\.lookup\.kalasTitle\} \$\{t\.lookup\.kalasBody\}`;/);
});
