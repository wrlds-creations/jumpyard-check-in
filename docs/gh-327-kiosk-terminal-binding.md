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
