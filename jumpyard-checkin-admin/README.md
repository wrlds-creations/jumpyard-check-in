# JumpYard Check-in Admin

Staff PWA for inspecting JumpYard Cloud handoffs that are ready for staff.

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

T0087 target:

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

The app is static-exported with `output: "export"`. The staff handoff view reads JumpYard Cloud dev API list/detail endpoints and does not redeem tickets.

The dev JumpYard Cloud API CORS config must include the exact Pages origin before the public admin URL can call staff APIs. T0087 prepares `https://jumpyard-checkin-admin.pages.dev` in `infra/config/dev.json`; if the Cloudflare project gets another hostname, update the CORS origin and deploy the dev stack before testing.

Cloudflare credentials, API tokens, staff passcodes, and JumpYard Cloud secrets must not be stored in this app or in the repository. Staff auth stays server-owned through JumpYard Cloud.

## Public Smoke Checklist

After Cloudflare Pages is connected and the dev CORS change is deployed:

1. Open `https://jumpyard-checkin-admin.pages.dev`.
2. Log in with the AWS-stored dev staff passcode.
3. Confirm the ready-for-staff queue loads.
4. Search a booking, handoff code, name, masked email, or masked phone.
5. Scan or paste a QR payload and confirm the handoff detail opens.
6. Redeem only a dedicated Playground test booking and confirm the success screen appears.
