#!/usr/bin/env node
const {
  RollerConfigError,
  buildRollerUrl,
  loadLocalEnv,
  readRollerConfig,
  requestRollerAccessToken,
  validateRollerSmokeConfig,
} = require('./roller-client');

const DEFAULT_DATA_API_PATH = '/data/bookingitems';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_SEED_REFERENCES = ['5032210', '5032211', '5032212', '5032213', '5032214', '5032215'];

function parseArgs(argv) {
  const args = {
    json: false,
    endpointPath: process.env.ROLLER_DATA_API_PATH || DEFAULT_DATA_API_PATH,
    startDate: process.env.ROLLER_DATA_START_DATE || toIsoDate(new Date()),
    endDate: process.env.ROLLER_DATA_END_DATE || null,
    pageSize: parsePositiveInteger(process.env.ROLLER_DATA_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    maxPages: parsePositiveInteger(process.env.ROLLER_DATA_MAX_PAGES, DEFAULT_MAX_PAGES),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--path') {
      args.endpointPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--start-date') {
      args.startDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--end-date') {
      args.endDate = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--page-size') {
      args.pageSize = parsePositiveInteger(argv[index + 1], DEFAULT_PAGE_SIZE);
      index += 1;
      continue;
    }

    if (arg === '--max-pages') {
      args.maxPages = parsePositiveInteger(argv[index + 1], DEFAULT_MAX_PAGES);
      index += 1;
      continue;
    }

    if (isIsoDate(arg) && isIsoDate(argv[index + 1])) {
      args.startDate = arg;
      args.endDate = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  args.endDate = args.endDate || addDays(args.startDate, 1);
  validateDataApiArgs(args);
  return args;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Page controls must be positive integers.');
  }
  return parsed;
}

function validateDataApiArgs(args) {
  if (!args.endpointPath.startsWith('/data/')) {
    throw new Error('ROLLER_DATA_API_PATH must start with "/data/".');
  }

  if (!isIsoDate(args.startDate) || !isIsoDate(args.endDate)) {
    throw new Error('ROLLER_DATA_START_DATE and ROLLER_DATA_END_DATE must be YYYY-MM-DD.');
  }

  if (args.endDate <= args.startDate) {
    throw new Error('ROLLER_DATA_END_DATE must be after ROLLER_DATA_START_DATE.');
  }
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function requestDataApiPage(config, token, args, pageNumber) {
  const url = buildRollerUrl(config.baseUrl, args.endpointPath);
  url.searchParams.set('startDate', args.startDate);
  url.searchParams.set('endDate', args.endDate);
  url.searchParams.set('pageNumber', String(pageNumber));
  url.searchParams.set('pageSize', String(args.pageSize));

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  const body = parseMaybeJson(text, contentType);

  if (!response.ok) {
    throw new Error(`Roller Data API request failed with HTTP ${response.status}: ${summarizeErrorBody(body, text)}`);
  }

  const records = extractRecords(body);
  return {
    pageNumber,
    status: response.status,
    contentType,
    bodyShape: describeBodyShape(body),
    records,
  };
}

function parseMaybeJson(text, contentType) {
  if (!text) return null;
  if (!contentType.includes('application/json')) return text;
  return JSON.parse(text);
}

function summarizeErrorBody(body, text) {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const message = body.message ?? body.error ?? body.title ?? body.detail;
    if (message) return String(message).slice(0, 200);
  }

  return String(text || 'No response body').slice(0, 200);
}

function extractRecords(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];

  const candidateKeys = ['items', 'data', 'results', 'records', 'bookingItems', 'bookings'];
  for (const key of candidateKeys) {
    if (Array.isArray(body[key])) return body[key];
  }

  return [];
}

function describeBodyShape(body) {
  if (Array.isArray(body)) return 'json-array';
  if (body && typeof body === 'object') return `json-object:${Object.keys(body).slice(0, 8).join(',')}`;
  return typeof body;
}

function shouldFetchNextPage(page, args) {
  return page.records.length >= args.pageSize && page.pageNumber < args.maxPages;
}

function summarizeRecords(pages, args) {
  const records = pages.flatMap((page) => page.records);
  const firstRecord = records[0] ?? {};
  const bookingReferences = unique(records.map((record) => record.bookingReference).filter(Boolean));
  const seedMatches = DEFAULT_SEED_REFERENCES.filter((reference) => bookingReferences.includes(reference));
  const bookingDates = unique(records.map((record) => record.bookingDate).filter(Boolean)).slice(0, 10);
  const modifiedDates = records.map((record) => record.bookingModifiedDate).filter(Boolean).sort();

  return {
    endpointPath: args.endpointPath,
    window: {
      startDate: args.startDate,
      endDate: args.endDate,
      basis: 'Roller Data API modified date window; bookingDate is returned for local filtering.',
    },
    paging: {
      pageSize: args.pageSize,
      maxPages: args.maxPages,
      pagesFetched: pages.length,
      recordsReturned: records.length,
    },
    response: {
      firstPageStatus: pages[0]?.status ?? null,
      firstPageShape: pages[0]?.bodyShape ?? null,
      sampleFields: Object.keys(firstRecord).slice(0, 20),
    },
    observedData: {
      uniqueBookingReferences: bookingReferences.length,
      seedBookingReferencesFound: seedMatches,
      bookingDates,
      earliestModifiedDate: modifiedDates[0] ?? null,
      latestModifiedDate: modifiedDates[modifiedDates.length - 1] ?? null,
    },
  };
}

function unique(values) {
  return [...new Set(values.map((value) => String(value)))];
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const config = readRollerConfig();
  const validation = validateRollerSmokeConfig(config);

  if (!validation.ok) {
    console.error('Roller Data API smoke test blocked by configuration:');
    for (const error of validation.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  try {
    const token = await requestRollerAccessToken(config);
    const pages = [];
    let pageNumber = 1;

    do {
      const page = await requestDataApiPage(config, token, args, pageNumber);
      pages.push(page);
      pageNumber += 1;
    } while (shouldFetchNextPage(pages[pages.length - 1], args));

    const summary = summarizeRecords(pages, args);

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log('Roller Data API smoke test passed.');
    console.log(`- env: ${validation.safeConfig.env}`);
    console.log(`- baseUrl: ${validation.safeConfig.baseUrl}`);
    console.log(`- endpoint: ${summary.endpointPath}`);
    console.log(`- modifiedDateWindow: ${summary.window.startDate} -> ${summary.window.endDate}`);
    console.log(`- pagesFetched: ${summary.paging.pagesFetched}`);
    console.log(`- recordsReturned: ${summary.paging.recordsReturned}`);
    console.log(`- firstPageShape: ${summary.response.firstPageShape}`);
    console.log(`- sampleFields: ${summary.response.sampleFields.join(', ') || 'none'}`);
    console.log(`- seedBookingReferencesFound: ${summary.observedData.seedBookingReferencesFound.join(', ') || 'none'}`);
    console.log(`- bookingDates: ${summary.observedData.bookingDates.join(', ') || 'none'}`);
    console.log(`- modifiedDateRange: ${summary.observedData.earliestModifiedDate || 'none'} -> ${summary.observedData.latestModifiedDate || 'none'}`);
    console.log('- no secrets, access tokens, customer names, emails, or phone numbers were printed.');
  } catch (error) {
    if (error instanceof RollerConfigError) {
      console.error(`Roller Data API smoke test blocked by configuration: ${error.message}`);
      process.exit(1);
    }

    console.error(`Roller Data API smoke test failed: ${error.message}`);
    console.error('No secrets were printed. Confirm that Data API access is enabled for these Playground credentials.');
    process.exit(1);
  }
}

main();
