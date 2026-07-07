# T0186 Water Bottle Add-On

## Status

Closed on 2026-07-07 after implementation, AWS deploy, Cloudflare deploys, and user approval.

## Goal

Add water bottle handling as a clear add-on or bring-your-own confirmation. Guests should be able to buy a water bottle or actively confirm they brought one, with simple environmental copy explaining that JumpYard does not hand out disposable cups.

## Implementation

- Added `water_bottle` as a phone add-on id, sorted after socks and before other add-ons.
- Added a water bottle card to both buy-entry and existing-booking add-on flows.
- Required either water bottle quantity or active own-bottle confirmation when the water bottle add-on is available.
- Added Swedish/English water bottle copy:
  - `Har du med egen vattenflaska? Tyvärr kan vi inte dela ut engångsmuggar av miljöskäl.`
- Added water bottle icon assets to phone and admin public icon folders. The final user-selected flatter icon was converted from green chroma-key to transparent PNG and cache-busted as `imagegen-flat-t0186`.
- Updated phone booking summary and ready-for-entry handout views to show the water bottle icon.
- Updated admin handout icon classification so water bottles are recognized as a check-in handout item.
- Updated existing booking add-on recognition so real booking items containing water/bottle/flaska text map to `water_bottle`.
- Updated Roller Live catalog readiness required add-ons to include `water_bottle`.

## Roller Product Mapping

Read-only Roller Live catalog search found these relevant bottle candidates:

| Candidate | Product id | Parent | Price |
|---|---:|---|---:|
| `Jumpy Vattenflaska` | `1324123` | `Merchandise` / `970508` | `49 kr` |
| `Vattenflaska Svart` | `970521` | `Merchandise` / `970508` | `45 kr` |
| `Sportflaska` | `970529` | `Merchandise` / `970508` | `89 kr` |

T0186 uses `Jumpy Vattenflaska` because it is the most JumpYard-branded general water bottle product. The backend mapping is:

```text
water_bottle -> Roller Live product 1324123
parent -> 970508 / Merchandise
requiresAvailability -> false
```

## AWS / Deploy

AWS metadata confirmed from `infra/config/park-test-full-flow-rehearsal.json` and STS:

| Field | Value |
|---|---|
| Account | `376129878018` |
| Region | `eu-north-1` |
| Environment | `park-test` |
| Client | `JumpYard` |
| Project | `jumpyard-check-in` |
| Owner | `love` |
| Repository | `wrlds-creations/jumpyard-check-in` |
| Managed by | `cdk` |
| Data classification | `confidential` |
| Exportable | `true` |
| Cost center | `unassigned` |

`npm --prefix infra run diff:park-test-full-flow-rehearsal` showed only the existing `BookingHandler` Lambda code bundle changing. No new AWS resources, no gate changes, no venue/date scope changes, no webhook processing, no JumpYard-owned SMS/email sends, and no public API contract changes were introduced.

`npm --prefix infra run deploy:park-test-full-flow-rehearsal` completed successfully and the stack reached `UPDATE_COMPLETE`.

Phone and admin park-test Cloudflare Pages were direct-deployed from builds using:

```text
NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com
```

Stable URLs checked:

- `https://jumpyard-check-in-park-test.pages.dev/` returned HTTP `200`.
- `https://jumpyard-checkin-admin-park-test.pages.dev/` returned HTTP `200`.
- Phone and admin `water-bottle.png` assets returned HTTP `200`.
- Deployed phone bundle contains both `water_bottle` and the park-test API target.
- After the flatter icon replacement, phone and admin were redeployed again. The stable phone bundle contains `water_bottle`, `imagegen-flat-t0186`, and the park-test API target.
- Final phone polish deploys compacted the recommended socks count card, removed the grey capacity-loading surface, made small add-on copy black, and made add-on price text black/normal weight.

## Validation

| Check | Result |
|---|---|
| `npm --prefix jumpyard-checkin-phone run lint` | Passed with existing Next `<img>` warnings only. |
| `npm --prefix jumpyard-checkin-phone run build` | Passed. |
| `npm --prefix jumpyard-checkin-admin run lint` | Passed. |
| `npm --prefix jumpyard-checkin-admin run build` | Passed. |
| `npm --prefix infra run build` | Passed. |
| `npm --prefix infra run validate:roller-live-catalog-index-readiness` | Passed self-test. |
| Read-only Live catalog readiness | Passed; `water_bottle` selected `1324123` / `Jumpy Vattenflaska` / `4900` cents. |
| `npm --prefix infra run synth:park-test-full-flow-rehearsal` | Passed. |
| `npm --prefix infra run diff:park-test-full-flow-rehearsal` | Passed; only `BookingHandler` code changed. |
| AWS deploy | Passed; `jumpyard-check-in-park-test-stack` reached `UPDATE_COMPLETE`. |
| Park-test availability API smoke | Passed; `water_bottle` returned product `1324123`, price `49`, non-capacity. |
| Cloudflare phone/admin deploy | Passed. |
| Flatter water bottle icon deploy | Passed; phone/admin assets return HTTP `200`, and deployed bundles include `imagegen-flat-t0186`. |
| Final phone UI polish deploy | Passed; stable phone URL returned HTTP `200` with cachebusters `t0186_compact_socks` and `t0186_black_prices`. |
| `git diff --check` | Passed; Git emitted line-ending normalization warnings only. |

## Follow-Up

T0186 is closed. If JumpYard chooses a different exact bottle SKU or changes the disposable-cup policy, open a new scoped ticket rather than changing this closeout retroactively.
