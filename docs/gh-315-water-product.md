# Exact Live water offer

Scope: [Cloud issue #315](https://github.com/wrlds-creations/jumpyard-check-in/issues/315), supplying the product dependency for [kiosk #69](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/69).

## Selection and compatibility

| Purpose | ROLLER variation | Parent | Observed price |
|---|---|---|---|
| New water offer | JumpYard Vatten `970411` | Cold Drinks `970363` | 20 SEK |
| Historical water purchases only | Jumpy Vattenflaska `1324123` | Merchandise `970508` | 49 SEK |

The Live water offer requires the exact new variation and parent in the fresh product cache. The legacy name cannot win in either row order. Missing, expired or unpriced new water is omitted, not replaced by the old bottle or another Cold Drinks product. The central daily fetch and 24-hour expiry remain unchanged. Observed prices in this document are evidence, not application fallback prices.

New phone and kiosk quote/draft requests reject retired `1324123` before external work. Existing draft payment-result/status reconciliation does not use this new-sale validation. Stored items, totals, historical cache rows, linked add-ons and Handoff display remain untouched. Playground selection and all other product mappings are unchanged.

No ROLLER catalog edit, booking creation, payment, refund, redemption, cache purge, new AWS resource, migration, permission change or frontend change is part of this implementation.

## Read-only provider evidence

- Live `GET /products`, 2026-08-27T12:23:13.869Z: exact new variation and parent as above, `isSuspended=false`, tax-inclusive, tax 12. [Source evidence](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/69#issuecomment-5439095829).
- Cloud quote at 2026-08-27T12:37:57Z, correlation `gh315_water_quote_preflight`: two units of `970411`, date 2026-08-27, start 15:00, `requiresAvailability=false`. HTTP 200, `status=quoted`, total/amount owing 40 SEK, fees 0, source Live `POST /bookings/draft/costs`, `wroteBooking=false`. This proves quote eligibility and price, not terminal payment or physical stock.

## Regression coverage

`npm run validate:gh315-water-product` executes the real booking handler with isolated AWS/provider boundaries. It covers both cached row orders, exact parent/variation, missing price/SKU, wrong sibling, changed cached price, fresh-cache SQL, unchanged Playground mapping, new-entry/existing-booking request payloads, all four stale-purchase routes, historical paid item identity and already-started old-SKU payment-result/status recovery.

The regression failed before the change with actual product `1324123` versus expected `970411`, then passed after the change. Full repository/infrastructure validation and deployment evidence belong in the PR and the post-merge rollout record.

## Release boundary

Use the existing reviewed-main immutable release, read-only plan and protected `park-test` approval. Expected AWS difference: only `BookingHandler5D1461BB` code. No migrations. Exact target: account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, existing Nacka `50871` scope and operating dates through 2026-09-30.

Rollback selects a previously successful compatible immutable artifact through the same protected path. It restores the former offer for new purchases and must not rewrite either SKU's existing purchases. Do not rebuild locally or remove historical products as rollback.

The implementation PR alone does not prove deployment. Keep #315 open until rollout evidence is merged. Physical selection, terminal amount and Handoff verification remain with kiosk #69. The separate keyboard PR is not merged or deployed by this Cloud change.
