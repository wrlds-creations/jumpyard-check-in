import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// #498 (Love 2026-10-08, "kör alternativ 1 med exakt hemsidans värden"): the guest app uses JumpYard's own
// Acumin with exactly jumpyard.se's type system (D0247), while the staff app keeps the shared system
// stack of D0159.
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const css = source('app/globals.css');
const MODULES = ['PhoneCompletion', 'PhonePaymentConfirmation', 'EmailMarketingOptIn', 'BandColours']
  .map(name => [name, source(`components/${name}.module.css`)]);
const GUEST_CSS = [['globals', css], ...MODULES];
const SYSTEM_STACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// Innermost rules ("selector { declarations }"), also those inside @media and @container.
const rules = text => [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));
// The first rule with exactly this selector (a later one may sit in a @media or @container block).
const rule = (text, selector) => {
  const found = rules(text).find(item => item.selector === selector);
  assert.ok(found, `${selector} exists`);
  return found.body;
};

test('#498: one upright Acumin face like jumpyard.se, without an oblique range', () => {
  const faces = rules(css).filter(item => item.selector === '@font-face');
  assert.equal(faces.length, 1, 'one face in globals.css');
  const face = faces[0].body;
  assert.match(face, /font-family: "JumpYard Acumin";\s+src: url\("\/fonts\/AcuminVariableConcept\.woff2"\) format\("woff2"\);/);
  assert.match(face, /font-style: normal;/);
  assert.match(face, /font-weight: 100 900;/);
  assert.match(face, /font-stretch: normal;/);
  assert.match(face, /font-display: swap;/);
  for (const [name, text] of GUEST_CSS) {
    assert.doesNotMatch(text, /oblique \d|font-style: oblique/, `${name}: no oblique range or slnt-mapped italic`);
    if (name !== 'globals') assert.doesNotMatch(text, /@font-face|Completion Acumin/, `${name}: no face of its own`);
  }
  // It starts loading with the page.
  assert.match(source('app/page.tsx'), /preload\('\/fonts\/AcuminVariableConcept\.woff2', \{ as: 'font', type: 'font\/woff2', crossOrigin: 'anonymous' \}\)/);
});

test('#498: the roles carry the site\'s exact axes; body text takes wght from its weight', () => {
  const root = rules(css).find(item => item.selector === ':root' && item.body.includes('--jy-heading-axes'));
  assert.ok(root, 'the role axes are defined once on :root');
  assert.match(root.body, /--jy-heading-axes: "slnt" -12, "wdth" 60, "wght" 900;/);
  assert.match(root.body, /--jy-button-axes: "slnt" 0, "wdth" 65, "wght" 900;/);
  assert.match(root.body, /--jy-small-button-axes: "slnt" 0, "wdth" 65, "wght" 800;/);
  assert.match(root.body, /--jy-body-axes: "slnt" 0, "wdth" 100;/);
  const body = rules(css).filter(item => item.selector === 'body').map(item => item.body).join('');
  assert.match(body, /font-family: "JumpYard Acumin", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\s+font-weight: 400;\s+font-variation-settings: var\(--jy-body-axes\);/);
  // Every axis setting in the guest CSS is one of the four roles (or a label's inherited role).
  for (const [name, text] of GUEST_CSS) {
    for (const [, value] of text.matchAll(/font-variation-settings: ([^;]+);/g)) {
      assert.match(value, /^(var\(--jy-(heading|button|small-button|body)-axes\)|inherit)$/, `${name}: ${value}`);
    }
  }
});

test('#498: headings are never double-slanted and buttons take the browser\'s oblique', () => {
  for (const [name, text] of GUEST_CSS) {
    for (const { selector, body } of rules(text)) {
      if (body.includes('var(--jy-heading-axes)')) {
        assert.match(body, /font-style: normal;/, `${name} ${selector}: a heading is upright`);
        assert.match(body, /font-weight: 900;/, `${name} ${selector}: heading weight`);
        assert.doesNotMatch(body, /font-synthesis/, `${name} ${selector}: nested italic text keeps its oblique`);
      }
      if (/var\(--jy-(button|small-button)-axes\)/.test(body)) {
        assert.match(body, /font-style: italic;/, `${name} ${selector}: a button is italic`);
      }
    }
  }
  assert.match(rule(css, ':where(.font-black)'), /font-variation-settings: var\(--jy-heading-axes\);\s+font-weight: 900;\s+font-style: normal;/);
  assert.match(css, /:where\(button\.italic:is\(\.font-black, \.font-extrabold\), \.type-button\) \{\s+font-variation-settings: var\(--jy-button-axes\);\s+font-weight: 900;\s+font-style: italic;/);
  assert.match(css, /:where\(\.uppercase:is\(\.font-black, \.font-extrabold, \.font-bold\)[^{]+\{\s+font-variation-settings: var\(--jy-small-button-axes\);\s+font-weight: 800;\s+font-style: italic;/);
  // The site's spacing: headings -0.03em (24-44 px) and +0.15px (16-20 px), buttons -0.015em, 14 px small
  // buttons -0.04em, the start heading -0.03em and the biggest hero (the number) -0.048em. No role adds word
  // spacing, as on the site.
  assert.match(css, /:where\(\.font-black\):where\(\.text-base, \.text-lg, \.text-xl\) \{ letter-spacing: 0\.15px; \}/);
  assert.match(css, /:where\(\.font-black\):where\(\.text-2xl, \.text-3xl, \.text-4xl, \.text-5xl\) \{ letter-spacing: -0\.03em; \}/);
  assert.match(css, /\.type-button\) \{\s+letter-spacing: -0\.015em;/);
  assert.match(css, /:where\(button\.italic\.text-sm:is\(\.font-black, \.font-extrabold\)\) \{ letter-spacing: -0\.04em;/);
  assert.match(rule(css, '.park-choice-title'), /font-variation-settings: var\(--jy-heading-axes\);[\s\S]*letter-spacing: -0\.03em;/);
  for (const [name, text] of GUEST_CSS) assert.doesNotMatch(text, /word-spacing: (?!normal|inherit)/, `${name}: no extra word spacing`);
  assert.match(rule(MODULES[0][1], '.number'), /letter-spacing: -\.048em;/);
});

test('#498: labels nested in a button are marked as the button role', () => {
  const approval = source('components/SafetyApproval.tsx');
  assert.match(approval, /<span className=\{`type-button block font-black italic uppercase leading-tight \$\{compact \? 'text-base' : 'text-lg'\}`\}>/);
  assert.equal((source('components/ParkChoice.tsx').match(/<h2 className="type-button /g) || []).length, 2);
});

test('#498: only the site\'s weights: body 400 and bold 700, small buttons 800, headings and buttons 900', () => {
  for (const [name, text] of GUEST_CSS) {
    for (const { selector, body } of rules(text).filter(item => item.selector !== '@font-face')) {
      for (const [, weight] of body.matchAll(/font-weight: ([^;]+);/g)) {
        assert.match(weight, /^(400|700|800|900|inherit)$/, `${name} ${selector}: font-weight ${weight}`);
      }
    }
  }
  for (const file of fs.readdirSync(new URL('../components/', import.meta.url)).filter(file => file.endsWith('.tsx'))) {
    assert.doesNotMatch(source(`components/${file}`), /\bfont-(thin|extralight|light|medium|semibold)\b/, file);
  }
  assert.doesNotMatch(source('app/page.tsx'), /\bfont-(thin|extralight|light|medium|semibold)\b/);
});

test('#498: the completion page uses the roles and keeps its hero height', () => {
  const completion = MODULES[0][1];
  assert.match(completion, /\.hero h1, \.numberLabel, \.number, \.pickup h2, \.quantity, \.dialog h2, \.dialog > strong \{ font-variation-settings: var\(--jy-heading-axes\); font-weight: 900; font-style: normal; \}/);
  assert.match(completion, /\.footer button, \.dialog button \{ font-variation-settings: var\(--jy-button-axes\); font-weight: 900; font-style: italic; letter-spacing: -\.015em;/);
  assert.match(rule(completion, '.itemLabel'), /font-weight: 700; font-style: italic;/);
  // The condensed number and title are larger at line heights that keep today's line boxes:
  // number 29cqw x 1.02, title clamp(24px, 7.6cqw, 33px) x 1.12, label 17px x 1.2.
  const box = (selector) => {
    const body = rule(completion, selector);
    const size = body.match(/font-size: (?:clamp\([^,]+, )?([\d.]+)(?:cqw|px)/)[1];
    return Number(size) * Number(body.match(/line-height: ([\d.]+);/)[1]);
  };
  assert.ok(Math.abs(box('.number') - 29 * 1.02) < 0.05, 'number line box');
  assert.ok(Math.abs(box('.hero h1') - 7.6 * 1.12) < 0.05, 'title line box');
  assert.ok(Math.abs(box('.numberLabel') - 17 * 1.2) < 0.05, 'label line box');
});

test('#498 keeps D0159: the staff app\'s shared system stack lines stay, Acumin comes in a later rule', () => {
  // scripts/validate-t0194-staff-identity-frontend.js asserts these exact lines in the phone stylesheet.
  const theme = css.indexOf(`--font-sans: ${SYSTEM_STACK}`);
  const bodyStack = css.indexOf(`font-family: ${SYSTEM_STACK}`);
  assert.ok(theme > 0 && bodyStack > theme, 'the shared stack lines are present');
  assert.ok(css.indexOf(`font-family: "JumpYard Acumin", ${SYSTEM_STACK}`) > bodyStack, 'Acumin is applied after them');
  assert.doesNotMatch(css, /--font-sans: "JumpYard Acumin"/, 'the theme token stays the shared stack');
  // Production CSS: no preview block and no !important in the type system or the guest modules.
  assert.doesNotMatch(css, /preview \(start\)|preview \(end\)|font-everywhere/);
  const system = css.slice(css.indexOf('/* #498'), css.indexOf('.text-jy-red'));
  assert.ok(system.length > 0);
  assert.doesNotMatch(system, /!important/);
  for (const [name, text] of MODULES) assert.doesNotMatch(text, /!important/, name);
});
