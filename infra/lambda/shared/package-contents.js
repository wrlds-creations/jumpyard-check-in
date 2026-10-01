'use strict';

const { bandColourForItem } = require('./band-colours');

// GH-367: response-only contents for the verified Nacka Weekday Combo.
// Each Lambda is deployed as an isolated directory. Keep its packaged copy byte-identical
// to this source; package-contents.test.js checks that boundary without changing CDK.
function withPackageContents(item, quantity = item?.quantity) {
  const productId = String(item?.productId ?? '').trim();
  const parentProductId = String(item?.parentProductId ?? '').trim();
  if (
    productId !== '1242136' ||
    (parentProductId !== '' && parentProductId !== '1242135') ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(quantity * 2)
  ) return item;

  return {
    ...item,
    packageContents: [
      { kind: 'admission', quantity: quantity * 2, collection: 'checkin', durationMinutes: 60 },
      { kind: 'pizza', quantity, collection: 'later' },
    ],
  };
}

function withBookingPackageContents(booking) {
  return {
    ...booking,
    items: booking.items.map((item) => withPackageContents(item)),
  };
}

// GH-459: response-only band colour of an admission item (band-colours.js). The Combo's
// own admission duration is used without adding contents; unmapped items are unchanged.
function withBandColour(item) {
  const bandColour = bandColourForItem(withPackageContents(item));
  return bandColour ? { ...item, bandColour } : item;
}

// Guest booking responses: verified package contents and band colours.
function withGuestItemDetails(item) {
  return withBandColour(withPackageContents(item));
}

function withGuestBookingDetails(booking) {
  return { ...booking, items: booking.items.map((item) => withGuestItemDetails(item)) };
}

module.exports = {
  withBandColour,
  withBookingPackageContents,
  withGuestBookingDetails,
  withGuestItemDetails,
  withPackageContents,
};
