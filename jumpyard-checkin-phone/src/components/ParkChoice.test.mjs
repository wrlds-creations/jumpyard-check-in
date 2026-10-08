import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// #492: the start page's logo jumps once with a flip, a beat after it has loaded and the page is fully
// visible. Only transform animates and reduced motion stills it.
const require = createRequire(import.meta.url);
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const choice = source('components/ParkChoice.tsx');
const css = source('app/globals.css');

function loadParkChoice() {
  const output = ts.transpileModule(choice, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const overrides = {
    '@/components/FlowTransition': { FlowScreen: () => null },
    '@/context/LanguageContext': { useTranslation: () => ({ t: { choice: {} } }) },
    '@/components/JumpyardIcon': { JumpyardIcon: () => null },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', output)(id => overrides[id] ?? require(id), mod, mod.exports);
  return mod.exports.ParkChoice;
}

// The body of the brace block that starts at `from` (nested blocks included).
function block(text, from) {
  const open = text.indexOf('{', from);
  for (let depth = 0, index = open; index < text.length; index++) {
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return text.slice(open + 1, index);
  }
  throw new Error('unclosed block');
}
const properties = body => body.split(';').map(line => line.split(':')[0].trim()).filter(Boolean);
const keyframes = name => {
  const at = css.indexOf(`@keyframes ${name} {`);
  assert.notEqual(at, -1, `${name} exists`);
  return [...block(css, at).matchAll(/([\d.%, ]+) \{([^}]*)\}/g)].map(([, offsets, body]) => ({
    offsets: offsets.split(',').map(offset => Number.parseFloat(offset)), body,
    transform: body.match(/transform: ([^;]+);/)?.[1] ?? '',
  }));
};
const JUMP = '.park-choice-logo[data-ready="true"]';
const FLIP = '.park-choice-logo[data-ready="true"] > img';
const rule = selector => {
  const at = css.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `${selector} exists`);
  return block(css, at);
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('the logo is marked ready once it has loaded and the page is fully visible, with a jump that fits', async () => {
  const children = [loadParkChoice()({ onSelect() {} }).props.children].flat(Infinity);
  const scene = children.find(child => child?.props?.className === 'park-choice-logo mb-8');
  const logo = scene.props.children;
  assert.equal(logo.type, 'img');
  assert.equal(logo.props.className, 'w-36');
  assert.equal(choice.match(/park-choice-logo/g).length, 1);
  // React never renders the start, so neither the first paint nor a re-render can start or restart it.
  assert.equal(scene.props['data-ready'], undefined);
  assert.equal(scene.props.style, undefined);
  assert.doesNotMatch(choice, /\.animate\(|onAnimation/);

  const frame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => callback();
  try {
    const image = ({ complete = true, naturalWidth = 441, top = 167.3, entrance = [] } = {}) => {
      const parent = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
      return {
        complete, naturalWidth, parentElement: parent,
        closest: selector => (selector === '[data-flow-transition]' ? { getAnimations: () => entrance } : null),
        getBoundingClientRect: () => ({ top, width: 144, height: 167.5 }),
      };
    };
    const fit = img => [img.parentElement.style['--park-choice-jump'], img.parentElement.style['--park-choice-flip-scale']];
    const loading = image({ complete: false, naturalWidth: 0 });
    logo.props.ref(loading);
    await flush();
    assert.equal(loading.parentElement.dataset.ready, undefined, 'still loading when it mounts: nothing starts');
    Object.assign(loading, { complete: true, naturalWidth: 441 });
    logo.props.onLoad({ currentTarget: loading });
    await flush();
    assert.equal(loading.parentElement.dataset.ready, 'true', 'loaded: ready, the stylesheet adds the beat');
    assert.deepEqual(fit(loading), ['72px', '1'], '375x812: the full jump at full size');

    const cached = image();
    logo.props.ref(cached);
    await flush();
    assert.equal(cached.parentElement.dataset.ready, 'true', 'a logo that loaded before React listened still jumps');

    let fadeIn;
    const fading = image({ entrance: [{ finished: new Promise(resolve => { fadeIn = resolve; }) }] });
    logo.props.ref(fading);
    await flush();
    assert.equal(fading.parentElement.dataset.ready, undefined, 'the beat counts from the end of the fade');
    fadeIn();
    await flush();
    assert.equal(fading.parentElement.dataset.ready, 'true');
    const cancelled = image({ entrance: [{ finished: Promise.reject(new Error('cancelled')) }] });
    logo.props.ref(cancelled);
    await flush();
    assert.equal(cancelled.parentElement.dataset.ready, 'true', 'a cancelled fade still lets it start');

    const broken = image({ naturalWidth: 0 });
    logo.props.ref(broken);
    await flush();
    assert.equal(broken.parentElement.dataset.ready, undefined, 'a logo that fails to load never jumps');
    // Logo tops measured on the start page in Safari's visible area with its toolbars.
    const iphone = image({ top: 93.3 });
    logo.props.ref(iphone);
    await flush();
    assert.equal(iphone.parentElement.dataset.ready, 'true', '390x664 (iPhone 13-15 Safari) still flips');
    assert.deepEqual(fit(iphone), ['58px', '1'], 'a lower jump, still at full size');
    const se = image({ top: 35.3 });
    logo.props.ref(se);
    await flush();
    assert.equal(se.parentElement.dataset.ready, 'true', '375x548 (iPhone SE Safari) still flips');
    assert.deepEqual(fit(se), ['24px', '0.78'], 'the lowest jump with a smaller logo while it turns');
    const tiny = image({ top: 20 });
    logo.props.ref(tiny);
    await flush();
    assert.equal(tiny.parentElement.dataset.ready, undefined, 'not even 24 px at 0.75 fits: it stands still');
    Object.assign(se, { getBoundingClientRect: () => ({ top: 400, width: 144, height: 167.5 }) });
    logo.props.onLoad({ currentTarget: se });
    await flush();
    assert.deepEqual(fit(se), ['24px', '0.78'], 'it starts once');
    assert.doesNotThrow(() => logo.props.ref(null));
  } finally {
    globalThis.requestAnimationFrame = frame;
  }
});

test('only a ready logo moves: once, after a beat, the jump and the flip together', () => {
  assert.deepEqual(properties(rule('.park-choice-logo')), ['display']);
  assert.equal(css.match(/animation:[^;]*park-choice-(jump|flip)/g).length, 2, 'two rules start it');
  const jump = rule(JUMP).match(/^ animation: park-choice-jump (\d+(?:\.\d+)?)s (\d+(?:\.\d+)?)s; $/);
  const flip = rule(FLIP).match(/^ animation: park-choice-flip (\d+(?:\.\d+)?)s (\d+(?:\.\d+)?)s; $/);
  assert.ok(jump && flip, 'one iteration each, no loop');
  assert.deepEqual(jump.slice(1), flip.slice(1), 'the jump and the flip share their timing');
  const [duration, delay] = jump.slice(1).map(Number);
  assert.ok(duration >= 1.3 && duration <= 1.6, 'about 1.3-1.6 s of motion');
  assert.ok(delay >= 0.6 && delay <= 1, 'a short beat before it starts');
});

test('no layout property animates: one jump up and down, one full turn, squash and stretch from the feet', () => {
  const jump = keyframes('park-choice-jump');
  const flip = keyframes('park-choice-flip');
  for (const step of [...jump, ...flip]) {
    assert.deepEqual(properties(step.body).filter(name => !['transform', 'opacity', 'animation-timing-function'].includes(name)), []);
  }
  const flight = jump.flatMap(step => step.offsets.map(() => {
    const match = /^translateY\((?:0|calc\(var\(--park-choice-jump, (\d+)px\) \* (-[\d.]+)\))\) scale\((1|var\(--park-choice-flip-scale, 1\))\)$/.exec(step.transform);
    assert.ok(match, `${step.transform} only lifts and sizes the logo`);
    return { lift: match[1] ? Number(match[1]) * Number(match[2]) : 0, smaller: match[3] !== '1' };
  }));
  const lift = flight.map(step => step.lift);
  const apex = lift.indexOf(Math.min(...lift));
  assert.ok(lift[apex] <= -60 && lift[apex] >= -80, 'about 60-80 px high where there is room');
  assert.ok(lift.every((y, index) => index === 0 || (index <= apex ? y <= lift[index - 1] : y >= lift[index - 1])), 'up once, down once');
  assert.equal(lift.at(-1), 0, 'it lands where it started');
  // The smaller turning size applies only in the air, and the logo is back at full size when it lands.
  assert.ok(flight.every(step => !step.smaller || step.lift < 0));
  assert.ok(flight.some(step => step.smaller));
  assert.equal(flight.at(-1).smaller, false);
  assert.match(css, /^ {2}78%, 100% \{ transform: translateY\(0\) scale\(1\); \}/m);

  // rotate() turns around the centre (the default origin); translateY(+-50%) moves the scale to the feet.
  const turns = flip.map(step => {
    const match = step.transform.match(/^rotate\((\d+)deg\) translateY\(50%\) scale\(([\d.]+), ([\d.]+)\) translateY\(-50%\)$/);
    assert.ok(match, `${step.transform} keeps one pivot per motion`);
    return match.slice(1).map(Number);
  });
  const angles = turns.map(([angle]) => angle);
  assert.equal(angles[0], 0);
  assert.equal(angles.at(-1), 360, 'one full turn');
  assert.ok(angles.every((angle, index) => index === 0 || angle >= angles[index - 1]), 'one way only');
  assert.equal(angles.filter((angle, index) => index && angle !== angles[index - 1]).length, 1, 'a single flip');
  const flipping = turns.findIndex(([angle]) => angle === 360);
  assert.ok(turns.slice(flipping - 1, flipping + 1).every(([, x, y]) => x === 1 && y === 1), 'it turns at its own shape');
  assert.ok(turns.some(([angle, x, y]) => angle === 0 && x > 1 && y < 1), 'a crouch before the take-off');
  assert.ok(turns.some(([angle, x, y]) => angle === 0 && x < 1 && y > 1), 'a stretched take-off');
  assert.ok(turns.some(([angle, x, y]) => angle === 360 && x > 1 && y < 1), 'a squashed landing');
  assert.deepEqual(turns.at(-1).slice(1), [1, 1], 'it settles at rest');
});

test('reduced motion wins over a ready logo: no animation at all', () => {
  const last = Math.max(css.indexOf(`\n${JUMP} {`), css.indexOf(`\n${FLIP} {`));
  // The same selectors later in the sheet always override the motion.
  const media = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{/g)]
    .filter(match => match.index > last)
    .map(match => block(css, match.index));
  assert.ok(media.some(body => body.includes(`${JUMP}, ${FLIP} { animation: none; }`)));
});

test('#495: the heading welcomes with "Redo att hoppa?" in the same italic, the last word in red', () => {
  const copy = source('context/LanguageContext.tsx');
  assert.match(copy, /title: 'Redo att',\s+titleAccent: 'hoppa\?',/);
  assert.match(copy, /title: 'Ready to',\s+titleAccent: 'jump\?',/);
  assert.doesNotMatch(copy, /Vad vill du göra\?|What would you like to do\?/);
  assert.match(choice, /<h1 className="text-3xl leading-none font-black italic uppercase text-foreground mb-6 text-center">\s*\{t\.choice\.title\} <span className="text-primary">\{t\.choice\.titleAccent\}<\/span>\s*<\/h1>/);
});
