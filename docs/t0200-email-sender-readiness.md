# T0200 Email Sender Readiness

## Approved boundary

T0200 prepares transactional check-in email for the existing `park-test` environment in AWS account `376129878018`, region `eu-north-1`. It does not enable automatic or manual guest sends, the booking-time schedule, SMS, production AWS infrastructure, or real guest traffic.

The approved sender contract is:

- Display name: `JumpYard Nacka`
- From: `nackaforum@jumpyard.se`
- Reply-To: `nackaforum@jumpyard.se`
- SES domain identity: `jumpyard.se`
- SES configuration set: `jumpyard-check-in-park-test-email`
- Message class: transactional service email for an existing JumpYard Nacka booking

The Lambda runtime has no SES send permission while `safetyGates.guestMessagingSendsEnabled=false`. The SES configuration set is also created with sending disabled until domain verification, production access, and the later controlled-send checkpoint have passed.

## Delivery resources

Reviewed CDK defines:

- one `jumpyard.se` SES domain identity using Easy DKIM with a 2048-bit key;
- one dedicated configuration set requiring TLS and using bounce-and-complaint suppression;
- CloudWatch event publishing for send, delivery, bounce, complaint, reject, and rendering failure;
- event-count alarms for bounce, complaint, reject, and rendering failure;
- proactive account reputation alarms at 2% bounce and 0.05% complaint;
- eight CloudFormation outputs: the configuration-set name, identity domain, and three DKIM record names plus values.

No custom MAIL FROM domain is created. SES therefore uses its default MAIL FROM behavior while DKIM supplies the initial aligned authentication path. No MX or inbound mailbox record is changed.

## Minimal DNS handoff to João

Protected release run `29568860560` and deployment run `29569173836` created the SES identity from merge commit `f74239e5f3640850ce2e34a01f4e53e1ecc314c1`. The exact DNS handoff is:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `kufzx7xe4jqyotkcbvg3iw6hzci54cpw._domainkey.jumpyard.se` | `kufzx7xe4jqyotkcbvg3iw6hzci54cpw.dkim.amazonses.com` |
| CNAME | `5icli6vzkxeohb67lxe5bclwihyqg5a2._domainkey.jumpyard.se` | `5icli6vzkxeohb67lxe5bclwihyqg5a2.dkim.amazonses.com` |
| CNAME | `d33aqoyuxzkydfrmpgck2v7enhjpmi3y._domainkey.jumpyard.se` | `d33aqoyuxzkydfrmpgck2v7enhjpmi3y.dkim.amazonses.com` |

João added the records to authoritative `jumpyard.se` DNS. WRLDS/Codex did not write them. AWS readback on 2026-07-22 reports identity verified, DKIM `SUCCESS`, DKIM signing enabled, and SES production access enabled at 50,000 messages/day and 14/second.

## Protected rollout evidence

- Implementation PR: `#209`, merged as `f74239e5f3640850ce2e34a01f4e53e1ecc314c1`
- Immutable release run: `29568860560`
- Protected park-test deployment run: `29569173836`
- Plan: 187 -> 196 resources; nine additions, zero removals; migrations off
- Verification: selected/deployed templates match, CloudFormation completed, drift is `IN_SYNC`, no alarm is in `ALARM`, queues are empty, migrations remain complete through `0016`, and both Cloudflare park-test projects report the exact commit
- Closed gates: configuration-set sending is false, application guest sends are false, the booking-time schedule is off, and the session Lambda has no SES send IAM policy
- Completed later gates: DNS/DKIM verification, SES production access, approved responsive HTML/text copy, and two separately approved controlled visual-client deliveries
- Remaining gate: Love manually confirms Gmail/Outlook rendering, display name, Reply-To, link host, and message-header authentication before issue closeout

## Transactional email copy

The proposed Swedish copy contract, to be explicitly confirmed before the controlled send, is:

- Subject: `Dags att checka in inför ditt besök hos JumpYard Nacka`
- Opening: `Hej!`
- Timing: `Din hopptid kl HH:MM närmar sig.` when a start time exists, otherwise `Din hopptid hos JumpYard Nacka närmar sig.`
- Action: `Checka in här:` followed by the personal JumpYard Cloud link.
- Safety: `Länken är personlig och ska inte delas vidare.`
- Support: `Behöver du hjälp? Svara på det här mejlet så hjälper JumpYard Nacka dig.`
- Sign-off: `Vi ses snart!` and `JumpYard Nacka`

Replies go to the existing Nacka park mailbox through the Reply-To header. The email is not marketing and does not introduce subscription or promotional content.

## SES production-access request draft

Use only these confirmed facts in the AWS request:

- Website/business: `https://www.jumpyard.se/nackaforum/`
- Workload: JumpYard Nacka transactional check-in email for an existing booking
- Sender: `JumpYard Nacka <nackaforum@jumpyard.se>`
- Recipients: guests who supplied an email address as part of their JumpYard/Roller booking
- Geography: Sweden for the initial Nacka pilot
- Acquisition/consent: no purchased or scraped lists; the address belongs to the existing booking
- Support: replies reach `nackaforum@jumpyard.se`
- Bounce/complaint handling: SES suppression for both outcomes, dedicated event telemetry, alarms, and operational review
- Sending pattern: event-driven transactional messages tied to a selected booking time; unattended scheduling remains disabled in T0200
- Confirmed absolute peak case: up to 150 recipients per 30 minutes between 10:00 and 20:00, or 3,000 recipients in the most extreme operating day
- Requested quota: 5,000 recipients per 24 hours and 5 recipients per second, leaving bounded headroom above the confirmed peak without representing expected daily use

Love confirmed the absolute peak case and requested quota on 2026-07-17. The request must describe 3,000 recipients as the extreme case, not normal daily usage, and must not claim a larger routine or monthly volume without new evidence.

## Controlled proof evidence

Love explicitly approved two separate test messages so the same design could be compared in Gmail and Outlook, then approved one additional Gmail-only message on 2026-08-02 to inspect the final single-CTA revision. Raw destinations are not stored in repository evidence; the operator accepts only the two approved SHA-256 recipient hashes and reports `l***@w***.com` plus `l***@g***.com`.

Guarded operator `scripts/send-t0200-controlled-email.js` defaults to dry-run, accepts only one or both destinations from the same fixed hash allowlist, and requires matching command plus process-local confirmations specific to the recipient count. Immediately before each write it proved the exact AWS account/region, production access, verified identity/DKIM, TLS/suppression/event destination, sender/Reply-To/origin, recipient hashes, zero email alarms, application guest sends false, no booking-time messaging rule, and session-Lambda SES permission denied.

The operator temporarily enabled only `jumpyard-check-in-park-test-email`, sent one message per approved address using a deliberately invalid non-booking test token, and restored the configuration set to false in `finally`. SES returned provider message ids:

- `0110019f8a8336e8-dd8fd0e1-4870-4393-a28b-aac50769579b-000000`
- `0110019f8a8341be-d407ee70-ddcb-4b4d-b901-acee3a0d896f-000000`

The original CloudWatch readback reached `Send=2`, `Delivery=2`, `Bounce=0`, `Complaint=0`, `Reject=0`, and `RenderingFailure=0`. The 2026-08-02 one-address run exceeded the local 60-second reporting window after SES acceptance, so it was not retried; immediate containment readback showed configuration-set sending already false, and the bounded metric window reached exactly `Send=1`, `Delivery=1`, and zero failure events. Cumulative controlled evidence is therefore `Send=3`, `Delivery=3`, and zero `Bounce`, `Complaint`, `Reject`, or `RenderingFailure`. Final AWS readback confirms configuration-set sending false and application guest sends false. Because these proofs intentionally bypassed the disabled application route, they did not create Aurora `email_deliveries` rows; application audit/deduplication remains part of the separately reviewed T0201 unattended-delivery path.

The original two-address proof used the then-approved two-CTA revision. The explicitly approved 2026-08-02 Gmail message used the final single-CTA revision, reached provider delivery, and Love approved its visual result the same day. The proof correctly kept the park-test origin. A later approved production/cutover issue must change the email link to `https://checkin.jumpyard.se/` only after revalidating that exact domain for the production payment flow and Apple Pay; T0200 does not make that provider approval claim.

T0201, not T0200, owns automatic timing and unattended booking-time delivery.
