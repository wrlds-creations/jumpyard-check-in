#!/usr/bin/env node
const assert = require('assert');
const path = require('path');

const lookup = require(path.join('..', 'infra', 'lambda', 'lookup', 'index.js'))._internal;

function booking(reference, startTime) {
  return {
    booking: {
      bookingReference: reference,
      items: [
        {
          bookingDate: '2026-06-30',
          startTime,
        },
      ],
    },
    lookupPath: 'test',
    rollerBooking: { bookingReference: reference },
  };
}

assert.strictEqual(lookup.inferIdentifierType('166797742'), 'bookingReference');
assert.strictEqual(lookup.inferIdentifierType('68b3bbb4-9a46-4379-96ac-bc7157f2fb3e'), 'rollerUniqueId');
assert.strictEqual(lookup.inferIdentifierType('guest@example.com'), 'email');
assert.strictEqual(lookup.inferIdentifierType('070 123 45 67'), 'phone');
assert.strictEqual(lookup.normalizePhoneForSearch('070 123 45 67'), '+46701234567');

const selected = lookup.selectBestBookingSearchMatch(
  [booking('later', '12:30:00'), booking('next', '11:00:00')],
  '2026-06-30',
  new Date('2026-06-30T08:44:00.000Z'),
);
assert.strictEqual(selected.booking.bookingReference, 'next');

const scoped = lookup.scopeBookingForLookupDate(
  {
    bookingReference: 'multi',
    items: [
      { bookingDate: '2026-06-30', startTime: '11:00:00' },
      { bookingDate: '2026-07-01', startTime: '12:00:00' },
    ],
  },
  '2026-06-30',
);
assert.deepStrictEqual(scoped.items, [{ bookingDate: '2026-06-30', startTime: '11:00:00' }]);

console.log('T0177 contact lookup validation passed.');
