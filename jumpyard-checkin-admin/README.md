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

Use `npm run build` as the build command and `out` as the output directory.

The app is static-exported with `output: "export"`. The staff handoff view reads JumpYard Cloud dev API list/detail endpoints and does not redeem tickets.
