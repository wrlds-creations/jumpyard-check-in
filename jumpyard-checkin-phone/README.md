# JumpYard Check-in Phone

Guest-facing phone flow for JumpYard Next check-in.

## Scope

- Booking lookup and park selection
- Ticket purchase flow
- Booking summary
- Safety video and attestations
- SkyRider attestation
- Add-ons and payment handoff
- QR/code presentation
- Success and handout guidance
- Extension flow at `/extend`

The booking lookup step uses `src/flow/cloudClient.ts` and calls JumpYard Cloud server-side lookup. SMS token validation still uses local mock flow data in `src/flow/mockClient.ts`.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Optional local lookup overrides:

```bash
NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com
NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE=2026-05-21
```

When `NEXT_PUBLIC_JUMPYARD_LOOKUP_EXPECTED_DATE` is omitted, the phone app uses today's date in `Europe/Stockholm` for the lookup request. The explicit override remains useful for fixed Playground scenarios.

For external device testing:

```bash
npm run dev:tunnel
```

## Validation

```bash
npm run lint
npm run build
```

## Deployment

The app is configured for static export in `next.config.ts`:

```ts
output: "export"
```

Production deployment target is still documented as `TBD` in the root project context.

## Cloudflare Pages Targets

Use the same source code for dev and park-test. The Cloudflare Pages environment variable controls which JumpYard Cloud API the built static app calls.

| Target | Cloudflare Pages project | Pages URL | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL` |
|---|---|---|---|
| Dev / Playground | `jumpyard-check-in` | `https://jumpyard-check-in.pages.dev` | `https://m0uo5g4mde.execute-api.eu-north-1.amazonaws.com` |
| Park-test / Roller Live | `jumpyard-check-in-park-test` | `https://jumpyard-check-in-park-test.pages.dev` | `https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |

Recommended park-test Pages settings:

| Setting | Value |
|---|---|
| GitHub repository | `wrlds-creations/jumpyard-check-in` |
| Production branch | `main` |
| Root directory | `jumpyard-checkin-phone` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Public environment variable | `NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL=https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com` |

Do not store Roller credentials, API tokens, or JumpYard Cloud secrets in Cloudflare Pages. The phone app calls only JumpYard Cloud; Roller Live remains server-side behind the park-test API.

## Notes

- Shared project context lives in the repository root.
- Do not add real credentials to this app.
- Static media lives in `public/`.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
