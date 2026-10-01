import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { SAFETY_COVER, SAFETY_MEDIA } from './safetyMedia.ts';

test('each language ships its own complete, versioned MP4 inside the media budget', () => {
  assert.notEqual(SAFETY_MEDIA.sv.src, SAFETY_MEDIA.en.src);
  for (const [lang, media] of Object.entries(SAFETY_MEDIA)) {
    const bytes = fs.readFileSync(new URL('../../public' + media.src, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(media.src, `/media/safety-${lang}-${hash.slice(0, 12)}.mp4`);
    assert.ok(bytes.length < 4_000_000, `${lang} exceeds the reviewed 4 MB budget`);
    assert.equal(media.durationSeconds, 15);
    // Metadata must precede media bytes so first playback does not need the tail.
    const atoms = [];
    for (let offset = 0; offset < bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      assert.ok(size >= 8 && offset + size <= bytes.length, 'valid MP4 atom');
      atoms.push(bytes.toString('ascii', offset + 4, offset + 8));
      offset += size;
    }
    assert.ok(atoms.indexOf('moov') >= 0 && atoms.indexOf('moov') < atoms.indexOf('mdat'));
  }
});

test('the start-screen cover is one small, versioned JPEG cached like the films', () => {
  const bytes = fs.readFileSync(new URL('../../public' + SAFETY_COVER, import.meta.url));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(SAFETY_COVER, `/media/safety-cover-${hash.slice(0, 12)}.jpg`);
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG');
  assert.ok(bytes.length < 40_000, 'the cover stays a small still');
  const headers = fs.readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\/media\/safety-cover-\*\.jpg\r?\n\s+Content-Type: image\/jpeg\r?\n\s+Cache-Control: public, max-age=31536000, immutable/);
});
