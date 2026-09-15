// Local, isolated verification of the real components and shipped MP4s. Requires
// an existing Playwright installation (PLAYWRIGHT_MODULE may point to its entry).
// Builds its fixture in the OS temp directory; it is never part of the app export.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(app, 'package.json'));
const { webpack } = require('next/dist/compiled/webpack/webpack');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const output = path.resolve(process.env.SAFETY_BROWSER_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'jumpyard-gh343-browser-')));
fs.mkdirSync(output, { recursive: true });
const loader = path.join(output, 'typescript-loader.cjs');
fs.writeFileSync(loader, `const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: {
target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX
}}).outputText; };`);
const entry = path.join(output, 'fixture.tsx');
fs.writeFileSync(entry, `import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '@/context/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { SafetyVideo } from '@/components/SafetyVideo';
function Fixture() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return <main><header className="flex justify-end p-3"><LanguageToggle compact /></header>
    {!open ? <button onClick={() => setOpen(true)}>Open safety video</button>
      : done ? <p role="status">Safety rules reached</p>
      : <SafetyVideo onComplete={() => setDone(true)} />}</main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider><Fixture /></LanguageProvider></StrictMode>);`);
for (const mode of ['production', 'development']) {
  await new Promise((resolve, reject) => webpack({
    mode, entry, target: 'web', devtool: false,
    optimization: { minimize: false },
    output: { path: output, filename: `${mode}.js` },
    resolve: { extensions: ['.tsx', '.ts', '.js', '.mjs'], alias: { '@': path.join(app, 'src') }, modules: [path.join(app, 'node_modules')] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
}
const exportRoot = path.join(app, 'out');
const css = fs.readdirSync(path.join(exportRoot, '_next/static/chunks')).filter(name => name.endsWith('.css'));
const headers = fs.readFileSync(path.join(app, 'public/_headers'), 'utf8');
assert.match(headers, /\/media\/safety-\*\.mp4\r?\n\s+Content-Type: video\/mp4\r?\n\s+Cache-Control: public, max-age=31536000, immutable/);
const requests = [];
let failLanguage;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${css.map(name => `<link rel="stylesheet" href="/_next/static/chunks/${name}">`).join('')}</head><body><div id="root"></div><script src="/${url.searchParams.has('development') ? 'development' : 'production'}.js"></script></body></html>`);
  }
  const file = ['production.js', 'development.js'].includes(url.pathname.slice(1))
    ? path.join(output, url.pathname.slice(1)) : path.resolve(exportRoot, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(exportRoot + path.sep) && !file.startsWith(output + path.sep)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const media = url.pathname.startsWith('/media/safety-');
  if (media && failLanguage && url.pathname.includes(`safety-${failLanguage}-`)) { res.writeHead(503); return res.end(); }
  const row = { url: url.pathname, range: req.headers.range, bytes: 0, complete: false };
  if (media) requests.push(row);
  // Conservative HTTP 200/full-body behavior matches the previous hosted video
  // observation. This does not claim Cloudflare or physical Wi-Fi verification.
  res.setHeader('Content-Length', fs.statSync(file).size);
  res.setHeader('Content-Type', media ? 'video/mp4' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.woff2') ? 'font/woff2' : 'image/png');
  if (media) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  const stream = fs.createReadStream(file);
  stream.on('data', chunk => { row.bytes += chunk.length; });
  res.on('finish', () => { row.complete = true; });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.SAFETY_BROWSER_CHANNEL || 'msedge', headless: true });
const report = { browser: browser.version(), output, profiles: [], scenarios: [], requests };
const snapshots = [];
let activePage;
async function newPage({ lang = 'sv', width = 390, development = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(({ lang }) => {
    localStorage.setItem('jy.lang', lang);
    window.framesSeen = [];
    window.elementsSeen = [];
    document.addEventListener('click', () => { window.actionAt = performance.now(); }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      if (window.denyAutomatic && this.lang === 'en') return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      if (window.holdOldPlay && this.lang === 'sv') return new Promise((_, reject) => { window.rejectOld = reject; });
      return play.call(this);
    };
    new MutationObserver(() => {
      for (const video of document.querySelectorAll('video')) {
        if (window.elementsSeen.includes(video)) continue;
        window.elementsSeen.push(video);
        const started = window.actionAt;
        video.requestVideoFrameCallback(() => window.framesSeen.push({ lang: video.lang, ms: performance.now() - started, current: video.isConnected }));
      }
    }).observe(document, { subtree: true, childList: true });
  }, { lang });
  const page = await context.newPage();
  activePage = page;
  page.on('pageerror', error => { snapshots.push({ pageError: error.message }); console.error('Fixture browser error:', error.message); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
  await page.goto(base + (development ? '/?development' : '/'));
  await page.getByRole('button', { name: 'Open safety video' }).waitFor();
  return { context, page, cdp };
}
async function open(page) { await page.getByRole('button', { name: 'Open safety video' }).click(); }
async function frame(page, count) { await page.waitForFunction(count => window.framesSeen.length >= count, count); return page.evaluate(() => window.framesSeen.at(-1)); }
async function play(page) { await page.getByRole('button', { name: /^(Spela upp|Play)$/ }).click(); await page.waitForFunction(() => { const v = document.querySelector('video'); return !v.paused && v.currentTime > 0; }); }
async function fullBuffer(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v.buffered.length && v.buffered.end(v.buffered.length - 1) >= 14.9
      && performance.getEntriesByType('resource').some(r => r.name === v.currentSrc && r.encodedBodySize > 0);
  }, null, { timeout: 45000 });
}
async function switchTo(page, lang) { await page.getByTestId(`language-option-${lang}`).click(); }
async function onlyActive(page, lang) {
  assert.equal(await page.locator('video').count(), 1);
  assert.equal(await page.locator('video').getAttribute('lang'), lang);
  assert.ok(await page.evaluate(() => window.elementsSeen.filter(v => !v.isConnected).every(v => v.paused && !v.getAttribute('src'))));
}
try {
  for (const profile of process.env.SAFETY_SKIP_PERFORMANCE ? [] : [{ mbps: 10, rttMs: 100, samples: 5 }, { mbps: 1, rttMs: 300, samples: 1 }]) {
    const values = [];
    for (let sample = 0; sample < profile.samples; sample++) {
      const { context, page, cdp } = await newPage();
      await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.rttMs, downloadThroughput: profile.mbps * 1e6 / 8, uploadThroughput: profile.mbps * 1e6 / 8 });
      const begin = requests.length;
      await open(page);
      const cold = await frame(page, 1);
      assert.ok(requests.slice(begin).every(r => r.url.includes('safety-sv-')), 'no unselected preload');
      await play(page);
      await fullBuffer(page);
      await switchTo(page, 'en');
      const firstSwitch = await frame(page, 2);
      await fullBuffer(page);
      const beforeReturn = requests.length;
      await switchTo(page, 'sv');
      const cachedReturn = await frame(page, 3);
      await onlyActive(page, 'sv');
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/media/')).map(r => ({ name: r.name.split('/').at(-1), transferSize: r.transferSize, encodedBodySize: r.encodedBodySize })));
      values.push({ cold, firstSwitch, cachedReturn, cachedReturnRequests: requests.length - beforeReturn, resources });
      await context.close();
    }
    report.profiles.push({ ...profile, values });
    console.log('Measured network profile', profile, values.map(v => ({ cold: v.cold.ms, firstSwitch: v.firstSwitch.ms, cachedReturn: v.cachedReturn.ms })));
  }
  for (const width of [320, 390]) {
    const { context, page } = await newPage({ width });
    await open(page); await frame(page, 1);
    await switchTo(page, 'en'); await frame(page, 2);
    assert.ok(await page.getByRole('button', { name: 'Play', exact: true }).isVisible());
    await play(page);
    await page.locator('video').evaluate(v => v.pause());
    await page.getByRole('button', { name: 'Continue watching', exact: true }).waitFor();
    await switchTo(page, 'sv');
    assert.ok(await page.getByRole('button', { name: 'Spela upp', exact: true }).isVisible());
    await play(page);
    for (let i = 0; i < 10; i++) await switchTo(page, i % 2 ? 'sv' : 'en');
    await onlyActive(page, 'sv');
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
    assert.ok(!(await page.getByRole('button', { name: 'Bekräfta säkerhetsreglerna' }).isVisible()));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `swedish-${width}.png`) });
    await page.getByRole('button', { name: 'Bekräfta säkerhetsreglerna' }).waitFor({ timeout: 20000 });
    await switchTo(page, 'en');
    assert.ok(!(await page.getByRole('button', { name: 'Confirm safety rules' }).isVisible()));
    await play(page);
    await page.waitForFunction(() => document.querySelector('video').currentTime > 4);
    await page.screenshot({ path: path.join(output, `english-${width}.png`) });
    await page.getByRole('button', { name: 'Confirm safety rules' }).click({ timeout: 20000 });
    await page.getByText('Safety rules reached').waitFor();
    await onlyActiveAfterCompletion(page);
    report.scenarios.push(`idle, pause, 10 rapid switches, full viewing, completed-language reset, continuation and layout at ${width}px`);
    await context.close();
  }
  {
    const { context, page } = await newPage({ lang: 'en', development: true });
    const begin = requests.length;
    await open(page); await frame(page, 1); await play(page);
    assert.ok(requests.slice(begin).every(r => r.url.includes('safety-en-')));
    report.scenarios.push('saved English preference and StrictMode effect replay');
    await context.close();
  }
  {
    const { context, page } = await newPage();
    await open(page); await frame(page, 1);
    await page.evaluate(() => { window.holdOldPlay = true; });
    await page.getByRole('button', { name: 'Spela upp', exact: true }).click();
    await page.getByText('Laddar säkerhetsvideon').waitFor();
    await switchTo(page, 'en'); await frame(page, 2);
    await page.evaluate(() => { window.rejectOld(new DOMException('Late failure', 'NotAllowedError')); window.elementsSeen[0].dispatchEvent(new Event('ended')); });
    await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 0.2);
    await onlyActive(page, 'en');
    assert.ok(!(await page.getByRole('button', { name: 'Confirm safety rules' }).isVisible()));
    report.scenarios.push('language switch during pending play; stale rejection and completion ignored');
    await context.close();
  }
  {
    const { context, page } = await newPage();
    await open(page); await play(page);
    await page.evaluate(() => { window.denyAutomatic = true; });
    await switchTo(page, 'en');
    await page.getByRole('button', { name: 'Continue watching', exact: true }).waitFor();
    await page.evaluate(() => { window.denyAutomatic = false; });
    await page.getByRole('button', { name: 'Continue watching', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
    report.scenarios.push('autoplay permission denial retains a working explicit resume');
    await context.close();
  }
  {
    const { context, page, cdp } = await newPage();
    await cdp.send('Network.clearBrowserCache');
    await open(page); await play(page);
    failLanguage = 'en';
    await switchTo(page, 'en');
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    failLanguage = undefined;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
    report.scenarios.push('failed new-language request and successful retry');
    await context.close();
  }
  assert.deepEqual(snapshots, [], 'no uncaught browser errors');
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message };
  if (activePage && !activePage.isClosed()) {
    report.failure.state = await activePage.evaluate(() => ({ text: document.body.innerText, video: [...document.querySelectorAll('video')].map(v => ({ src: v.src, paused: v.paused, ended: v.ended, time: v.currentTime, duration: v.duration, readyState: v.readyState, error: v.error?.code })) }));
    await activePage.screenshot({ path: path.join(output, 'failure.png') });
    console.error('Failure state:', report.failure.state);
  }
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ...report, errors: snapshots }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  console.log('Browser evidence:', path.join(output, 'results.json'));
}
async function onlyActiveAfterCompletion(page) {
  assert.equal(await page.locator('video').count(), 0);
  assert.ok(await page.evaluate(() => window.elementsSeen.every(v => v.paused && !v.getAttribute('src'))));
}
