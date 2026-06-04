# Guest Messaging Production Unlock

This document is the source of truth for moving JumpYard guest SMS and email from controlled dev smoke tests to production-capable unattended booking-time sends.

## Current Dev State

Read-only AWS checks were run on 2026-06-02 against account `376129878018`, region `eu-north-1`.

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
| SES identities | `love@wrlds.com` verified | No JumpYard/WRLDS sending domain is configured for production. |
| SES configuration set | not found for `jumpyard-check-in-dev-email` | No dedicated email event configuration set exists yet. |

## Confirmed AWS Requirements

AWS SNS SMS sandbox exit requires verified/tested destination numbers first, then an AWS Support case. The support form asks for website/app, message type, sending region, destination countries, opt-in explanation, message templates, and spend/quota details. Source: https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox-moving-to-production.html

AWS End User Messaging SMS sandbox confirms sandbox limits: low monthly spend, only verified destination numbers, and a support request per region before production. Source: https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html

AWS SES sandbox allows sending only to verified recipients/domains, with sandbox limits of 200 messages per 24 hours and 1 message per second. Production access still requires verified sending identities and an SES production access request. Source: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html

Amazon SNS supports message-level Sender ID via `AWS.SNS.SMS.SenderID`. Sender ID support varies by country and region. A Sender ID must be recognizable and within AWS format rules; `JumpYard` is the desired sender label but still needs AWS/provider approval and handset verification. Source: https://docs.aws.amazon.com/sns/latest/dg/sms_sending-overview.html

## Hard Gates

Do not enable unattended `confirmSend=true` scheduled booking-time messages until all of these are true:

| Gate | Required state |
|---|---|
| SMS production access | AWS confirms SMS sandbox exit for `eu-north-1` and the planned destination countries. |
| SMS sender identity | Sender ID or origination identity is configured, approved where required, and verified on a real handset. |
| Email production access | SES production access is approved in the sending region. |
| Email sender identity | A production sender domain or address is verified with DKIM, SPF/DMARC policy, and approved reply-to/from values. |
| Guest consent/copy | Final transactional SMS and email copy, opt-in/consent basis, and support/opt-out wording are approved. |
| Volume plan | Expected monthly volume, peak rate, countries, and spend limits are approved. |
| Monitoring | Production delivery failure monitoring exists for SMS, email, and due-message processing; the T0101 dev runbook is not enough by itself. |
| Environment boundary | Dev/staging/live config, base URLs, secrets, and sender identities are separated. |

Until those gates are satisfied:

- EventBridge due-message processing must stay in planning mode with `confirmSend=false`.
- Manual confirmed sends remain dev-only controlled smokes.
- Production guests must not depend on AWS SMS/SES delivery from this project.

## Inputs Needed From JumpYard/WRLDS

| Input | Needed for |
|---|---|
| Final public check-in URL/custom domain | AWS support cases and message templates. |
| Final SMS copy | SMS support case and production message approval. |
| Final email copy/design | SES production access and customer experience review. |
| Monthly SMS/email volume | AWS support case and quota sizing. |
| Peak sends per minute | AWS support case, throttling, and queue planning. |
| Destination countries | AWS SMS support case and sender-id support check. |
| Consent/opt-in basis | AWS support case and compliance review. |
| Support/opt-out wording | AWS support case and production copy. |
| Sender display goal | SMS Sender ID or origination identity choice. |
| Email from domain/address | SES identity, DKIM, SPF/DMARC, and reply-to setup. |
| DNS owner/access | Domain verification and email deliverability setup. |
| Approval to submit AWS support cases | Required before requesting sandbox exit/production access. |

## Future Codex Steps

After the missing inputs are available and explicitly approved, the next implementation tickets can:

1. Create SES domain identity and document required DNS records.
2. Configure production email sender/reply-to values per environment.
3. Request or configure SMS sender identity/origination according to AWS approval.
4. Submit AWS Support production-access requests with approved content.
5. Add channel-specific delivery alarms and link them to the T0101 operations runbook.
6. Run sandbox-to-production smokes with real guest-like data.
7. Flip unattended booking-time sends only after a reviewed CDK/config change.

## Current Decision

T0089 does not unlock production sending. It makes the remaining external approvals and inputs explicit, keeps the dev safety gate intact, and prepares the next tickets to be precise instead of guessing inside AWS.
