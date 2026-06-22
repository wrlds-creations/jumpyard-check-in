# CODEX_TASK.md

## Ticket ID
T0153

## Status
Blocked

## Goal
Run a Roller Live read-only preflight for JumpYard Nacka using the park-test configuration.

## Scope
- Use the park-test Roller base URL `https://api.roller.app`.
- Prefer the park-test Roller credentials secret when it contains real credentials.
- If park-test credentials are still placeholders, use only an explicitly documented read-only fallback credential source.
- Make read-only Roller Live requests only.
- Confirm reachable venue/context, product/catalog candidates, 60-minute entry candidates, availability-relevant inputs, and payment/settings read-only facts where available.
- Document differences from Playground assumptions and the exact next gate required before quote/cost, draft, payment, webhook, redeem, frontend, SMS, or email work.
- Do not print or commit secret values, access tokens, raw PII, or broad raw Roller payloads.
- Do not create or update AWS resources.
- Do not call Roller write endpoints, including draft creation/publish, booking mutation, redemption, webhook registration, payment execution, SMS/email, or frontend traffic.

## Validation
- Read source-of-truth docs and AWS infrastructure workflow before changes.
- Validate AWS account/region before reading AWS config/secrets.
- Add or use a script with a hard allowlist of read-only Roller endpoints.
- Prove the script refuses write-like endpoints/methods.
- Run the read-only preflight and record sanitized results.
- Run relevant local validators.

## Result
T0153 is blocked on Roller Live credentials.

The park-test Roller credentials secret is placeholder-only. The explicitly documented fallback source `/jumpyard-check-in-dev/roller/credentials` was tried only for the Live auth step, but `POST https://api.roller.app/token` returned HTTP `400`. No Live venue/product/availability data reads were made.
