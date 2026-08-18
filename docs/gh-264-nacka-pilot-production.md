# Issue #264 Nacka Pilot-Production Contract

Date: 2026-08-18

Status: Initial protected rollout complete. Manual financial/admin evidence, compatible rollback/re-promotion, and retired-project cleanup remain.

## Decision

The existing technically named `park-test` environment is the sharp backend for the single-park Nacka pilot.

`park-test` remains its technical identity everywhere: AWS account `376129878018`, region `eu-north-1`, stack `jumpyard-check-in-park-test-stack`, resource prefix `jumpyard-check-in-park-test`, `WRLDS:Environment=park-test`, existing secrets, Aurora data, API, Cognito, queues, webhooks, alarms, and Roller Live venue `50871`. Its business role is Nacka pilot production.

No second AWS backend is created, no resource is renamed, and no operational data is copied. A future rollout to several parks is a separate architecture, isolation, credential, cost, and approval decision.

## Public And Verification Surfaces

| Surface | Verification target | Public pilot target | Backend |
|---|---|---|---|
| Phone | `https://jumpyard-check-in-park-test.pages.dev` | `https://checkin.jumpyard.se` | Existing Park API |
| Staff/admin | `https://jumpyard-checkin-admin-park-test.pages.dev` | `https://staff-checkin.jumpyard.se` | Existing Park API and Cognito |

The public Cloudflare Pages projects remain `jumpyard-check-in-production` and `jumpyard-checkin-admin-production`. Their names describe the frontend role; they do not imply a separate AWS backend.

The kiosk is not part of this frontend cutover. Its repository, Pages project, terminal flow, and release path remain unchanged.

## Release Flow

1. A reviewed PR merges to `main`.
2. `release.yml` automatically builds one immutable, hashed Park artifact containing CDK, migrations, phone output, and admin output. This step changes no environment.
3. An operator selects the successful release workflow run and exact full commit SHA.
4. `deploy-park-test.yml` renders the read-only AWS plan. After protected approval it deploys the exact assembly and the exact phone/admin outputs to the Park verification projects. It never rebuilds.
5. Park verification proves stack/config identity, CORS, Cognito callbacks, both frontend targets, alarms, queues, migrations, and exact Cloudflare commit readback.
6. `deploy-checkin-domain-test.yml` then renders the public-target plan. After protected approval it promotes the same phone/admin outputs to the two public Pages projects. It changes no AWS resource and never rebuilds.
7. Public verification proves both custom-domain associations, TLS, exact commit readback, Park API target, Cognito target, staff routes, and the Apple Pay association file.
8. Rollback selects a prior successful release artifact and runs the same protected target path. Re-promotion uses the same process.

A merge therefore builds a candidate automatically but does not publish it to Park or the public pilot origins.

## Cloudflare Deployment Policy

The authoritative route is the protected immutable-artifact workflow. Direct Cloudflare Git deployment must be disabled on all four retained phone/admin Pages projects before the first #264 rollout:

- `jumpyard-check-in-park-test`
- `jumpyard-checkin-admin-park-test`
- `jumpyard-check-in-production`
- `jumpyard-checkin-admin-production`

The protected workflows fail closed unless retained projects have `production_branch=main` and no Git source.

After public promotion and rollback are both proven, the two superseded Playground/dev Pages projects may be removed through an exact-target Cloudflare operation:

- `jumpyard-check-in`
- `jumpyard-checkin-admin`

Record their Cloudflare project IDs immediately before deletion. Do not remove them before phone, staff/admin, exact release readback, and rollback evidence pass. DNS records are unchanged because the public custom domains already point to the retained production-named Pages projects.

## AWS And Identity Change

The next protected Park deployment may update only the existing API Gateway CORS origin list and existing Cognito app-client callback/logout lists for the new staff origin, plus any independently reviewed exact artifact delta already present in the selected `main` release.

Required public values are:

- CORS origin `https://checkin.jumpyard.se`
- CORS origin `https://staff-checkin.jumpyard.se`
- callback `https://staff-checkin.jumpyard.se/auth/callback`
- logout `https://staff-checkin.jumpyard.se/admin`

The Park verification origins and kiosk CORS origin stay present. The generated API Gateway endpoint stays enabled because no custom API hostname is approved.

## Safety Boundaries

- General guest messaging stays closed and the controlled email link stays on the existing Park URL until separately approved.
- The Nacka venue/date, payment, redemption, webhook, staff, lifecycle, and emergency-stop gates do not widen through this decision.
- No AWS account, region, stack, resource, tag, secret, database, or Roller credential is created, copied, renamed, or deleted.
- No kiosk frontend, terminal, print flow, or kiosk repository is changed.
- No future multi-park tenancy or isolation model is selected.
- Issue #256 must finish or be explicitly superseded before an external #264 promotion selects its release baseline.

## Initial Rollout Evidence

- Implementation PR [#268](https://github.com/wrlds-creations/jumpyard-check-in/pull/268) merged as `fc8e1c4cf1d42f25790dbcc817cdc9be483ca5f0`.
- Automatic release run [32145647163](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32145647163) produced artifact id `9327831112` with digest `sha256:cb4bada0d550085bd06b32b1054e80cc3f59a3db6307437b00bc5446a83f8a77`.
- Initial Park run [32146182366](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32146182366) deployed the exact release but its final verifier stopped on a pre-existing transient ROLLER error alarm. The alarm was neither reset nor suppressed and returned naturally to `OK`.
- Same-artifact Park re-promotion [32146904664](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32146904664) passed the no-change 202-to-202 plan and exact AWS/Cloudflare verification. Park phone/admin deployment ids are `b2d938e3` and `d022214c`.
- Protected public promotion [32147234728](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/32147234728) deployed the same outputs without rebuilding or mutating AWS. Public phone/admin deployment ids are `a34804e0` and `835630e8`.
- The verifier proved HTTP 200, exact Park API/Cognito targets, both custom domains, exact commit SHA, and the Apple association SHA256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`. Independent Chrome readback loaded live Roller capacity, the PIN screen, `/admin`, and the Cognito login with `redirect_uri=https://staff-checkin.jumpyard.se/auth/callback`.
- Cloudflare dashboard readback showed no Git source on all four retained phone/admin projects.

## Remaining Closeout Gates

- Love's iPhone/Apple Pay confirmation on `checkin.jumpyard.se` for the selected release;
- credentialed admin login, callback/logout, and read-only staff-flow confirmation on `staff-checkin.jumpyard.se`;
- rollback and re-promotion run IDs for both target groups using two compatible immutable releases;
- exact IDs and deletion readback for the two retired dev Pages projects after every prior gate passes.

The last successful artifact before #264 is intentionally not a rollback candidate: its manifest predates the public staff origin and is rejected by the current release validators. Merging this evidence change produces a second compatible immutable release, after which the protected workflows can prove rollback and re-promotion without rebuilding either selected artifact.
