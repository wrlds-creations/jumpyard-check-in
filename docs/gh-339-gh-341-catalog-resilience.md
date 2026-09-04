# Catalog resilience — issues #339 and #341

## Scope and approval

Love explicitly requested and approved these two issues as one implementation
package on 2026-09-04. Branch: `codex/gh-339-catalog-resilience`; approved base:
`c5b58512af804d7eb1e5ded35250313c96a3b834`. Scope is Booking/DataSync source,
focused regressions and validation wiring, and durable documentation.

Love subsequently explicitly authorized commit, push, merge, deployment, testing
where possible and then closure. Before PR publication, main
`5e163356cc7c30cd7b7d5b381db9472f42381172` was integrated, preserving #374's rollout
evidence and #343's safety-video implementation. Before final PR validation, main
`7294cfea6d46af11dc9bc23994e72c43a8c8d1a4` added #343's rollout evidence and was
also integrated. Documentation conflicts retained every rollout, both decisions
in order and current flow facts; runtime files did not conflict.

- [#339 approval](https://github.com/wrlds-creations/jumpyard-check-in/issues/339#issuecomment-5540336687)
- [#341 approval](https://github.com/wrlds-creations/jumpyard-check-in/issues/341#issuecomment-5540336997)

No new dependency, service, AWS resource, migration, price lifetime, SKU,
payment-result rule, kiosk source or live business operation is included.

## What was already fixed

Love correctly recalled [#294](https://github.com/wrlds-creations/jumpyard-check-in/issues/294).
PR #295 fixed stable booking-item upserts and gave the fetched product cache its
own transaction. PR #297 corrected current-SKU matching. These changes remain.
A later booking import failure cannot roll back a committed product refresh.

The remaining #339 gap was earlier: booking items, tickets, payment history,
customers and local scope were read before product persistence. A failure there
could prevent the refresh from being reached. The new full-handler regression
reproduced this against the base for all four provider data sources: no product
request and no product commit. It now verifies the product commit survives each
failure, while the overall booking sync still reports failure.

## Implemented behavior

### Daily product prices (#339)

The same central product request and independent transaction now run before the
unrelated source reads. The normal run still requests `/products` once; existing
bounded transport retries and request pacing are unchanged. Product failure
still fails the run; empty results never renew old prices. Separate safe events
identify failed or empty product refreshes.

Stock add-ons still require a current cached price. Missing/expired/invalid prices
omit only those offers and log `booking.addon_catalog_incomplete` with configured
product keys, without raw rows or guest data. Other fresh offers remain available.
Exact water selection and authoritative Roller quote/capacity checks remain.

### Optional public catalog (#341)

Only products explicitly requiring public-catalog eligibility (currently Combo)
are omitted when that catalog request fails, is malformed or exceeds two seconds.
The deadline includes the response body, aborts the fetch, and ignores late
results. There are no added retries, cache or reuse of stale eligibility. Even a
failed HTTP response containing plausible Combo IDs cannot authorize the offer.

Normal entry/family products continue to the existing authoritative availability
request. Its own failure still blocks; a closed 90-minute slot at 19:00 remains
unavailable. A successful catalog proves only product eligibility, not capacity.
The existing availability source adds `catalogStatus` (`verified`, `unavailable`
or `not_required`), and safe failure diagnostics remain observable.

There is no mandatory delay for a successful catalog response. The failed optional
check has a two-second ceiling; this is not a delay applied to each guest and not
an end-to-end latency guarantee. Normal requests retain one catalog request, one
availability request and the existing two cache reads.

## Environment readback

Read-only AWS inspection on 2026-09-04 confirmed:

- Account `376129878018`, region `eu-north-1`, existing Nacka `park-test`.
- DataSync is active, timeout 600 seconds, no `ROLLER_PRODUCT_CACHE_TTL_HOURS`
  override; the source default remains 24 hours.
- The daily rule is enabled at `cron(0 2 * * ? *)`.
- Existing metadata: client/cost center JumpYard; project `jumpyard-check-in`;
  owner/creator `love`; repository `wrlds-creations/jumpyard-check-in`;
  managed by CDK; confidential; exportable.

No AWS setting or stored data was changed during inspection.

## Validation and publication

`npm run validate:gh339-catalog-resilience` runs 27 isolated scenarios: early
source and later persistence failures, product retry/TTL/pacing, missing prices,
safe diagnostics, failed/malformed/late catalog results, visibility and normal
time-slot availability. The new tests are part of root `npm run validate`.

`npm run infra:check` passed, including compilation, existing catalog tests,
configuration guards, synthetic infrastructure and the existing operational
self-tests. Independent review found no actionable issue in the production
changes and added isolated late-resolution/rejection checks.

All root `npm run validate` steps passed across two segments. The full run used
a separate source-identical worktree with local dependency directories, because
Next.js rejects dependencies linked outside its build root. All 12 then-current
changed/new files were hash-matched before that run. It passed through #305,
then #315's older test console lacked the newly used `warn` method. Adding that
method to the test stub preserved every assertion; #315 and every remaining
root step were rerun successfully in the implementation worktree. No runtime
code changed after the full run began. `git diff --check` passed.

The Repository job in PR CI `33874831832` subsequently passed the complete root
suite in one run. The final documentation-only main integration triggers the
required checks again before merge.

Local tests use synthetic AWS/HTTP responses and create no real booking or
payment. No guest incident frequency or real-provider latency was measured.

## Changed files

- Runtime: `infra/lambda/data-sync/index.js`, `infra/lambda/booking/index.js`,
  `infra/lambda/booking/phone-product-catalog.js`.
- Regressions: `scripts/validate-gh339-product-refresh.js`,
  `scripts/validate-gh339-addon-catalog.js`,
  `scripts/validate-gh341-catalog-availability.js`; #315's test console in
  `scripts/validate-gh315-water-product.js` accepts the new warning event.
- Validation wiring: `package.json`, `TEST_PLAN.md`.
- Durable documentation: `PROJECT_CONTEXT.md`, `DECISIONS.md` (D0211),
  `AWS_RESOURCES.md`, this evidence file. `REPO_CURRENT_STATE.md` is unchanged
  because no new merged/deployed state exists.

## Remaining publication

Implementation is not published. PR, commit and protected immutable promotion
remain pending. Select the then-current approved release and rollback candidate
at publication; do not rebuild on deployment. A later public check should confirm
ordinary entry, family/Combo offers and current add-on prices after promotion.
No claim is made that these code-proven failure paths caused a guest incident.
