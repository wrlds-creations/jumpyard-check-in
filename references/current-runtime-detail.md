# Current runtime detail

Read for phone/admin behavior or data integration work. Facts are relocated without changing scope.

## Current Implemented Flow Facts

- #340: safe, correlated server-error reports. #403: lookup reads audit IDs.
- [#345](../docs/gh-345-staff-handout.md): daily codes, today-only queue, early café; APK accepted. AirDroid: colleague.

- Lookup is Aurora-first with Roller-authoritative refresh, Nacka/date scope, and nearest same-day selection. Ready bookings start/resume a server session; opaque booking-bound guest proof stays in phone memory and hash-only in Aurora.
- Safety: server-owned handoff, approval-to-safety and final paid check (D0199/#331); video recovery/media (D0210/#343). Staff identity/heartbeat: #334.
- Phone purchases use server-owned Roller paths and Live availability. Weekday Combo `1242135`/`1242136` requires public eligibility; catalog failure omits Combo (#341). Daily price refresh precedes booking reads (#339); 24-hour expiry stays. D0207: 2x60-min bands + 1 later pizza; no socks/drinks.
- Live water: `970411`/`970363` (D0195).
- D0196/D0197: compact add-ons use plus/minus, native scroll and Continue validation. D0205/#350: tiny top-right SV/EN control; both languages only on start screens.
- New PWA bookings use `sendConfirmations=true`; phone recovery follows D0201/D0203/D0206. D0209: prepare before receipt. Mocks: dev only.


## Data And Integration Facts

- Aurora stores normalized booking, item, ticket, payment, product, contact, webhook, session, token, delivery, and draft/link state. Data API windows populate an operational cache, never the source of truth.
- Booking webhooks use `x-roller-apikey`; the Park pilot-production backend validates its secret value. A broader multi-park webhook and credential model remains open.
- Dev schedules are off for Aurora auto-pause; manual operations wake it. Guest messaging resolves opaque `jy_token` links server-side.
- Park-test Live/Nacka index sync runs daily with bounded traffic, 30-day-past/all-future retention, and freshness monitoring. Webhook `1465` feeds durable FIFO intake and a serialized authoritative worker with DLQ/recovery/replay. Critical actions still confirm against Roller. See [T0196](../docs/t0196-booking-index-morning-seed.md) and [T0197](../docs/t0197-webhook-reconciliation.md).
