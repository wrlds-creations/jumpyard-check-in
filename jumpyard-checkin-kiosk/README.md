# JumpYard Check-in Kiosk

In-park kiosk flow for JumpYard Next check-in.

## Scope

- Start and idle screens
- Booking check
- Ticket purchase flow
- Booking summary
- Safety video and attestations
- SkyRider attestation
- Add-ons and payment handoff
- Code presentation
- Success and print/handoff guidance

The current app uses local mock flow data in `src/flow/mockClient.ts`. Replace that adapter with real JumpYard/JY Cloud integrations when contracts are confirmed.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run build
```

## Deployment

The kiosk deployment target is still `TBD` in the root project context. The existing Dockerfile expects a standalone Next.js output, but `next.config.ts` currently uses the default config. Resolve that mismatch before relying on Docker builds.

## Notes

- Shared project context lives in the repository root.
- Do not add real credentials to this app.
- Static media lives in `public/`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
