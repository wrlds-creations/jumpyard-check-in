# T0145 Current-State Audit

Date: 2026-06-17

Ticket: `T0145`

Scope: read-only audit of the current dev/Playground implementation before any `park-test` environment, AWS resource, Roller Live, webhook, payment, redeem, or visitor-test work.

## Read-Only Sources

- Repository source-of-truth files: `PROJECT_CONTEXT.md`, `DECISIONS.md`, `REPO_CURRENT_STATE.md`, `CODEX_TASK.md`, `AWS_RESOURCES.md`, `JUMPYARD_CLOUD_CONTRACT.md`, `API_PROTECTION_BOUNDARY.md`, and `docs/roadmap/backlog.md`.
- Infra/config/code inventory: `infra/config/dev.json`, `infra/config/dev.example.json`, `infra/lib/config.ts`, `infra/lib/jumpyard-cloud-stack.ts`, `infra/lambda/*`, `infra/scripts/*`, and `package.json` files.
- Frontend deploy/config inventory: `jumpyard-checkin-phone/README.md`, `jumpyard-checkin-phone/src/flow/cloudClient.ts`, `jumpyard-checkin-admin/README.md`, `jumpyard-checkin-admin/src/lib/adminApi.ts`, `jumpyard-checkin-admin/public/_headers`, and kiosk README/package metadata.
- Read-only AWS identity check: `aws sts get-caller-identity --profile wrlds-dev --region eu-north-1` confirmed account `376129878018`. No AWS resources were created, changed, deployed, or deleted.
- Local `.env` was inspected only for key names and redacted value presence. No secret values were printed or documented.

## Current Surface Inventory

| Surface | Current dev/Playground state | Source files/resources | Park-test blocker | Future ticket touch points |
|---|---|---|---|---|
| Environment contract | Only `dev` is implemented. The approved dev config targets AWS account `376129878018`, region `eu-north-1`, resource prefix `jumpyard-check-in-dev`, Roller environment `playground`, and base URL `https://api.play.roller.app`. | `infra/config/dev.json`, `infra/lib/config.ts`, `AWS_RESOURCES.md` | No `park-test` contract or config exists yet, and current config validation intentionally requires Playground. | `T0146`, `T0147`, `T0148` |
| Local Roller env | Local `.env` contains redacted Roller keys for `ROLLER_ENV`, `ROLLER_BASE_URL`, `ROLLER_CLIENT_ID`, and `ROLLER_CLIENT_SECRET`. | `.env` key-name audit only, `scripts/check-roller-env.js`, root `package.json` | Park-test must not reuse dev local secrets or assume Live values through `.env`; Live secret references need explicit separation. | `T0146`, `T0152`, `T0153` |
| AWS foundation | The deployed stack is `jumpyard-check-in-dev-stack` with API `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com`, Aurora cluster `jumpyard-check-in-dev-aurora`, SQS/DLQ, EventBridge rules, CloudWatch logs/alarms/dashboard, Secrets Manager, SSM, and S3 raw-payload storage. | `AWS_RESOURCES.md`, `infra/lib/jumpyard-cloud-stack.ts` | Park-test resources do not exist. Future resources must be separately named/tagged and must not reuse dev API, Aurora, queues, secrets, or schedules. | `T0148`, `T0149`, `T0150` |
| Roller non-secret config | Dev SSM parameters are `/jumpyard-check-in-dev/roller/env=playground` and `/jumpyard-check-in-dev/roller/base-url=https://api.play.roller.app`. | `AWS_RESOURCES.md`, `infra/lib/jumpyard-cloud-stack.ts` | Park-test needs its own SSM parameter names and Live base URL guardrails; dev must continue to fail closed against Live. | `T0147`, `T0150`, `T0152` |
| Secrets | Dev secret references include Roller credentials, webhook dev token, redeem dev token, staff auth, check-in link token, and Aurora admin. Values are not stored in repo and were not read. | `AWS_RESOURCES.md`, `infra/lib/jumpyard-cloud-stack.ts` | Park-test needs separate secret names and explicit live-write kill switches. Dev-only shared tokens are not production-grade controls. | `T0152` |
| API routes | Dev API exposes lookup, session, staff auth/list/detail/redeem, session-link, SMS/email planning/send, booking availability/quote/draft/add-product, lower-level redeem, and Roller webhook routes. | `infra/lib/jumpyard-cloud-stack.ts`, `API_PROTECTION_BOUNDARY.md`, `JUMPYARD_CLOUD_CONTRACT.md` | All API Gateway routes currently use `AuthorizationType=NONE`; protection is app-level plus CORS/stage throttling. Park-test must revisit route exposure for staff, internal ops, webhooks, writes, and redeem. | `T0149`, `T0152`, `T0155`, `T0156`, `T0160` |
| Database/schema | Dev Aurora uses schema `jumpyard` with migrations `0001` through `0008` present. The schema inventory says applied through `0008 prepayment draft customer names`. | `infra/migrations/*`, `AWS_RESOURCES.md` | `AWS_RESOURCES.md` also has an older top-level status sentence saying migrations through `0007`; future migration planning should verify and reconcile this docs drift before park-test DB work. | `T0149`, `T0150`, `T0151` |
| Phone API target | Phone source defaults to dev API `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` and can be overridden with `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`. | `jumpyard-checkin-phone/src/flow/cloudClient.ts`, `jumpyard-checkin-phone/README.md` | Park-test needs a separate deployment/config value pointing to the park-test JumpYard Cloud API. Same source code should remain shared. | `T0156` |
| Admin API target and CSP | Admin source defaults to the same dev API and can use `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL`. Static `_headers` CSP `connect-src` is hardcoded to the dev API. | `jumpyard-checkin-admin/src/lib/adminApi.ts`, `jumpyard-checkin-admin/public/_headers`, `jumpyard-checkin-admin/README.md` | Park-test admin deployment must update both env/API target and CSP/connect-src. CORS must include the park-test admin origin. | `T0156` |
| Public deploy surfaces | Current public dev Pages URLs are `https://jumpyard-check-in.pages.dev` for phone and `https://jumpyard-checkin-admin.pages.dev` for admin. Kiosk deployment target remains TBD. | `jumpyard-checkin-phone/README.md`, `jumpyard-checkin-admin/README.md`, runbooks | Park-test needs separate deploy targets or environment-specific Pages config without forking source. Kiosk is not part of the park-test sequence unless scoped later. | `T0156` |
| CORS | Dev CORS allows localhost phone/admin ports plus the two current Cloudflare Pages origins. | `infra/config/dev.json`, `AWS_RESOURCES.md` | Park-test API must allow only reviewed park-test origins and must not accidentally remove dev origins from the dev stack. | `T0148`, `T0156` |
| Webhooks | Roller Playground webhook id `238` posts booking events to the dev webhook endpoint. The register script is guarded by a Playground-only write confirmation. | `AWS_RESOURCES.md`, `infra/scripts/register-roller-webhook.ts`, `infra/lambda/webhook/index.js` | Live webhook registration is not prepared or approved. Auth/signature/IP policy and rollback/removal behavior must be documented before registration. | `T0154`, `T0155` |
| Booking quote/draft/payment | Booking Lambda reads Playground availability/products, quotes costs, creates guarded Playground drafts with `confirmDraft=true`, persists safe draft metadata, and returns raw `paymentJwt` only in the response. Phone uses the vendored Roller payment package. | `infra/lambda/booking/index.js`, `jumpyard-checkin-phone/src/flow/cloudClient.ts`, `jumpyard-checkin-phone/vendor/roller-ecom-payments/`, `JUMPYARD_CLOUD_CONTRACT.md` | Live quote, draft, and payment must be separated into explicit gates. Raw payment JWT must remain response-only/in-memory. | `T0157`, `T0158`, `T0159` |
| Redeem | Dev redeem handler has `ENABLE_ROLLER_REDEEM_WRITES=true` in the deployed handler environment and relies on staff/dev-token controls plus `confirmRedeem`. | `infra/lib/jumpyard-cloud-stack.ts`, `infra/lambda/redeem/index.js`, `API_PROTECTION_BOUNDARY.md` | Park-test must introduce environment-specific redeem gates/kill switches before any Live redemption. Lower-level direct redeem should not remain a broad public path. | `T0152`, `T0160` |
| SMS/email schedules | Dev booking-time messaging EventBridge schedule invokes planning mode every 5 minutes with `confirmSend=false`. SNS/SES remain sandbox/dev constrained. | `infra/config/dev.json`, `AWS_RESOURCES.md`, `infra/lambda/session/index.js` | Park-test visitor messaging is not automatically approved. Provider readiness, sender/domain state, consent, and emergency stop need separate gates. | `T0149`, `T0152`, `T0161` |
| Scripts and write guards | Root and infra scripts include dry-run-first Roller, import, webhook, payment, seed, migration, synth, diff, and deploy commands. Write paths require explicit environment variables or CDK deploy commands. | root `package.json`, `infra/package.json`, `infra/scripts/*` | Park-test commands do not exist yet. Future tickets must add fail-closed commands and approval phrases without weakening existing dev/Playground guards. | `T0147`, `T0148`, `T0149`, `T0152`, `T0153`, `T0154` |
| CI/deploy automation | Repository has a pull request template but no GitHub Actions workflows. Cloudflare Pages appears to own frontend build/deploy surfaces outside repo workflows. | `.github/pull_request_template.md`, app READMEs | Park-test deploy preflight should not assume GitHub Actions. Cloudflare project/env ownership must be verified before frontend park-test exposure. | `T0149`, `T0156` |

## Park-Test Blockers

1. No `park-test` environment contract exists yet.
2. Current CDK config validation is intentionally Playground-only.
3. No separate park-test AWS resources, API URL, Aurora database, secrets, SSM parameters, queues, schedules, or CloudWatch surfaces exist.
4. Current phone/admin defaults and admin CSP point at the dev API.
5. Live Roller read/write, webhook registration, payment, and redeem actions are not approved by T0145.
6. Route protection remains a documented boundary rather than a production-grade API Gateway authorizer/WAF implementation.
7. Secret separation and kill switches for Live draft/payment/redeem/webhook actions are not yet implemented.
8. `AWS_RESOURCES.md` has migration-status docs drift: top status says through `0007`, while the schema inventory and migration files show `0008` as the latest known migration.

## Future Ticket Touch List

| Ticket | Likely files/resources to touch | Notes |
|---|---|---|
| `T0146` | `PROJECT_CONTEXT.md`, `DECISIONS.md`, `AWS_RESOURCES.md`, `docs/roadmap/backlog.md`, this audit note | Define the environment contract only. No credentials, Live calls, deploys, or resources. |
| `T0147` | `infra/lib/config.ts`, config validators/tests, `scripts/check-roller-env.js`, Roller env guard docs | Add fail-closed support for `park-test` while proving dev cannot point at Live. |
| `T0148` | `infra/config/park-test.json`, `infra/lib/jumpyard-cloud-stack.ts`, `infra/bin/jumpyard-cloud.ts`, `infra/package.json`, synth/diff docs | Synthesis-only skeleton; no deploy. |
| `T0149` | Deployment/rollback runbook, `AWS_RESOURCES.md`, Cloudflare/AWS preflight docs, route/auth checklist | Read-only preflight and stop criteria before any deploy. |
| `T0150` | CDK deploy config, `AWS_RESOURCES.md`, AWS account/region/tags/resource inventory | Requires explicit deploy approval. Park-test resources only. |
| `T0151` | `infra/migrations/*`, migration runner/status docs, `AWS_RESOURCES.md` | Park-test database only; verify dev `schema_migrations` unchanged. |
| `T0152` | Secret references, handler env gates, kill-switch docs, `AWS_RESOURCES.md` | No secret values in repo or logs. Live-write flags default off. |
| `T0153` | Roller read-only scripts/client, preflight report docs | Live reads only after approval; no drafts, payments, redemptions, or webhook writes. |
| `T0154` | `infra/scripts/register-roller-webhook.ts`, webhook dry-run docs/config | Dry-run only; exact endpoint/headers/events/rollback preview. |
| `T0155` | Webhook registration record, `AWS_RESOURCES.md`, webhook validation notes | Requires explicit approval; avoid duplicate Live webhook registrations. |
| `T0156` | Phone/admin deployment env, API URL config, admin `_headers`, CORS config, Cloudflare notes | Same source code, separate API target; dev deployments remain available. |
| `T0157` | Booking quote path and smoke report docs | Live quote/cost only; no draft/payment/redeem. |
| `T0158` | Booking draft guard path, payment JWT handling checks, smoke report docs | One controlled Live draft only after approval and allow flag. |
| `T0159` | Phone payment path, payment runbook, outcome/refund notes | One internal real payment only; refund/cancel remains manual outside the app. |
| `T0160` | Session/redeem handlers, admin staff flow, redeem smoke report | Controlled Live redeem only after gate approval. |
| `T0161` | Staff-assisted visitor runbook and issue log | Limited assisted visitor test with normal Roller fallback. |
| `T0162` | Outcome/go-no-go report, backlog/followups | Docs/analysis only. |

## T0145 Conclusion

The current implementation is a single dev/Playground stack and two main public frontend deployments that target that dev API. Park-test can reuse the same source code and server-owned architecture, but it needs a separately contracted environment, fail-closed config support, separate AWS resources, separate secret references, reviewed route/deploy exposure, and explicit Live gates before any read/write/payment/redeem action.

T0145 made documentation changes only. It did not change app behavior, Lambda code, CDK resources, AWS state, Roller state, Cloudflare settings, credentials, bookings, drafts, payments, redemptions, SMS, or email.
