# Drop-in prices for entries on the phone and the kiosk

Scope: [issue #501](https://github.com/wrlds-creations/jumpyard-check-in/issues/501), decision D0248.

On 2026-10-09 Gustav, via Love, asked for new entries bought in the check-in apps to cost the same as at the kassa: "vi vill gärna köra drop-in-priser". Gustav confirmed the rule. A drop-in entry costs the web price + 20 kr, and a family entry costs the web price + 60 kr.

## Verified product evidence

All reads on 2026-10-09 were read-only.

| Source | Finding |
|---|---|
| Aurora `product_catalog_cache`, fetched 2026-10-09 | Each of the six entry parents has one `Biljetter (Drop-In - <price> kr)` variant per web price. The parents are `1189805`, `1189823` and `1189771`, plus the family parents `1189814`, `1189832` and `1189794`. |
| Pairing check over the whole cache | Every web variant has exactly one Drop-In sibling at web + 20 kr (family + 60 kr), and no parent repeats a Drop-In price. The one exception is Familj 120 min: web 870 kr `1189797` has no sibling at 930 kr. Its neighbour is `Drop-In - 870 kr` `1189801`, and that tier has never been sold. |
| Aurora booking items, 2026-09-01 to 2026-10-08 | The kassa (`Doorlist`) sells only Drop-In variants. The web checkout (`Consumer`) and our apps (`Api`) sell web variants. In every slot where both were sold, Drop-In = web + 20 kr (family + 60 kr). |
| ROLLER `GET /product-availability`, Saturday 2026-10-10, all entry parents and Combo | Each session allocates only a web variant. For 60 min, that is 180 kr at 09:00–09:30 and 17:00–18:00, 200 kr at 10:00–12:30 and 220 kr at 13:00–16:30. Drop-In variants appear in neither `products` nor `allocations`. |
| ROLLER `POST /bookings/draft/costs` (price calculation only) | Drop-In `1189813` for Saturday 13:00 costs 240 kr, so the API key may price Drop-In variants. |
| Weekday Combo `1242135` | It has only variant `1242136` at 450 kr, with no Drop-In sibling, so it stays unchanged. |

The three ROLLER calls (token, availability and costs) were approved by Love in chat and created nothing.

## Behaviour

1. **Availability.** `POST /v1/bookings/availability` still selects ROLLER's allocated web variant per slot.
   - For entry and family products, Cloud then looks up the cached Drop-In sibling under the same parent at web + step.
   - It returns that sibling's `productId`, `productName`, `unitPrice` and `unitPriceCents`.
   - The siblings come from the same `loadPhoneBookingParentProducts` read that availability already makes, which now also selects `priceCents`.
2. **Fallback.** Without exactly one fresh sibling, the slot keeps its web variant, as before.
   - Cloud logs `booking.drop_in_price_missing` with product keys, web ids and web prices only.
   - The `booking.availability_succeeded` event records `dropInPricedSlotCount` and `dropInMissingProducts`.
3. **Validation.** Quote and draft validation (`validateItemsAvailable`) accept a cached Drop-In id only at the slot whose allocated web variant it pairs with (web + step).
   - Otherwise they return `drop_in_price_mismatch`.
   - Capacity and online-sales checks use that slot.
   - If ROLLER ever allocates the Drop-In id itself, the existing direct check applies.
4. **Pricing authority.** ROLLER stays the authority: the quote and draft carry the Drop-In id, and ROLLER computes the amount.

Phone and kiosk need no change. Both already show `unitPrice` and send the returned `productId`, and neither shows the ROLLER variant name. Staff screens show the parent name ("Entré 60 min"), as for kassa bookings today.

## ROLLER call budget

The call budget is unchanged: one availability read per availability request, and one availability read per validated item at quote and draft. The sibling lookup is an Aurora read inside the existing query.

## Validation

- `npm run validate:gh501-dropin-entry-prices` runs 9 unit tests and 6 handler checks with synthetic Nacka variants. All of them fail on the previous code.
- `npm run validate:gh339-catalog-resilience`, `node scripts/validate-gh315-water-product.js` and the booking and shared Lambda unit tests still pass.

## Rollout

The rollout is pending, through the protected Park release (`Refs #501`). Love verifies one phone purchase and one kiosk purchase at the drop-in price.

## Open item

Gustav may correct the Familj 120 min sibling in ROLLER (`Drop-In - 870 kr`, expected 930 kr). Until then, that tier sells at the web price and logs the warning.
