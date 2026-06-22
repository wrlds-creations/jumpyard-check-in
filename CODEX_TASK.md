# CODEX_TASK.md

## Ticket ID
T0153

## Status
Complete

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
T0153 passed after the park-test Roller credentials secret was populated through AWS Console.

The read-only preflight authenticated against Roller Live using `/jumpyard-check-in-park-test/roller/credentials`, confirmed venue `JumpYard Nacka Forum` with venue id `50871`, read the Live product catalog, found `Entré 60 min` product id `1189805` and `Entré 60 min - Familj` product id `1189814`, and confirmed availability reads for those product ids. No quote, draft, payment, webhook registration, redeem, frontend traffic, SMS, or email was performed.
