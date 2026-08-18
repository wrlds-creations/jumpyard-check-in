# T0197 Roller Webhook Reconciliation

Issue [#199](https://github.com/wrlds-creations/jumpyard-check-in/issues/199) enables Roller Live booking webhook processing only in the existing park-test/Nacka boundary. Roller remains authoritative; Aurora remains an operational cache.

## Operational Model

The webhook is a doorbell, not the guest register:

1. Roller sends `Created`, `Updated`, or `Cancelled` to the existing park-test endpoint.
2. Public intake verifies only the registered `x-roller-apikey` value, validates the signal, deduplicates and stores safe metadata, and places the event on a FIFO queue before HTTP `200`.
3. Intake does not call Roller REST and does not store the raw webhook payload.
4. One reserved-concurrency worker verifies the current credentials belong to Nacka `50871`, reads current `GET /bookings/{identifier}`, applies the same 30-day-past plus all-future visit boundary as T0196, and upserts normalized booking/item/ticket/contact state.
5. Duplicate and older signals are harmless because every accepted signal re-reads current Roller state. Processed event ids are no-ops.

The queue retries a failed message five times before its FIFO DLQ. A five-minute recovery rule finds `received`, `pending_enrichment`, or `failed` rows older than two minutes only while their enrichment-attempt count is below five. Exhaustion emits a dedicated alarm and remains explicitly replayable after repair; it cannot retry indefinitely. T0196 remains the morning catch-all when Roller sends no webhook, and check-in-critical work still confirms live state.

## Exact Boundary

- AWS: account `376129878018`, region `eu-north-1`, environment `park-test`.
- Roller: Live base URL, credential venue confirmed through `GET /venues/me` as Nacka `50871`.
- Registration: existing webhook `1465`, exact park-test booking endpoint, `Created`/`Updated`/`Cancelled`, `tickets=true`.
- Authentication: exact HTTP header name `x-roller-apikey`; the value comes from `/jumpyard-check-in-park-test/webhooks/dev-token` and is compared as fixed-length SHA-256 digests with `timingSafeEqual`.
- Runtime approval: `T0197_LIVE_WEBHOOK_PROCESSING_APPROVED` plus the existing emergency stop.
- Provider pacing: at least one second between Roller request starts, bounded 429/5xx retry, maximum four attempts and ten-second `Retry-After`.
- Data: stable event id/hash, event type, booking identifiers, payload hash, status, attempts, timestamps, and bounded error summary only. No raw webhook/booking payload, note, address, secret, access token, or unmasked credential is stored or printed.

## Deployed Resources

The 2026-07-15 rollout moved the park-test stack from 171 to 187 resources without replacement or deletion:

- `jumpyard-check-in-park-test-webhook-events.fifo`
- `jumpyard-check-in-park-test-webhook-events-dlq.fifo`
- `jumpyard-check-in-park-test-stack-webhook-processor` with reserved concurrency `1`
- SQS event-source mapping with batch size `1` and partial-batch failure reporting
- `jumpyard-check-in-park-test-webhook-recovery` at `rate(5 minutes)`
- DLQ-visible, queue-age, processing-failure, worker-error, and worker-throttle alarms
- 30-day worker log group and updated operations dashboard

Migration `0015` grants the restricted webhook role DELETE only on booking item/ticket child rows so authoritative snapshots can remove stale children. Migration `0016` grants SELECT only on `event_log.event_id`, which PostgreSQL requires for the existing `ON CONFLICT` audit insert. It does not expose audit payload, subject, or summary columns. Issue #212 migration `0017` removes only the obsolete nonnegative constraint on booking-level amount owing so Roller refunds, credits, or overpayment state can remain signed instead of rejecting an otherwise authoritative snapshot.

## Guarded Operations

Read-only preflight is the default:

```text
npm --prefix infra run reconcile:webhook:live:park-test
```

It verifies AWS identity, deployed Lambda/queue configuration, and Roller registration `1465` without printing secrets or PII. Synthetic intake and replay additionally require `--apply`, an explicit booking/event argument, and the exact environment approval phrase enforced by `roller-live-webhook-reconciliation.ts`.

Rollback is a reviewed deploy of `infra/config/park-test.json`, which closes webhook processing and recovery while leaving durable queues and the external registration intact. Registration deletion, secret rotation, lifecycle deletion, and production changes are separate approvals.

## Deployment Evidence

- Migrations `0015` and `0016` applied transactionally; latest migration is `0016`.
- Reviewed CDK change set added exactly 16 resources, updated intake code/config/IAM, and replaced or deleted nothing.
- Final stack is `UPDATE_COMPLETE` with 187 resources; intake and worker are `Active`; worker concurrency is `1`; recovery is `ENABLED`.
- Read-only Roller registration readback matched id `1465`, endpoint, events, ticket inclusion, and expected header.
- Negative deployed requests returned safe HTTP `200` states for missing token, invalid JSON, oversized body, and unsupported event.
- Authenticated synthetic intake reached `accepted` then `processed`; the normalized target had one booking, one item, two tickets, and zero retention violations.
- A newer `Updated` signal followed by an older `Created` signal both read current Roller state; the Aurora payload hash stayed unchanged. A third identical event returned `duplicate` with no added attempt.
- Guarded replay left the processed event unchanged and both queues empty.
- A three-minute-old unqueued event was found by the recovery invocation and reached `processed` in one attempt.
- Invalid queue shape returned a partial-batch failure; deployed redrive readback showed five attempts, 720-second visibility, enabled batch-size-one mapping, and the exact FIFO DLQ.
- Four final synthetic events are `processed`, four early venue-proof test events are terminal `ignored_scope`, and none are `received`, `pending_enrichment`, or `failed`.
- Final CDK diff has zero differences. CloudFormation drift is `IN_SYNC` with zero drifted resources.
- No non-synthetic Roller delivery arrived during the validation window. Observing the next real booking change is the remaining manual confirmation; it is not substituted with a Roller business write.

### Issue #212 Repair And Recovery Evidence

- The 2026-08-02 repair added a five-attempt recovery bound and the `jumpyard-check-in-park-test-webhook-retry-exhausted` alarm. Migration `0017` is applied, and the stack now has 197 resources.
- Both known high-attempt failed events reached `processed`; their one authoritative booking snapshot preserved `amount_owing_cents = -371600`. No `received`, `pending_enrichment`, or `failed` rows remained.
- All five DLQ messages were matched to five already processed event rows before guarded 5/5 redrive. Unknown messages were zero; the main queue and DLQ ended empty.
- A new safe synthetic signal processed successfully with event-id hash `cb703ca664c2d117`; Roller webhook `1465` retained its exact registration.
- Initial protected run `30763549295` completed all write stages but exposed API Gateway access-log ARN normalization in final drift verification. PR #214 synthesized the canonical ARN, and immutable release `30765157585` re-promoted successfully as run `30765356271`.
- The approved re-promotion plan added and removed no resources and changed only `DefaultStage`. Final readback returned `UPDATE_COMPLETE`, drift `IN_SYNC`, zero alarms in `ALARM`, empty queues, migrations through `0017`, exact Cloudflare commit readback, and public phone/admin/Apple Pay HTTP 200 checks. No rollback was needed.

### Issue #257 Provisional-Item Repair And Recovery Evidence

- A kiosk can create a provisional Handoff item before Roller publishes the booking. Authoritative webhook enrichment now conflicts on the provider `booking_item_id`, updates only when the existing row belongs to the same `roller_unique_id`, returns the actual persisted `booking_item_key` for ticket and cleanup work, and fails closed on a cross-booking identity collision.
- Immutable release `67e6ffa` was built once by run `32133478654`; its release artifact digest is `sha256:d11ed60c87868fa3ba5afd47b259fc692ef011dd47b988cb1d179200ca7822e0`. The change required no migration or new AWS resource.
- The guarded T0197 replay operator verified account `376129878018`, region `eu-north-1`, Nacka `50871`, active serialized worker, and exact Roller webhook `1465` before queueing the two known failed events. Event-id hashes `d43621e636252d5b` and `c2b32b22a419f561` both reached `processed` with cleared errors.
- Readback preserved each existing `jybi_*` primary key and its ticket relationship while replacing provisional metadata with the Roller snapshot: product `Biljetter (200 kr)`, parent product `Entré 60 min`, product type `sessionpass`, and quantity `1`.
- The two DLQ messages were inspected and matched exactly to those two already processed event ids before guarded 2/2 redrive. No unknown message existed; the source queue, main queue, and DLQ ended empty.
- The first protected promotion completed AWS and Cloudflare writes but its immediate verifier still observed the pre-recovery operational state. After bounded recovery and CloudWatch convergence, protected re-promotion run `32136044606` used an exact 202-to-202 no-change plan (artifact `9324009792`, digest `sha256:93e2b2f5387b98e1c4935f621226901af2401d0f881c6f4d9cfd0ebbb26b9a3f`) and passed every stage.
- Final readback returned `UPDATE_COMPLETE`, drift `IN_SYNC`, zero alarms in `ALARM`, empty Roller operations and webhook queues/DLQs, migrations through `0020`, exact phone/admin Cloudflare commit readback, and public phone/admin/admin-route/Apple Pay HTTP 200 checks.
- No Roller business write, new booking, payment, guest message, migration, resource creation/removal, queue purge, secret output, lifecycle apply, or production action occurred.

## Non-Goals Preserved

No Roller draft, booking, payment, add-on, redemption, refund, cancellation, registration, or deletion write was performed. Guest messaging stayed off. No production, DNS, Cloudflare, frontend, lifecycle apply, secret mutation, or broader venue/date work occurred.
