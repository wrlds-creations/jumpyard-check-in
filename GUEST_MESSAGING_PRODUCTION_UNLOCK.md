# Guest Messaging Production Unlock

This document is the source of truth for moving JumpYard guest email from controlled dev smoke tests to production-capable unattended booking-time sends. Love chose email-only for Sprint 3 on 2026-07-17; SMS is deferred and does not block the sprint.

## Current Dev State

Read-only AWS checks were repeated on 2026-07-17 against account `376129878018`, region `eu-north-1`.

T0101 added the dev response runbook in `OPERATIONS_RUNBOOK.md`, including SMS/email delivery checks, SNS/SES sandbox meaning, and safe first actions. This does not replace production delivery monitoring or SNS/SES production access.

| Area | Current state | Meaning |
|---|---|---|
| SNS SMS sandbox | `IsInSandbox=true` | SMS can only be sent to verified sandbox destination numbers. |
| SNS SMS type | `DefaultSMSType=Transactional` | Correct message class for check-in invitations. |
| SNS SMS spend | `MonthlySpendLimit=1` USD | Current sandbox/dev spend ceiling is very low. |
| SNS Sender ID | no `DefaultSenderID` | Handsets may show AWS/provider default sender such as `NOTICE`. |
| SNS origination numbers | none | No project-owned SMS origination number is configured. |
| AWS End User Messaging tier | `ACCOUNT_TIER=SANDBOX` | The newer SMS service view also confirms sandbox. |
| AWS End User Messaging Sender IDs | none | `JumpYard` sender id is not configured. |
| AWS End User Messaging pools | none | No SMS pool exists. |
| Verified SMS destinations | one verified test phone | Good for dev smoke only, not guest traffic. |
| SES production access | `ProductionAccessEnabled=false` | Email can only go to verified recipients/domains or simulator. |
| SES sending | `SendingEnabled=true` | Dev sending works inside sandbox rules. |
| SES quota | `200/day`, `1/sec` | Sandbox email limits still apply. |
| SES identities | `love@wrlds.com` verified; `jumpyard.se` deployed with verification/DKIM pending | João must publish the exact three CNAME records before domain verification. |
| SES configuration sets | `jumpyard-check-in-park-test-email` deployed with sending disabled | Delivery cannot open before later reviewed gates. |
| SES suppression | account-level bounce and complaint suppression enabled; zero suppressed addresses at readback | Known bad destinations are suppressed without storing them in repository evidence. |

## Confirmed AWS Requirements

AWS SNS SMS sandbox exit requires verified/tested destination numbers first, then an AWS Support case. The support form asks for website/app, message type, sending region, destination countries, opt-in explanation, message templates, and spend/quota details. Source: https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-moving-to-production.html

AWS End User Messaging SMS sandbox confirms sandbox limits: low monthly spend, only verified destination numbers, and a support request per region before production. Source: https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html

AWS SES sandbox allows sending only to verified recipients/domains, with sandbox limits of 200 messages per 24 hours and 1 message per second. Production access still requires verified sending identities and an SES production access request. Source: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html

Amazon SNS supports message-level Sender ID via `AWS.SNS.SMS.SenderID`. Sender ID support varies by country and region. A Sender ID must be recognizable and within AWS format rules; `JumpYard` is the desired sender label but still needs AWS/provider approval and handset verification. Source: https://docs.aws.amazon.com/sns/latest/dg/sms_sending-overview.html

## Hard Gates

Do not enable unattended `confirmSend=true` scheduled booking-time email until all of these are true:

| Gate | Required state |
|---|---|
| Email production access | SES production access is approved in the sending region. |
| Email sender identity | `jumpyard.se` is SES/DKIM verified and runtime From plus Reply-To are exactly `nackaforum@jumpyard.se`. |
| Guest consent/copy | Final transactional email copy, existing-booking contact basis, and support/reply wording are approved. |
| Volume plan | Expected daily/monthly volume and peak email rate are approved. |
| Monitoring | Configuration-set delivery, bounce, complaint, reject, rendering-failure, suppression, account-health, and due-message monitoring exists. |
| Environment boundary | Dev, park-test pre-production, and future production config, base URLs, secrets, and sender identities are separated; park-test is never treated as production. |

Until those gates are satisfied:

- EventBridge due-message processing must stay in planning mode with `confirmSend=false`.
- Park-test application/manual sends remain disabled; one controlled email requires a separate final confirmation and an approved test recipient.
- Production guests must not depend on AWS SES delivery from this project.
- SMS remains sandbox/deferred and is not part of the Sprint 3 send plan.

## Inputs Needed From JumpYard/WRLDS

| Input | Needed for |
|---|---|
| Final public check-in URL/custom domain | AWS support cases and message templates. |
| Final email copy/design | SES production access and customer experience review. |
| Daily/monthly email volume | Absolute peak confirmed as 3,000 recipients in one day; normal and monthly volume remain unclaimed. |
| Peak email sends per minute | Absolute peak confirmed as 150 recipients per 30 minutes (5/minute); request 5,000/day and 5/second for bounded headroom. |
| Destination geography | Initial Nacka pilot scope and SES request. |
| Contact basis | Confirm existing-booking transactional use. |
| Support wording | Replies go to `nackaforum@jumpyard.se`. |
| Email from domain/address | Confirmed as `jumpyard.se` / `nackaforum@jumpyard.se`. |
| DNS owner/access | João owns authoritative DNS and applies only the exact three generated DKIM CNAMEs. |
| Approval to submit SES production access | Approved by issue #208 once the factual volume/peak inputs are confirmed. |

## Future Codex Steps

Issue #208/T0200 now owns these ordered steps:

1. Merge reviewed SES identity/configuration-set/sender/telemetry code.
2. Promote the immutable artifact through the protected park-test workflow with configuration-set sending and application sends still off.
3. Give João the exact three generated DKIM CNAME records and verify public DNS plus SES DKIM status.
4. Submit the factual SES production-access request for 5,000 recipients/day and 5/second, stating the confirmed extreme case of 3,000/day and 5/minute rather than implying that quota is normal usage.
5. Enable only the SES configuration set through reviewed IaC after hard gates pass, then obtain separate confirmation for one approved test email.
6. Keep automatic/manual application sends off at T0200 closeout.
7. Let T0201 separately enable unattended booking-time email only after its timing/duplicate/kill-switch review.

## Current Decision

T0200 prepares an email-only sender without unlocking guest delivery. The approved initial sender is `JumpYard Nacka <nackaforum@jumpyard.se>` with the same Reply-To. Dev remains on `love@wrlds.com`; SMS is deferred. Love confirmed an absolute peak case of 150 recipients per 30 minutes from 10:00 to 20:00, or 3,000 in one extreme day, and approved a request for 5,000/day and 5/second. DNS values and any unconfirmed normal/monthly volume must not be guessed.
