# CODEX_TASK.md

## Ticket ID
T0154

## Status
Complete

## Goal
Prepare park-test Roller Live webhook registration tooling/config in dry-run mode.

## Scope
- Use the park-test Roller base URL `https://api.roller.app`.
- Show the exact park-test JumpYard Cloud booking webhook endpoint.
- Show the Roller webhook registration endpoint, expected delivery header, event list, include settings, duplicate behavior, and rollback command template.
- Treat this ticket as dry-run only.
- Do not register, update, disable, delete, or otherwise change Roller Live webhooks.
- Do not call Roller Live in this ticket.
- Do not create or update AWS resources.
- Do not print or commit secret values, access tokens, raw PII, raw Roller payloads, or raw webhook payloads.
- Do not enable park-test webhook processing, frontend traffic, payments, redemptions, SMS, or email.

## Validation
- Read source-of-truth docs and AWS infrastructure workflow before changes.
- Validate AWS account/region before reading AWS metadata.
- Add a dry-run command that has no apply/register/delete mode.
- Prove the script rejects write-like arguments.
- Run the dry-run and record sanitized output.
- Run relevant local validators.

## Result
T0154 added `infra/scripts/roller-live-webhook-dry-run.ts`, `npm --prefix infra run webhook:live:park-test:dry-run`, and `npm --prefix infra run validate:roller-live-webhook-dry-run`.

The dry-run plan confirmed the park-test endpoint `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com/v1/roller/webhooks/bookings`, Roller registration endpoint `POST https://api.roller.app/webhooks`, delivery header `x-roller-apikey`, header value source `/jumpyard-check-in-park-test/webhooks/dev-token`, booking events `Created`, `Updated`, and `Cancelled`, `tickets=true`, duplicate behavior, and rollback template. The script rejects apply/register/delete modes.

T0154 made no Roller Live requests, did not register or change webhooks, did not create or update AWS resources, did not print secret values, and did not enable webhook processing, frontend traffic, payments, redemptions, SMS, or email.
