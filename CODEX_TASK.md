# CODEX_TASK.md

## Ticket ID
T0089

## Goal
Prepare the guest SMS/email production unlock package without enabling unattended production sends.

## Dependencies
- T0088 completed and merged.
- Guest messaging already has server-owned SMS/email link creation and unified due-message planning.
- Dev scheduled due-message processing still runs with `confirmSend=false`.
- SNS and SES production access require external AWS approval and sender/domain inputs.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md
- New guest-messaging production-readiness documentation file if useful

## Do not touch
- App UI files
- Lambda code
- CDK resources
- Aurora migrations
- Roller integration code
- Payment behavior
- Staff/admin behavior
- Guest phone behavior
- Package dependencies
- Assets
- Deliverables
- Production credentials
- Roller Live
- `.env`

## Requirements

1. Run read-only AWS checks for the current dev messaging state:
   - SNS SMS sandbox status
   - SNS SMS attributes relevant to sender id/message type/spend
   - SES account sandbox/production status
   - SES verified identities
   - AWS End User Messaging SMS sender-id/pool state if available through the CLI

2. Create or update clear production-unlock documentation for:
   - SMS sandbox exit requirements
   - email SES production access requirements
   - sender/domain identity requirements
   - what user inputs are still missing
   - what Codex can do later with user approval
   - what must stay blocked until approval is complete

3. Keep the implementation safe:
   - do not submit AWS Support cases
   - do not create sender ids, pools, identities, DNS records, domains, or production resources
   - do not enable unattended real scheduled sends
   - do not change EventBridge payloads
   - do not change `confirmSend`

4. Update roadmap/source-of-truth files:
   - current state
   - followups for user/AWS inputs
   - decisions if a production messaging gate is confirmed
   - test plan with read-only validation

## Non-goals
- Do not move SNS or SES out of sandbox.
- Do not verify a new phone number or email/domain identity.
- Do not send SMS or email.
- Do not enable production sender id `JumpYard`.
- Do not enable production unattended booking-time messages.
- Do not create staging/live AWS resources.
- Do not modify app flows.

## Acceptance criteria
- Current SNS and SES readiness state is documented from read-only AWS checks.
- The repository contains a clear checklist for SMS/email production unlock.
- Missing user/AWS inputs are explicit.
- The current dev safety gate remains unchanged.
- Root validation passes.

## Manual verification
Open the production-unlock document and confirm a non-chat Codex session can answer:
- what is ready now
- what is blocked
- what user input is needed
- what AWS approval is needed
- what must not be enabled yet

## Automated validation
Run:
- npm run validate
- git diff --check
