# CODEX_TASK.md

## Ticket ID
T0032

## Goal
Create a safe Roller payment-package proof-of-concept harness against the deployed JumpYard Cloud quote/draft endpoints.

## Dependencies
- T0031 completed, deployed, and merged.
- Dev JumpYard Cloud API is available.
- Roller Playground quote/draft credentials are stored server-side in AWS.
- No public phone payment UI is allowed until Roller payment-package prerequisites are confirmed.

## Allowed areas
- CODEX_TASK.md
- PROJECT_CONTEXT.md
- DECISIONS.md
- REPO_CURRENT_STATE.md
- FOLLOWUPS.md
- TEST_PLAN.md
- JUMPYARD_CLOUD_CONTRACT.md
- .env.example
- package.json
- scripts/roller-payment-package-poc.js

## Do not touch
- Phone UI implementation
- Admin UI implementation
- Kiosk UI implementation
- AWS resources
- Aurora migrations
- Roller webhook registration
- Redeem business logic
- Production credentials
- Live Roller config
- `.env`
- Package dependencies
- Unrelated assets or deliverables

## Requirements

1. Add a guarded local POC command, for example:
   - `npm run roller:payment:poc`
   - `npm run roller:payment:poc:apply-draft`

2. The POC must:
   - Call JumpYard Cloud `POST /v1/bookings/quote` by default.
   - Create no Roller booking by default.
   - Optionally call JumpYard Cloud `POST /v1/bookings/draft` only with an explicit one-off confirmation env var.
   - Use safe fake customer data only.
   - Never call Roller directly from the browser or frontend.
   - Never print Roller secrets, access tokens, or raw `paymentJwt`.

3. Payment-package prerequisite checks must:
   - Detect whether an approved Roller payment-package/download URL has been configured.
   - Require the package URL to use HTTPS.
   - Detect whether a public HTTPS test origin has been configured for Roller allowlisting.
   - Treat localhost/private origins as not ready for the real payment drop-in test.
   - Record that fake/test card details still need Roller confirmation unless explicitly marked confirmed.

4. Documentation must:
   - Capture the current T0032 outcome.
   - Make clear that quote/draft are ready, but actual in-PWA payment remains blocked until Roller provides/authorizes the payment package, public HTTPS allowlist, and fake/test card details.
   - Keep phone create-booking/payment UI wiring in a later ticket.

## Non-goals
- Do not build phone booking UI.
- Do not render the Roller/Adyen payment component in the phone app.
- Do not process a real or fake card payment.
- Do not publish a paid booking after payment.
- Do not add product/add-on linked-booking flow.
- Do not change AWS infrastructure.
- Do not add dependencies.
- Do not write to Roller Live/production.

## Acceptance criteria
- `npm run roller:payment:poc` reaches the deployed JumpYard Cloud quote endpoint and creates no booking.
- `npm run roller:payment:poc:apply-draft` fails closed without the explicit confirmation env var.
- A guarded apply-draft run creates at most one Roller Playground draft booking and reports only safe payment-session metadata.
- Missing Roller payment package, public HTTPS origin, and test-card details are reported as blockers, not guessed.
- `npm run validate` passes.
- No app UI, AWS resources, production config, or dependencies are changed.

## Manual verification
Run:

```bash
npm run roller:payment:poc
```

Optionally create one Playground draft booking:

```bash
ROLLER_PAYMENT_POC_ALLOW_DRAFT=I_UNDERSTAND_THIS_CREATES_PLAYGROUND_DRAFT_BOOKING npm run roller:payment:poc:apply-draft
```

Confirm:
1. Quote returns cost data from JumpYard Cloud.
2. Draft mode requires explicit confirmation.
3. Output does not print the raw `paymentJwt`.
4. Payment-package and HTTPS-origin blockers are explicit.

## Automated validation
Run:
- `npm run validate`
- `node --check scripts/roller-payment-package-poc.js`
- `npm run roller:payment:poc`
- `npm run roller:payment:poc:apply-draft` without confirmation
