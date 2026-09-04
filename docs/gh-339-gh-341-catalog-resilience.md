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
- [#339 publication authorization](https://github.com/wrlds-creations/jumpyard-check-in/issues/339#issuecomment-5540685229)
- [#341 publication authorization](https://github.com/wrlds-creations/jumpyard-check-in/issues/341#issuecomment-5540685617)

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
suite in one run. After the final documentation-only main integration, all four
required jobs in [CI 33875086100](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33875086100)
passed on reviewed head `8f62b79d3a9d1b32610a97faf7f49a2d14a44e8c`. [PR #380](https://github.com/wrlds-creations/jumpyard-check-in/pull/380)
merged as `0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce` at 12:57:17 UTC.

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
  `AWS_RESOURCES.md`, this evidence file. The dependent rollout documentation also
  updates `REPO_CURRENT_STATE.md` after the merged/deployed state is verified.

## Protected rollout — 2026-09-04

The final source review is recorded on [PR #380](https://github.com/wrlds-creations/jumpyard-check-in/pull/380)
at head `8f62b79d3a9d1b32610a97faf7f49a2d14a44e8c`. The independent local runtime
review preceded publication; both main integrations changed documentation only.
The GitHub review record was submitted by the author account. All four required
checks passed and normal branch/environment protections remained enforced.

| Item | Verified identity |
|---|---|
| Merge/source | `0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce` |
| Successful immutable release | [33875422657](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33875422657) |
| Artifact | `9937812376`, `park-test-release-0e04fb4f3a86d11366687e4aa7b4cd232d1fc4ce` |
| Artifact digest | `sha256:4e7fd8491991a5c558089c4e17a1979d183276463aa65e357abd4b5e2326a4ca` |
| Manifest SHA256 | `9a20aa08bcc7ac740ff3ee8770620846da794bb07d088fe92040082832f39ecb` |
| Park promotion | [33875994276](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33875994276), success |
| Public promotion | [33876020299](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33876020299), success |

The release passed its complete source, infrastructure and frontend checks.
Local Park/public artifact validators and both protected plans verified all 556
checksums, the exact SHA, existing account/region/stack, four fixed Pages targets,
API and Nacka scope. Target configuration and migration runtime hashes match the
prior successfully deployed #343 release. No deploy or rollback rebuild occurred.

The reviewed Park plan contained 202 resources, no additions/removals or section
changes, and only `BookingHandler5D1461BB` and `DataSyncHandler2BB2FACC` changed.
Independent template comparison narrowed every change to `Properties.Code.S3Key`
or `Metadata.aws:asset:path`. The previous canonical template hash was
`1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`; the exact
selected/deployed hash is
`cc997a77255d49c435b16e2d004bd52c8fb97cb79e9d1192a67fb5f88aa0cfb2`.

Delegated Park approval followed review of successful plan job `101032992361`
and named the exact release, target, two-code-asset plan and rollback candidate.
Migration apply stayed false. Park finished with exact template equality,
`UPDATE_COMPLETE`, `IN_SYNC` drift, no active alarms, empty queues, migrations
already applied through `0020`, exact Cloudflare commit readback and passing
HTTP/configuration/Apple association checks.

The public plan was prepared while Park ran. Its successful job `101033078971`
was reviewed against the same manifest, source outputs, fixed public projects,
`https://checkin.jumpyard.se` and `https://staff-checkin.jumpyard.se`. Public
approval was submitted only after the complete Park run and independent Park
readback passed. The public workflow verified active domains, allowed/blocked
CORS, Cognito targets/callbacks, exact Cloudflare commit and the Apple association
hash `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`.

### Live verification and limits

Independent HTTP readback compared actual response bytes with the selected
artifact: 28 Park responses and 28 public responses matched, covering phone,
staff/admin routes, referenced script/style files and Apple association.

One read-only request to the deployed `/v1/bookings/availability` used 2026-09-04
at 16:00 and 19:00. It returned HTTP 200, `catalogStatus: verified`, Roller Live
authority and `wroteBooking: false`:

- At 16:00, ordinary 60/90/120-minute entries, family products, the verified
  Combo and all configured add-ons were available.
- At 19:00, ordinary/family 60-minute products were available; 90/120-minute
  products and Combo remained unavailable according to Roller.
- Fresh stock offers included socks, exact water `970411`, lock and coffee.
  This confirms the current stock-price path, without renewing any cache row.

The single diagnostic request took 3,184 ms end to end. That is not a before/after
latency measurement or throughput guarantee; the two-second bound applies only
to the optional public-catalog read. The tests prove no mandatory delay or added
normal-path request. No customer-incident rate is inferred from the code defect.

No real booking, payment, check-in, forced catalog outage, manual sync, cache
mutation, queue replay or guest message was performed. Early-import/catalog
failures and late responses were tested with isolated synthetic dependencies.
Physical handset/Wi-Fi and load testing were not performed. The next natural
daily refresh was not awaited or claimed as observed after deployment.

Evidence files are `%TEMP%/jumpyard-gh339-{park,public}-readback.json`,
`jumpyard-gh339-{park,public}-{plan,deploy}.log` and
`jumpyard-gh339-park-plan-33875994276/plan.json`.

### Rollback and closeout

The verified rollback candidate is the previously successful and deployed #343
release `33873617274`, source `5e163356cc7c30cd7b7d5b381db9472f42381172`, artifact
`9937052826`, digest
`sha256:2aa7e5445bd0cb1fecd32a01ea8f7a3ba2d7a1d53331199c678a14cc86d20221`.
It was rechecked as unexpired, retained until 2026-12-03T12:36:18Z; all 556 files
validated locally and its template matched the pre-deploy stack. Rollback would
promote that same artifact through the protected workflows. No rollback or
re-promotion was needed.

During documentation closeout, the separately owned #335 [Park run 33876824492](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33876824492)
successfully promoted `1783cd468caa0198755841641fc3a55962bdeda0`, which descends
from this catalog release. Its 205-resource plan leaves the Booking/DataSync
functions unchanged. The snapshot therefore records that newer Park version and
the still-current public `0e04fb4` version separately. #335 owns alarm delivery
acceptance and its rollout evidence; this closeout does not claim those tests.

Love explicitly requested available testing followed by closure. #339 preserves
#294's independent commit, detects unavailable prices/failed refreshes and keeps
expired prices out of offers. #341 safely omits unverified Combo eligibility
while retaining authoritative availability and prices. The 27 failure/success
scenarios, full CI/release, protected rollout and live checks satisfy the approved
scope. No new Project draft was created; the already linked operational and
provider work remains separate. Recommended next step: use the normal public
links; any future observed catalog incident has safe diagnostics for follow-up.
