# Local phone transition review — #426

Base: `168a82e0815662b5fdc7fe16567f1a86f2567d5d`. Branch: `codex/gh-426-smooth-phone-flow`. Prepared locally on 2026-09-17. The existing #396 worktree and its uncommitted changes were preserved. No commit, push, PR or deployment.

## Change

Root content/navigation now change in the same commit instead of waiting for an outgoing AnimatePresence screen. After Love requested softer motion on 2026-09-18, shared FlowTransition/FlowScreen presentation now fades an inert copy of the outgoing view out for 180 ms while the incoming view fades/slides in for 240 ms. The copy is captured before DOM mutation and removed on completion, rapid navigation or unmount; it retains no React effects/handlers, strips form identities, freezes video/canvas and refuses provider frames. Reduced motion, including live preference changes, skips the transition. Independent nested entrances remain suppressed. BuyTickets and AddonsOffer coordinate their nested steps. Scroll/focus runs after the incoming layout commits, rather than multiple times from async business handlers. Lookup no longer automatically opens a native input keyboard. Basket/payment/recovery rules are preserved.

The availability waiting state keeps the real time-choice geometry and makes its hidden controls inert. No minimum spinner duration, backend caching, prefetch or API changes were added. The observed hosted API wait belongs to #427.

## Try locally

In `jumpyard-checkin-phone`, run `npm ci`, set `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=http://127.0.0.1:3037` for the development process and run `npm run dev -- --webpack --hostname 127.0.0.1 --port 3026`. Open `http://127.0.0.1:3026/preview/flow`.

The 390×844 iframe renders real presentation components with a separate fixture controller. The toolbar supports wait/error simulation, SV/EN and simulated payment/safety/ready. It does not exercise every real root state transition or create a booking/payment/check-in. Synthetic reads stay local; other API/external fetches are rejected. The production route exports not-found and excludes its fixture module.

## Verification

- TypeScript, lint and production build pass. Four pre-existing image lint warnings remain.
- 325 flow/component tests pass in the 2026-09-18 source-directory regression run, covering existing payment recovery/confirmation, completed purchase, exit, add-on Back, safety, code application and nine transition/snapshot tests.
- Three additional fixture tests pass; `npm run test:flow-transitions` runs all twelve focused tests.
- The production mock-boundary postbuild check includes `/preview/flow`; no fixture markers occur in exported JS.
- WRLDS validator passes; workflow tests: 19 pass, eight template-only skips.
- Fixture browser journey: time→product→quantity→add-ons→review→contact and Back; own socks/bottle choices remain checked. A five-second wait preserves exactly 336 CSS px before/during loading; hidden controls are inert. Simulated errors remain local and expose Retry. Simulated approved payment→video presentation, toolbar jump to rules, local rule selection→ready and reset work.
- Actual app root: recovered local draft exits through the real confirmation dialog, home→lookup→Back works, focus lands on H1 and scroll is zero. Home/lookup were checked at 320×568, 390×844 and 430×932 with no horizontal overflow, in SV/EN and with reduced motion. This is not the full journey at every size.

## Remaining acceptance

Physical iPhone/Android keyboard, touch timing, real slow-network and provider recovery behavior remain unverified. Long error text and every short-screen/step combination still need user/device review. The configured animation is not a measured physical latency guarantee. The fixture payment controller does not replace existing business regression tests or live acceptance. Shared #427 owns availability latency, kiosk #118 owns installed wrapper/P400 verification. User localhost review is next.

## Softer-transition browser review — 2026-09-18

Forward and Back were rechecked through time, product, quantity, add-ons, summary and contact. Own-socks/water choices survive Back. Browser instrumentation confirmed the outgoing heading retains its exact pre-change rectangle, the copy is inert/aria-hidden, no form IDs/names are duplicated and the copy is removed after the transition. Incoming/outgoing animations use only opacity and transform. Phone reduced-motion emulation was tested on load and when toggled while the app remained open: no copies were created in reduced mode. Temporary instrumentation/emulation was removed before handoff. No physical-device frame-rate claim is made.
