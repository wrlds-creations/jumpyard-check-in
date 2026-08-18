import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findRecoveredBookingProduct,
  getVisibleBookingProductSections,
  isPurchasableBookingProduct,
} from './productVisibility.ts';
import { weekdayComboCopy } from '../context/weekdayComboCopy.ts';

function product(overrides = {}) {
  return {
    available: true,
    capacityRemaining: 10,
    durationMinutes: 60,
    endTime: '11:00',
    jumpersPerUnit: 1,
    key: 'E60',
    label: '60 min entry',
    onlineSalesOpen: true,
    parentProductId: 'parent-1',
    productId: 'product-1',
    productName: 'Adult',
    requiresAvailability: true,
    startTime: '10:00',
    type: 'entry',
    unitPrice: 200,
    unitPriceCents: 20000,
    ...overrides,
  };
}

function slot(products) {
  return {
    date: '2026-08-17',
    products,
    startTime: '10:00',
  };
}

test('groups only purchasable booking products and leaves empty sections empty', () => {
  const sections = getVisibleBookingProductSections(
    slot([
      product({ key: 'COMBO60', productId: 'combo-1', type: 'combo' }),
      product({ available: false, key: 'E60', productId: 'entry-unavailable', type: 'entry' }),
      product({ key: 'E90', productId: 'entry-available', type: 'entry' }),
      product({ key: 'F60', productId: null, type: 'family' }),
      product({ key: 'socks', productId: 'addon-1', type: 'addon' }),
    ])
  );

  assert.deepEqual(sections.combo.map(({ key }) => key), ['COMBO60']);
  assert.deepEqual(sections.entry.map(({ key }) => key), ['E90']);
  assert.deepEqual(sections.family, []);
  assert.equal(sections.total, 2);
});

test('hides products that cannot satisfy one sellable unit of capacity', () => {
  assert.equal(
    isPurchasableBookingProduct(product({ capacityRemaining: 1, jumpersPerUnit: 2, type: 'combo' })),
    false
  );
  assert.equal(
    isPurchasableBookingProduct(product({ capacityRemaining: 4, jumpersPerUnit: 4, type: 'family' })),
    true
  );
});

test('returns an empty result when the selected slot has no purchasable products', () => {
  const sections = getVisibleBookingProductSections(
    slot([
      product({ available: false, key: 'COMBO60', type: 'combo' }),
      product({ capacityRemaining: 0, key: 'E60', type: 'entry' }),
      product({ key: 'F60', productId: '', type: 'family' }),
    ])
  );

  assert.deepEqual(sections, { combo: [], entry: [], family: [], total: 0 });
});

test('recovery cannot restore an unavailable or otherwise hidden product', () => {
  const recovered = {
    durationMinutes: 60,
    key: 'COMBO60',
    label: 'Weekday Combo',
    productId: '1242136',
    startTime: '10:00',
    type: 'combo',
    unitPrice: 450,
  };

  const unavailableSlot = slot([
    product({ available: false, key: 'COMBO60', productId: '1242136', type: 'combo' }),
  ]);
  assert.equal(findRecoveredBookingProduct(unavailableSlot, recovered), null);

  const availableReplacement = product({ key: 'COMBO60', productId: '1242136', type: 'combo' });
  assert.equal(findRecoveredBookingProduct(slot([availableReplacement]), recovered), availableReplacement);
});

test('uses Weekday Combo copy without the retired name or all-days claim', () => {
  assert.deepEqual(weekdayComboCopy, {
    en: { availability: 'Weekdays', name: 'Weekday Combo' },
    sv: { availability: 'Vardagar', name: 'Weekday Combo' },
  });
  assert.equal(JSON.stringify(weekdayComboCopy).includes('ComboDeal'), false);
  assert.equal(JSON.stringify(weekdayComboCopy).includes('Alla dagar'), false);
  assert.equal(JSON.stringify(weekdayComboCopy).includes('All days'), false);
});
