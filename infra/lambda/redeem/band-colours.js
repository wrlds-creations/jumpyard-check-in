'use strict';

// GH-459 (D0233): JumpYard's fixed wristband colour scheme, transcribed from the laminated
// "Sluttid" chart at the Nacka desk that JumpYard delivered on 2026-09-30.
// The colour is decided by when the admission ENDS (start time + duration), not by
// when it starts. The chart is a ten-colour cycle, one step per half hour from 10:00
// to 20:00; its 09:00 and 09:30 rows are blank. Any other end time (before 10:00,
// after 20:00 or off the :00/:30 grid) has no colour: Cloud never guesses.
// Nacka only. The venue is not checked per booking: every flow that reaches this code is
// gated to Nacka, and another park needs its own scheme here before it opens (D0233).
// Response-only presentation. Each Lambda is deployed as an isolated directory, so its
// packaged copy must stay byte-identical to this source (band-colours.test.js).
const BAND_COLOUR_SCHEME = deepFreeze({
  version: 'nacka-2026-09-30',
  venueId: '50871',
  colours: {
    'svart-rod': { sv: 'Svart/Röd', en: 'Black/Red', swatch: ['#141414', '#E2231A'] },
    gul: { sv: 'Gul', en: 'Yellow', swatch: ['#FFD400'] },
    gron: { sv: 'Grön', en: 'Green', swatch: ['#00A651'] },
    ljusbla: { sv: 'Ljusblå', en: 'Light blue', swatch: ['#3DB7E4'] },
    'rosa-lila': { sv: 'Rosa/Lila', en: 'Pink/Purple', swatch: ['#F27BB0', '#7B3FA0'] },
    rod: { sv: 'Röd', en: 'Red', swatch: ['#E2231A'] },
    morkbla: { sv: 'Mörkblå', en: 'Dark blue', swatch: ['#1F3A93'] },
    lila: { sv: 'Lila', en: 'Purple', swatch: ['#7B3FA0'] },
    svart: { sv: 'Svart', en: 'Black', swatch: ['#141414'] },
    orange: { sv: 'Orange', en: 'Orange', swatch: ['#F68B1F'] },
  },
  // Sluttid -> band, row by row as printed on the chart.
  endTimes: {
    '10:00': 'svart-rod', '10:30': 'gul', '11:00': 'gron', '11:30': 'ljusbla', '12:00': 'rosa-lila',
    '12:30': 'rod', '13:00': 'morkbla', '13:30': 'lila', '14:00': 'svart', '14:30': 'orange',
    '15:00': 'svart-rod', '15:30': 'gul', '16:00': 'gron', '16:30': 'ljusbla', '17:00': 'rosa-lila',
    '17:30': 'rod', '18:00': 'morkbla', '18:30': 'lila', '19:00': 'svart', '19:30': 'orange',
    '20:00': 'svart-rod',
  },
});

// The staff handout (#345) hands out wristbands for exactly these ROLLER product types.
const ADMISSION_PRODUCT_TYPES = new Set(['membership', 'partypackage', 'pass', 'recurringpass',
  'recurringsession', 'recurringsessions', 'sessionpass', 'standardpass']);
const NON_PHYSICAL_PRODUCT_TYPES = new Set(['fee', 'giftcard']);
// Phone and kiosk purchases are described with Cloud's own verified product definitions
// before ROLLER confirms them; these types name its entry and family admissions.
const PURCHASE_ADMISSION_TYPES = new Set(['entry', 'family']);
const productTypeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
  return Object.freeze(value);
}

// "13:00", "13:00:00" (Aurora) or "9:30". Seconds must be zero; anything else is unknown.
function clockMinutes(value) {
  const match = typeof value === 'string' ? value.trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d)(?:\.0+)?)?$/) : null;
  if (!match || Number(match[1]) > 23 || Number(match[3] ?? 0) !== 0) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function positiveMinutes(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

// End = start + duration. An explicit admission duration wins (Weekday Combo: 60 min,
// D0207); otherwise the booking item's own end time gives its duration.
function admissionEndTime({ startTime, durationMinutes, endTime } = {}) {
  const start = clockMinutes(startTime);
  if (start === null) return null;
  const end = clockMinutes(endTime);
  const duration = positiveMinutes(durationMinutes) ?? (end !== null && end > start ? end - start : null);
  return duration === null || start + duration >= 24 * 60 ? null : formatClock(start + duration);
}

function bandColourForEndTime(endTime) {
  const minutes = clockMinutes(endTime);
  const key = minutes === null ? null : formatClock(minutes);
  const id = key && Object.hasOwn(BAND_COLOUR_SCHEME.endTimes, key) ? BAND_COLOUR_SCHEME.endTimes[key] : null;
  if (!id) return null;
  const colour = BAND_COLOUR_SCHEME.colours[id];
  return { id, name: { sv: colour.sv, en: colour.en }, swatch: [...colour.swatch], endTime: key,
    schemeVersion: BAND_COLOUR_SCHEME.version };
}

// The one mapping: an admission's start and duration (or end) to its band, or null.
function bandColourForAdmission(admission) {
  const endTime = admissionEndTime(admission);
  return endTime ? bandColourForEndTime(endTime) : null;
}

function productTypes(item) {
  const summary = item?.summary && typeof item.summary === 'object' ? item.summary : {};
  return [item?.productType, item?.productSubType, item?.parentType, summary.type, summary.productType,
    summary.subType, summary.productSubType, summary.parentType].map(productTypeKey).filter(Boolean);
}

function isAdmissionProduct(item) {
  const types = productTypes(item);
  return !types.some((type) => NON_PHYSICAL_PRODUCT_TYPES.has(type)) &&
    types.some((type) => ADMISSION_PRODUCT_TYPES.has(type) || PURCHASE_ADMISSION_TYPES.has(type));
}

// One colour per admission item. Verified package contents (Weekday Combo) carry their own
// admission duration; other admission products use their own duration or end time.
function bandColourForItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (Array.isArray(item.packageContents)) {
    const admission = item.packageContents.find((content) => content?.kind === 'admission');
    return admission ? bandColourForAdmission({ startTime: item.startTime,
      durationMinutes: admission.durationMinutes ?? item.durationMinutes, endTime: item.endTime }) : null;
  }
  return isAdmissionProduct(item) ? bandColourForAdmission(item) : null;
}

// Staff rows: one entry per colour with the number of bands for the group.
function groupBandColours(items) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = Number.isSafeInteger(item?.sessionLimit) ? item.sessionLimit : item?.quantity;
    if (!item?.bandColour?.id || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const group = groups.get(item.bandColour.id);
    if (group) group.quantity += quantity;
    else groups.set(item.bandColour.id, { ...item.bandColour, quantity });
  }
  return [...groups.values()];
}

module.exports = {
  ADMISSION_PRODUCT_TYPES,
  BAND_COLOUR_SCHEME,
  NON_PHYSICAL_PRODUCT_TYPES,
  PURCHASE_ADMISSION_TYPES,
  admissionEndTime,
  bandColourForAdmission,
  bandColourForEndTime,
  bandColourForItem,
  groupBandColours,
  isAdmissionProduct,
  productTypeKey,
};
