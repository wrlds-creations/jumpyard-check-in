# T0182 Mobile Viewport, UX Polish, And Add-On Prefetch

## Goal

Fix the phone app so mobile browser entrypoints render consistently, especially the QR-open path that once appeared extremely zoomed on iPhone, then apply the approved park-test feedback polish across the existing phone flow without changing the underlying architecture or broad product model.

## Scope

Del A:

- Add explicit Next viewport metadata for device-width, initial scale, and viewport fit.
- Preserve user pinch zoom; do not set maximum scale or disable scalable viewport behavior.
- Add global mobile stability guards for page width, horizontal overflow, text-size adjustment, and media width.
- Harden top-level phone layout containers and dynamic labels so long text cannot widen the page.

Del B / live park-test UX polish:

- Reduce unnecessary explanatory copy and grey visual weight across the phone flow.
- Keep the tested base flow, but make decisions and primary actions clearer on mobile.
- Polish start choice, start time, product selection, jumper/add-on/contact/summary/payment, safety, ready-for-entry, booking lookup, existing-booking summary, existing-booking add-ons, and SkyRider screens.
- Require the socks step to choose either add-on quantity or an active approved-socks confirmation before continuing.
- Merge contact and payment prep for the buy-entry flow so payment follows contact details on the same slide.
- Add a read-only existing-booking add-on availability prefetch after booking lookup so the add-ons screen can load faster after the guest starts check-in.

Out of scope: public API contract changes, backend data-contract changes, new AWS resources, new Roller endpoints, broader venue/date scope, webhooks, JumpYard-owned guest sends, water-bottle product launch, full Roller product-count source-of-truth mapping, admin UI redesign, production readiness, and the future kiosk/AirHive workstreams.

## Implementation

- `jumpyard-checkin-phone/src/app/layout.tsx` now exports a `viewport` with `width: "device-width"`, `initialScale: 1`, and `viewportFit: "cover"`.
- `jumpyard-checkin-phone/src/app/globals.css` now locks `html`/`body` to full width with horizontal overflow hidden, keeps mobile text auto-scaling stable, and prevents images/videos/canvas from exceeding their containers.
- Phone flow containers in `src/app/page.tsx` and key components now use scoped `min-w-0`, max-width containment, wrap, or truncation where dynamic labels could otherwise create horizontal overflow.
- Dynamic rows covered include progress labels, booking references, booking product/add-on labels, add-on rows, buy-entry product/add-on rows, payment summary rows, and final handout/other-add-on rows.
- The phone UI now uses the approved smaller/cleaner mobile composition for the start choice, start-time cards, product cards, jumper quantity, add-ons, contact details, summary, payment loading/completion, safety video/rules, ready-for-entry QR, booking lookup, existing-booking summary, existing-booking add-ons, and SkyRider consent.
- The buy-entry summary now centers on an expanded `Att betala` section, with selected products listed directly beneath the total and the payment step kept under `Din kontakt`.
- The existing-booking summary keeps the icon-led product presentation, removes redundant grey helper copy, and uses the same polished add-on/SkyRider/review pattern as the new-booking path.
- The safety video now presents a larger responsive video-first screen with short-duration copy, play overlay behavior, replay, and a direct path into safety-rule confirmation.
- The final ready-for-entry screen keeps the QR code while using shorter staff handoff copy and a quieter new-booking link.
- `src/app/page.tsx` now starts a read-only availability prefetch for existing-booking add-ons after lookup/session resolution and when starting check-in.
- `src/components/AddonsOffer.tsx` can consume a matching prefetched availability result or promise, and falls back to its normal availability request if the prefetch is missing or failed.

## Validation

| Check | Result | Notes |
|---|---|---|
| `npm --prefix jumpyard-checkin-phone run lint` | Passed | Existing four `<img>` warnings only. |
| `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com npm --prefix jumpyard-checkin-phone run build` | Passed | Park-test API target baked into the static phone bundle; existing `baseline-browser-mapping` notices only. |
| Static mobile viewport checks | Passed | Served `jumpyard-checkin-phone/out` locally and checked `/` plus `/?park=1` at `375x667`, `390x844`, `360x740`, and `412x915`. |
| Horizontal overflow assertions | Passed | For every checked entry URL and reachable key screen, `document.documentElement.scrollWidth <= window.innerWidth` and `document.body.scrollWidth <= window.innerWidth`. |
| Reachable key screens | Passed | Start choice, booking lookup, and buy-entry first screen were checked in all four mobile viewport sizes. |
| Visual spot check | Passed | At `390x844`, start choice, booking lookup, and buy-entry first screen kept the same basic feel without extreme zoom. |
| User live-review pass | Passed | Love reviewed the deployed park-test phone flow screen-by-screen in the in-app browser and approved the final T0182 polish. |
| Add-on prefetch closeout | Passed | Existing-booking add-on availability prefetch is read-only and does not create drafts, payments, add-ons, redemptions, or backend state before the guest continues. |
| `npm run validate` | Passed | Root workflow/current-ticket/followup/history/skills/AWS/frontend-target/T0177 validators passed. |
| Park-test frontend target check | Passed | `npm run validate:park-test-frontend-target` confirmed the phone bundle targets the park-test API and excludes the dev/fake/local API targets. |
| Cloudflare park-test deploy | Passed | Direct-deployed the static phone build to `jumpyard-check-in-park-test`; stable URL returned HTTP `200`, and the in-app browser showed no console errors after reload. |
| `git diff --check` | Passed | CRLF normalization warnings only. |

## Result

T0182 is closed as a combined mobile viewport consistency and approved mobile UX/copy-polish ticket. The park-test app remains intentionally open for Nacka dates through 2026-09-30; closing this ticket does not close the full-flow runtime window.
