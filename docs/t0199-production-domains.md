# T0199 Production Web Domain Preparation

## Outcome

T0199 locks the Swedish production web entrypoints and makes the later rollout reviewable. Under Love's explicit 2026-07-16 scope extension in issue #206, it also created exactly two empty Cloudflare Pages projects and associated the two approved custom domains. João then published the exact reviewed CNAME records. No application content, AWS resource, CORS change, or production traffic was deployed.

The canonical machine-readable contract is [`config/production-domains.json`](../config/production-domains.json).

| Surface | Approved public origin | Source | Empty Pages project | Exact CNAME target | Current state |
|---|---|---|---|---|---|
| Guest check-in | `https://checkin.jumpyard.se` | `jumpyard-checkin-phone` | `jumpyard-check-in-production` | `jumpyard-check-in-production.pages.dev` | DNS public; association `Active`; `SSL enabled`; zero deployments |
| Staff/admin | `https://staff-checkin.jumpyard.se` | `jumpyard-checkin-admin` | `jumpyard-checkin-admin-production` | `jumpyard-checkin-admin-production.pages.dev` | DNS public; association `Active`; `SSL enabled`; zero deployments |

João/JumpYard owns `jumpyard.se` DNS and confirmed both records were applied. Cloudflare and Google public resolvers return the exact targets with TTL 3600, and Cloudflare reports both domains `Active` with `SSL enabled`. The projects still have no Git provider and no application deployment; the production API base URL remains unset.

## Applied DNS Records

João applied these records in the authoritative `jumpyard.se` DNS zone:

| Type | Name/host | Full hostname | Target | Observed TTL |
|---|---|---|---|---|
| CNAME | `checkin` | `checkin.jumpyard.se` | `jumpyard-check-in-production.pages.dev` | `3600` seconds |
| CNAME | `staff-checkin` | `staff-checkin.jumpyard.se` | `jumpyard-checkin-admin-production.pages.dev` | `3600` seconds |

The records were publicly verified at `2026-07-16T17:09:40+02:00`. This prepares DNS and TLS only; both addresses intentionally return Cloudflare `522` until an approved application artifact is deployed to the empty Pages projects.

## API And CORS Boundary

There is no approved `api-checkin.jumpyard.se` hostname in this stage. The later production issue must create the production API, put its exact generated base URL into both frontend builds, and configure API Gateway CORS for exactly:

- `https://checkin.jumpyard.se`
- `https://staff-checkin.jumpyard.se`

The staff identity configuration must use:

- callback: `https://staff-checkin.jumpyard.se/auth/callback`
- logout: `https://staff-checkin.jumpyard.se/admin`

Because no custom API hostname is approved, a generated API Gateway `execute-api` endpoint would remain the only API origin and therefore must remain enabled. CORS is a browser-origin restriction, not API authentication. The production issue must not claim that an edge or WAF layer is non-bypassable while the generated endpoint remains reachable. Disabling that endpoint requires an approved custom API hostname and a separate reviewed topology change.

References:

- [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [AWS HTTP API CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)
- [AWS HTTP API default endpoint](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-disable-default-endpoint.html)

## Preserved Park-test Baseline

T0199 does not change or extend park-test. Its existing origins remain:

| Role | Current origin |
|---|---|
| Phone | `https://jumpyard-check-in-park-test.pages.dev` |
| Staff/admin | `https://jumpyard-checkin-admin-park-test.pages.dev` |
| Existing kiosk interface | `https://jumpyard-check-in-kiosk.pages.dev` |
| JumpYard Cloud API | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |

Production origins must never be added to `infra/config/park-test*.json`, and a production bundle must never contain the dev or park-test API base URL.

## Later Rollout Preconditions

Do not deploy application content or create production AWS/API resources until one separately approved production issue names the exact account, environment, owners, repositories, tags, data classification, cost center, production delivery workflow, and rollback authority. That issue must also have:

1. a recorded T0204 GO decision;
2. a protected production build-and-promotion path that uses immutable artifacts;
3. created production AWS/API/Cognito targets with exact readback;
4. revalidated these exact empty Cloudflare Pages projects, custom-domain associations, and `*.pages.dev` targets;
5. reviewed frontend build variables, exact CORS origins, and staff callback/logout URLs;
6. a confirmed DNS owner, applied-value readback, and rollback communication path with João; and
7. monitoring and smoke-test owners present during the change.

If any physical target differs from this contract, the rollout stops. A placeholder is never sent to João.

## Cloudflare, DNS, And TLS Sequence

T0199 has completed the Cloudflare preparation in this order for each surface:

1. Create one empty Pages project after checking for naming collisions.
2. Confirm no Git provider and zero application deployments.
3. Associate the approved custom hostname before external DNS exists.
4. Read back the exact `*.pages.dev` CNAME target and pending association.
5. João applied both exact CNAME records after the reviewed handoff.
6. Verify the records through Cloudflare and Google public resolvers and confirm both Cloudflare domains are `Active` with `SSL enabled`.

DNS and TLS are now prepared, but the links must not be distributed because both projects remain empty. The later approved production issue must execute and record this order:

1. Build the phone/admin output through the approved production release path from one exact reviewed commit and artifact.
2. Deploy that artifact to the existing empty production Pages project with the exact production API and identity variables.
3. Verify the generated `*.pages.dev` target, source commit, bundle target, HTTP response, security headers, and absence of dev/park-test API identifiers.
4. Confirm each custom hostname is still attached to the intended project and its public CNAME still matches this contract.
5. Reconfirm both custom domains are active with valid TLS after deployment.
6. Run all pre-traffic checks below. Do not distribute the links until every check passes.

## Verification Matrix

| Check | Required evidence | Stop condition |
|---|---|---|
| DNS ownership | Public DNS returns the reviewed CNAME chain for both hosts | Missing, extra, or different target |
| TLS | Both origins return a trusted certificate for the exact hostname | Pending, invalid, mismatched, or downgraded TLS |
| Artifact identity | Pages readback and asset fingerprint match the approved commit/artifact | Rebuild, dirty source, or wrong commit |
| Guest bundle target | Guest build contains only the approved production API base URL | Dev/park-test API id or unknown API |
| Staff bundle target | Staff build contains the production API and identity values | Wrong API, Cognito domain, or client |
| CORS positive | Preflight from both approved origins succeeds only on intended methods/headers | Either approved origin fails |
| CORS negative | Dev, park-test, arbitrary, and `null` origins receive no allow-origin grant | Any unexpected origin is allowed |
| Admin redirect | Login callback and logout return only to the approved staff origin | Mismatch, wildcard, or park-test callback |
| Guest flow | Read-only lookup and safe session smoke work on the guest hostname | Network/auth/config error |
| Staff flow | Admin authentication and PIN-only staff sign-in reach the correct production venue | Wrong venue, role, or identity target |
| API posture | Generated endpoint state matches the no-custom-hostname contract | Endpoint disabled without an approved alternative, or false edge-isolation claim |
| Monitoring | API, auth, Pages, and error signals are visible to named owners | Missing alarms, access, or response owner |

The production issue defines whether any controlled Roller or data write is needed. T0199 authorizes none. Its live changes were the two empty Pages projects, two custom-domain associations, and the exact owner-applied CNAME records recorded above.

## Abort And Rollback

The pre-DNS gate has passed. Abort before application deployment if a target, artifact, API URL, callback, CORS value, certificate path, monitoring owner, or rollback operator is missing or inconsistent. Leave both projects empty and do not distribute either link.

If a problem appears after DNS:

1. stop distributing both production links and record the exact failure time;
2. ask João to restore the captured prior DNS state for the affected hostname; for a new hostname, that normally means removing the new CNAME;
3. do not point a production hostname at dev or park-test;
4. if the defect is only in a deployed frontend artifact, promote the last approved production artifact through the same protected workflow without rebuilding;
5. if API/CORS/identity configuration is defective, restore the last approved production configuration through its protected workflow;
6. verify public DNS/TLS and confirm traffic no longer reaches the failed target before removing the custom-domain association; and
7. preserve the failed artifact, run IDs, DNS values, timestamps, and smoke evidence for the follow-up review.

DNS rollback is not instantaneous. The production issue must agree the TTL and rollback window with João before the change and must never describe record removal as immediate recovery.

## Evidence Record

T0199 has filled the Cloudflare and handoff rows from live readback. The later production issue must fill the remaining rollout evidence before traffic is approved:

| Evidence | Guest | Staff/admin |
|---|---|---|
| Cloudflare project name | `jumpyard-check-in-production` | `jumpyard-checkin-admin-production` |
| Generated Pages origin | `https://jumpyard-check-in-production.pages.dev` | `https://jumpyard-checkin-admin-production.pages.dev` |
| Application deployments | `0` | `0` |
| Applied CNAME target | `jumpyard-check-in-production.pages.dev` | `jumpyard-checkin-admin-production.pages.dev` |
| Custom-domain association status | `Active`; `SSL enabled` | `Active`; `SSL enabled` |
| DNS applied/readback | João confirmed; public readback `2026-07-16T17:09:40+02:00`; TTL `3600` | João confirmed; public readback `2026-07-16T17:09:40+02:00`; TTL `3600` |
| TLS certificate readback | `CN=checkin.jumpyard.se`; Google Trust Services `WE1`; SHA-1 `6D0FD0F65663F7208C573CCCC54E5AD24BDFDA3F` | `CN=staff-checkin.jumpyard.se`; Google Trust Services `WE1`; SHA-1 `E2C101219EA7D393A900F222D83D9DFC39E705CD` |
| Release run/artifact/SHA | Pending | Pending |
| Bundle target proof | Pending | Pending |
| CORS proof | Pending | Pending |
| Rollback readback | Pending | Pending |

T0199 is complete when this contract, validator, runbook, public DNS/TLS readback, live Cloudflare readback, and zero-deployment evidence are reviewed and pass. DNS and TLS work, but both hostnames intentionally return Cloudflare `522` until a later approved production issue deploys the application.
