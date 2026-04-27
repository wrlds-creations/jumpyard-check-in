# JumpYard Check-in Admin

Staff PWA for redeeming completed check-ins and handing out wristbands, Connected bands, socks, and other physical items.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Cloudflare Pages

Use `npm run build` as the build command and `out` as the output directory.

The app is static-exported with `output: "export"`. The current MVP uses a mock admin API in `src/lib/adminApi.ts`; replace that adapter with JY Cloud calls when the real endpoints are available.
