# Six obsolete local payment attempts

Scope: [#417](https://github.com/wrlds-creations/jumpyard-check-in/issues/417), converted from Project item `PVTI_lADOBXiXg84BdXuJzg7DGv8` after Love explicitly requested removal on 2026-09-15. Commissioning remains in [#327](gh-327-kiosk-terminal-binding.md) and kiosk #86.

## Decision and limits

Love authorized disposal of six obsolete local attempts, not a claim that their financial outcomes were cancelled or unpaid. Four rows stored `unknown`; two stored `created`. ROLLER booking lookups by their retained draft identifiers returned 404. That is not definitive payment evidence. No supported read-only retrieval of their original payment JWTs was established; no JWT was reconstructed and no draft was recreated or published.

The cleanup removes only the six local cache rows. It leaves ROLLER's financial/booking records and all existing terminal claims unchanged. It does not authorize retrying an old attempt or change runtime handling of an unresolved claim. A fresh P400 commissioning purchase has its own approval and must independently establish an idle attended terminal, no kiosk recovery, definitive current installation claims and a stable P400 lock. This supersedes the earlier investigation-only gate; the six historical financial outcomes remain unclassified.

## Reviewed selection and dependencies

Existing account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, database `jumpyard_cloud`, Live Nacka venue `50871`. All ten WRLDS metadata values were checked. The dedicated existing `jumpyard_lifecycle_runtime` role performed the operation, without administrator credentials or new permissions.

The exact set required card-present `payment_pending` drafts created from August 15 inclusive through September 1 exclusive, payment state `unknown`/`created`, and no confirmed booking. The six dates were August 15 (two), 17, 20 and 31 (two). The selection digest was `8214aaddf3d905a29abfbb792a80988904c3c6855d80bcc753db86d7d468cb25`.

All six had expired local lifetimes, no published booking reference, no matching cached booking by provider/external identity, no session, no booking link and no terminal-binding claim. One was an old add-on draft with an outgoing original-booking/group reference; no linked add-on booking existed. Its original booking was independently protected with all other bookings. Schema inspection found zero incoming foreign keys and zero user triggers on the draft table. An initial conservative plan rejected the outgoing add-on reference without changing data; the final plan explicitly protected the original booking.

## Applied evidence

At **2026-09-15 14:05:15 UTC**, the exact six-row deletion committed in one serializable transaction. A short lock timeout and `NOWAIT` table locks prevented racing with changes to drafts, sessions, claims, bookings or links. The private exact-set/state digest had to equal the reviewed plan before deletion. The transaction required exactly six deleted rows and zero remaining candidates; otherwise it rolled back.

In-memory before/after comparisons proved that **every other draft, every cached booking and every terminal-binding claim was unchanged**. This includes the resolved August historical booking and today's cancelled and published/reconciled/confirmed V210 attempts. A separate post-commit read verified zero remaining candidates. The operator helper's final SHA256 was `0fff799c158450fb8d42ec9d8157f2f33172b4729fb47ec70d7a8394f3cfe830`; its modes were read-only plan, exact-digest apply and read-only verify. Private row identities and snapshots remained in process memory; no database/customer export was written.

Before apply and on verification, the existing Aurora cluster was encrypted, deletion-protected and had at least seven days of backup retention with a recent restore point. Recovery, if needed, means supervised isolated point-in-time restore to before this operation followed by exact record recovery; never overwrite the active pilot database to recover these six rows. No separate snapshot/resource was created.

Provider business writes: **0**. Payment retries, refunds, booking cancellations, guest messages and lock releases: **0**. No schema, IAM, resource, secret, runtime, deployment or general retention-policy change occurred. The deployed backend remains release `34966352071` / Park `34967225013`; no rollback or re-promotion occurred.

## Completion boundary

The local cleanup is complete. Historical financial outcomes are still unknown and must not be presented as reconciled. P400 configuration, exact-cart approval, physical payment/readback and closing the paired commissioning issues remain separate work under #327/#86.
