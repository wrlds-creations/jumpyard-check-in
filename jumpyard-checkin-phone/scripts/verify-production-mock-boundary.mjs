import assert from 'node:assert/strict';
import fs from 'node:fs';

// Run after the real production export; catches route/build configuration changes.
for (const route of ['extend', 'preview/payment', 'preview/safety']) {
  const html = fs.readFileSync(new URL(`../out/${route}.html`, import.meta.url), 'utf8');
  assert.match(html, /404/, `/${route} must export the not-found page.`);
  assert.doesNotMatch(html, /<(?:button|video|form|canvas)\b/i, `/${route} must not export guest controls.`);
  assert.doesNotMatch(html, /15:30|16:00|EXTPAY_|data-preview-guest|data-preview-state|Inga riktiga betalningar/,
    `/${route} must not export simulated guest controls.`);
}
console.log('Production extension, payment preview and safety preview export only not-found pages.');
