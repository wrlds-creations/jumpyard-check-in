# T0156 Park-Test Frontend Target

Date: 2026-06-23

## Scope

T0156 configures the existing phone and admin frontend source for a separate park-test deployment target.

The ticket keeps the source code shared:

- No copied phone app.
- No copied admin app.
- No frontend calls to Roller.
- No payment, redeem, SMS, email, booking draft, webhook processing, or visitor-flow rollout.

The only frontend target switch is the public build-time API variable:

```text
NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL
```

## Target Model

| Surface | Dev / Playground | Park-test / Roller Live |
|---|---|---|
| Phone Pages project | `jumpyard-check-in` | `jumpyard-check-in-park-test` |
| Phone Pages URL | `https://jumpyard-check-in.pages.dev` | `https://jumpyard-check-in-park-test.pages.dev` |
| Admin Pages project | `jumpyard-checkin-admin` | `jumpyard-checkin-admin-park-test` |
| Admin Pages URL | `https://jumpyard-checkin-admin.pages.dev` | `https://jumpyard-checkin-admin-park-test.pages.dev` |
| API base URL | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| Roller access | Server-side Playground via JumpYard Cloud dev | Server-side Live via JumpYard Cloud park-test |

Cloudflare Pages should set the park-test public environment variable to:

```text
NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com
```

## Repository Changes

- `infra/config/park-test.json` now uses the reviewed park-test Pages origins for CORS:
  - `https://jumpyard-check-in-park-test.pages.dev`
  - `https://jumpyard-checkin-admin-park-test.pages.dev`
- `infra/config/park-test.json` now uses the park-test phone Pages URL as the disabled guest-message base URL.
- `jumpyard-checkin-admin/public/_headers` CSP `connect-src` allows both the dev API and park-test API because the same static admin source can be deployed to either target.
- `jumpyard-checkin-phone/README.md` and `jumpyard-checkin-admin/README.md` document the dev and park-test Cloudflare Pages settings.
- `scripts/validate-park-test-frontend-target.js` verifies that dev defaults remain unchanged and park-test target config is present.

## Cloudflare Status

`npx --yes wrangler whoami` reported that Wrangler is not logged in, so T0156 did not create or update Cloudflare Pages projects from the local terminal.

Create or verify these Cloudflare Pages projects manually or through an authenticated Cloudflare workflow:

| Project | Root directory | Build command | Output directory | Public env var |
|---|---|---|---|---|
| `jumpyard-check-in-park-test` | `jumpyard-checkin-phone` | `npm run build` | `out` | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| `jumpyard-checkin-admin-park-test` | `jumpyard-checkin-admin` | `npm run build` | `out` | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |

## AWS CORS

T0156 deployed the intended park-test CORS origins to `jumpyard-check-in-park-test-stack`:

- `https://jumpyard-check-in-park-test.pages.dev`
- `https://jumpyard-checkin-admin-park-test.pages.dev`

The deploy changed API Gateway CORS and disabled guest-message base URL environment values only. It did not enable staff auth, webhook processing, draft writes, redeem writes, SMS, or email.

Pre-deploy CDK diff showed only:

- API Gateway HTTP API CORS `AllowOrigins` placeholder values replaced with the two park-test Pages origins.
- `SessionHandler` environment values `CHECKIN_EMAIL_BASE_URL` and `CHECKIN_SMS_BASE_URL` updated from the placeholder phone URL to `https://jumpyard-check-in-park-test.pages.dev/`.

Post-deploy CDK diff showed no differences.

## Validation

Performed validation:

```powershell
node scripts/validate-park-test-frontend-target.js
$env:NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL='https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com'; npm --prefix jumpyard-checkin-phone run build; Remove-Item Env:NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL
$env:NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL='https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com'; npm --prefix jumpyard-checkin-admin run build; Remove-Item Env:NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL
npm --prefix infra run validate:config-guards
npm --prefix infra run validate:park-test-synth
aws sts get-caller-identity --profile wrlds-dev --output json
cd infra
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
npx cdk deploy -c config=./config/park-test.json --profile wrlds-dev --require-approval never
npx cdk diff -c config=./config/park-test.json --profile wrlds-dev --method=template
npm run validate
git diff --check
```

AWS identity:

```text
Account: 376129878018
Arn: arn:aws:sts::376129878018:assumed-role/AWSReservedSSO_AdministratorAccess_8a2502e60c822ae0/Love
```

CORS preflight results:

| Origin | Route | Result |
|---|---|---|
| `https://jumpyard-check-in-park-test.pages.dev` | `OPTIONS /v1/check-in/lookup` | HTTP `204`; `access-control-allow-origin` returned the phone origin. |
| `https://jumpyard-checkin-admin-park-test.pages.dev` | `OPTIONS /v1/staff/auth/login` | HTTP `204`; `access-control-allow-origin` returned the admin origin. |

These `OPTIONS` requests did not invoke Roller, create Aurora rows, or run check-in logic.

## Safety Outcome

T0156 must leave these gates closed:

- `JUMPYARD_EMERGENCY_STOP=true`
- `ENABLE_STAFF_AUTH=false`
- `ENABLE_GUEST_MESSAGE_SENDS=false`
- `ENABLE_ROLLER_BOOKING_DRAFT_WRITES=false`
- `ENABLE_ROLLER_REDEEM_WRITES=false`
- `ENABLE_ROLLER_WEBHOOK_PROCESSING=false`
