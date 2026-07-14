# T0194 Personal Staff Identity

Status: complete and closed on 2026-07-14. The approved PIN-only backend, migration, Cognito administrator identity, secret rotation, transactional session replacement, request-stable Cloudflare Pages build, complete staff lifecycle, negative cases, and named credential-free audit are deployed and verified in park-test. Love accepted the final result and explicitly chose to close without an additional post-fix manual traffic smoke.

## Outcome

T0194 replaces the shared park-test passcode and generic `JumpYard Staff` actor with a deliberately simple split model:

- Ordinary staff enter only their personal six-digit PIN on the staff application's start page.
- They do not enter a name, email address, password, Google account, device name, or authenticator-app code.
- Shared park devices are not registered. A park may use the expected three to five devices directly.
- A separate administrator signs in at `/admin` with a stronger Cognito account and TOTP, then creates, disables, enables, and resets ordinary staff accounts.
- When creating or resetting an account, the administrator enters first and last name, hands over the screen, and the employee chooses and repeats their own PIN.
- Every ordinary account receives the fixed `staff_operator` role for the current check-in workflow.

The useful analogy is a staff-room key cabinet. Each employee has one small personal key (the PIN) that opens the staff application, while the manager keeps the stronger master key used only to issue or withdraw staff keys. Staff do not need to understand the master-key system.

The staff queue, QR/paste opening, booking detail, product handout, and existing Roller redeem rules remain unchanged.

## Why PIN Alone Can Identify The Employee

The six-digit PIN is both the employee's identifier and proof. It therefore must be unique within the park. The server uses a secret-keyed lookup value to find the account and a separate domain-separated scrypt verifier to validate the PIN. Neither the raw PIN nor the opaque session token is stored in Aurora or written to logs.

The administrator UI rejects duplicate PINs without revealing another employee's PIN. Predictable values such as `123456`, repeated digits, simple ascending or descending sequences, and a short deny-list are rejected.

Successful login returns a random opaque session token. Only its SHA-256 hash is stored. A new PIN login for the same employee revokes that employee's previous active PIN session, which limits accidental unattended sessions across shared devices.

## Staff Experience

1. Open the existing staff URL.
2. Enter six digits.
3. Press **Logga in**.
4. See the same queue and check-in tools as today, now with the employee's name in the header and audit trail.
5. Log out when leaving the device.

There is no device enrollment. Browser state uses `sessionStorage`, not `localStorage`, and is cleared on logout or authorization failure. The server enforces fifteen minutes of inactivity and an eight-hour absolute session maximum. Frontend heartbeats keep an actively used session alive but cannot extend it beyond eight hours.

The staff queue uses a stable session key, persistent activity throttle, and one in-flight refresh coordinator. User activity can update the local idle timer without reloading the queue, overlapping refreshes are coalesced, stale session/query responses are discarded, and a rapid logout plus new PIN login cannot lose the new session's queue load.

## Administrator Experience

The known `/admin` route is separate from the staff start page. It uses a dedicated Cognito user pool with administrator-created accounts, OAuth authorization code with PKCE, and required authenticator-app TOTP. This complexity applies only to the small number of trusted account administrators, not ordinary park staff.

For the small park-test administrator group, the deployed password policy accepts at least eight characters with an uppercase letter, lowercase letter, and digit; a symbol is optional. Cognito prevents reuse of the last five passwords and still requires administrator TOTP. This explicitly approved usability tradeoff does not change the PIN-only staff flow, and no actual administrator password is stored in source, documentation, Aurora, or deployment output.

An authenticated `staff_admin` can:

- list ordinary staff for venue `50871`;
- create a staff account from first name, last name, and a staff-chosen six-digit PIN;
- disable or re-enable an account;
- reset a PIN while the employee chooses the replacement; and
- immediately invalidate that employee's existing sessions when status or PIN changes.

The admin cannot assign broader roles through the web form. Ordinary accounts are created as `staff_operator`; provider tokens never decide business authorization.

The guarded `npm --prefix infra run staff-admin-identity:park-test -- ...` command is restricted to bootstrapping and lifecycle management of the Cognito `staff_admin` account. It does not accept or manage ordinary staff PINs.

## Mobile And Visual Contract

The staff root, authenticated queue, administrator page, and authorization callback use the same system-font stack as the phone check-in application. Normal labels, helper text, headings, metadata, and active icons use solid black; gray remains only for disabled, inactive, or placeholder states. JumpYard red remains the primary action, link, and focus color.

The layouts are explicitly narrow-screen safe. Rendered checks at 320, 360, and 390 CSS pixels confirmed that the staff PIN form, authenticated queue, administrator create/reset forms, and authorization callback stay inside the viewport without horizontal overflow.

Cognito Managed Login is provider-hosted. Its supported branding is deployed with black copy, JumpYard-red buttons, links, and focus states, plus rounded form, input, and button shapes. Cognito does not support a custom font family or Swedish localization for this flow, so the hosted page remains English and uses provider-owned Open Sans. Replacing it with a custom credential UI only to match typography or language is outside T0194.

## Server Authorization And Audit

API Gateway validates Cognito JWTs only for the four administrator routes. Ordinary staff routes remain Lambda-authorized because their credential is an opaque JumpYard session token rather than a JWT.

For every staff list, detail, and redeem request, JumpYard Cloud verifies the opaque token hash, provider, environment, venue, current account state, current role, revocation state, idle expiry, and absolute expiry before Aurora data is returned or Roller can be called. The redeem Lambda independently repeats the relevant checks and only permits `staff_operator`.

Audit events use the stable Aurora `staff_identity_id`, approved display-name snapshot, role, server session id, correlation id, target session, result, and bounded reason. They exclude raw PINs, PIN lookup values, PIN verifiers, opaque tokens, Cognito bearer/refresh tokens, source addresses, and unnecessary guest data.

## Online Guessing Protection

A public PIN-only login needs a global safety brake because an attacker does not need to know an employee name. T0194 therefore combines:

- the existing API Gateway staff-login envelope of burst 10 and sustained 2 requests/second;
- a source-keyed limit of 20 failed PIN attempts in ten minutes;
- a venue-wide limit of 25 failed PIN attempts in ten minutes; and
- a 30-minute temporary block on new PIN logins when either threshold is reached.

Source addresses are stored only as server-secret HMAC values, never as raw IP addresses. Invalid, unknown, inactive, and incorrect PIN attempts produce the same public failure response.

These counters cover only failed staff PIN logins. They do not count valid logins, guest lookup, the phone check-in flow, queue/detail refreshes, purchases, redemptions, or already active staff sessions. A rush of roughly 120 arriving guests in 20 minutes therefore uses the larger T0193 guest/staff route capacity and does not consume the PIN-failure budget.

The deliberate tradeoff is fail-closed denial of service: a malicious person can intentionally trigger a temporary block on new staff logins. Existing authenticated staff sessions continue to work. This tradeoff is accepted for PIN-only identity because removing the venue brake would make online guessing of any employee PIN materially easier. Alerting, automatic limiter-row purge, and longer-term edge controls remain separate follow-up work.

## Aurora Data Delta

Migration `0009_staff_identity.sql` adds:

- `staff_identities` for stable identity, names, role, venue/environment, status, keyed PIN lookup, scrypt verifier, PIN-change boundary, and Cognito-admin recovery state;
- `staff_auth_sessions` for hash-only PIN sessions and Cognito-admin sessions, snapshots, idle/absolute expiry, and revocation; and
- `staff_pin_auth_limits` for source-keyed and venue-wide failed-login windows.

Database constraints keep local PIN identities and Cognito administrators structurally separate. A trigger revokes active sessions when role, status, token floor, or PIN material changes. Raw PINs and raw session tokens are never written by the migration or runtime.

The limiter rows need a retention/purge policy in T0195.

## Deployed AWS Delta

The park-test stack now has exactly 154 CloudFormation resources:

- five Cognito/JWT resources for administrator identity: user pool, public app client, user-pool domain, managed-login branding, and API Gateway JWT authorizer; and
- five new API routes, each with route, integration, and Lambda permission: one staff session route and four administrator routes.

The existing `POST /v1/staff/auth/login` route remains and becomes the PIN entry point. It is not exchanged for the session route.

The existing staff-auth Secrets Manager resource was repurposed from the shared passcode to a generated 64-character server-only `pinPepper`. Only the session Lambda can read it. The secret rotated in place and no additional secret resource was created. The redeem Lambda never receives the PIN pepper.

No identity pool, browser IAM credential, device-registration resource, custom domain, CloudFront distribution, WAF, SMS MFA, production resource, or real Roller write was added in the identity rollout.

The reviewed 2026-07-14 `cdk diff --no-change-set --strict` against account `376129878018` confirmed:

- 20 additions: the five Cognito/JWT resources and five route/integration/permission triplets;
- no resource removal or replacement;
- the existing staff-auth secret changes in place from generated passcode fields to generated `pinPepper` fields;
- the park-test API CORS method list adds `PATCH` for the admin item route;
- the existing API stage adds settings/dependencies for the five routes;
- session/redeem Lambda code and identity environment variables change;
- the redeem Lambda loses its old staff-secret read permission, while only the session Lambda retains access to the repurposed secret; and
- three non-secret stack outputs expose the admin user-pool id, public client id, and managed-login domain.

All resources remain inside the existing approved metadata boundary: account `376129878018`, region `eu-north-1`, client `JumpYard`, project `jumpyard-check-in`, environment `park-test`, owner/creator `love`, repository `wrlds-creations/jumpyard-check-in`, classification `confidential`, exportable `true`, and cost center `unassigned`.

Post-deploy readback confirmed CloudFormation `UPDATE_COMPLETE`, 154 resources, and 26 API routes: six `AWS_IAM`, four Cognito `JWT`, and sixteen Lambda-protected `NONE`. The four administrator routes use authorizer `nnwcuy`. The dedicated user pool `eu-north-1_rmaqadThL` has Essentials tier, MFA `ON`, and deletion protection active. Migration status shows `0001` through `0009` applied, and the existing staff secret exposes only the expected non-secret field names with a 64-character pepper value that was never printed.

A same-day visual follow-up updated only the existing managed-login branding settings in place and kept the stack at 154 resources. Cognito rejected an initial logo-inclusive update because the available vertical logo did not meet its form-logo aspect-ratio requirement; CloudFormation rolled that attempt back cleanly. The corrected no-logo update reached `UPDATE_COMPLETE` with explicit black/red/radius settings and `UseCognitoProvidedValues=false`. No user pool, client, domain, API, Lambda, IAM, Aurora, secret, or production resource was added, removed, replaced, or interrupted.

## Cost

Only one or a few administrators are expected to become Cognito monthly active users. Ordinary PIN staff do not use Cognito, TOTP, SMS, or per-user external identity services. The reviewed incremental identity cost is therefore negligible at park-test scale. Existing Lambda, HTTP API, Secrets Manager, and Aurora request/storage increments are small but not claimed as zero.

References: [Cognito pricing](https://aws.amazon.com/cognito/pricing/), [managed login](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html), [TOTP MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html), [OAuth code and PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html), and [HTTP API JWT authorization](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html).

## Rollout Status

No real Roller redeem write is required to validate identity.

1. Completed: local validation, synth, and read-only CDK diff were reviewed.
2. Completed: Love approved the exact resource, IAM, migration, secret-rotation, data, cost, administrator, rollout, and rollback delta.
3. Completed: migration `0009` was applied before PIN-mode Lambdas.
4. Completed: the park-test stack deployed and rotated the existing staff-auth secret into the PIN pepper.
5. Completed: the named Cognito administrator was registered in Cognito and Aurora, and the initial invitation was sent to `love@wrlds.com`.
6. Completed: the park-test PIN/admin mobile and visual build was deployed to Cloudflare Pages and later superseded by the final request-stable build at immutable deployment `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev` and stable URL `https://jumpyard-checkin-admin-park-test.pages.dev`.
7. Completed: inventory, route/auth readback, negative auth probes, Cognito callback probe, all-alarms-`OK`, `IN_SYNC` drift, and clean after-diff checks passed.
8. Completed manually: Love changed the administrator password, enrolled TOTP, and signed in at `/admin`.
9. Completed manually: one ordinary staff identity was created and PIN-only staff sign-in succeeded.
10. Completed live: a trivial PIN and a randomly generated forged opaque session were rejected without a Roller call; the existing create/admin-login/staff-login audit rows contain stable actor, role, venue, and session/target context without PIN, token, source-address, or email fields.
11. Completed corrective deploy: a live first-login `200` followed by second-login `500` was traced to unordered revoke/insert CTE execution under the one-active-session index. Session replacement now uses an identity row lock plus sequential revoke/insert statements in one Aurora transaction with rollback; the reviewed/deployed delta changed only the existing session Lambda code and its after-diff is clean.
12. Completed live: Love performed three sequential PIN logins after the correction; all returned HTTP `200`, each immediately authorized staff queue reads, and Aurora retained exactly one unrevoked local-PIN session while marking predecessors as replaced.
13. Completed live: logout returned HTTP `200`; disable returned `200` and PIN login was denied with `403`; enable returned `200`, PIN login and queue reads returned `200`, and final logout returned `200`.
14. Completed audit: create, reset, disable, enable, staff/admin session start, and staff logout events all contain the required actor/environment/venue context and none of the forbidden PIN, token, password, authorization, source-address, or email fields.
15. Completed corrective Pages deploy: API access logs exposed roughly 40 queue reads in a few seconds because activity-driven auth object updates restarted the queue effect. The frontend now keys effects by stable session id, persists the activity throttle, coalesces queue reads, discards stale session/query responses, preserves selected details, and handles rapid staff-session replacement without a stuck loader.
16. Completed automated deploy proof: PIN and legacy regression builds, lint, TypeScript, source assertions, independent race review, exact park-test build, all three Pages routes, and the combined park-test API/PIN/Cognito bundle passed at immutable deployment `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev` and the stable URL.
17. Completed corrective AWS deploy: final review found the initial PIN redeem session lookup did not apply the authorized venue filter even though the nested trusted Roller path did. The entry read now always receives the personal principal's venue, the regression requires the `50871` SQL parameter, the reviewed diff changed only existing `RedeemHandler` code, CloudFormation reached `UPDATE_COMPLETE`, Lambda readback was healthy, and the after-diff was empty.
18. Completed corrective AWS deploy: final review also found a PIN-reset/login race between slow verification and transaction start. The locked identity read now requires the exact lookup hash and verifier that were just checked; reset mismatch rolls back before revoke/insert, emits no success audit, and returns neutral `403 staff_pin_invalid`. The reviewed diff changed only existing `SessionHandler` code, CloudFormation reached `UPDATE_COMPLETE`, Lambda readback was healthy, and the after-diff was empty.
19. Accepted by Love: after testing the staff flow, Love approved closeout and explicitly declined an additional post-fix manual traffic smoke. This acceptance does not convert that unrun smoke into test evidence.
20. Further real staff accounts may now be created through the approved administrator flow.

## Rollback

The immediate safe rollback is `ENABLE_STAFF_AUTH=false` or the existing emergency stop, which closes staff and admin access. If migration succeeds but deployment fails, the additive tables can remain unused while staff access stays closed. If the stack succeeds but Pages fails, keep staff auth closed until the matching frontend is deployed.

Functional rollback to the old shared passcode is not the preferred response because the deployment repurposes and rotates the old secret. Restoring the previous backend and Pages build would require an explicitly reviewed maintenance operation and a newly generated legacy passcode. Do not attempt to reinterpret the PIN pepper as the old passcode.

## Completion

No T0194 verification remains. Administrator setup, staff creation, repeated PIN login, reset, duplicate/trivial-PIN and forged-session probes, transactional replacement, reset-race credential revalidation, venue-isolated PIN redeem lookup, logout, disable/re-enable with denied/restored login, final lifecycle audit, and automated queue-request stability checks all pass. Love accepted the final deployed result without an additional post-fix manual traffic smoke. A real Roller redemption was explicitly excluded and was not performed for identity closeout.

## Validation Evidence

The following local implementation checks passed on 2026-07-14 across the initial rollout and corrective passes without Aurora, Cognito-account, or Roller writes:

- `npm run validate`;
- `npm run infra:check`;
- PIN and legacy frontend static builds, frontend lint, TypeScript, and queue request-stability/race assertions;
- backend syntax and focused PIN/admin/session/redeem tests;
- migration SQL-splitter self-test;
- infrastructure package-lock dry run;
- park-test synth at 26 routes and 154 resources.

The deployment then used `wrlds-dev` as `Love` in account `376129878018`, region `eu-north-1`, after the required metadata and rollback preflight. Post-deploy evidence confirmed:

- migration `0009` applied after `0001` through `0008`;
- CloudFormation `UPDATE_COMPLETE`, 154 resources, 26 routes, and the expected 6 IAM / 4 JWT / 16 `NONE` split;
- one active Aurora `staff_admin` registry and one enabled Cognito user awaiting first password change, without exposing the email in automated readback;
- stable Pages HTTP `200` for `/`, `/admin`, and `/auth/callback`, with the active park-test API, PIN mode, and deployed Cognito client/domain confirmed in the combined bundle;
- malformed PIN rejected with HTTP `400 staff_pin_format_invalid`;
- missing staff session rejected with HTTP `401 staff_auth_session_required`;
- missing administrator JWT rejected at API Gateway with HTTP `401`;
- Cognito authorize accepted the deployed public client and stable callback and redirected to managed login;
- all 17 CloudWatch alarms `OK`;
- CloudFormation drift `IN_SYNC` with zero drifted resources; and
- `cdk diff --no-change-set --strict` reported no differences after deployment.

A same-day approved follow-up deploy updated only the existing Cognito user pool password policy in place: minimum length changed from twelve to eight and symbols became optional. That initial live readback confirmed the exact 8/upper/lower/digit/no-symbol-required policy while MFA stayed `ON`, Essentials tier and deletion protection stayed unchanged, the invited administrator was still enabled in `FORCE_CHANGE_PASSWORD`, the stack stayed at 154 resources, all 17 alarms were `OK`, fresh drift detection was `IN_SYNC` with zero drifted resources, and the follow-up after-diff was clean.

No ordinary staff account, raw PIN, token, secret value, real Roller write, SMS, or email send was used in automated validation. The Cognito account invitation email was the only expected identity-delivery side effect from that automated rollout.

After the automated rollout, Love manually completed the password change, TOTP enrollment, administrator sign-in, ordinary-staff creation, and PIN-only sign-in. No administrator password, staff PIN, token, or staff name is recorded in this document or automated output.

The final Cloudflare deployment `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev` and the stable URL returned HTTP `200` for `/`, `/admin`, and `/auth/callback`. The combined deployed JavaScript contains the park-test API, PIN mode, and deployed Cognito client/domain. Browser checks at 320, 360, and 390 CSS pixels confirmed exact viewport-width rendering without horizontal overflow for `/`, the authenticated staff queue, `/admin` create/reset, and `/auth/callback`. The deployed application uses the phone application's system-font stack with solid-black normal copy and active icons. The hosted Cognito page also fits 320 CSS pixels and uses the deployed black/red/radius branding, while remaining English in provider-owned Open Sans because Managed Login exposes neither Swedish localization nor custom-font controls.

On 2026-07-14, a live closeout audit confirmed one administrator identity and one ordinary staff identity. A controlled trivial-PIN probe returned `403 staff_pin_invalid`, a generated forged opaque-session heartbeat returned `401 staff_auth_session_required`, and the source/venue limiter stayed unblocked at two failures, far below its thresholds. Love privately completed reset, duplicate-PIN rejection, logout, disable with denied PIN login, re-enable with restored login, and final logout. Read-only Aurora aggregation confirmed the identity is enabled, zero local-PIN sessions remain unrevoked, and lifecycle events exist for create, two resets, disable, enable, eight staff session starts, five admin session starts, and logout. Every inspected lifecycle payload had actor/environment/venue context and none of the forbidden credential/source fields. Codex neither requested nor accessed any password, TOTP, PIN, or session token.

Later the same day, API access logs showed successful staff PIN login at `09:44:44Z` followed by HTTP `500` at `09:44:50Z` on the immediate replacement login. Code analysis matched the public error to the database exception path: the original two data-modifying CTEs had no guaranteed execution order and could collide with `staff_auth_sessions_one_active_pin_idx`. The correction uses `BeginTransaction`, `SELECT ... FOR UPDATE`, sequential revoke and insert, then `CommitTransaction`, with best-effort rollback on every pre-commit failure. Focused regression tests prove two logins return new distinct tokens, the old token is rejected, the new token heartbeats, transaction order is lock/revoke/insert, raw credentials stay out of SQL, and failed insertion rolls back. Full `npm run validate` and `npm run infra:check` passed. The pre-deploy full-flow diff named only `SessionHandler` code; CloudFormation reached `UPDATE_COMPLETE`, Lambda readback was healthy, and the post-deploy diff was empty. Love then performed three sequential live PIN logins at `10:01:59Z`, `10:02:07Z`, and `10:02:13Z`; all returned HTTP `200`, all subsequent queue reads returned `200`, and safe Aurora aggregation showed six historical local-PIN sessions, one unrevoked session, and three `new_pin_login` replacements. No PIN or token was accessed or printed.

The same live queue evidence also revealed an independent frontend amplification: mutable auth/activity updates could restart the queue-loading effect and produced roughly 40 successful `GET /v1/staff/check-in/sessions` calls in a few seconds. The final correction uses a stable session key, ref-backed 15-second activity throttle, one in-flight plus pending refresh coordinator, versioned latest-query handling, synchronous query/selection refs, stale-response rejection, and explicit recovery when an old session request overlaps a new PIN session. The focused frontend validator now asserts those contracts and builds both PIN and legacy modes; admin lint, TypeScript, the exact park-test build, and independent code review passed. The final Pages deployment is `https://391533f3.jumpyard-checkin-admin-park-test.pages.dev`; its three routes and combined public configuration were verified over HTTP. Love accepted the deployed result and chose not to run one more manual traffic smoke, so closeout records automated/deploy proof rather than claiming post-fix live request-count evidence.

Final independent review also found that `getStaffRedeemSession` received a venue filter only in the historical Cognito staff mode. Active PIN authorization already returned the trusted `50871` venue and the nested redeem path enforced it before Roller work, but the initial session lookup could expose an earlier blocked-session envelope for a known cross-venue id. The correction passes the authorized venue for every personal staff principal and leaves only legacy dev principals without a venue unfiltered. The strengthened backend test asserts the SQL clause and exact venue parameter. The reviewed park-test diff named only `RedeemHandler` code; CloudFormation reached `UPDATE_COMPLETE`, Lambda readback was `Active`/`Successful`, and the after-diff was empty. No real redeem or other Roller call was used for this verification.

The final session review found a separate reset race: the original login read and slowly verified one PIN before opening the replacement-session transaction, so an administrator reset committing between those stages could leave the later lock checking only current account state and a newly calculated auth time. The locked query now also matches the exact keyed lookup hash and scrypt verifier that were verified. If either changed, the transaction rolls back before revoking or inserting a session, no success audit is written, and the caller receives the same neutral `403 staff_pin_invalid` response. The focused regression simulates that exact interleaving and confirms rollback with no session/audit insert or returned token. The reviewed diff changed only `SessionHandler` code; CloudFormation reached `UPDATE_COMPLETE`, Lambda readback was `Active`/`Successful`, and the after-diff was empty.
