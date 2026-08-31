import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getExitFlowMode,
  hasReachedSafety,
  isEcommercePaymentNavigationLocked,
} from './exitFlowPolicy.ts';

const pageSource = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const buySource = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
const paymentSource = fs.readFileSync(new URL('../components/RollerPaymentDropIn.tsx', import.meta.url), 'utf8');

const base = {
  addonsStep: 'SELECT',
  buyStep: 'TIMESLOT',
  paymentCompleted: false,
  safetyLocked: false,
  session: null,
  state: 'KIOSK_LOOKUP',
};

test('shows exit after the public first page and hides it on public start', () => {
  assert.equal(getExitFlowMode(base), 'confirm');
  assert.equal(getExitFlowMode({ ...base, state: 'KIOSK_CHOICE' }), 'hidden');
});

test('keeps ecommerce payment and post-payment synchronization fail closed', () => {
  assert.equal(getExitFlowMode({ ...base, buyStep: 'PAYMENT', state: 'KIOSK_BUY' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, buyStep: 'APPROVED', state: 'KIOSK_BUY' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, buyStep: 'PENDING', state: 'KIOSK_BUY' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, addonsStep: 'PAYMENT', state: 'APP_ADDONS' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, addonsStep: 'APPROVED', state: 'APP_ADDONS' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, paymentCompleted: true, state: 'APP_BOOKING' }), 'hidden');
});

test('hides and guards the internal back action as soon as ecommerce payment is received', () => {
  assert.equal(isEcommercePaymentNavigationLocked('bootstrapping'), false);
  assert.equal(isEcommercePaymentNavigationLocked('ready'), false);
  assert.equal(isEcommercePaymentNavigationLocked('received'), true);
  assert.equal(isEcommercePaymentNavigationLocked('approved'), true);
  assert.equal(isEcommercePaymentNavigationLocked('failed'), false);
  assert.equal(isEcommercePaymentNavigationLocked('blocked'), false);

  assert.match(paymentSource, /onNavigationLockChangeRef\.current\?\.\(isEcommercePaymentNavigationLocked\(status\)\)/);
  assert.match(buySource, /if \(backNavigationLocked\) return/);
  assert.match(buySource, /\{!backNavigationLocked && \(/);
});

test('server safety state keeps exit hidden after internal back navigation', () => {
  const safetySession = {
    checkinSessionId: 'session-safe',
    guestResumeStep: 'safety',
    status: 'guest_in_progress',
  };
  assert.equal(hasReachedSafety('APP_ADDONS', safetySession), true);
  assert.equal(getExitFlowMode({ ...base, session: safetySession, state: 'APP_ADDONS' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, state: 'APP_SAFETY_VIDEO' }), 'hidden');
  assert.equal(getExitFlowMode({ ...base, safetyLocked: true, state: 'APP_ADDONS' }), 'hidden');
});

test('reset removes local recovery and the private token before returning to start', () => {
  const resetStart = pageSource.indexOf('const resetToStart = () =>');
  const resetEnd = pageSource.indexOf('const restartAfterBuyRecovery =', resetStart);
  const resetSource = pageSource.slice(resetStart, resetEnd);

  assert.match(resetSource, /clearBuyFlowRecovery\(\)/);
  assert.match(resetSource, /token: null/);
  assert.match(resetSource, /setState\('KIOSK_CHOICE'\)/);
});
