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

- `npm run validate:gh501-dropin-entry-prices` runs 9 catalog unit tests (3 of them new) and 6 handler checks with synthetic Nacka variants. All 6 handler checks fail on the previous code.
- `npm run validate:gh339-catalog-resilience`, `node scripts/validate-gh315-water-product.js` and the booking and shared Lambda unit tests still pass.
- PR #502 passed all 7 CI checks, including the full `npm run validate` on Linux.

## Rollout evidence

Love approved the rollout in chat on 2026-10-09 ("ja jag godkänner!"). The release, plan and approval steps:

| Step | Evidence |
|---|---|
| Merge | [PR #502](https://github.com/wrlds-creations/jumpyard-check-in/pull/502) squash-merged as `ae0da6e0d6f6a4db4e689ac97e8697fd2bed6408`. |
| Release | [Run 37936068108](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/37936068108) produced artifact `11618198315`, digest `sha256:1a208cd49764eac010e8b6f18528fce2cfd0f953b5b240d9c50c928529307e3b`. |
| Park plan | [Run 37937040871](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/37937040871) verified the downloaded digest. The plan showed 218 resources, current and in release; Added none; Removed none; Changed only `BookingHandler5D1461BB`. Migrations were not applied. |
| Approval and deploy | The protected `park-test` approval recorded Love's go, the plan facts and the rollback candidate. The deploy and its verification step passed. |
| Rollback candidate | Release 37925387617 (`dcd41bf`), the previous Park deployment. |

No public frontend promotion was needed: the phone and kiosk sources did not change, and both call the Park API.

### Runtime readback

The Booking Lambda was modified at 2026-10-09T13:30:24Z, and its state is `Active`. One availability request for Friday 2026-10-09 at 17:00 and 17:30, sent like the phone sends it, returned these Drop-In siblings:

| Entry | Drop-In id | Price |
|---|---|---|
| E60 | `1189812` | 220 kr |
| E90 | `1189829` | 250 kr |
| E120 | `1189777` | 280 kr |
| F60 | `1189821` | 660 kr |
| F90 | `1189838` | 750 kr |
| F120 | `1189800` | 840 kr |

- Weekday Combo stayed `1242136` at 450 kr, and SkyRider stayed 40 kr.
- The Booking log showed no `booking.drop_in_price_missing` warning and no server error.

### Acceptance

| Channel | Time | Purchase | Result |
|---|---|---|---|
| Phone (`ecommerce`) | 15:36 | One 90 min entry as `Biljetter (Drop-In - 250 kr)` (`1189829`), 250 kr | Paid in full; the draft was published to ROLLER. |
| Kiosk (`card_present`) | 15:51 | The same Drop-In entry plus Bryggkaffe, 285 kr | Paid in full on the terminal; the draft was published. |

Love confirmed both purchases in chat ("testade i mobilen som funkade", "funkar för kiosk också"). Both showed the drop-in price and became Drop-In products in ROLLER, the same products the kassa sells.

## Open item

Gustav may correct the Familj 120 min sibling in ROLLER (`Drop-In - 870 kr`, expected 930 kr). Until then, that tier sells at the web price and logs the warning. It has never been sold.
