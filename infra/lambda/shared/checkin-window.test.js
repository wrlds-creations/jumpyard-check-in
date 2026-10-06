'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { canAutoRedeemNow, evaluateCheckinWindow, stockholmNow } = require('./checkin-window');

// 2026-10-17 is in CEST (UTC+2): 11:00Z is 13:00 in Nacka.
const at = (stockholmClock, date = '2026-10-17') => new Date(`${date}T${stockholmClock}:00+02:00`);
const booking = { visitDate: '2026-10-17', startTime: '14:00:00', endTime: '15:00:00' };

test('Stockholm clock is used, not UTC', () => {
  assert.deepEqual(stockholmNow(new Date('2026-10-17T22:30:00Z')), { date: '2026-10-18', minutes: 30 });
});

test('check-in opens 120 minutes before the start and closes when the session ends', () => {
  assert.equal(evaluateCheckinWindow(booking, at('11:59')).state, 'too_early');
  assert.equal(evaluateCheckinWindow(booking, at('11:59')).opensAt, '12:00');
  assert.equal(evaluateCheckinWindow(booking, at('12:00')).state, 'open');
  assert.equal(evaluateCheckinWindow(booking, at('14:45')).state, 'open', 'late guests may still check in');
  assert.equal(evaluateCheckinWindow(booking, at('15:00')).state, 'open');
  assert.equal(evaluateCheckinWindow(booking, at('15:01')).state, 'too_late');
  assert.equal(evaluateCheckinWindow(booking, at('15:01')).closesAt, '15:00');
});

test('other days and missing times', () => {
  assert.equal(evaluateCheckinWindow({ ...booking, visitDate: '2026-10-18' }, at('14:00')).state, 'too_early');
  assert.equal(evaluateCheckinWindow({ ...booking, visitDate: '2026-10-16' }, at('14:00')).state, 'too_late');
  assert.equal(evaluateCheckinWindow({ visitDate: '2026-10-17', startTime: null, endTime: null }, at('08:00')).state, 'open',
    'unknown times never block a guest');
  assert.equal(evaluateCheckinWindow({ ...booking, startTime: '01:00:00', endTime: '02:00:00' }, at('00:10')).opensAt, '00:00');
});

test('automatic admission: today, until the end plus a short grace', () => {
  assert.equal(canAutoRedeemNow(booking, at('09:00')), true, 'purchases and early kiosk check-ins are admitted');
  assert.equal(canAutoRedeemNow(booking, at('15:30')), true);
  assert.equal(canAutoRedeemNow(booking, at('15:31')), false);
  assert.equal(canAutoRedeemNow({ ...booking, visitDate: '2026-10-18' }, at('14:00')), false);
  assert.equal(canAutoRedeemNow({ visitDate: '2026-10-17' }, at('23:00')), true);
});
