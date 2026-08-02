#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildCheckinEmailMessage } = require('../infra/lambda/session/email-template');

const outputFlagIndex = process.argv.indexOf('--output');
const outputPath = path.resolve(
  outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1]
    ? process.argv[outputFlagIndex + 1]
    : path.join(os.tmpdir(), 'jumpyard-t0200-email-preview.html'),
);

const preview = buildCheckinEmailMessage({
  booking: {
    bookingDate: '2026-07-22',
    bookingReference: 'JY-50871',
    startTime: '14:30:00',
  },
  checkinUrl: 'https://jumpyard-check-in-park-test.pages.dev/?jy_token=preview-only-not-a-real-token',
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, preview.html, 'utf8');
console.log(outputPath);
