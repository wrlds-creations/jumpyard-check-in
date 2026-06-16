# Roadmap Backlog

This backlog was created in T0128 so broad future planning does not bloat `REPO_CURRENT_STATE.md`. It is a planning surface, not proof that a ticket is active or completed.

## Backlog Lifecycle

- Backlog is for planned or active tickets only.
- When a ticket is completed, remove it from the active backlog sections during closeout.
- Record completed tickets in [docs/history/completed-tickets.md](../history/completed-tickets.md).
- Record closeout validation evidence in [docs/history/validation-log.md](../history/validation-log.md) when validation is performed.
- Keep `REPO_CURRENT_STATE.md` focused on the current ticket state and the recommended next ticket.

## Backlog Columns

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|

## Now

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|
| None | Ticket selection | No active Codex ticket. Choose the next scoped ticket from active followups, roadmap priorities, or user direction before editing. | T0133 completed | Low | Activate `CODEX_TASK.md` before implementation. | Root validators should pass before new ticket work starts. | Ready for selection |

## Next

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|
| `T0134` | Payment UX | Add a clear post-payment loading state while the paid booking is fetched and check-in is prepared. | T0133 | High | Directly after approved buy-entry payment; no payment provider or backend contract changes unless explicitly activated. | Phone lint/build plus payment-return mock smoke for loading, retry, and fallback copy. | Ready |
| `T0135` | Safety UX | Add buy-entry-specific context before the safety video after purchase. | T0134 | Medium | Buy-entry safety copy only; existing-booking safety copy can stay simpler. | Phone lint/build plus smoke of paid buy-entry safety-video and rules copy. | Planned |
| `T0136` | Flow recovery | Persist local buy-flow state so refresh can resume after purchase and during safety steps. | T0135 | High | Client-side buy-flow recovery only unless the activated ticket explicitly scopes server resume changes. | Phone lint/build plus refresh/resume smoke for paid and unsafe-to-resume states. | Planned |
| `T0137` | Confirmation UX | Make the final confirmation view lighter and channel-aware. | T0136 | Medium | Confirmation/final-step copy and handout summary only; no redeem or staff workflow changes. | Phone lint/build plus smoke of on-site, SMS/home, and kiosk copy if those channels are in scope. | Planned |
| TBD | Guest-facing add-on catalog | Review which Roller add-ons should be exposed to guests beyond SkyRider, socks, padlock, and coffee. | FU-044/FU-084 | Medium | Product/UX review before implementation. | Approved catalog and scope before code changes. | Planned |
| TBD | Payment method verification | Reverify visible payment methods during the first controlled Live payment test. | FU-071 archived note/T0054/T0075 | High | Do not infer Live methods from Playground without smoke. | Live payment surface evidence. | Planned |
| TBD | Production readiness sequence | Resume staging/live config, auth, retention, cutover, monitoring, and rollback work after demo scope is stable. | FU-055-FU-061 | High | Separate scoped readiness tickets. | Readiness gates and runbooks pass. | Planned |

## Buy-Flow UX Ticket Intake

These tickets use the repository's normal `T####` ticket language. The source brief's external labels are intentionally not used as ticket identifiers.

### T0134 Add Clear Post-Payment Loading State

Priority: P0/P1

Scope: Immediately after approved buy-entry payment.

Goal: After payment, clearly tell the guest that payment is complete and the booking is being fetched. The guest should not wonder where the purchase went.

Proposed copy:

- Heading: `Betalning klar`
- Text: `Vi hämtar din bokning och förbereder check-in.`
- Loader text: `Det tar bara några sekunder.`
- Fallback copy: `Försök igen eller visa detta för personalen.`

Acceptance criteria:

- Show a clear spinner or loading card after approved payment.
- The status is larger and clearer than a small line below the payment box.
- If sync takes too long, show retry.
- Use the fallback copy when retry/recovery is needed.
- Do not use `Personalkod`.

Non-goals:

- Do not change payment provider integration.
- Do not change server payment settlement rules unless explicitly scoped when the ticket is activated.

### T0135 Add Buy-Entry Safety-Video Context

Priority: P1

Scope: Safety video in the buy-entry flow.

Goal: When the safety video appears after payment, the guest should understand that purchase is complete and safety is the next step before the check-in QR appears.

Proposed copy:

- Heading: `Betalning klar`
- Subtext: `Titta på säkerhetsfilmen innan ni får er check-in QR.`
- Button after video: `Fortsätt`
- Rules copy after video: `Nästan klar. Bekräfta reglerna så visar vi din check-in QR.`

Acceptance criteria:

- Buy-entry flow gets its own safety-video copy.
- Existing-booking flow may keep simpler safety copy.
- The guest understands that purchase is complete.
- The guest understands check-in is not fully complete until the safety steps are complete.
- No user-facing copy introduced by the ticket uses en dashes, em dashes, long dash punctuation, or `Personalkod`.

Non-goals:

- Do not change video completion tracking semantics unless explicitly required by the existing component contract.
- Do not change final redeem or staff handoff behavior.

### T0136 Persist Buy-Flow State For Refresh Recovery

Priority: P1

Scope: Mobile flow, especially after purchase and during safety steps.

Goal: If the guest refreshes after buying a booking, the app should be able to resume locally and avoid losing the guest.

Example recovery copy:

- `Vi hittade din senaste check-in. Fortsätt där du var.`

Acceptance criteria:

- Store relevant buy-flow state in local storage or equivalent.
- At minimum, store booking reference, draft/payment state, selected start time, selected product, jumper count, and current flow step.
- After refresh, the app tries to resume the booking.
- If the app cannot safely resume, it shows clear recovery copy.
- Recovery copy must not feel like an error if payment is already complete.

Non-goals:

- Do not store raw payment JWTs.
- Do not expose Roller credentials or make frontend Roller API calls.
- Do not introduce server-owned resume changes unless explicitly scoped when the ticket is activated.

### T0137 Lighten And Channel-Aware Final View

Priority: P1

Scope: Confirmation/final step.

Goal: Make the final view simple and guest-friendly. Prefer check-in QR language over internal staff-state language.

Proposed copy for mobile on-site:

- Heading: `Check-in klar`
- Text: `Visa din check-in QR när ni hämtar armband.`
- Section: `Att hämta`
- Button: `Börja om`

Proposed copy for SMS/home:

- Heading: `Check-in klar`
- Text: `Visa din check-in QR när ni kommer till parken.`

Proposed copy for kiosk later:

- Heading: `Check-in klar`
- Text: `Ta utskriften och visa den när ni hämtar armband.`

Acceptance criteria:

- Final-view copy adapts by channel.
- Use `check-in QR` or `QR-kod`, not `Personalkod`.
- Clearly show what the guest should pick up, for example wristbands, socks, SkyRider, or coffee.
- Keep copy short and light.

Non-goals:

- Do not change redeem behavior.
- Do not change staff/admin queue semantics.
- Do not add new handout categories unless a scoped implementation ticket requires it.

## Later

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|
| TBD-01 | Roller clarification | T0090 confirmed gift cards are accepted by POST /bookings/draft/costs; paid full/partial Playground gift cards now apply in costs. T0090 confirmed documented GET /customers/{customerId}/multi-passes is reachable, but paid 10-Kort booking 5101046 returned zero balances and did not auto-apply in costs. T0093 and T0097 confirmed Gustav's model: the paid 10-Kort ticket/code can be accepted through discounts: [{ code }] as a 100% discount in booking costs. T0098 created/published one booking with the code and still found no remaining-balance readback; ask Josh/Joao/Pabel whether any current Nacka setup has a balance-aware endpoint or whether V1 should permanently stay code-accepted/code-rejected only. | FU-009 | High | Address as a scoped ticket from T0003/T0089/T0090/T0093/T0097/T0098. | Define ticket-specific validation before implementation. | Candidate |
| TBD-02 | Product configuration | Identify which add-ons must be reconfigured from stock/add-on products to ticket/session products if JumpYard wants API-driven redemption and webhook counting. | FU-010 | High | Address as a scoped ticket from T0003. | Define ticket-specific validation before implementation. | Candidate |
| TBD-03 | Roller clarification | Confirm the exact POST /redemptions response shape for full success, partial success, already redeemed, and invalid ticket cases. | FU-011 | Medium | Address as a scoped ticket from T0003. | Define ticket-specific validation before implementation. | Candidate |
| TBD-04 | Architecture validation | Load-test or simulate Roller one-call-per-second throttling before pilot traffic. | FU-013 | Medium | Address as a scoped ticket from T0003. | Define ticket-specific validation before implementation. | Candidate |
| TBD-05 | Roller clarification | Confirm the preferred availability-display pattern for core jump-entry products and durations before implementing new booking UI logic. | FU-014 | Medium | Address as a scoped ticket from T0003. | Define ticket-specific validation before implementation. | Candidate |
| TBD-06 | Data ingestion | Confirm the scheduled daily AWS sync window, retry policy, and monitoring shape for the morning booking seed. | FU-015 | High | Address as a scoped ticket from T0003. | Define ticket-specific validation before implementation. | Candidate |
| TBD-07 | Dependency security | Evaluate the aws-cdk-lib bundled brace-expansion audit warning and any available npm audit fix path in a dedicated dependency ticket. | FU-018 | Medium | Address as a scoped ticket from T0004. | Define ticket-specific validation before implementation. | Candidate |
| TBD-08 | Webhook security | Confirm Roller production webhook auth/signature policy and whether to use EMEA IP allowlisting before exposing webhook intake beyond dev. Playground delivery header x-roller-apikey, event id, and payload shape were confirmed in T0018. | FU-020 | High | Address as a scoped ticket from T0005/T0018. | Define ticket-specific validation before implementation. | Candidate |
| TBD-09 | Data retention | Confirm retention period for normalized booking snapshots, event logs, sync runs, and any approved raw payload storage. | FU-021 | Medium | Address as a scoped ticket from T0005. | Define ticket-specific validation before implementation. | Candidate |
| TBD-10 | Ingestion freshness | Confirm operational freshness thresholds for lookup display, SMS readiness, and mandatory live refresh before redeem. | FU-022 | Medium | Address as a scoped ticket from T0005. | Define ticket-specific validation before implementation. | Candidate |
| TBD-11 | Test data | Add an already-redeemed Playground seed scenario after POST /redemptions is implemented and safely tested. | FU-026 | Medium | Address as a scoped ticket from T0008. | Define ticket-specific validation before implementation. | Candidate |
| TBD-12 | Phone operating date | Replace the T0019 temporary Europe/Stockholm current-date fallback with a real venue operating-date source before pilot/production. | FU-027 | High | Address as a scoped ticket from T0010/T0019. | Define ticket-specific validation before implementation. | Candidate |
| TBD-13 | Gift cards | T0090 confirmed /data/giftcards is reachable and later returned two paid Venue Manager gift-card rows that apply in booking costs. T0091 implements giftCards in quote/draft payloads and no-payment draft publish for full gift-card coverage. T0092 public integrated smokes passed for invalid, partial, full-cover, and card-only cases. Future gift-card ingestion/state for audit/display/reconciliation remains optional and should be scoped separately if needed. | FU-029 | Low | Address as a scoped ticket from T0014/T0089/T0090/T0091/T0092. | Define ticket-specific validation before implementation. | Candidate |
| TBD-14 | Lookup fallback | Add supported GET /bookings search fallback for cases where direct GET /bookings/{identifier} cannot resolve an imprecise guest input. | FU-031 | Medium | Address as a scoped ticket from T0016. | Define ticket-specific validation before implementation. | Candidate |
| TBD-15 | Webhook scaling | Move webhook enrichment off the request path to SQS/EventBridge before production if latency, retries, or traffic volume require faster acknowledgement. | FU-032 | Medium | Address as a scoped ticket from T0017. | Define ticket-specific validation before implementation. | Candidate |
| TBD-16 | Redeem configuration | Decide whether JumpYard Cloud should send a configured Roller redemptionDevice name before production. Roller rejects non-existent device names, so T0021 omits it by default. | FU-035 | Medium | Address as a scoped ticket from T0021. | Define ticket-specific validation before implementation. | Candidate |
| TBD-17 | Session expiry | Define TTL, resume behavior, and cleanup rules for check-in sessions and handoff codes. | FU-037 | Medium | Address as a scoped ticket from T0022. | Define ticket-specific validation before implementation. | Candidate |
| TBD-18 | Safety gate | Confirm which guest-side safety/video/waiver states must be complete before staff/server-confirmed redeem. | FU-038 | High | Address as a scoped ticket from T0022. | Define ticket-specific validation before implementation. | Candidate |
| TBD-19 | Handoff security | Replace raw checkinSessionId QR payloads with signed or short-lived handoff tokens before production if staff auth or public exposure requires it. | FU-041 | High | Address as a scoped ticket from T0028. | Define ticket-specific validation before implementation. | Candidate |
| TBD-20 | Phone dependency audit | npm audit --omit=dev reports production advisories through direct dependency next@16.0.8 and bundled postcss; npm indicates a non-major fix is available at next@16.2.6. This is outside T0051 because payment execution should not upgrade the app framework in the same ticket. | FU-043 | High | Address as a scoped ticket from T0051. | Define ticket-specific validation before implementation. | Candidate |
| TBD-21 | Dependency security | Evaluate the phone app npm audit --audit-level=high findings from the T0028 QR dependency work in a dedicated dependency ticket before production. T0128 note: this row was renumbered from duplicate id FU-043; it remains a separate active followup. | FU-086 | Medium | Address as a scoped ticket from T0028. | Define ticket-specific validation before implementation. | Candidate |
| TBD-22 | Product catalog | Replace the phone-side mapped Playground add-on product ids used by existing-booking and new-booking add-on flows with a server-owned add-on catalog before production or multi-venue rollout. | FU-044 | High | Address as a scoped ticket from T0035/T0053. | Define ticket-specific validation before implementation. | Candidate |
| TBD-23 | SMS production readiness | T0089 reconfirmed SNS SMS and AWS End User Messaging SMS are sandboxed in eu-north-1, with no Sender IDs, pools, origination numbers, or production access. Required user inputs before submission: expected monthly volume, peak rate, final transactional SMS copy, destination countries, opt-in/consent wording, opt-out/support wording, sender-display goal, public check-in URL, and approval to submit AWS support requests. | FU-045 | High | Address as a scoped ticket from T0039/T0064/T0065/T0069/T0072/T0073/T0074/T0089. | Define ticket-specific validation before implementation. | Candidate |
| TBD-24 | SMS/email scheduling | T0073 confirmed a protected manual due-message run can send both SMS and email for a 30-minute-before booking window. T0089 keeps the EventBridge due-message rule planning-only with confirmSend=false. Deliberately enabling confirmed unattended 30-minute-before sends remains deferred until SMS and email production/sandbox gates pass, then a normal booking with non-preverified phone/email must be tested. | FU-049 | High | Address as a scoped ticket from T0045/T0046/T0064/T0065/T0068/T0069/T0072/T0073/T0089. | Define ticket-specific validation before implementation. | Candidate |
| TBD-25 | Staff auth | Replace the T0047 pilot passcode/token model with production staff identity, roles, MFA/session policy, and audit ownership before production rollout. | FU-050 | High | Address as a scoped ticket from T0047. | Define ticket-specific validation before implementation. | Candidate |
| TBD-26 | Payment redirect resume | Confirm whether Roller/Adyen payment flows that require full-page redirects or 3DS need a persisted client return state so a new-booking or add-product draft can resume after redirect instead of relying only on in-memory React state. | FU-051 | High | Address as a scoped ticket from T0052. | Define ticket-specific validation before implementation. | Candidate |
| TBD-27 | Environment readiness | Create reviewed staging/live CDK config, naming, domains, WRLDS tags, Roller environment split, and account/region preflight before any non-dev stack is created. This now follows gift-card and multi-visit/code edge-case validation. | FU-055 | High | Address as a scoped ticket from T0058/T0069. | Define ticket-specific validation before implementation. | Candidate |
| TBD-28 | Observability | T0060 added the first dev dashboard/alarms and safe Roller API call counters. T0101 added OPERATIONS_RUNBOOK.md for dev signal meaning, AWS/Aurora checks, safe first actions, and escalation routing. Remaining production work: notification routing, Aurora health, scheduler-specific health, SMS failure metrics, webhook/name-enrichment failure metrics, gift-card/Klippkort monitoring, and production thresholds. | FU-056 | High | Address as a scoped ticket from T0058/T0060/T0069/T0101. | Define ticket-specific validation before implementation. | Candidate |
| TBD-29 | API security | T0060 replaced wildcard dev CORS with explicit origins. T0061 added dev API Gateway stage throttling and 429 visibility. T0062 documented the route trust boundary for guest, staff, internal, webhook, and legacy/dev-only routes. Remaining production work: implement the boundary with route auth, route-specific limits, WAF or equivalent edge controls, and internal-only access for operations routes after the gift-card/multi-visit code validation gate. | FU-057 | High | Address as a scoped ticket from T0058/T0060/T0061/T0062/T0064/T0069. | Define ticket-specific validation before implementation. | Candidate |
| TBD-30 | Secrets lifecycle | Replace dev-only shared tokens/passcodes before production, define secret owners and rotation cadence, and separate live Roller/staff/webhook/SMS secrets from dev. | FU-058 | High | Address as a scoped ticket from T0058/T0069. | Define ticket-specific validation before implementation. | Candidate |

## External Gates

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|
| Gate-01 | Roller clarification | T0090 confirmed gift cards are accepted by POST /bookings/draft/costs; paid full/partial Playground gift cards now apply in costs. T0090 confirmed documented GET /customers/{customerId}/multi-passes is reachable, but paid 10-Kort booking 5101046 returned zero balances and did not auto-apply in costs. T0093 and T0097 confirmed Gustav's model: the paid 10-Kort ticket/code can be accepted through discounts: [{ code }] as a 100% discount in booking costs. T0098 created/published one booking with the code and still found no remaining-balance readback; ask Josh/Joao/Pabel whether any current Nacka setup has a balance-aware endpoint or whether V1 should permanently stay code-accepted/code-rejected only. | FU-009 | High | Needs external input/approval from Josh/Joao/Pabel. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-02 | SMS production readiness | T0089 reconfirmed SNS SMS and AWS End User Messaging SMS are sandboxed in eu-north-1, with no Sender IDs, pools, origination numbers, or production access. Required user inputs before submission: expected monthly volume, peak rate, final transactional SMS copy, destination countries, opt-in/consent wording, opt-out/support wording, sender-display goal, public check-in URL, and approval to submit AWS support requests. | FU-045 | High | Needs external input/approval from User/AWS Support. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-03 | Email production readiness | T0089 reconfirmed SES ProductionAccessEnabled=false, sandbox quota 200/day and 1/sec, only email identity love@wrlds.com verified, and no production domain identity, DKIM signing, custom MAIL FROM, or dedicated event configuration set. Email production unlock needs a final from domain/address, DNS access, production access request, and deliverability/monitoring plan. | FU-063 | High | Needs external input/approval from User/AWS Support. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-04 | SMS sender display | T0074 prepares sender/display goal JumpYard, but no AWS End User Messaging Sender ID exists yet and no support case was submitted. Actual handset sender label must be confirmed after AWS/provider approval and any Sender ID setup. | FU-069 | High | Needs external input/approval from User/AWS Support/T0083. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-05 | Payment methods | After Pabel's card-payment fix, the public payment drop-in renders Kortbetalning, Delbetalning, and Google Pay, but Swish no longer appears even though T0054 proved Swish could complete before the card fix. Ask Roller/Pabel to confirm whether Swish and Apple Pay are enabled for this Playground venue/payment configuration and whether card, Swish, and Apple Pay can be active together. | FU-071 | Medium | Needs external input/approval from Pabel/Roller. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-06 | Payment UX | Confirm later whether Roller/Adyen postal-code collection can or should be hidden or locale-adjusted for the Swedish checkout. T0079 intentionally leaves postal-code behavior unchanged. | FU-072 | Medium | Needs external input/approval from Pabel/Roller. | Evidence from owner/support/provider before implementation. | External gate |
| Gate-07 | Multi-visit passes | T0090 found Roller product catalog membership products for 10-Kort, 20-Kort, and 30-Kort, and costs can be calculated for selling 10-Kort. Paid 10-Kort booking 5101046 behaves like membership in booking detail, but GET /customers/4045520/multi-passes returned zero balances and booking costs with the same guest email kept amountOwing=200 with empty multiPassAllocations. T0097/T0098 confirmed current Nacka 10-Kort behaves like membership/discount-code validation through discounts: [{ code }], not beta multi-pass balance. V1 should support only code validation/amount reduction if implemented, not remaining-visit display. | FU-081 | High | Needs external input/approval from T0099/Josh/Joao/Pabel. | Evidence from owner/support/provider before implementation. | External gate |

## Parking Lot

| Ticket | Theme | Goal | Dependencies | Risk | Scope Boundary | Validation Expectation | Status |
|---|---|---|---|---|---|---|---|
| Park-01 | Deployment safety | Add a deployment and rollback runbook covering CI/CD identity, preflight checks, CDK diff approval, migration backup/restore, post-deploy smoke, and rollback criteria. | FU-059 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-02 | Cutover plan | Define live initial backfill range, Data API daily sync window, webhook registration order, freshness SLA, replay/reconciliation procedure, and cutover checklist. | FU-060 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-03 | Internal API exposure | Move or lock internal operations routes before staging/live: session-links, send-sms, send-due-sms, and lower-level direct check-in/redeem should not remain generally public browser endpoints. This remains after the gift-card/multi-visit code validation gate. | FU-061 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-04 | Email production readiness | T0089 reconfirmed SES ProductionAccessEnabled=false, sandbox quota 200/day and 1/sec, only email identity love@wrlds.com verified, and no production domain identity, DKIM signing, custom MAIL FROM, or dedicated event configuration set. Email production unlock needs a final from domain/address, DNS access, production access request, and deliverability/monitoring plan. | FU-063 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-05 | Roller redeem verification | T0070 confirmed Roller redemption through the staff-confirmed POST /redemptions path and local Aurora redeemed state, but Roller GET /bookings/{bookingReference} did not expose a clear redeemed status field on the returned ticket object. T0071 confirmed webhook/data reconciliation is healthy, but not a Roller-side redeemed display field. Decide whether future verification should use Roller UI, webhook/data reconciliation, or another Roller endpoint for post-redeem status display. | FU-066 | Medium | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-06 | Messaging monitoring | T0101 added SMS/email response steps to OPERATIONS_RUNBOOK.md, but there are still no channel-specific SMS/email delivery alarms, scheduler health thresholds, or notification routing; SNS delivery-status log groups still need production retention/review. | FU-068 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-07 | SMS sender display | T0074 prepares sender/display goal JumpYard, but no AWS End User Messaging Sender ID exists yet and no support case was submitted. Actual handset sender label must be confirmed after AWS/provider approval and any Sender ID setup. | FU-069 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-08 | Guest message copy polish | T0073 confirmed SMS and email delivery, and the current text is acceptable for controlled dev testing. Before broader guest rollout, refine SMS and email wording, tone, sender/context copy, and link language for the real JumpYard visitor journey. | FU-070 | Medium | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-09 | Payment methods | After Pabel's card-payment fix, the public payment drop-in renders Kortbetalning, Delbetalning, and Google Pay, but Swish no longer appears even though T0054 proved Swish could complete before the card fix. Ask Roller/Pabel to confirm whether Swish and Apple Pay are enabled for this Playground venue/payment configuration and whether card, Swish, and Apple Pay can be active together. | FU-071 | Medium | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-10 | Payment UX | Confirm later whether Roller/Adyen postal-code collection can or should be hidden or locale-adjusted for the Swedish checkout. T0079 intentionally leaves postal-code behavior unchanged. | FU-072 | Medium | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-11 | Multi-visit passes | T0090 found Roller product catalog membership products for 10-Kort, 20-Kort, and 30-Kort, and costs can be calculated for selling 10-Kort. Paid 10-Kort booking 5101046 behaves like membership in booking detail, but GET /customers/4045520/multi-passes returned zero balances and booking costs with the same guest email kept amountOwing=200 with empty multiPassAllocations. T0097/T0098 confirmed current Nacka 10-Kort behaves like membership/discount-code validation through discounts: [{ code }], not beta multi-pass balance. V1 should support only code validation/amount reduction if implemented, not remaining-visit display. | FU-081 | High | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
| Park-12 | Phone summary icon/copy polish | The check-in app still needs a small visual cleanup after the SkyRider deploy sync: use the preferred calendar/time icon, show correct product icons for handout/add-on rows instead of generic ticket icons, and remove redundant subtitles/details such as Biljetter, unit prices, bare time ranges, quantity labels, and coffee/add-on helper text where the primary row label is enough. | FU-084 | Medium | Keep out of active source-of-truth until prioritized. | Promote to scoped ticket with acceptance criteria. | Parking lot |
