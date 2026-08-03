const crypto = require('crypto');

const EXPECTED_API = 'https://ij4rnaui2b.execute-api.eu-north-1.amazonaws.com';
const EXPECTED_ASSOCIATION_SHA256 = '8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6';
const CHECKIN_URL = 'https://checkin.jumpyard.se';

async function fetchOk(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response;
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

async function main() {
  const rootResponse = await fetchOk(`${CHECKIN_URL}/`);
  const html = await rootResponse.text();
  const assets = assetUrls(CHECKIN_URL, html);
  const bodies = [html];
  for (const asset of assets.slice(0, 100)) bodies.push(await (await fetchOk(asset)).text());
  if (!bodies.some((body) => body.includes(EXPECTED_API))) {
    throw new Error('Controlled guest-domain deployment does not expose the exact park-test API target.');
  }

  const associationUrl = `${CHECKIN_URL}/.well-known/apple-developer-merchantid-domain-association`;
  const association = Buffer.from(await (await fetchOk(associationUrl)).arrayBuffer());
  const associationSha = crypto.createHash('sha256').update(association).digest('hex');
  if (associationSha !== EXPECTED_ASSOCIATION_SHA256) {
    throw new Error(`Apple Pay association SHA256 mismatch: ${associationSha}.`);
  }

  console.log(`Guest domain: HTTP 200 with exact park-test API target (${assets.length} assets checked).`);
  console.log(`Apple Pay association: HTTP 200 and SHA256 ${associationSha}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
