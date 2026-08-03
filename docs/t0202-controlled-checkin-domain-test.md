# T0202 Controlled `checkin.jumpyard.se` Test Alias

Issue [#220](https://github.com/wrlds-creations/jumpyard-check-in/issues/220) approves one narrow outcome: the reviewed phone app from park-test may also be served at `https://checkin.jumpyard.se` so Love can test Apple Pay on an iPhone.

This is not a production cutover. The hostname is temporarily a second front door to the existing park-test system:

```text
checkin.jumpyard.se
  -> selected immutable park-test phone build
  -> existing park-test JumpYard Cloud API
  -> Roller Live, Nacka Forum venue 50871
```

The existing `jumpyard-check-in-production` Cloudflare Pages project and custom-domain association are reused. No production AWS stack, API, database, secret, webhook, sender, or staff/admin deployment is created.

## Safety boundary

- Only `https://checkin.jumpyard.se` is added to the park-test API CORS allowlist. The phone, admin, and kiosk origins remain allowed.
- All park-test profiles carry the same four-origin list so a later scoped profile promotion does not accidentally remove the controlled alias.
- Email and SMS links remain on `https://jumpyard-check-in-park-test.pages.dev/`.
- `guestMessagingSendsEnabled` remains `false`; the disarmed T0201 single-booking control is not reopened.
- The domain workflow performs no AWS or Roller mutation and sends no guest message.
- The Apple Pay association file must remain byte-identical at SHA-256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`.
- Love owns the final Apple Pay tap/payment. Deployment automation does not submit a financial transaction.

## First promotion

The first rollout needs two protected operations because the domain workflow is intentionally Cloudflare-only:

1. Merge the reviewed implementation PR to `main` and select its successful `Build park-test release` run.
2. Run `Deploy or roll back park-test` for that exact release run/SHA. Review the read-only stack plan, approve the protected `park-test` environment, and leave migrations off unless the plan explicitly shows a separately approved need. This promotes the CORS-only AWS template change through the normal immutable path.
3. Confirm the deployed API returns the exact allow-origin header for the new guest origin, the three existing origins still work, and an unapproved origin receives no allow-origin header.
4. Run `Deploy or roll back controlled guest domain test` with the same successful release run/SHA and phrase `I_APPROVE_CHECKIN_DOMAIN_TEST_<full SHA>`.
5. Approve the protected `park-test` environment after reviewing the target summary. The workflow revalidates the artifact, checks the exact empty/custom-domain project, requires live CORS, deploys only `release/phone/out`, and verifies the Cloudflare commit SHA, public root, embedded park-test API target, and Apple Pay file.
6. Love opens `https://checkin.jumpyard.se` on the iPhone and performs the controlled Apple Pay test.

No local CDK or Wrangler command is part of this routine path.

## Rollback and re-promotion

The safe first containment action is to run `Deploy or roll back park-test` with an earlier successful immutable release that predates the CORS addition. That removes the new allow-origin value and makes browser API calls from the alias fail closed without deleting DNS or the Cloudflare project.

Cloudflare rollback or re-promotion uses `Deploy or roll back controlled guest domain test` with the selected successful immutable artifact and matching intent. It never rebuilds source during deployment. A later compatible alias artifact can replace the current phone output; re-promotion selects the approved issue-#220 artifact again.

## First rollout evidence

- AWS CORS release: [30832695522](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30832695522).
- Protected park-test CORS promotion: [30833080999](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30833080999). The 199-to-199-resource plan changed only API Gateway CORS.
- Initial domain deployment: [30833724481](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30833724481). The artifact published successfully; the immediate public verification saw a transient Cloudflare HTTP 522 during propagation.
- Propagation-verification fix: PR [#222](https://github.com/wrlds-creations/jumpyard-check-in/pull/222).
- Selected successful release: [30834669772](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30834669772), SHA `9ffe379e6deb13da509114e70665b56bcaeb471a`.
- Successful protected domain re-promotion: [30835107405](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/30835107405).

The final public proof returned HTTP 200, embedded the exact park-test API target, and served the 9,094-byte Apple association file with SHA-256 `8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`. All four approved browser origins received their exact allow-origin value; an unapproved origin received none. The in-app browser displayed the JumpYard booking/entry start page.

The implementation contract is now `active-awaiting-apple-pay-result`. Love's separate iPhone Apple Pay payment remains the only pending acceptance item and no automated workflow submits that financial transaction.
