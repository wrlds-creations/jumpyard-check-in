# T0189 Complete Sprint 3 Target And Ticket Correction

## Purpose

T0189 corrects the Sprint 3 plan before implementation starts. Love confirmed that the production target is not only the visible phone-to-admin journey. It must also include the background chain that makes the check-in link reliable:

```text
Roller booking
  -> approved initial backfill and scheduled morning seed
  -> webhook updates and reconciliation
  -> normalized booking state in JumpYard Cloud/Aurora
  -> due-booking scheduler at T-30 minutes
  -> one SMS and one email with a secure check-in link
  -> guest phone check-in and safety completion
  -> authenticated staff verification
  -> JumpYard Cloud audit and Roller ticket redemption
```

Roller remains the source of truth. Aurora is a minimal operational index and message/session store, not a replacement booking system.

## Audit Result

The missing flow was not absent from the older architecture. D0009, D0012, and D0019 already define daily seed, webhook updates, Aurora indexing, and live REST confirmation as separate responsibilities. Dev also contains guarded seed, webhook, scheduler, SMS, and email foundations.

The gap was in the current Sprint 3 plan:

| Risk | Finding | Correction |
|---|---|---|
| High | Initial production backfill, scheduled morning seed, retry, and freshness had no explicit Sprint 3 implementation ticket. | Add T0196. |
| High | T0193 protects the webhook route, but production webhook processing, idempotency, replay, reconciliation, and registration order had no explicit implementation ticket. | Add T0197. |
| High | Old T0197 covered sender/provider readiness but did not explicitly enable unattended SMS and email 30 minutes before the selected booking time. | Split sender readiness into T0200 and automatic T-30 delivery into T0201. |
| High | The old final rehearsal could pass without proving seed, webhook, Aurora freshness, or automatic messages. | T0204 must prove the full background and guest/staff chain. |
| Medium | The same promoted work remained duplicated as candidate or parking-lot rows. | Keep active followups for unresolved evidence, assign them to explicit tickets, and remove duplicate backlog candidates. |

## Complete Target Rules

- Initial backfill imports only an approved date/venue/data window.
- The scheduled morning seed upserts normalized records and records run/retry outcomes.
- Webhooks update same-day changes idempotently; replay and reconciliation repair missed or out-of-order events.
- Live REST refresh still confirms check-in-critical state before sensitive actions.
- Aurora stores only the approved normalized fields and operational state under the T0195 retention/security rules.
- T-30 messaging selects a booking only when the booking time, destination, consent, public HTTPS URL, sender/provider approval, and duplicate-suppression rules all pass.
- SMS and email share one due-booking decision but record delivery independently.
- A failed channel does not create duplicate successful sends; retry and operator visibility are explicit.
- The phone and admin apps call JumpYard Cloud, never Roller directly.
- A final GO decision is separate from technical completion; no ticket automatically launches production.

## Revised Ticket Sequence

T0189 is this documentation-only correction. The first implementation ticket is T0190.

| Ticket | Plain-Language Outcome | Why It Exists | Key Boundary / Dependency | Completion Evidence |
|---|---|---|---|---|
| `T0190` | Make venue and emergency-stop safety gates fail closed. | Unsafe gate precedence cannot become the production foundation. | Cloud safety only; no environment expansion. | Missing/wrong venue is blocked and emergency stop always wins. |
| `T0191` | Agree the staging/production environment contract. | Ownership, cost, data, naming, and rollback must be understood before AWS work. | Planning only; creates no AWS resources. | Love approves the environment contract and reviewed CDK plan. |
| `T0192` | Create the approved staging foundation. | The complete flow needs a safe rehearsal environment. | Explicit AWS approval; production remains untouched. | CDK diff/deploy/readback, tags, closed gates, cost, and rollback evidence pass. |
| `T0193` | Protect guest, staff, internal, scheduler, and webhook routes. | Every route needs the correct lock and abuse control. | Security boundary only; no product-flow redesign. | Positive/negative auth, throttling, and internal-route tests pass. |
| `T0194` | Replace the shared admin test passcode with production staff identity. | Redeem actions need personal identity, roles, session policy, and audit ownership. | Admin/staff identity only. | Approved role/session/MFA policy and admin tests pass. |
| `T0195` | Implement approved data, secret, permission, retention, backup, and restore rules. | Booking ingestion and messaging must not start before data ownership and expiry are clear. | No new data use without approval. | Retention/purge, least privilege, rotation, backup, and restore evidence pass. |
| `T0196` | Build the production booking-index baseline and scheduled morning seed. | Aurora needs an approved, fresh operating list without pretending to replace Roller. | Depends on T0192/T0195; approved venue/date/data window only. | Initial backfill, scheduled upsert, retry/run audit, freshness, and live-refresh evidence pass. |
| `T0197` | Enable production webhook updates and reconciliation. | Seed alone misses same-day changes; webhooks can also be delayed, duplicated, or out of order. | Depends on T0193/T0195/T0196 and Roller production webhook policy. | Auth, registration, idempotency, replay, reconciliation, and missed-event recovery pass. |
| `T0198` | Build controlled CI/CD and rollback for phone, admin, and cloud. | Deployments need automated checks and human approval instead of one local machine. | Deployment mechanics only; no automatic production launch. | CI, OIDC, synth/diff, target checks, approved deploy, and rollback rehearsal pass. |
| `T0199` | Put phone and admin on approved production domains. | Guests and staff need stable HTTPS addresses pointing to the correct API. | DNS/TLS/CORS/environment targeting only. | Phone/admin DNS, TLS, CORS, bundle, and API-target checks pass. |
| `T0200` | Obtain real SMS/email sender, consent, domain, provider, and deliverability readiness. | Automatic messages cannot start from sandbox or an unapproved identity. | No support request or real send without Love's explicit approval. | Sender/domain/provider, consent/copy, and controlled delivery evidence pass. |
| `T0201` | Enable automatic SMS and email with the secure check-in link 30 minutes before the selected time. | The confirmed target is proactive guest check-in, not only manual lookup at the park. | Depends on T0196/T0197/T0199/T0200; duplicate suppression and kill switch required. | Normal non-preverified guest receives one SMS and one email at T-30; retry, suppression, token resolution, failure, and stop tests pass. |
| `T0202` | Route monitoring and complete the operating runbook. | Seed, webhook, scheduler, messaging, database, and redeem failures need named owners and safe recovery. | Operations only. | Alarm delivery, scheduler/webhook/message metrics, reconciliation, backup/restore, and response rehearsal pass. |
| `T0203` | Close only remaining approved Sprint 2 phone/admin feedback. | Completed feedback must not be rebuilt. | No kiosk or activity-data implementation. | Reviewed done/remaining list and ticket-specific validation pass. |
| `T0204` | Rehearse the complete chain in staging and make the production GO/NO-GO decision. | The project is not ready if only the visible phone/admin screens work. | No automatic launch; Love makes the final decision. | Seed, webhook, Aurora freshness, T-30 SMS/email, phone check-in, admin redeem, alarms, reconciliation, and rollback all pass with an open-risk list. |

## Superseded Plan

T0188 remains the historical record of the first phone/admin scope correction. Its T0189-T0200 ticket numbering is superseded by this T0189 correction because the confirmed production target was incomplete. Kiosk/print/terminal and JumpyBoard/AirHive remain separate projects.

## Intentionally Unchanged

- Application, Lambda, migration, infrastructure, and frontend code
- AWS resources, configuration, deployed gates, and current costs
- Roller registration, credentials, data, bookings, payments, webhooks, and redemptions
- SMS/email sender configuration, support requests, or sends
- Cloudflare Pages projects or deployments
- The Nacka/date-scoped park-test full-flow posture through 2026-09-30

## Validation

T0189 closed as documentation-only on 2026-07-10. The dependency-free documentation/source-of-truth validators, strict T0190-T0204 sequence check, promoted-work ownership checks, and `git diff --check` passed. The known aggregate `npm run validate` clean-checkout dependency gap remains outside this documentation-only ticket.
