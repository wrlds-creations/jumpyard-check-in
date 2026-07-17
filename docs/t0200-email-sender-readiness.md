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

The exact record names and values do not exist until the protected park-test rollout creates the SES identity. After that rollout, copy only these three CloudFormation output pairs:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `GuestEmailDkimRecordName1` output | `GuestEmailDkimRecordValue1` output |
| CNAME | `GuestEmailDkimRecordName2` output | `GuestEmailDkimRecordValue2` output |
| CNAME | `GuestEmailDkimRecordName3` output | `GuestEmailDkimRecordValue3` output |

João adds the records to authoritative `jumpyard.se` DNS. WRLDS/Codex does not write them. Do not send placeholders or shorten the AWS-generated values. After public DNS resolves, read back the three records and confirm SES reports both the identity and DKIM as verified.

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

## Controlled proof checkpoint

The later proof requires a separate explicit confirmation immediately before sending. It may target only an address Love approves for the test. Before the send:

1. Confirm account `376129878018`, region `eu-north-1`, SES production access enabled, identity/DKIM verified, and configuration-set sending enabled through reviewed IaC.
2. Confirm automatic/manual application guest sends and the booking-time schedule remain disabled.
3. Confirm the exact masked recipient, sender, Reply-To, subject, and public HTTPS check-in origin.
4. Send exactly one controlled message through the approved configuration set.
5. Verify receipt, display name, Reply-To, link host, DKIM authentication, SES delivery event, safe audit row, and absence of recipient/token/full-link data in logs.
6. Return the configuration set to the reviewed fail-closed state if any hard gate fails.

T0201, not T0200, owns automatic timing and unattended booking-time delivery.
