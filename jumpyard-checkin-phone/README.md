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

## Notes

- Shared project context lives in the repository root.
- Do not add real credentials to this app.
- Static media lives in `public/`.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
