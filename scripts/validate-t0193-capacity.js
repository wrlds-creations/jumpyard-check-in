const assert = require('node:assert/strict');

const SHARED_PUBLIC_IP = '203.0.113.10';
const WINDOW_SECONDS = 20 * 60;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

const DEFAULT_LIMIT = Object.freeze({ rate: 50, burst: 150 });
const ROUTE_LIMITS = Object.freeze({
  OPTIONS: DEFAULT_LIMIT,
  lookup: Object.freeze({ rate: 25, burst: 80 }),
  availability: Object.freeze({ rate: 20, burst: 60 }),
  quote: Object.freeze({ rate: 10, burst: 40 }),
  draft: Object.freeze({ rate: 5, burst: 20 }),
  addon_quote: Object.freeze({ rate: 10, burst: 40 }),
  addon_draft: Object.freeze({ rate: 5, burst: 20 }),
  resolve: Object.freeze({ rate: 40, burst: 100 }),
  session_start: Object.freeze({ rate: 40, burst: 100 }),
  ready: Object.freeze({ rate: 40, burst: 100 }),
  staff_login: Object.freeze({ rate: 2, burst: 10 }),
  staff_list: Object.freeze({ rate: 20, burst: 50 }),
  staff_detail: Object.freeze({ rate: 20, burst: 50 }),
  staff_redeem: Object.freeze({ rate: 5, burst: 20 }),
  webhook_bookings: Object.freeze({ rate: 10, burst: 50 }),
  webhook_redemptions: Object.freeze({ rate: 10, burst: 50 }),
  internal_session_link: Object.freeze({ rate: 1, burst: 5 }),
  internal_send_sms: Object.freeze({ rate: 1, burst: 5 }),
  internal_send_email: Object.freeze({ rate: 1, burst: 5 }),
  internal_due_sms: Object.freeze({ rate: 1, burst: 5 }),
  internal_due_messages: Object.freeze({ rate: 1, burst: 5 }),
  legacy_redeem: Object.freeze({ rate: 1, burst: 5 }),
});

class TokenBucket {
  constructor({ rate, burst }) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.lastRefillAtMs = 0;
  }

  take(atMs) {
    assert.ok(Number.isFinite(atMs) && atMs >= this.lastRefillAtMs, 'Events must be processed in time order.');

    const elapsedSeconds = (atMs - this.lastRefillAtMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSeconds * this.rate);
    this.lastRefillAtMs = atMs;

    if (this.tokens + Number.EPSILON < 1) return false;

    this.tokens -= 1;
    return true;
  }
}

function createEventFactory() {
  let sequence = 0;

  return ({ atSeconds, deviceId, legitimate = true, route, sourceIp = SHARED_PUBLIC_IP }) => ({
    atMs: Math.round(atSeconds * 1000),
    deviceId,
    legitimate,
    route,
    sequence: sequence++,
    sourceIp,
  });
}

function addBrowserRequest(events, createEvent, request) {
  if (request.preflight !== false) {
    events.push(
      createEvent({
        ...request,
        atSeconds: Math.max(0, request.atSeconds - 0.2),
        route: 'OPTIONS',
      }),
    );
  }

  events.push(createEvent(request));
}

function buildArrivalSchedule() {
  const arrivals = [];

  for (const atSeconds of [0, 15, 30, 60, 90]) {
    for (let guest = 0; guest < 8; guest += 1) arrivals.push(atSeconds);
  }

  for (let group = 0; group < 20; group += 1) {
    for (let guest = 0; guest < 4; guest += 1) arrivals.push(120 + group * 48);
  }

  assert.equal(arrivals.length, 120);
  assert.ok(arrivals.slice(0, 40).every((atSeconds) => atSeconds <= 120));
  assert.ok(arrivals.every((atSeconds) => atSeconds < WINDOW_SECONDS));
  return arrivals;
}

function buildLegitimateScenario(arrivals = buildArrivalSchedule()) {
  const events = [];
  const createEvent = createEventFactory();
  const personaCounts = {
    existing_basic: 0,
    existing_addon: 0,
    link_resume: 0,
    new_booking: 0,
  };
  const readyTimes = [];

  arrivals.forEach((arrival, index) => {
    const deviceId = `guest-${String(index + 1).padStart(3, '0')}`;
    const persona = index % 10;

    if (persona <= 4) {
      personaCounts.existing_basic += 1;
      addBrowserRequest(events, createEvent, { atSeconds: arrival, deviceId, route: 'lookup' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 1, deviceId, route: 'availability' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 1, deviceId, route: 'session_start' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 90, deviceId, route: 'ready' });
      readyTimes.push(arrival + 90);
      return;
    }

    if (persona <= 6) {
      personaCounts.existing_addon += 1;
      addBrowserRequest(events, createEvent, { atSeconds: arrival, deviceId, route: 'lookup' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 1, deviceId, route: 'availability' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 1, deviceId, route: 'session_start' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 30, deviceId, route: 'addon_quote' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 50, deviceId, route: 'addon_draft' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 100, deviceId, route: 'ready' });
      readyTimes.push(arrival + 100);
      return;
    }

    if (persona <= 8) {
      personaCounts.link_resume += 1;
      addBrowserRequest(events, createEvent, { atSeconds: arrival, deviceId, route: 'resolve' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 1, deviceId, route: 'availability' });
      addBrowserRequest(events, createEvent, { atSeconds: arrival + 90, deviceId, route: 'ready' });
      readyTimes.push(arrival + 90);
      return;
    }

    personaCounts.new_booking += 1;
    addBrowserRequest(events, createEvent, { atSeconds: arrival, deviceId, route: 'availability' });
    addBrowserRequest(events, createEvent, { atSeconds: arrival + 30, deviceId, route: 'quote' });
    addBrowserRequest(events, createEvent, { atSeconds: arrival + 31, deviceId, route: 'draft' });
    addBrowserRequest(events, createEvent, { atSeconds: arrival + 60, deviceId, route: 'lookup' });
    events.push(createEvent({ atSeconds: arrival + 62, deviceId, route: 'lookup' }));
    events.push(createEvent({ atSeconds: arrival + 64, deviceId, route: 'lookup' }));
    addBrowserRequest(events, createEvent, { atSeconds: arrival + 65, deviceId, route: 'session_start' });
    addBrowserRequest(events, createEvent, { atSeconds: arrival + 155, deviceId, route: 'ready' });
    readyTimes.push(arrival + 155);
  });

  for (let staffIndex = 0; staffIndex < 2; staffIndex += 1) {
    const deviceId = `staff-${staffIndex + 1}`;
    addBrowserRequest(events, createEvent, { atSeconds: 0, deviceId, route: 'staff_login' });

    for (let atSeconds = 2; atSeconds < WINDOW_SECONDS; atSeconds += 30) {
      addBrowserRequest(events, createEvent, {
        atSeconds,
        deviceId,
        preflight: atSeconds % 300 === 2,
        route: 'staff_list',
      });
    }
  }

  readyTimes.forEach((readyAt, index) => {
    const deviceId = `staff-${(index % 2) + 1}`;
    addBrowserRequest(events, createEvent, { atSeconds: readyAt + 5, deviceId, route: 'staff_detail' });
    addBrowserRequest(events, createEvent, { atSeconds: readyAt + 7, deviceId, route: 'staff_redeem' });
  });

  assert.deepEqual(personaCounts, {
    existing_basic: 60,
    existing_addon: 24,
    link_resume: 24,
    new_booking: 12,
  });
  assert.ok(events.every((event) => event.atMs <= WINDOW_SECONDS * 1000));

  return { arrivals, events, personaCounts };
}

function buildConcentratedArrivalSchedule() {
  const arrivals = Array.from({ length: 40 }, () => 0);

  for (let group = 0; group < 20; group += 1) {
    for (let guest = 0; guest < 4; guest += 1) arrivals.push(120 + group * 48);
  }

  assert.equal(arrivals.length, 120);
  assert.equal(arrivals.slice(0, 40).every((atSeconds) => atSeconds === 0), true);
  return arrivals;
}

function simulate(events) {
  const buckets = new Map();
  const results = [];
  const orderedEvents = [...events].sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence);

  for (const event of orderedEvents) {
    const limit = ROUTE_LIMITS[event.route];
    assert.ok(limit, `Missing T0193 capacity policy for route ${event.route}.`);

    let bucket = buckets.get(event.route);
    if (!bucket) {
      bucket = new TokenBucket(limit);
      buckets.set(event.route, bucket);
    }

    results.push({ ...event, accepted: bucket.take(event.atMs) });
  }

  return results;
}

function maxRollingCount(events, windowMs) {
  const ordered = [...events].sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence);
  let start = 0;
  let maximum = 0;

  for (let end = 0; end < ordered.length; end += 1) {
    while (ordered[end].atMs - ordered[start].atMs >= windowMs) start += 1;
    maximum = Math.max(maximum, end - start + 1);
  }

  return maximum;
}

function validateLegitimateCapacity() {
  const scenario = buildLegitimateScenario();
  const results = simulate(scenario.events);
  const throttled = results.filter((result) => !result.accepted);
  const sourceIps = new Set(results.map((result) => result.sourceIp));

  assert.equal(sourceIps.size, 1, 'Every guest and staff client must share one public park IP in the model.');
  assert.deepEqual([...sourceIps], [SHARED_PUBLIC_IP]);
  assert.equal(scenario.arrivals.length, 120);
  assert.equal(scenario.events.length, 1652, 'The fixed scenario request count must remain deterministic.');
  assert.equal(throttled.length, 0, 'Legitimate shared-IP park traffic must not receive protection-caused 429s.');

  return {
    maxFiveMinuteSharedIpRequests: maxRollingCount(scenario.events, FIVE_MINUTES_MS),
    requests: scenario.events.length,
  };
}

function validateConcentratedArrivalCapacity() {
  const scenario = buildLegitimateScenario(buildConcentratedArrivalSchedule());
  const concentratedArrivalEvents = scenario.events.filter(
    (event) => event.deviceId.startsWith('guest-') && event.atMs <= 2 * 1000,
  );
  const results = simulate(concentratedArrivalEvents);
  const throttled = results.filter((result) => !result.accepted);
  const throttledByRoute = Object.fromEntries(
    Object.entries(
      throttled.reduce((counts, result) => {
        counts[result.route] = (counts[result.route] ?? 0) + 1;
        return counts;
      }, {}),
    ).sort(([left], [right]) => left.localeCompare(right)),
  );

  assert.equal(
    throttled.length,
    0,
    `Forty simultaneous mixed guest arrivals must fit the configured per-route burst envelopes: ${JSON.stringify(throttledByRoute)}.`,
  );
  return concentratedArrivalEvents.length;
}

function buildFlood({ durationSeconds = 30, offeredRate, route, startAtSeconds = 0 }) {
  const createEvent = createEventFactory();
  const events = [];
  const requestCount = durationSeconds * offeredRate;

  for (let index = 0; index < requestCount; index += 1) {
    events.push(
      createEvent({
        atSeconds: startAtSeconds + index / offeredRate,
        deviceId: `abuse-${route}`,
        legitimate: false,
        route,
      }),
    );
  }

  return events;
}

function validateSustainedAbuseIsBounded() {
  const summaries = [];

  for (const [route, limit] of Object.entries(ROUTE_LIMITS)) {
    const durationSeconds = 30;
    const offeredRate = Math.max(limit.rate * 4, 20);
    const results = simulate(buildFlood({ durationSeconds, offeredRate, route }));
    const accepted = results.filter((result) => result.accepted).length;
    const throttled = results.length - accepted;
    const theoreticalMaximum = Math.ceil(limit.burst + limit.rate * durationSeconds);

    assert.ok(throttled > 0, `${route} must throttle sustained traffic above its configured rate.`);
    assert.ok(
      accepted <= theoreticalMaximum,
      `${route} accepted ${accepted} requests, above token-bucket bound ${theoreticalMaximum}.`,
    );
    summaries.push({ route, accepted, offered: results.length, throttled });
  }

  return summaries;
}

function validateRouteIsolation() {
  const scenario = buildLegitimateScenario();
  const webhookFlood = buildFlood({ durationSeconds: 120, offeredRate: 80, route: 'webhook_bookings' });
  const internalFlood = buildFlood({ durationSeconds: 120, offeredRate: 40, route: 'internal_send_sms' });
  const results = simulate([...scenario.events, ...webhookFlood, ...internalFlood]);
  const legitimateThrottles = results.filter((result) => result.legitimate && !result.accepted);
  const abusiveThrottles = results.filter((result) => !result.legitimate && !result.accepted);

  assert.equal(
    legitimateThrottles.length,
    0,
    'Webhook/internal abuse must not consume guest, session, payment, or staff route buckets.',
  );
  assert.ok(abusiveThrottles.length > 0, 'The isolated abusive routes must still be bounded.');
}

function main() {
  const legitimate = validateLegitimateCapacity();
  const concentratedRequests = validateConcentratedArrivalCapacity();
  const abuseSummaries = validateSustainedAbuseIsBounded();
  validateRouteIsolation();

  const totalAbuseOffered = abuseSummaries.reduce((total, summary) => total + summary.offered, 0);
  const totalAbuseThrottled = abuseSummaries.reduce((total, summary) => total + summary.throttled, 0);

  console.log(
    `[pass] T0193 accepts 120 deterministic shared-IP guest flows (${legitimate.requests} requests including cold-browser preflights) with zero protection-caused 429s`,
  );
  console.log(
    `[pass] T0193 shared-IP model peaks at ${legitimate.maxFiveMinuteSharedIpRequests} requests in five minutes without treating park Wi-Fi as an attacker`,
  );
  console.log(
    `[pass] T0193 accepts the first two seconds of a concentrated 40-device simultaneous arrival wave (${concentratedRequests} mixed guest/preflight requests) with zero modeled 429s`,
  );
  console.log(
    `[pass] T0193 models configured circuit breakers on all ${Object.keys(ROUTE_LIMITS).length} route policies (${totalAbuseThrottled}/${totalAbuseOffered} synthetic requests throttled)`,
  );
  console.log('[pass] T0193 keeps guest/staff traffic isolated from webhook and internal-route floods');
  console.log('[pass] T0193 capacity validation is deterministic, dependency-free, synthetic, and performs no network or Live writes');
}

if (require.main === module) {
  main();
}

module.exports = {
  ROUTE_LIMITS,
};
