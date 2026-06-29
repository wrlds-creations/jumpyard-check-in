# T0175 Payment Method Readiness

## Goal

Get as close as possible to Apple Pay readiness before the Wednesday park test after the T0169 phone proof showed:

- card payment worked,
- Apple Pay opened briefly on iPhone and collapsed,
- Swish was not visible.

## Evidence Reviewed

Local implementation:

- `jumpyard-checkin-phone/src/components/RollerPaymentDropIn.tsx`
- `jumpyard-checkin-phone/public/.well-known/apple-developer-merchantid-domain-association`
- `jumpyard-checkin-phone/public/_headers`
- `jumpyard-checkin-phone/vendor/ecom-payments/dist/payment.service.js`
- `jumpyard-checkin-phone/vendor/ecom-payments/dist/adyen.js`
- `infra/lambda/booking/index.js`

Prior project evidence:

- `docs/t0159-internal-live-payment-smoke.md`
- `docs/t0167-receipt-confirmation-handling.md`
- `docs/t0169-post-payment-booking-sync.md`

External references:

- Adyen Apple Pay Web Drop-in docs: <https://docs.adyen.com/payment-methods/apple-pay/web-drop-in>
- Adyen Swish Web Drop-in docs: <https://docs.adyen.com/payment-methods/swish/web-drop-in>
- Adyen payment-method management docs: <https://docs.adyen.com/payment-methods/add-payment-methods>

## Finding

JumpYard does not choose the visible payment methods in frontend code, but JumpYard does own whether the park-test Pages domain can serve the Apple Pay domain-association file.

Plain-language version: our app provides the checkout counter and hands Roller the payment slip. Roller/Adyen decide which card terminals are actually plugged in. For Apple Pay, our website also needs an ID sign on the door so Apple/Adyen can verify the domain.

The phone frontend:

- imports Roller's official `@roller/ecom-payments` package,
- bootstraps it with `apiUrl`, `configurationId`, and `integrationId` from Roller payment settings,
- passes the raw `paymentJwt` only in memory to the package,
- lets the package render the Adyen Drop-in inside `#roller-payment-container`.

The backend:

- calls Roller for draft/payment data,
- fetches venue payment settings,
- exposes only whether payment config exists plus `apiUrl`, `configurationId`, and `integrationId`,
- does not maintain a JumpYard-owned allowlist such as `showSwish=true` or `showApplePay=true`.

Roller's package then fetches the ecom payment configuration and reads the provider-side payment method list. For Adyen, the wrapper supports card configuration and Apple Pay configuration if the method is present and the browser/device allows Apple Pay. Swish visibility must come from the Adyen/Roller payment-method configuration for the relevant merchant, country, currency, and session.

Before the T0175 Apple Pay fix, both phone Pages domains returned `404` for:

- `https://jumpyard-check-in-park-test.pages.dev/.well-known/apple-developer-merchantid-domain-association`
- `https://jumpyard-check-in.pages.dev/.well-known/apple-developer-merchantid-domain-association`

T0175 adds the Adyen Apple Pay domain-association file to the phone app public assets and adds a Cloudflare Pages `_headers` rule so the file is exported and served as text.

This removes one concrete JumpYard-side Apple Pay blocker after deployment. It does not by itself prove Apple Pay, because Roller/Adyen must still register/approve the domain for the merchant configuration and the smoke must run on a compatible Apple Pay device/browser.

## Method Readiness

| Method | T0175 status | Why |
|---|---|---|
| Card | Ready for assisted park test | T0159 and T0169 proved real Roller Live card payment in the park-test PWA. |
| Apple Pay | Partially unblocked by JumpYard; still needs deploy, Roller/Adyen domain registration, and iPhone smoke | The park-test domain-association file was missing and is now added locally. The remaining likely blockers are Roller/Adyen merchant-domain registration, Apple Pay payment-method enablement, and compatible Safari/Wallet/device conditions. |
| Swish | Not ready to promise | Swish was not visible in the Live park-test drop-in. JumpYard code does not hide it; it must be returned by the Roller/Adyen ecom configuration/session before the Drop-in can show it. |

## Decision

Apple Pay is worth pursuing before Wednesday. The immediate JumpYard fix is to deploy the domain-association file, then ask Roller/Adyen to register/approve the park-test Pages domain for Apple Pay and run one controlled iPhone smoke.

Operationally:

- If Apple Pay still fails after deploy/domain registration, staff should be ready to use card payment for the park test.
- If the visitor cannot or will not pay by card, the fallback is the normal Roller/POS/manual park flow, not a JumpYard-built payment workaround.
- Swish remains separate payment configuration work; this T0175 revision focuses on Apple Pay.

## External Questions

Ask Roller/Adyen/Pabel/Josh:

1. Is Apple Pay enabled for the JumpYard Nacka Live ecom/Adyen configuration used by the API key/payment settings?
2. Can Roller/Adyen register or verify `jumpyard-check-in-park-test.pages.dev` for Apple Pay web payments after this branch is deployed and the association file is publicly reachable?
3. If Apple Pay still collapses, can Roller/Adyen confirm the exact client-side or merchant-validation error for the park-test payment session?
4. Separately: is Swish enabled for the same Live configuration, and can card, Apple Pay, and Swish all be active together?

## Out Of Scope

- No custom Swish integration.
- No changes to the vendored Roller payment package.
- No AWS deploy, Roller Live write, draft/payment creation, refund, redemption, webhook processing, SMS/email, or visitor traffic.

## Validation

- Documentation and source-code inspection only.
- `npm --prefix jumpyard-checkin-phone run build` passed and confirmed the association file is exported to `out/.well-known/apple-developer-merchantid-domain-association`.
- `npm run validate` passed.
- `git diff --check` passed with existing CRLF normalization warnings only.
