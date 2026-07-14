# JumpYard Check-in Admin

Staff/admin PWA for personal PIN sign-in, JumpYard Cloud handoff/redeem work, and administrator-managed staff identity.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional local API override:

```bash
NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com
```

## Cloudflare Pages

Dev / Playground target:

| Setting | Value |
|---|---|
| Cloudflare Pages project name | `jumpyard-checkin-admin` |
| Expected Pages URL | `https://jumpyard-checkin-admin.pages.dev` |
| GitHub repository | `wrlds-creations/jumpyard-check-in` |
| Production branch | `main` |
| Root directory | `jumpyard-checkin-admin` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Public environment variable | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` |
| Staff identity mode | `NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE=legacy` |

Park-test / Roller Live target:

| Setting | Value |
|---|---|
| Cloudflare Pages project name | `jumpyard-checkin-admin-park-test` |
| Expected Pages URL | `https://jumpyard-checkin-admin-park-test.pages.dev` |
| GitHub repository | `wrlds-creations/jumpyard-check-in` |
| Production branch | `main` |
| Root directory | `jumpyard-checkin-admin` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Public environment variable | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |
| Staff identity mode | `NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE=pin` |
| Admin Cognito domain | `NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_DOMAIN=https://jumpyard-check-in-park-test-admin-376129878018.auth.eu-north-1.amazoncognito.com` |
| Admin Cognito app client | `NEXT_PUBLIC_JUMPYARD_ADMIN_COGNITO_CLIENT_ID=4cm36dkcrptlpq9j163q45ae56` |

The app is static-exported with `output: "export"`. The same admin source can target dev or park-test through the public API environment variable. The staff handoff view reads JumpYard Cloud list/detail endpoints and does not call Roller directly.

The dev JumpYard Cloud API CORS config must include the exact Pages origin before the public admin URL can call staff APIs. T0087 prepares `https://jumpyard-checkin-admin.pages.dev` in `infra/config/dev.json`; if the Cloudflare project gets another hostname, update the CORS origin and deploy the dev stack before testing.

The park-test JumpYard Cloud API CORS config must include `https://jumpyard-checkin-admin-park-test.pages.dev` before the park-test admin URL can call staff APIs. The static Cloudflare `_headers` CSP allows both the dev API and park-test API so the same source can be deployed to either target without editing app code.

Cloudflare credentials, API tokens, staff PINs, admin Cognito tokens, and JumpYard Cloud secrets must not be stored in source or in the repository. Authorization remains server-owned through JumpYard Cloud.

## Staff Identity Modes

Dev explicitly uses `NEXT_PUBLIC_JUMPYARD_STAFF_IDENTITY_MODE=legacy` so the existing Playground passcode flow remains available. Park-test uses `pin`: ordinary staff see only one masked six-digit PIN field at `/`, while administrators use the separate `/admin` surface.

PIN login sends only `{pin}` to `POST /v1/staff/auth/login`. JumpYard Cloud returns one high-entropy opaque session token; the raw token is held only in browser `sessionStorage`, while Aurora stores only its hash. Heartbeat and logout use `POST /v1/staff/auth/session`. The browser locks after 15 minutes without staff activity and the session has an eight-hour absolute maximum. Logout clears queue, detail, scanner, search, and guest state in all open tabs.

The administrator Cognito flow uses OAuth authorization code with PKCE and the exact callback:

```text
https://jumpyard-checkin-admin-park-test.pages.dev/auth/callback
```

The admin app requests only the `openid` scope. It has no client secret, and each sign-in uses `prompt=login`. The callback removes OAuth `code` and `state` query parameters before exchanging the code, then starts a server-owned admin session through `POST /v1/admin/auth/session` and returns to `/admin`. Admin access and refresh tokens are held only in `sessionStorage`; they are never written to URLs or `localStorage`.

The admin browser also locks after 15 minutes and has an eight-hour maximum. Admin logout revokes the JumpYard Cloud admin session and Cognito refresh token, then completes managed logout. Staff and admin use separate storage keys and logout channels.

An authenticated administrator creates ordinary staff with first name, last name, and a staff-chosen six-digit PIN. New staff receive `staff_operator` by default. The administrator can reset a PIN and enable or disable the account; each of those changes invalidates old sessions. Raw PINs are never returned or stored.

JumpYard Cloud remains authoritative for actor, venue, role, permissions, revocation, and final redeem. Because `_headers` is static, its CSP lists the exact park-test admin Cognito domain. Update the environment variable and `public/_headers` together if that domain changes.

## Mobile And Visual Contract

The staff root, authenticated queue, administrator page, and authorization callback use the same system-font stack as the phone check-in application. Normal user-facing copy and active icons are solid black, JumpYard red is used for primary actions and focus, and gray is reserved for disabled, inactive, or placeholder states.

The layout must stay inside the viewport at 320, 360, and 390 CSS pixels. Staff and admin cards, text fields, PIN fields, buttons, headers, and callback content must not create horizontal page overflow.

Cognito Managed Login is provider-hosted and has a narrower customization boundary. The deployed settings use black text, JumpYard-red buttons, links, and focus, plus rounded forms and controls. Cognito does not expose Swedish localization or a custom font family for this flow, so its page remains English in provider-owned Open Sans. The application does not replace this credential boundary with a custom sign-in form merely for font or language parity.

## Public Smoke Checklist

For dev/Playground legacy validation after Cloudflare Pages is connected and the dev CORS change is deployed:

1. Open `https://jumpyard-checkin-admin.pages.dev`.
2. Log in with the AWS-stored dev staff passcode.
3. Confirm the ready-for-staff queue loads.
4. Search a booking, handoff code, name, masked email, or masked phone.
5. Scan or paste a QR payload and confirm the handoff detail opens.
6. Redeem only a dedicated Playground test booking and confirm the success screen appears.

For park-test PIN identity, use a non-write rehearsal session unless a real Roller redemption is separately approved:

1. Open `https://jumpyard-checkin-admin-park-test.pages.dev/admin`, complete admin password/TOTP, and create a synthetic staff record with first name, last name, and PIN.
2. Open `https://jumpyard-checkin-admin-park-test.pages.dev`, confirm only the PIN field is shown, and sign in with the synthetic PIN.
3. Confirm the correct display name appears and the ready-for-staff queue loads.
4. Duplicate the staff tab, log out in either copy, and confirm both tabs immediately return to a clean PIN screen.
5. Reset the synthetic PIN in `/admin`; confirm the old PIN and all old staff sessions stop working and the new PIN succeeds.
6. Disable the synthetic staff record and confirm access fails without exposing whether the PIN exists.
7. Repeat `/`, the authenticated queue, `/admin` create/reset, and `/auth/callback` at 320, 360, and 390 CSS pixels; confirm the page width equals the viewport and every input/button remains inside it.
8. Confirm normal application copy is black and uses the phone font stack; confirm Cognito remains English in Open Sans with the supported black/red/radius branding.
