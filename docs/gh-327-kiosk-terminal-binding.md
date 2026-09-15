# Kiosk installation and terminal binding

Scope: [Cloud #327](https://github.com/wrlds-creations/jumpyard-check-in/issues/327), paired with [kiosk #86](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/issues/86).

## Contract

One APK and one hosted application serve both Nacka profiles. Draft requests use `channel=kiosk`, `kioskInstallationId`, `kioskCapability`, and `kioskProfileId`. The two supported profiles are `nacka-forum-kiosk-1` and `nacka-forum-kiosk-2`. The backend derives the installation fingerprint from the capability and checks its active allowlist, selected profile, and configured Nacka venue before provider writes. Existing-booking purchases also check the authoritative original booking venue. Phone requests cannot supply kiosk identity fields.

The existing private provider configuration holds `kioskInstallations` (active, venue, allowed profiles), `kioskProfiles` (active, venue, terminal alias), and `paymentTerminals`. Each bound terminal has a random stable `lockId` as well as the private provider terminal value. Aliases for the same physical terminal must share the same lock id. Never regenerate that id to bypass a pending payment. The installation id supplies ROLLER's application `deviceId`; only the backend supplies `terminalId`. The lock id is excluded from ROLLER payloads and public responses. No real identifiers, capability values, or hashes belong in this document or GitHub.

## Persistent concurrency guard

The existing `idempotency_records` table reserves the installation and the terminal in sorted order with one `INSERT ... ON CONFLICT` statement. A request must claim every required key before creating a provider draft. A losing request releases only its own unused partial claim. A random payment-attempt id is allocated before the provider write and retained by the resulting prepayment draft.

The keys contain an opaque installation id and a random terminal lock id, never a provider identifier or capability. Active reservations have no clock-based expiration. A crash, lost provider response, missing prepayment row, `created`, `unknown`, or approved-but-unconfirmed payment therefore remains blocked. A later request can replace the claim only after the stored attempt is definitively failed/cancelled/reconciled or its booking is published. This also permits safe profile changes following a resolved attempt. No schema, route, IAM permission, or resource is added.

These bounded operational locks are not an audit archive. Partial claims expire immediately; active claims retain only their opaque owner until resolved/replaced. A decommissioned or orphaned claim needs supervised recovery: inspect the originating attempt and provider evidence, establish that no unresolved charge or payment prompt exists, then release only the reviewed claim using an approved operator path. There is deliberately no time-based or guest-controlled unlock. Retention deletion of the associated draft must never be treated as proof of a safe retry.

## Coordinated rollout and recovery

1. Review both implementations on current mainline, including kiosk commissioning and payment recovery tests. Merge through separate reviewed PRs. Implementation merge alone is not physical certification or issue closure.
2. Privately verify the supplied ROLLER terminal reference against the required API field. Support case `00244700`, supplied by Love on 2026-09-15, identifies the Nacka Forum POS assignment and reports the device offline, last seen September 9. This is provider identification evidence, not a successful API/payment test.
3. Review the exact private configuration: preserve unrelated fields and the existing P400 mapping; provision active installations and allowed profiles, and stable terminal lock ids. The narrow existing-secret change is authorized by #327; a protected deployment remains a separate checkpoint. Cached provider configuration may take up to five minutes to refresh after reassignment/revocation; wait for that boundary and verify rejection before treating revocation as effective.
4. Promote a selected immutable backend release through the protected Park workflow. Install/publish the paired kiosk version in a supervised idle window. Temporary `allowLegacyKioskTerminalAlias` compatibility accepts only `primary`; it cannot route a legacy caller to V210. Once a terminal has a lock id, both legacy and provisioned callers reserve the same terminal. Disable compatibility after the P400 installation is commissioned and all older clients are retired. Drain existing legacy attempts before changing routing or rollback.
5. Verify unknown/revoked/wrong-profile requests fail before provider writes. Verify terminal assignment and online state without starting a draft or payment. Keep an immutable rollback release and restore matching client/config compatibility only after resolving active attempts; rollback never clears locks or retries an uncertain payment.
6. Love supervises and approves the exact cart, amount, card, and attended V210 for at most one minimal payment. Record the definitive outcome and authoritative booking, or diagnose the unresolved result without a second attempt. Kiosk #86's physical P400 check remains required; a new P400 charge requires separate approval.

## Validation

- `npm run validate:gh327-kiosk-terminal-binding`: handler, normalization, authorization, legacy compatibility, quote separation, unchanged phone behavior and reservation ordering.
- `GH327_DATABASE_TEST=true GH327_PGPORT=55327 npm run validate:gh327-kiosk-terminal-binding`: disposable loopback PostgreSQL, all existing migrations, real `jumpyard_booking_runtime` permissions, twelve competing connections, cross-terminal/profile/replacement guards and definitive release. CI uses its existing isolated PostgreSQL service on port 55435. Fixtures are synthetic and removed after the test.
- Existing kiosk terminal, reconciliation, add-product and exact-payment-state regressions; full repository and infrastructure checks before handoff.

Local PostgreSQL 17.11 passed all 14 focused tests on 2026-09-15, including all twelve concurrent requests. The atomic conflict behavior is defined by [PostgreSQL INSERT](https://www.postgresql.org/docs/17/sql-insert.html). `npm run infra:check` and the full validation chain passed. The full chain used an in-memory LF normalization for the two bounded context documents, matching Linux CI; the default Windows CRLF checkout exceeds their raw-character limits. This existing validator issue has a Project draft, and no unrelated history or mainline snapshot was rewritten. `git diff --check` passed. No live provider request, secret update, deployment or physical payment was part of this local evidence.

## Protected backend rollout — 2026-09-15

Love's explicit green light authorized the coordinated release. Reviewed [backend PR #411](https://github.com/wrlds-creations/jumpyard-check-in/pull/411) and [kiosk PR #101](https://github.com/wrlds-creations/jumpyard-check-in-kiosk/pull/101) are merged. Backend CI [34966043543](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34966043543) passed all six jobs, including real PostgreSQL concurrency. The paired source remains one APK and one web application. Both Issues remain open for commissioning and physical proof.

| Evidence | Selected value / result |
| --- | --- |
| Backend source | `ce7c795c1fd460936b552323805790d8bf657827` |
| Immutable release | [34966352071](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34966352071), artifact `10394873499` |
| Local artifact validation | 664 files; manifest SHA256 `01bf0b9dfc9380f8c87538ec5b32b79a07303f669b793adb012043a28bbaf809` |
| Protected plan/deployment | [34967225013](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34967225013), successful |
| Exact plan | 208 resources before/after; only Booking Lambda `Code` changes; no resource additions/removals or other template changes |
| Deployed template | `ae412badf5c7d0d6fde1ba93e30c2440a85ef4b0dec9b39f7b0181e36a8981e6` |
| Runtime readback | Active/successful Lambda; all six deployed code files exactly match the immutable artifact |
| Operational checks | Template equality, `IN_SYNC` drift, zero active alarms, empty queues, exact-SHA Park Pages, public Park probes; migrations through `0023`, no migration apply |
| Rollback artifact retained | Release [34963769097](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/34963769097), source `65efb3811a5ee226aa38e72b4449e72f985da09c`; all 664 files independently verified |

The actual GitHub plan was reviewed and independently compared with the running AWS template before normal delegated protected-environment approval. The existing account `376129878018`, region `eu-north-1`, stack and ten WRLDS metadata values match the Issue. IAM, schema, routes, venue/date window, messaging gates and resource counts are unchanged. The deployed booking runtime's existing DB permissions also passed a non-executing `EXPLAIN` of the exact reservation statement; it wrote no rows. No local CDK deployment, rebuild, rollback, re-promotion or public phone/admin promotion occurred. Public frontends remain on #343's approved source.

Four safe live probes returned the expected rejection: malformed and unknown new-booking identities returned `409 kiosk_installation_not_authorized`; incomplete add-on identity returned `400 kiosk_installation_identity_incomplete`; the phone channel rejected kiosk identity with `400 kiosk_installation_identity_not_allowed`. They used synthetic data and stopped before provider calls; the new-booking probes produced only failed local idempotency records. An aggregate query under the actual restricted booking DB identity reported zero card-present attempts in the previous 24 hours after the probes. No ROLLER draft, payment, booking, refund, redemption or guest message was created.

## Remaining commissioning evidence

The existing provider secret was read privately and remains unchanged. Its P400 `primary` mapping is preserved; no installation/profile records or terminal lock ids have been applied yet. The provider support case identifies V210 but does not prove it is currently online. Secret registration must follow native identity creation, exact private plan review and version-guarded apply/readback.

The kiosk source is `aca0f33c59f18d75611607d2a1dc728ed2b1c974`. Its tested site and `0.1.6-debug` APK are frozen with a 143-file checksum manifest. Wireless ADB pairing succeeded and read-only checks found one physical Android 14 kiosk; duplicate ADB aliases refer to that same device. The installed APK was retained for rollback without copying app data. Installation and publication await the requested confirmation that the kiosk is idle and has no unresolved guest purchase. The existing installed APK uses the same version label but has different contents, so package version alone is not release proof.

After the idle-window confirmation: install the frozen APK preserving app data, create/register its private installation identity, publish the frozen site, and verify the authenticated Android profile selector, cancellation, persistence and relaunch. The installer enters the Android device credential personally. Then verify mapping/online status and negative authorization cases before requesting the exact attended V210 cart/amount/card approval. At most one V210 attempt is allowed; an ambiguous result requires diagnosis without retry. Physical P400 regression remains open and no new P400 charge is authorized.

Follow-up planning remains separate: the kiosk Project draft **Restore a reproducible kiosk reference infra dependency install** records its existing copied-infra lockfile issue; the Windows context-validator newline draft records the existing local-only size discrepancy. Neither changes this release's scope.
