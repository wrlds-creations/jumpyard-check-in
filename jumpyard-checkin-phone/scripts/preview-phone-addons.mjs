import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';

// Opt in to a single assigned private IPv4 address for a same-WiFi review.
// Keep loopback as the default; never bind every interface or a public address.
export function previewHosts(lanAddress = '', interfaces = networkInterfaces()) {
  if (!lanAddress) return ['127.0.0.1'];
  const [first, second] = lanAddress.split('.').map(Number);
  const privateAddress = first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  const assigned = Object.values(interfaces).flat().some(entry => entry && !entry.internal && entry.address === lanAddress);
  if (isIP(lanAddress) !== 4 || !privateAddress || !assigned) {
    throw new Error('PREVIEW_LAN_HOST must be a private IPv4 address assigned to this computer.');
  }
  return ['127.0.0.1', lanAddress];
}

// Local #318 review only. These are invented fixture ids, not verified ROLLER
// products. Nothing in this server forwards to Cloud, ROLLER or a terminal.
const fixtureProducts = [
  { key: 'E60', id: '90000001', price: 200, label: 'Entré 60 min', type: 'entry', durationMinutes: 60 },
  { key: 'socks', id: '90000002', price: 45, label: 'Hoppsockor', type: 'addon' },
  { key: 'water_bottle', id: '90000003', price: 20, label: 'Vattenflaska, testprodukt', type: 'addon' },
  { key: 'skyrider', id: '90000004', price: 40, label: 'SkyRider', type: 'addon' },
  { key: 'lock', id: '90000005', price: 49, label: 'Hänglås', type: 'addon' },
  { key: 'coffee', id: '90000006', price: 35, label: 'Kaffe', type: 'addon' },
];

function demoBooking(reference, date) {
  const item = (name, quantity, type) => ({
    productName: name, parentProductName: name, productType: type, quantity,
    bookingDate: date, startTime: '14:00', endTime: '15:00', tickets: [],
  });
  return {
    bookingReference: reference, rollerUniqueId: reference, status: 'active', paymentStatus: 'paid', amountOwing: 0,
    customer: { firstName: 'Demo', lastName: 'Familj' },
    items: [item('Entré 60 min', 2, 'entry'), ...(['DEMO318SOCKS', 'DEMO318PAID'].includes(reference) ? [item('Hoppsockor', 1, 'addon')] : []), ...(reference === 'DEMO318PAID' ? [item('Jumpy Vattenflaska', 1, 'addon')] : [])],
  };
}

export function previewResponse(method, pathname, body = {}) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
  const source = { system: 'local-preview', environment: 'fixture-only', freshnessStatus: 'fresh' };
  const guestAccess = { token: 'local-preview-not-a-real-token', expiresAt: null };
  if (method === 'POST' && pathname === '/v1/bookings/availability') {
    const date = body.date || today;
    return [200, { status: 'available', availability: { date, slots: (body.startTimes || ['14:00']).map((startTime) => ({
      date, startTime, products: fixtureProducts.map((product) => ({
        available: true, capacityRemaining: 40, durationMinutes: product.durationMinutes || 0,
        endTime: null, jumpersPerUnit: product.type === 'entry' ? 1 : 0, key: product.key,
        label: product.label, onlineSalesOpen: true, parentProductId: product.id, productId: product.id,
        productName: product.label, requiresAvailability: ['entry', 'skyrider'].includes(product.type === 'entry' ? 'entry' : product.key),
        startTime, type: product.type, unitPrice: product.price, unitPriceCents: product.price * 100,
      })),
    })) } }];
  }
  if (method === 'POST' && pathname === '/v1/check-in/lookup') {
    const reference = String(body.identifier || '').toUpperCase();
    if (!['DEMO318', 'DEMO318SOCKS', 'DEMO318PAID'].includes(reference)) {
      return [404, { status: 'not_found', error: { message: 'Use DEMO318 or DEMO318SOCKS in this local preview.' } }];
    }
    return [200, { status: 'found', booking: demoBooking(reference, body.expectedDate || today),
      eligibility: { canCheckIn: true, reason: 'ready', amountOwing: 0 }, guestAccess, source }];
  }
  if (method === 'POST' && pathname === '/v1/check-in/sessions' && ['DEMO318', 'DEMO318SOCKS', 'DEMO318PAID'].includes(body.bookingReference)) {
    return [200, { status: 'session_started', booking: demoBooking(body.bookingReference, body.expectedDate || today),
      session: { checkinSessionId: `preview-${body.bookingReference}`, status: 'active', safetyStatus: 'not_started', handoffStatus: 'not_ready', expiresAt: null },
      guestAccess, source }];
  }
  if (method === 'POST' && (pathname === '/v1/bookings/quote' || /^\/v1\/bookings\/DEMO318(SOCKS|PAID)?\/add-products\/quote$/.test(pathname))) {
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.some((item) => !fixtureProducts.some((product) => product.id === String(item.productId)) || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return [400, { status: 'rejected', error: { code: 'invalid_fixture', message: 'Only local demo products are supported.' } }];
    }
    const total = items.reduce((sum, item) => sum + fixtureProducts.find((product) => product.id === String(item.productId)).price * item.quantity, 0);
    return [200, { status: 'quoted', quote: { externalId: 'local-preview', itemCount: items.length, expiresAt: null,
      costs: { total, amountOwing: total, tax: 0, transactionFee: 0, cardFee: 0, discount: 0 } } }];
  }
  // Fail closed, including drafts, payment attempts, finalization and redemption.
  return [403, { status: 'blocked', error: { code: 'local_preview_only', message: 'Lokal förhandsvisning. Bokningar och betalningar är avstängda. Local preview: bookings and payments are disabled.' } }];
}

async function startPreview() {
  const port = 3318;
  const origin = `http://localhost:${port}`;
  const hosts = previewHosts(process.env.PREVIEW_LAN_HOST);
  const allowedHosts = new Set(['localhost', ...hosts].map(host => `${host}:${port}`));
  // A nonempty slash makes cloudClient use same-origin /v1 paths. Both
  // local and optional LAN views stay isolated from the real API.
  process.env.NEXT_PUBLIC_JUMPYARD_CLOUD_API_BASE_URL = '/';
  process.env.NEXT_PUBLIC_PHONE_ADDON_PREVIEW = 'true';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  const { default: next } = await import('next');
  const app = next({ dev: true, dir: resolve(fileURLToPath(new URL('..', import.meta.url))),
    hostname: process.env.PREVIEW_LAN_HOST || 'localhost', port });
  await app.prepare();
  const handle = app.getRequestHandler();
  const requestHandler = async (req, res) => {
    if (!allowedHosts.has(req.headers.host)) {
      res.writeHead(403).end('Local preview host required');
      return;
    }
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/preview') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await readFile(new URL('./preview-phone-addons.html', import.meta.url)));
      return;
    }
    if (!url.pathname.startsWith('/v1/')) return handle(req, res);
    // Only this same-origin demo can call the fixture API.
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      res.writeHead(403).end('Local preview origin required');
      return;
    }
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) throw new Error('Request too large');
      }
      const [status, response] = previewResponse(req.method, url.pathname, raw ? JSON.parse(raw) : {});
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(response));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'invalid_request' }));
    }
  };
  const upgrade = app.getUpgradeHandler();
  const servers = hosts.map(host => {
    const server = createServer(requestHandler);
    server.on('upgrade', (req, socket, head) => {
      if (!allowedHosts.has(req.headers.host) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
        socket.destroy();
        return;
      }
      upgrade(req, socket, head);
    });
    server.listen(port, host, () => console.log(`Issue #318 local preview: http://${host}:${port}\nFixtures only. No Cloud, ROLLER or payments. Lookup DEMO318 or DEMO318SOCKS.`));
    return server;
  });
  const close = () => { for (const server of servers) server.close(); void app.close().finally(() => process.exit(0)); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startPreview().catch((error) => { console.error(error); process.exitCode = 1; });
}
