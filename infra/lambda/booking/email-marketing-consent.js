'use strict';

const crypto = require('node:crypto');
const COPY_VERSION = 'phone-email-2026-09-23-v3';
const PRIVACY_URL = 'https://jumpyard.se/dataskyddspolicy/';
const COPY = {
  sv: 'Ja tack! Mejla mig erbjudanden & nyheter från JumpYard',
  en: 'Yes please! Email me offers & news from JumpYard',
};
const emailHash = (email) => crypto.createHash('sha256').update(String(email ?? '').trim().toLowerCase()).digest('hex');

function validateChoice(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.granted !== true ||
      value.copyVersion !== COPY_VERSION || !Object.hasOwn(COPY, value.locale)) {
    return { code: 'email_marketing_consent_invalid', message: 'The optional email marketing choice is invalid.' };
  }
  return null;
}

function createPendingGrant(choice, customer, uniqueId, externalId, environment, now = new Date()) {
  if (!choice) return null;
  if (validateChoice(choice) || !uniqueId || !externalId || !customer.email) throw new Error('Invalid pending consent');
  return {
    granted: true,
    channel: 'email',
    source: 'phone_new_booking',
    venueId: '50871',
    scope: 'JumpYard email offers and news',
    copyVersion: COPY_VERSION,
    copyText: COPY[choice.locale],
    privacyUrl: PRIVACY_URL,
    locale: choice.locale,
    capturedAt: now.toISOString(),
    emailHash: emailHash(customer.email),
    uniqueId,
    externalId,
    environment,
  };
}

function isPaidBooking(booking, grant) {
  const status = String(booking?.paymentStatus ?? booking?.status ?? booking?.bookingStatus ?? '').toLowerCase().replace(/\s/g, '');
  const allStatuses = [booking?.paymentStatus, booking?.status, booking?.bookingStatus].join(' ').toLowerCase();
  const owing = booking?.amountOwing ?? booking?.costs?.amountOwing;
  return String(booking?.uniqueId ?? '') === grant.uniqueId &&
    booking?.externalId === grant.externalId &&
    Boolean(booking?.bookingReference) &&
    !/cancel|refund|delete/.test(allStatuses) &&
    ['paid', 'fullypaid'].includes(status) &&
    typeof owing === 'number' && Number.isFinite(owing) && owing <= 0;
}

// Full current writable profile, not stale checkout values. No false email flag,
// guessed SMS value or arbitrary property from the browser may reach this call.
function buildGuestGrant(guest, grant) {
  if (emailHash(guest?.email) !== grant.emailHash || !guest?.firstName || !guest?.lastName) return null;
  const sms = guest.acceptMarketingSMS ?? guest.acceptMarketingSms;
  if (typeof guest.acceptMarketing !== 'boolean' || typeof sms !== 'boolean') return null;
  const result = { firstName: guest.firstName, lastName: guest.lastName,
    email: guest.email, phone: guest.phone ?? guest.contactNumber ?? null,
    acceptMarketing: true, acceptMarketingSms: sms };
  for (const key of ['dateOfBirth', 'gender', 'taxIdentificationNumber', 'address', 'flags']) {
    if (Object.hasOwn(guest, key)) result[key] = guest[key];
  }
  return result;
}

// Dependencies own persistence and transport. A durable claim is consumed BEFORE
// PUT. Unknown outcomes are deliberately not retried: replaying an old grant
// after an unsubscribe is worse than requiring manual investigation.
async function deliverPendingGrant(grant, deps, now = Date.now()) {
  if (!grant || grant.copyVersion !== COPY_VERSION || grant.source !== 'phone_new_booking') return 'not_pending';
  const age = now - Date.parse(grant.capturedAt);
  if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) return 'expired';
  const booking = await deps.getBooking(grant.uniqueId);
  if (!isPaidBooking(booking, grant)) return 'not_paid';
  const guestId = String(booking.customerId ?? booking.customer?.id ?? '');
  if (!/^\d+$/.test(guestId)) return 'guest_unverified';
  const guest = await deps.getGuest(guestId);
  const payload = buildGuestGrant(guest, grant);
  if (!payload) return 'guest_unverified';
  if (!(await deps.claim())) return 'already_claimed';
  if (guest.acceptMarketing === true) {
    await deps.record('already_opted_in');
    return 'already_opted_in';
  }
  try {
    await deps.putGuest(guestId, payload);
    await deps.record('submitted');
    return 'submitted';
  } catch {
    // record() must not log provider payloads, names, contact, or medical flags.
    await deps.record('unknown');
    return 'unknown';
  }
}

module.exports = { COPY_VERSION, COPY, PRIVACY_URL, validateChoice, createPendingGrant,
  isPaidBooking, buildGuestGrant, deliverPendingGrant, emailHash };
