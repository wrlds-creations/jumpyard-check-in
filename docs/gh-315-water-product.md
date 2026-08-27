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
- Read-only Aurora cache check through the restricted Booking runtime role: `970411`/`970363`, price 2000 cents, fetched 2026-08-27T02:01:15.706Z, expires 2026-08-28T02:01:15.706Z, fresh. The separate old `1324123` row remains at 4900 cents. No refresh or deletion was needed; the existing daily sync already contained both products.

## Regression coverage

`npm run validate:gh315-water-product` executes the real booking handler with isolated AWS/provider boundaries. It covers both cached row orders, exact parent/variation, missing price/SKU, wrong sibling, changed cached price, fresh-cache SQL, unchanged Playground mapping, new-entry/existing-booking request payloads, all four stale-purchase routes, historical paid item identity and already-started old-SKU payment-result/status recovery.

The regression failed before the change with actual product `1324123` versus expected `970411`, then passed after the change. Local `npm run validate`, `npm run infra:check` (including synth) and `git diff --check` passed. [CI run 33073036776](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33073036776) passed all required Repository, Infrastructure, Phone and Admin checks, including the exact Park profile synth. [Implementation PR #316](https://github.com/wrlds-creations/jumpyard-check-in/pull/316) merged as `ebc7598cbebe70e52fc7724b65617fde73c5e9e9`.

## Release boundary

Use the existing reviewed-main immutable release, read-only plan and protected `park-test` approval. Expected AWS difference: only `BookingHandler5D1461BB` code. No migrations. Exact target: account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, existing Nacka `50871` scope and operating dates through 2026-09-30.

Rollback selects a previously successful compatible immutable artifact through the same protected path. It restores the former offer for new purchases and must not rewrite either SKU's existing purchases. Do not rebuild locally or remove historical products as rollback.

## Verified rollout on 2026-08-27

| Evidence | Result |
|---|---|
| Reviewed source | PR #316, `ebc7598cbebe70e52fc7724b65617fde73c5e9e9` |
| Immutable build | [33073309846](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33073309846), success |
| Artifact | `9646859303`, digest `sha256:189f65bda5f42d2eb32992c41a0fb9c120616a46da5f6ced939791fe97663c65` |
| Protected rollout | [33073712214](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33073712214), success after reviewed visible plan and delegated approval |
| Plan | 202 current/release resources; only BookingHandler5D1461BB changed; no additions/removals or section changes |
| Release template hash | `b227888a573552adb362baebbf0cd866c5e0eeec9ffab06e13e908ad191ecf07` |
| Lambda readback | Updated 2026-08-27T12:52:25Z, Active/Successful, code SHA256 `uMTV+6kCIu2O9LzAOsxCTK7tZJrHAQ3f2Ld5bxGdx1Y=` |

The workflow passed exact deployed-template equality, `UPDATE_COMPLETE`, `IN_SYNC` drift, zero Park alarms, empty related queues, same-SHA Park verification phone/admin outputs and HTTP/config checks. Migrations remained complete through `0020`, with apply disabled. Nacka `50871`, dates through 2026-09-30, permissions, routes, runtime gates and secrets are unchanged. No public frontend or kiosk deployment was performed.

At 2026-08-27T12:53:30.957Z, the public Cloud availability contract returned exactly one offered water variation: JumpYard Vatten `970411`, parent `970363`, unitPrice 20 / unitPriceCents 2000, available and onlineSalesOpen true. No `1324123` was offered. Correlation: `gh315_water_live_availability`, date 2026-08-27, slot 16:00; source Live, `wroteBooking=false`.

The follow-up Live quote `gh315_water_live_quote` for two units returned HTTP 200, quoted, total/amount owing 40 SEK, fees 0, `wroteBooking=false`. A quote containing retired `1324123` returned HTTP 400 / `product_no_longer_available` (`gh315_retired_water_live_quote`). No real booking, payment, redemption or refund was created.

Rollback readiness: earlier successful release [32833988322](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32833988322), source `ec60eaae0bef0d7ed973e797de67578dcefa088e`, artifact `9557991482`, digest `sha256:46af7aa72170b2b3ca8af7e8ae4e244bbfe14787fba13127609029cec021b2f7`, was verified unexpired. It was successfully deployed in [32834381643](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32834381643) and remains schema-compatible because this rollout applied no migration. No rollback was needed or performed for #315; do not claim a new rollback rehearsal.

Physical selection, terminal amount and Handoff verification remain with kiosk #69. The separate keyboard PR #68 and kiosk layout PR #75 are not merged or deployed by this Cloud change. Start a fresh guest flow after restarting the kiosk app or reloading the mobile page so a pre-release in-memory cart does not retain the old offering. Existing payments should instead finish using their stored attempt.
