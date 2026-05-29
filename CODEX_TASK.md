# CODEX_TASK.md

## Ticket ID
T0074

## Goal
Prepare the SMS production unlock path so real guest phone numbers can receive booking-time SMS without SNS sandbox pre-verification.

## Dependencies
- T0073 completed and merged.
- Controlled SMS delivery to the verified sandbox test phone was confirmed.
- Dev AWS stack exists and targets Roller Playground.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- AWS_RESOURCES.md
- TEST_PLAN.md

## Do not touch
- App source code
- UI files
- Payment implementation
- SMS/email Lambda code
- Data API importer code
- Webhook code
- Redeem code
- CDK infrastructure code
- Aurora migrations
- Package dependencies
- Production credentials
- Live Roller config
- `.env`
- Unrelated local assets or deliverables

## Requirements

1. Confirm current SMS production-readiness state with read-only checks.
   - Confirm AWS account and region.
   - Confirm SNS SMS sandbox state.
   - Confirm AWS End User Messaging SMS account tier.
   - Confirm whether sender IDs or pools already exist.
   - Confirm current SMS spend and delivery diagnostic settings.

2. Review official AWS SMS production-access guidance.
   - Use official AWS documentation only for current sandbox/production-access facts.
   - Document the required AWS Support case inputs.
   - Document Sweden sender ID support and sender-display implications.

3. Prepare the production unlock request package.
   - Draft the AWS Support case content for sandbox exit.
   - List the user/company inputs still needed before submission.
   - Keep estimated volume, legal/business contact details, and final message copy as placeholders unless already confirmed.

4. Preserve safety.
   - Do not submit an AWS Support case in this ticket.
   - Do not request or register Sender IDs.
   - Do not change account SMS attributes.
   - Do not enable unattended scheduled sends.
   - Do not create, change, deploy, or delete AWS resources.

5. Update source-of-truth docs.
   - Update `PROJECT_CONTEXT.md` with the SMS unlock plan.
   - Update `DECISIONS.md` if a meaningful sender/unlock decision is made.
   - Update `REPO_CURRENT_STATE.md` with T0074 status and next step.
   - Update `TEST_PLAN.md` with the read-only validation result.
   - Update `AWS_RESOURCES.md` with current SMS operational state.
   - Update `FOLLOWUPS.md` with the remaining external/user actions.

## Non-goals
- Do not leave SNS SMS sandbox in this ticket.
- Do not submit AWS Support cases.
- Do not create or register a Sender ID.
- Do not enable real unattended SMS or email sends.
- Do not modify SMS/email message templates in code.
- Do not test payment flows.
- Do not write to Roller Live/production.
- Do not create staging or production AWS resources.

## Acceptance criteria
- Current SMS sandbox and sender-resource state is known and documented.
- AWS official production-access requirements are summarized with source links.
- AWS Support case draft exists in source-of-truth docs.
- Remaining user inputs are explicit.
- Unattended scheduled sends remain disabled.
- No AWS resources, Lambda code, CDK config, app code, or package dependencies were changed.
- `npm run validate` passes.
- `git diff --check` passes.

## Manual verification
Review the prepared AWS Support request content and confirm the missing business details, expected monthly SMS volume, final sender text, and whether WRLDS should submit the case now or wait.

## Automated validation
Run:
- npm run validate
- git diff --check
