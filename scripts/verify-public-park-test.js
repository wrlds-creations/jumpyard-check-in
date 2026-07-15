const EXPECTED_API = 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com';
const PHONE_URL = 'https://jumpyard-check-in-park-test.pages.dev';
const ADMIN_URL = 'https://jumpyard-checkin-admin-park-test.pages.dev';

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.text();
}

function assetUrls(baseUrl, html) {
  const urls = new Set();
  const pattern = /(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(pattern)) {
    const candidate = new URL(match[1], baseUrl);
    if (candidate.origin === new URL(baseUrl).origin && /\.(?:js|json)(?:\?|$)/.test(candidate.href)) {
      urls.add(candidate.href);
    }
  }
  return [...urls];
}

async function assertConfigured(url, label) {
  const html = await fetchText(url);
  const assets = assetUrls(url, html);
  const bodies = [html];
  for (const asset of assets.slice(0, 100)) bodies.push(await fetchText(asset));
  if (!bodies.some((body) => body.includes(EXPECTED_API))) {
    throw new Error(`${label} deployment does not expose the exact park-test API target.`);
  }
  console.log(`${label}: HTTP 200 with park-test API target (${assets.length} assets checked).`);
}

async function main() {
  await assertConfigured(PHONE_URL, 'Phone');
  await assertConfigured(ADMIN_URL, 'Admin');
  await assertConfigured(`${ADMIN_URL}/admin`, 'Admin route');
  const appleResponse = await fetch(`${PHONE_URL}/.well-known/apple-developer-merchantid-domain-association`);
  if (!appleResponse.ok) throw new Error(`Apple Pay association returned HTTP ${appleResponse.status}.`);
  console.log('Apple Pay association: HTTP 200.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
