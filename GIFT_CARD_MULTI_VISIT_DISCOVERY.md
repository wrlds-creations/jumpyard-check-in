# Gift Card And Multi-Visit Discovery

This document records T0090 discovery for gift card payment and multi-visit pass behavior in Roller Playground.

## Scope

The business goal is:

- Let a guest pay for a buy-entry booking with a gift card.
- Let a guest use a multi-visit pass if Roller supports that as a payment or entitlement source.
- Avoid guessing multi-visit behavior into the payment or redeem model.

T0090 did not change app UI, JumpYard Cloud code, AWS resources, Aurora schema, Roller bookings, payments, or redemptions.

## Sources Checked

| Source | Finding |
|---|---|
| Roller Create draft booking docs | The page describes draft booking with separate `discounts` and `giftCards` arrays, returning booking costs and a payment JWT. URL: https://docs.roller.app/docs/rest-api/516f25029993a |
| Roller Booking costs docs | Booking costs uses the same draft/create booking payload family and is the safe non-booking calculation endpoint. URL: https://docs.roller.app/docs/rest-api/branches/main/62e21c34b7ef3-booking-costs |
| Roller Data API gift cards docs | `/data/giftcards` is read-only gift-card export by modified-date window. URL: https://docs.roller.app/docs/roller-api/107eedb77c32f-get-gift-cards |
| Roller guest multi-passes docs | `GET /customers/{customerId}/multi-passes` returns guest multi-pass balances with product, remaining-use, expiry, expired, and exhausted fields. The docs say `customerId` is deprecated but equivalent to `guestId`. |
| Roller RedemptionDetail docs | Redemption details can include `customerId`, `membershipStatus`, and `multiPass` entitlement details with usage tracking and ownership. This helps verify redeemed state, but does not explain how to apply a multi-pass during booking costs/draft. |
| Roller multi-pass product beta help docs | New beta multi-pass products are request-only, tied to booking holder email/online account, apply automatically to eligible session pass products in online/POS/Venue Manager carts, and cover all eligible sessions on an all-or-nothing basis. |
| Roller legacy multi-pass help docs | Older online-booking multi-passes can be modeled as standard pass plus discount code. This is not the same as the beta multi-pass REST model. |
| Roller gift card help docs | Gift cards are stored-value payment methods. They can be created as products, issued from Venue Manager, and redeemed online/POS by gift-card number. |
| Local JumpYard Cloud booking Lambda | Quote and draft request normalization already accepts `giftCards: [{ giftCardNumber }]` and forwards it to Roller. |
| Local Roller payment package | No multi-pass-specific client-side payment API was found. Payment still operates through `paymentJwt`. |

## Safe Playground Checks

All checks used Roller Playground credentials, printed no secrets, and did not create bookings, drafts, payments, redemptions, or Aurora writes.

| Check | Result |
|---|---|
| Product availability | Roller availability returned a valid entry slot for `2026-06-02 10:00`, product variation `1765860`, with remaining capacity. |
| Base booking costs | `POST /bookings/draft/costs` returned HTTP `200`, `bookingCosts.total=200`, `bookingCosts.amountOwing=200`, and top-level `giftCards` plus `multiPassAllocations` keys. |
| Invalid gift card booking costs | Same endpoint with `giftCards: [{ giftCardNumber: ... }]` returned HTTP `200`, kept `amountOwing=200`, and returned top-level `giftCardErrors` with one error. |
| Data API gift cards | `/data/giftcards` originally returned HTTP `200` for sampled windows but `0` records. After two Playground gift-card fixtures were created and paid in Venue Manager, `/data/giftcards` returned two gift-card rows for booking references `5101043` and `5101044`, with balances `500` and `100`. |
| Gift-card fixture costs | Before payment, those two gift-card numbers returned `Giftcard is not active`. After the source gift-card bookings were paid, `POST /bookings/draft/costs` applied both gift cards successfully. The `100 kr` gift card reduced a `200 kr` quote to `amountOwing=100`; the `500 kr` gift card reduced the same quote to `amountOwing=0`. |
| Product catalog multi-visit products | Product catalog contains `membership` products for `10-Kort`, `20-Kort`, `30-Kort`, and variants. |
| Product catalog gift cards | Product catalog contains `giftcard` products including `Presentkort`, `Presentkort Återbetalningskort`, and `Julbox`. |
| Product catalog beta multi-pass type | Product catalog returned product types `addon`, `sessionpass`, `giftcard`, `membership`, and `partypackage`; no explicit beta `multipass` product type was present in the current Playground response. |
| Membership product costs | `POST /bookings/draft/costs` for `10-Kort` variation `1765758` returned HTTP `200`, `total=1750`, `amountOwing=1750`. This proves selling a pass-like product can be costed, not that an existing pass can pay for entry. |
| Paid `10-Kort` membership fixture | Playground booking `5101046` bought product `1765758` (`10-Kort`) and is `Paid`, total `1750`, amount owing `0`, with Roller customer id `4045520`. The booking item ticket includes `membershipStatus`, confirming Roller treats this fixture as membership-like. |
| Guest detail | `GET /guests/{guestId}` returned guest identity fields only; no pass, membership, or multi-pass keys were present. |
| Documented customer multi-pass endpoint | `GET /customers/{customerId}/multi-passes` for a known Playground booking customer returned HTTP `200` with an empty array. It also returned HTTP `200` with an empty array for paid `10-Kort` customer `4045520`. This proves the endpoint is reachable, and that this `10-Kort` fixture is not exposed as a beta multi-pass balance through that endpoint. |
| Paid `10-Kort` customer quote | `GET /guests/4045520` returned enough guest contact data to quote with the same email. A `POST /bookings/draft/costs` quote for one eligible entry product with that guest email returned `total=200`, `amountOwing=200`, and `multiPassAllocations.allocations=[]`. This means the paid `10-Kort` fixture did not auto-apply to the API costs quote. |
| Guessed multi-pass REST paths | `/guests/{guestId}/multi-passes`, `/multipasses`, `/multiPasses`, `/passes`, `/memberships`, `/tickets`, `/redemptions`, and `/memberships?guestId=...` returned HTTP `404`. |
| Data API tickets | Sampled ticket windows returned only `productType=Pass`, `productSubType=Session`; no membership/multi-visit test records were present. |

## Gift Card Conclusion

Gift card payment is implementable in T0091. T0090 proved both partial and full gift-card application through the safe booking costs endpoint after the Playground gift-card fixtures were paid/activated in Venue Manager.

Confirmed:

- Roller costs accepts `giftCards`.
- Gift cards are not just discount codes in the documented booking payload. Roller models `discounts` and `giftCards` as separate arrays.
- Roller Help Center describes gift cards as stored value. If the balance covers the full purchase, no other payment method is needed; if balance is insufficient, the guest can pay the remainder with another method.
- Invalid gift cards fail softly inside a successful costs response through `giftCardErrors`.
- Current JumpYard Cloud quote/draft normalization already forwards `giftCards`.
- `bookingCosts.amountOwing` is the key value for deciding whether payment is still needed.
- Current Playground product catalog has gift-card products, and Venue Manager can issue gift-card fixtures that appear in `/data/giftcards`.
- Gift-card fixtures must be active before Roller applies them in booking costs; unpaid/reserved gift-card issue bookings can still appear in the Data API but fail costs with `Giftcard is not active`.
- Paid/active gift-card fixtures apply directly in booking costs. Partial gift-card value reduces `amountOwing`; full gift-card value can reduce `amountOwing` to `0`.
- Gift card creation, balance adjustment, and administration are not part of the current public API path for this project. Venue Manager remains the setup/admin surface for test gift cards.
- Payment Link should not be the main path for gift cards or add-ons because it does not keep the guest inside the PWA flow and is not the path that proved gift-card/discount handling.

Not yet confirmed:

- Whether a zero-owing draft should use `POST /bookings/draft/publish` instead of rendering Roller/Adyen payment.
- Whether the final published booking webhook/payment rows clearly show gift-card usage.

Needed input:

- Keep the current paid Playground gift-card fixtures available for T0091 implementation and T0092 smokes.

How to create gift-card fixtures in Roller Playground:

1. Go to `Products > All products`.
2. Filter/search for product type `Gift card`.
3. Open the gift-card product options menu and select `Issue new gift card`.
4. Enter value, quantity, purchaser details, delivery method, and recipient details.
5. Let Roller generate the gift-card number or set a clear non-production custom number.
6. For fast Playground testing, use a safe non-card payment method such as `Complimentary` if allowed; otherwise use Roller payment request.
7. Give JumpYard Cloud the gift-card number and expected balance for a costs/draft smoke.

## Multi-Visit Conclusion

Multi-visit is not ready for a balance-aware implementation yet.

Confirmed:

- Roller product catalog has multi-visit-like `membership` products such as `10-Kort`, `20-Kort`, and `30-Kort`.
- Those products can be costed as things to sell.
- A paid `10-Kort` fixture exists in Playground as booking `5101046`, but it behaves as a membership product in the observed REST data, not as a beta multi-pass balance.
- Roller has a documented read endpoint for existing guest multi-pass balances: `GET /customers/{customerId}/multi-passes`.
- The documented endpoint is reachable in Playground; both a normal known booking customer and the paid `10-Kort` customer returned HTTP `200` and `0` balances.
- Roller RedemptionDetail can include `multiPass`, `customerId`, usage state, and `membershipStatus` after a ticket/pass redemption path.
- Roller Help Center's new beta multi-pass model applies automatically when the guest is logged in online or added as the booking holder in POS/Venue Manager, using the same email address that owns the pass.
- Beta multi-passes cover eligible session pass products all-or-nothing; guests/staff cannot choose specific sessions to apply.
- If a beta multi-pass covers every eligible session and there are no other items, the expected booking total is `0`.
- Current Playground products still appear as `membership` products for 5-/10-/20-/30-card style products; the beta `multipass` product type is not visible in the `/products` response.
- The booking costs response includes a `multiPassAllocations` key, even for normal booking costs.
- The booking costs response for the paid `10-Kort` customer still returned empty `multiPassAllocations`, so this fixture should not be implemented as multi-visit until Roller confirms another apply path.
- Based on the broader Roller/Pabel notes, the Nacka multi-visit path may behave more like a membership or discount-code validation flow than the documented beta multi-pass balance endpoint.
- For V1, JumpYard should not promise or display "X of Y visits remaining". Roller should validate any membership/multi-visit code, and JumpYard should only show whether the code applied, was rejected, or reduced the amount due.

Not confirmed:

- How a guest identifies an existing multi-visit pass.
- Whether the current Playground venue has any guest with an active beta multi-pass balance. The paid `10-Kort` fixture did not count as one.
- Whether multi-visit passes can be applied in `POST /bookings/draft/costs` or `POST /bookings/draft` through another payload or customer-account mechanism.
- Whether Nacka's `10-Kort`/multi-visit should be sent as `discounts: [{ code }]`, another booking costs field, or another Roller-supported membership-code mechanism.
- Whether the API can trigger the same automatic beta multi-pass behavior by sending the booking holder's customer/email plus eligible session pass items, without a manual multi-pass field.
- Whether a multi-visit use creates a booking, a redemption, a ticket update, a membership usage record, or something else.
- Whether `multiPass` appears only after `POST /redemptions`, or also after a checkout/booking-costs allocation.
- How staff redeem should behave if entry was paid by a multi-visit pass.

Do not implement multi-visit in T0091. The paid `10-Kort` membership fixture did not appear in `GET /customers/{customerId}/multi-passes` and did not auto-apply in costs. Multi-visit needs Roller/Josh/Joao/Pabel confirmation or a real beta multi-pass fixture.

## T0093 Membership And 10-Kort Code Validation

T0093 tested the likely Nacka membership/code payload without creating bookings, drafts, payments, redemptions, Aurora writes, AWS resources, or UI changes.

Tested payload shape:

```json
{
  "items": [
    {
      "productId": 1765860,
      "quantity": 1,
      "bookingDate": "2026-06-03",
      "startTime": "10:00"
    }
  ],
  "discounts": [
    {
      "code": "<guest-entered code>"
    }
  ]
}
```

Safe Playground results:

| Check | Result |
|---|---|
| Baseline no code | `POST /bookings/draft/costs` returned `total=200`, `amountOwing=200`, `discount=0`, and `multiPassAllocations.allocations=[]`. |
| Invalid discount code | Roller returned HTTP `200`, kept `amountOwing=200`, returned `discount=0`, and still echoed a discount row. This means JumpYard must not treat the presence of a discount row as proof that a code applied. |
| Paid `10-Kort` booking reference, booking unique id, and booking item id | These candidate values had no effect: `amountOwing=200`, `discount=0`, and no multi-pass allocation. |
| Paid `10-Kort` ticket id | The masked ticket id from paid `10-Kort` booking `5101046` applied as a 100% discount through `discounts: [{ code }]`: one `200 kr` entry became `amountOwing=0`, `discount=200`. |
| Paid `10-Kort` ticket id with quantity `2` | The same code also discounted two entry tickets from `400 kr` to `amountOwing=0`, `discount=400`. Roller returned this as a normal discount, not as `multiPassAllocations`. |
| Normal paid entry ticket id comparison | A normal paid entry ticket id from booking `5100965` did not discount the quote. This suggests the successful `10-Kort` behavior is not generic "any ticket id works". |

Important interpretation:

- The current Nacka `10-Kort` fixture appears usable as a Roller discount-code style checkout input when the guest enters the membership/ticket code.
- Roller did not return any remaining-visit balance or `multiPassAllocations` for this fixture.
- Roller treated the accepted code as `percentOff=100`, `isLoyaltyDiscount=false`, and a normal discount response.
- The API costs response does not clearly show whether a future draft/published booking consumes one visit, all covered sessions, or only validates the code at checkout time.
- Because quantity `2` was fully discounted, JumpYard should ask Roller whether this is intended for Nacka `10-Kort` and whether draft/publish/payment enforces exhaustion and usage.

V1 recommendation:

- Implement membership/`10-Kort` only as code validation, not as balance display.
- Send the guest-entered code to Roller as `discounts: [{ code }]` in quote and draft payloads.
- Treat a code as accepted only when Roller reduces `amountOwing` or returns a positive discount amount.
- Treat no amount reduction as rejected/no effect, even if Roller echoes a discount row.
- Do not show "X visits remaining" in V1.
- Before writing a real draft/booking with a `10-Kort` code, run a guarded Playground smoke with explicit user approval because it may consume or reserve use of the pass.

## T0097 Gustav Membership Discount-Code Confirmation

T0097 re-checked the same question after Gustav clarified that the current JumpYard Nacka `10-Kort` setup is not Roller beta multi-pass. Gustav's model is that the current cards behave more like a membership-linked discount code: the guest has a code, Roller validates the code, and Roller should decide whether it can be applied.

Official docs checked:

| Source | Finding |
|---|---|
| Roller Validate discount codes docs | The endpoint is being deprecated and says Booking Costs should be used to validate discounts instead. URL: https://docs.roller.app/docs/rest-api/6e406a47c99e9-validate-discount-codes |
| Roller Create Discount Codes docs | Roller has first-class discount-code configuration APIs for creating codes against an existing discount configuration. URL: https://docs.roller.app/docs/rest-api/armugwijxjpqd-create-discount-codes |
| Roller Booking Costs docs | Booking Costs is the safe no-write calculation endpoint and uses the same draft/create booking payload family, including `discounts`. URL: https://docs.roller.app/docs/rest-api/branches/main/62e21c34b7ef3-booking-costs |
| Roller Get membership redemptions Data API docs | Roller has readback data for membership redemptions by redemption date, which may be useful after a real use is consumed. URL: https://docs.roller.app/docs/roller-api/377728db25f1a-get-membership-redemptions |
| Roller guest multi-passes docs | `GET /customers/{customerId}/multi-passes` remains the documented beta-style balance endpoint, but current Nacka `10-Kort` data still does not appear there. |

Safe no-write Playground checks:

| Check | Result |
|---|---|
| Paid `10-Kort` fixture | Booking `5101046` is still `Paid`, total `1750`, has a customer id, and contains membership-like markers in booking detail. |
| Multi-pass endpoint | `GET /customers/4045520/multi-passes` returned HTTP `200` with `0` balances. |
| Baseline quote | `POST /bookings/draft/costs` for one eligible `200 kr` entry without a code returned `total=200`, `amountOwing=200`, and `discount=0`. |
| Invalid code quote | The same quote with an invalid code returned HTTP `200`, kept `amountOwing=200`, and returned a discount row with `discount=0`. Echoed discount rows must not be treated as success. |
| Known `10-Kort` code quote | The masked paid `10-Kort` ticket/code from booking `5101046` sent as `discounts: [{ code }]` reduced the `200 kr` quote to `amountOwing=0`, `discount=200`, `percentOff=100`, and still returned empty `multiPassAllocations`. |
| Quantity `2` edge quote | The same known code reduced two `200 kr` entries from `400 kr` to `amountOwing=0`, `discount=400`. This needs a real consumption/exhaustion write test before we rely on it in production UX. |

Interpretation:

- Gustav's clarification matches the observed API behavior.
- The current Nacka `10-Kort` should not be implemented as a beta multi-pass balance in V1.
- The current Nacka `10-Kort` can be treated as a guest-entered membership/discount code candidate and sent to Roller as `discounts: [{ code }]` for quote/draft validation.
- JumpYard should consider a code accepted only if Roller actually reduces `amountOwing` or returns a positive discount amount.
- JumpYard should not show remaining visits for this setup because neither Booking Costs nor `GET /customers/{customerId}/multi-passes` returned balance data.
- JumpYard should not try to count visits locally in V1. Roller must remain the validator and enforcer.

Still unknown:

- Whether creating/publishing a draft with this code consumes one membership/10-card use.
- Whether Roller blocks the code once uses are exhausted.
- Whether quantity `2` should consume two visits or is an unintended discount configuration issue.
- Which readback source best proves consumption after a write: booking detail, membership redemptions Data API, redemption webhook, or another Roller view.

Recommended next ticket:

- `T0098` should be a controlled write smoke for the current Nacka `10-Kort` model, only after explicit approval. It should create one dedicated Playground booking with the code, publish/settle it through the supported no-payment or payment path, then verify whether Roller records a use and whether a second quote changes.

## Questions For Roller/Josh/Joao/Pabel

1. What is the supported API flow for applying a guest's existing multi-visit pass/10-card to a new booking?
2. For Nacka's current `10-Kort`, should the guest enter a membership/discount code, and should JumpYard send it in `discounts: [{ code }]`?
3. Should JumpYard use `GET /customers/{customerId}/multi-passes` only for future beta multi-pass products, not the current `10-Kort` membership setup?
4. For beta multi-pass products, does `POST /bookings/draft/costs` automatically apply the pass if the customer/email owns the pass and the items are eligible session passes?
5. If a multi-visit pass or membership code covers the entry, does the booking become `NoPaymentRequired`, `Paid`, or another status?
6. Does using a multi-visit pass consume a ticket through `POST /redemptions`, or does Roller consume one visit during booking/payment?
7. When a multi-pass is used, should JumpYard expect `multiPass` in RedemptionDetail/webhook as the authoritative usage proof?
8. Can Roller provide one Playground guest/pass/code fixture with remaining visits for integration testing?
9. Can Roller confirm that gift card creation/administration is Venue Manager only for this pilot, while payment use through Booking Costs/Draft is supported?

## Recommended T0091 Scope

Implement gift card first if valid Playground gift-card test data is available:

- Add guest-entered gift-card field in the buy-entry payment/review step.
- Send `giftCards` to quote and draft creation.
- Display invalid gift-card errors from Roller costs.
- Display gift-card amount applied when Roller returns it.
- If `amountOwing > 0`, continue to Roller/Adyen payment for the remaining amount.
- If `amountOwing === 0`, publish the no-payment draft if Roller confirms that path, then continue to the normal paid booking check-in continuation.

Defer multi-visit implementation until the supported apply payload and a Playground fixture are confirmed.

Defer membership/multi-visit code UX to a separate validation ticket. The likely V1 target is a generic "presentkort eller kod" concept only after Roller confirms whether membership/10-card codes should be sent as discount codes or another field.

## Recommended T0092 Smoke Cases

| Case | Expected proof |
|---|---|
| Normal card payment | Existing card-paid buy-entry flow still works. |
| Invalid gift card | Costs response shows an error and checkout cannot proceed as gift-card-paid. |
| Partial gift card | Total remains visible, gift-card value is applied, remaining amount is paid by card, booking continues to safety. |
| Full gift card | No card entry is required if Roller supports no-payment publish; booking continues to safety. |
| Multi-visit pass | Only after confirmed apply payload and fixture: one pass use creates the correct Roller state, RedemptionDetail includes the expected `multiPass` proof if applicable, and staff redeem does not consume the wrong ticket. |

## Current Decision

T0091 should implement gift-card support only after a valid Playground gift-card number is available. Multi-visit remains discovery/clarification-only until Roller confirms the API model.

## T0091 Implementation Note

T0091 implements only the confirmed gift-card path:

- The phone buy-entry flow accepts one optional gift-card number before quote/draft creation.
- JumpYard Cloud forwards `giftCards: [{ giftCardNumber }]` to Roller Booking Costs/Create Draft Booking.
- JumpYard Cloud returns safe gift-card metadata: requested count, applied count, applied amount when available/inferable, masked number when Roller returns one, and redacted errors.
- JumpYard Cloud does not log, persist, or return full gift-card numbers after submission.
- Invalid gift-card errors block draft creation until the guest removes or fixes the number.
- Partial gift-card coverage continues to Roller/Adyen payment for the remaining `amountOwing`.
- Full gift-card coverage calls Roller `POST /bookings/draft/publish` server-side when `amountOwing=0`, then the phone flow tries to sync the published booking through normal JumpYard Cloud lookup.
- If no-payment publish fails, JumpYard Cloud fails closed and does not show a misleading paid state.

T0091 still does not implement gift-card administration, `/data/giftcards` import, multi-visit balance display, membership-code payloads, or Payment Link behavior.

Dev deploy and direct API smoke passed on 2026-06-02:

- Invalid gift-card quote returned one safe error and kept `amountOwing=200`.
- The active `100 kr` fixture reduced a `200 kr` quote to `amountOwing=100`.
- The active `500 kr` fixture reduced a `200 kr` quote to `amountOwing=0`.
- Full gift-card draft publish created Roller Playground booking `5101055` and stored the local prepayment draft as `published`.
- Public phone-flow smoke remains T0092 because the phone UI must be committed, merged, and published by Cloudflare first.
