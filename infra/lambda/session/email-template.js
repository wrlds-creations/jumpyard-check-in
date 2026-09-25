const PARK_TEST_EMAIL_ASSET_BASE_URL = 'https://jumpyard-check-in-park-test.pages.dev';

const EMAIL_ASSETS = {
  bookingConfirmed: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard-next-icons/booking-confirmed-on-red-white-calendar.png`,
  logo: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard_logo.png`,
  stepBooking: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard-next-icons/group.png`,
  stepSafety: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard-next-icons/safety-check.png`,
  stepWristband: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard-next-icons/visitor-wristband.png`,
};

const SWEDISH_MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];
const SWEDISH_WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const STOCKHOLM_DAY = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
});

// GH-392 (Love, 2026-09-25): lead with the benefit and the time it takes, put the single
// action above the fold and explain the three steps. The safety video is 15 seconds.
const CHECKIN_STEPS = [
  {
    icon: 'stepBooking',
    text: 'Knappen öppnar din bokning direkt, ingen sökning behövs.',
    title: 'Öppna din bokning',
  },
  {
    icon: 'stepSafety',
    text: 'Titta på den korta filmen och godkänn reglerna i lugn och ro hemma.',
    title: 'Säkerhetsfilm och regler',
  },
  {
    icon: 'stepWristband',
    text: 'Då får ni armband och det ni har köpt direkt.',
    title: 'Visa QR-koden i entrén',
  },
];

const BODY_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY_FONT = "Impact,'Arial Black','Helvetica Neue',Arial,sans-serif";

function buildCheckinEmailMessage({ booking = {}, checkinUrl, now = new Date() }) {
  const bookingReference = stringOrNull(booking.bookingReference);
  const bookingTime = formatBookingTime(booking.startTime);
  const visitIsToday = isSameStockholmDay(booking.bookingDate, now);
  const visitDay = formatSwedishVisitDay(booking.bookingDate);
  const whenLabel = [
    visitIsToday ? 'Idag' : capitalize(visitDay),
    bookingTime ? `kl. ${bookingTime}` : null,
  ].filter(Boolean).join(' ') || 'Snart';
  const safeCheckinUrl = escapeHtml(checkinUrl);
  const subject = bookingTime
    ? `Checka in nu – gå direkt in kl. ${bookingTime}`
    : 'Checka in nu – gå direkt in när ni kommer';
  const preheader = 'Tar under 2 minuter. Visa QR-koden i entrén så får ni armbanden direkt.';
  const lead = 'Tar under 2 minuter. Sen går ni direkt till entrén.';
  const detailsLine = [
    capitalize(visitDay),
    bookingTime ? `kl. ${bookingTime}` : null,
    'JumpYard Nacka Forum',
    bookingReference ? `Bokning ${bookingReference}` : null,
  ].filter(Boolean).join(' · ');
  const text = [
    'Hej!',
    '',
    `${whenLabel} hoppar ni på JumpYard Nacka Forum. Checka in hemifrån nu.`,
    lead,
    '',
    `Checka in här: ${checkinUrl}`,
    '',
    'Så funkar det:',
    ...CHECKIN_STEPS.map((step, index) => `${index + 1}. ${step.title}. ${step.text}`),
    '',
    detailsLine,
    '',
    'Hinner du inte? Det går lika bra att checka in i kiosken på plats.',
    'Länken är personlig för din bokning och ska inte delas vidare.',
    'Behöver du hjälp? Svara på det här mejlet så hjälper JumpYard Nacka dig.',
    '',
    'Vi ses snart!',
    'JumpYard Nacka',
  ].join('\n');

  const steps = CHECKIN_STEPS.map((step, index) => `<tr>
                    <td valign="top" width="56" style="padding:${index === 0 ? '0' : '14px'} 14px 0 0;">
                      <img src="${EMAIL_ASSETS[step.icon]}" width="48" alt="" style="display:block;height:auto;max-width:48px;width:48px;">
                    </td>
                    <td valign="top" style="padding:${index === 0 ? '2px' : '16px'} 0 0 0;">
                      <p style="color:#000000;font-family:${DISPLAY_FONT};font-size:17px;font-style:italic;font-weight:900;letter-spacing:.3px;line-height:21px;margin:0;text-transform:uppercase;">${index + 1}. ${escapeHtml(step.title)}</p>
                      <p style="color:#000000;font-family:${BODY_FONT};font-size:15px;line-height:22px;margin:3px 0 0 0;">${escapeHtml(step.text)}</p>
                    </td>
                  </tr>`).join('\n                  ');

  const html = `<!doctype html>
<html lang="sv" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; display: block; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      table { border-collapse: collapse !important; }
      body { font-family: ${BODY_FONT}; height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      @media screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .hero-title { font-size: 36px !important; line-height: 36px !important; }
        .hero-icon { width: 72px !important; }
      }
    </style>
  </head>
  <body style="background-color:#ffffff;font-family:${BODY_FONT};margin:0;padding:0;">
    <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;font-family:${BODY_FONT};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;width:100%;">
      <tr>
        <td align="center" style="padding:16px 10px 24px 10px;">
          <table class="email-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:2px solid #111111;border-radius:24px;max-width:600px;overflow:hidden;width:600px;">
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:16px 28px 14px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" valign="middle">
                      <img src="${EMAIL_ASSETS.logo}" width="84" alt="JumpYard" style="display:block;height:auto;max-width:84px;width:84px;">
                    </td>
                    <td align="right" valign="middle" style="color:#000000;font-family:${DISPLAY_FONT};font-size:13px;font-style:italic;font-weight:900;letter-spacing:.8px;line-height:16px;text-transform:uppercase;">
                      Nacka Forum
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ef1742;padding:22px 28px 24px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right:10px;">
                      <p style="color:#ffffff;font-family:${BODY_FONT};font-size:13px;font-weight:900;letter-spacing:1.4px;line-height:16px;margin:0 0 8px 0;text-transform:uppercase;">${escapeHtml(whenLabel)}</p>
                      <h1 class="hero-title" style="color:#ffffff;font-family:${DISPLAY_FONT};font-size:40px;font-style:italic;font-weight:900;letter-spacing:-.5px;line-height:40px;margin:0;text-transform:uppercase;">Checka in<br>hemifrån</h1>
                      <p style="color:#ffffff;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:22px;margin:10px 0 0 0;">${escapeHtml(lead)}</p>
                    </td>
                    <td align="right" valign="middle" width="84">
                      <img class="hero-icon" src="${EMAIL_ASSETS.bookingConfirmed}" width="80" alt="" style="display:block;height:auto;max-width:80px;width:80px;">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:20px 28px 6px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#111111" style="background-color:#111111;border-radius:14px;">
                      <a href="${safeCheckinUrl}" target="_blank" style="color:#ffffff;display:block;font-family:${DISPLAY_FONT};font-size:22px;font-style:italic;font-weight:900;letter-spacing:.6px;line-height:24px;padding:18px 20px;text-align:center;text-decoration:none;text-transform:uppercase;">CHECKA IN NU</a>
                    </td>
                  </tr>
                </table>
                <p style="color:#000000;font-family:${BODY_FONT};font-size:12px;line-height:18px;margin:8px 0 0 0;text-align:center;">Länken är personlig för din bokning.</p>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:22px 28px 4px 28px;">
                <p style="color:#000000;font-family:${DISPLAY_FONT};font-size:14px;font-style:italic;font-weight:900;letter-spacing:1px;line-height:18px;margin:0 0 14px 0;text-transform:uppercase;">Så funkar det</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${steps}
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:22px 28px 22px 28px;">
                <p style="border-top:2px solid #000000;color:#000000;font-family:${BODY_FONT};font-size:14px;font-weight:800;line-height:21px;margin:0;padding-top:14px;">${escapeHtml(detailsLine)}</p>
                <p style="color:#000000;font-family:${BODY_FONT};font-size:14px;line-height:21px;margin:10px 0 0 0;">Hinner du inte? Det går lika bra att checka in i kiosken på plats.</p>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#111111;padding:20px 28px;">
                <p style="color:#ffffff;font-family:${BODY_FONT};font-size:14px;font-weight:800;line-height:21px;margin:0 0 4px 0;">Behöver du hjälp?</p>
                <p style="color:#ffffff;font-family:${BODY_FONT};font-size:13px;line-height:20px;margin:0;">Svara på det här mejlet så hjälper JumpYard Nacka dig.</p>
                <p style="color:#ffffff;font-family:${BODY_FONT};font-size:11px;line-height:17px;margin:14px 0 0 0;">Fungerar inte knappen? Öppna länken:<br><a href="${safeCheckinUrl}" target="_blank" style="color:#ffffff;text-decoration:underline;word-break:break-all;">${safeCheckinUrl}</a></p>
              </td>
            </tr>
          </table>
          <p style="color:#000000;font-family:${BODY_FONT};font-size:11px;line-height:17px;margin:14px auto 0 auto;max-width:540px;text-align:center;">Det här är ett servicemeddelande om din bokning hos JumpYard Nacka Forum.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, subject, text };
}

function buildCheckinEmailPreview(booking) {
  return buildCheckinEmailMessage({
    booking,
    checkinUrl: '[check-in-link]',
  });
}

function formatBookingTime(value) {
  const time = stringOrNull(value);
  if (!time) return null;
  return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
}

function parseBookingDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stringOrNull(value) || '');
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!SWEDISH_MONTHS[monthIndex] || day < 1 || day > 31) return null;
  return { day, monthIndex, weekday: new Date(Date.UTC(Number(match[1]), monthIndex, day)).getUTCDay(), year: match[1] };
}

function formatSwedishBookingDate(value) {
  const date = parseBookingDate(value);
  if (!date) return stringOrNull(value);
  return `${date.day} ${SWEDISH_MONTHS[date.monthIndex]} ${date.year}`;
}

// "fredag 25 september"; the year is implied for a visit within hours.
function formatSwedishVisitDay(value) {
  const date = parseBookingDate(value);
  if (!date) return stringOrNull(value);
  return `${SWEDISH_WEEKDAYS[date.weekday]} ${date.day} ${SWEDISH_MONTHS[date.monthIndex]}`;
}

function isSameStockholmDay(bookingDate, now) {
  const instant = now instanceof Date ? now : new Date(now);
  return Boolean(parseBookingDate(bookingDate)) && Number.isFinite(instant.getTime())
    && STOCKHOLM_DAY.format(instant) === bookingDate;
}

function capitalize(value) {
  const text = stringOrNull(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

function stringOrNull(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  EMAIL_ASSETS,
  PARK_TEST_EMAIL_ASSET_BASE_URL,
  buildCheckinEmailMessage,
  buildCheckinEmailPreview,
  formatSwedishBookingDate,
};
