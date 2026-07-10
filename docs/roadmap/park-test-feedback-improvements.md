# Park-Test Feedback Improvement Placeholders

This page preserves the completed post-park-test feedback queue after T0178-T0180. In the latest Sprint roadmap PDF, it corresponds to the Sprint 3 workstream "Agera på Sprint 2-respons". T0182-T0187 are closed; remaining phone/admin feedback decisions now belong to T0203 in the revised Sprint 3 plan.

## Outcome Guardrail

The tested base flow should be preserved. Park feedback was positive: guests could check in smoothly, the flow worked both with and without an existing booking, the park manager liked the app, and Oskar liked the flow. The improvement queue is about clarity, accessibility, copy, and robustness, not a new base design.

The deployed park-test full-flow window remains open until Love asks to close it. These placeholders do not close gates, broaden venue/date scope, enable webhooks, enable JumpYard-owned SMS/email sends, import same-day guest lists, or change AWS resources.

This page is not the full Sprint 3/4 roadmap. It covers the completed park-feedback response slice only. The main backlog tracks the Sprint 3 phone/admin/cloud plan. Kiosk/print/terminal and JumpyBoard/AirHive work remain separate project workstreams.

## Ticket Placeholders

| Ticket | Theme | Goal | Scope Boundary | Acceptance Notes |
|---|---|---|---|---|
| `T0182` | Global UX, layout, and copy density | Completed the immediate mobile viewport consistency pass and approved phone UX/copy polish after live park-test review. | Frontend UX/copy only. No public API contract, new AWS resource, Roller ownership, webhook, guest-send, or broader venue/date scope change. | Closed on 2026-07-07 with explicit viewport metadata, global overflow/text-size guards, dynamic-label width hardening, screen-by-screen phone UI polish, socks confirmation guard, buy-entry contact/payment consolidation, and read-only existing-booking add-on availability prefetch. |
| `T0183` | Safety video, rules, and child comprehension | Closed as already satisfied by the T0182 safety-flow polish. | Documentation-only closeout; no new legal/waiver model, app code, backend, AWS, Roller, gate, or deploy change. | Closed on 2026-07-07 because T0182 already made the safety video larger and clearer, added short-duration communication, improved replay/continue overlay behavior, clarified the path into safety-rule confirmation, and cleaned up rule copy/visual weight. |
| `T0184` | Older and technically inexperienced guest support | Closed as deferred to the later kiosk/staff-help setup. | Documentation-only closeout; no immediate phone-flow, backend, AWS, Roller, gate, or deploy change. | Closed on 2026-07-07 after Love confirmed this support need should be handled by the kiosk/personal-assistance track, where staff can help guests who struggle with QR/mobile check-in. |
| `T0185` | Socks confirmation guard | Closed as already satisfied by the T0182 socks add-on guard. | Documentation-only closeout; no backend/API, AWS, Roller, gate, payment, or deploy change. | Closed on 2026-07-07 because the add-ons step already requires either socks quantity or active approved JumpYard socks confirmation before continuing. |
| `T0186` | Water bottle add-on | Closed after adding water bottle handling as a clear add-on or bring-your-own confirmation. | Guest-facing add-on UX and product mapping review only; no frontend Roller calls, new AWS resources, gate broadening, webhook processing, JumpYard-owned sends, or venue/date-scope changes. | Closed on 2026-07-07. Guest can add a water bottle or confirm they brought one. Copy explains the simple reason: `Har du med egen vattenflaska? Tyvärr kan vi inte dela ut engångsmuggar av miljöskäl.` |
| `T0187` | Booking flow and Roller product semantics | Closed after adding the scoped ComboDeal buy-entry product and counting one ComboDeal package as two jumpers. | ComboDeal product mapping and phone product-selection UX only; klippkort, memberships, parties, broader catalog mapping, webhook processing, JumpYard-owned sends, and new AWS resources stayed out of scope. | Closed on 2026-07-07. ComboDeal now appears above standard entry products, maps through JumpYard Cloud to Roller Live parent `1318777`, and shows `2 personer + 60 min + 1 pizza` with the approved offer styling. |

## Deferred From This Queue

No separate `T0181` close-window ticket is planned right now because Love explicitly wants the park-test app to keep working until further notice.

No separate triage ticket is planned. `T0182` was the first concrete improvement ticket, not a feedback-sorting ticket.

T0188 is the first Sprint 3 phone/admin planning ticket. T0189 corrects the complete production target and renumbers the remaining-feedback owner to T0203 without reopening this completed feedback queue.
