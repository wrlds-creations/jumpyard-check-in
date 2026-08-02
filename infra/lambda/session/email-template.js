const PARK_TEST_EMAIL_ASSET_BASE_URL = 'https://jumpyard-check-in-park-test.pages.dev';

const EMAIL_ASSETS = {
  bookingConfirmed: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard-next-icons/booking-confirmed-on-red-white-calendar.png`,
  logo: `${PARK_TEST_EMAIL_ASSET_BASE_URL}/jumpyard_logo.png`,
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

function buildCheckinEmailMessage({ booking = {}, checkinUrl }) {
  const bookingReference = stringOrNull(booking.bookingReference);
  const bookingDate = formatSwedishBookingDate(booking.bookingDate);
  const bookingTime = formatBookingTime(booking.startTime);
  const safeCheckinUrl = escapeHtml(checkinUrl);
  const intro = bookingTime
    ? `Din hopptid kl. ${bookingTime} närmar sig.`
    : 'Din hopptid hos JumpYard Nacka närmar sig.';
  const preheader = `${intro} Checka in redan nu så går det snabbare när du kommer fram.`;
  const subject = 'Dags att checka in inför ditt besök hos JumpYard Nacka';
  const bookingDetailsText = [
    bookingDate ? `Datum: ${bookingDate}` : null,
    bookingTime ? `Hopptid: ${bookingTime}` : null,
    'Park: JumpYard Nacka Forum',
    bookingReference ? `Bokningsnummer: ${bookingReference}` : null,
  ].filter(Boolean);
  const text = [
    'Hej!',
    '',
    intro,
    'Checka in redan nu så går det snabbare när du kommer fram.',
    '',
    ...bookingDetailsText,
    '',
    `Checka in här: ${checkinUrl}`,
    '',
    'Länken är personlig och ska inte delas vidare.',
    'Behöver du hjälp? Svara på det här mejlet så hjälper JumpYard Nacka dig.',
    '',
    'Vi ses snart!',
    'JumpYard Nacka',
  ].join('\n');

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
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      @media screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .mobile-pad { padding-left: 22px !important; padding-right: 22px !important; }
        .hero-title { font-size: 34px !important; line-height: 36px !important; }
        .hero-icon { width: 92px !important; }
        .details-label { width: 38% !important; }
      }
    </style>
  </head>
  <body style="background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;">
    <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
      ${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;width:100%;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table class="email-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:2px solid #111111;border-radius:24px;max-width:600px;overflow:hidden;width:600px;">
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:22px 30px 20px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" valign="middle">
                      <img src="${EMAIL_ASSETS.logo}" width="92" alt="JumpYard" style="display:block;height:auto;max-width:92px;width:92px;">
                    </td>
                    <td align="right" valign="middle" style="color:#000000;font-family:Impact,'Arial Black','Helvetica Neue',Arial,sans-serif;font-size:14px;font-style:italic;font-weight:900;letter-spacing:.8px;line-height:17px;text-transform:uppercase;">
                      Nacka Forum
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ef1742;padding:34px 30px 36px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle" style="padding-right:12px;">
                      <p style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:900;letter-spacing:1.5px;line-height:16px;margin:0 0 12px 0;text-transform:uppercase;">Det är snart dags!</p>
                      <h1 class="hero-title" style="color:#ffffff;font-family:Impact,'Arial Black','Helvetica Neue',Arial,sans-serif;font-size:44px;font-style:italic;font-weight:900;letter-spacing:-.5px;line-height:44px;margin:0;text-transform:uppercase;">Dags att<br>checka in</h1>
                    </td>
                    <td align="right" valign="middle" width="126">
                      <img class="hero-icon" src="${EMAIL_ASSETS.bookingConfirmed}" width="116" alt="Bokningen är redo för incheckning" style="display:block;height:auto;max-width:116px;width:116px;">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:28px 30px 8px 30px;">
                <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:800;line-height:27px;margin:0;">Hej!</p>
                <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:450;line-height:27px;margin:8px 0 0 0;">${escapeHtml(intro)} Checka in redan nu så går det snabbare när du kommer fram.</p>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:14px 30px 8px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#111111" style="background-color:#111111;border-radius:14px;">
                      <a href="${safeCheckinUrl}" target="_blank" style="color:#ffffff;display:block;font-family:Impact,'Arial Black','Helvetica Neue',Arial,sans-serif;font-size:20px;font-style:italic;font-weight:900;letter-spacing:.6px;line-height:22px;padding:17px 20px;text-align:center;text-decoration:none;text-transform:uppercase;">CHECKA IN</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:14px 30px 6px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:2px solid #000000;border-radius:16px;">
                  ${buildBookingDetailRow('Datum', bookingDate, true)}
                  ${buildBookingDetailRow('Hopptid', bookingTime, !bookingDate)}
                  ${buildBookingDetailRow('Park', 'JumpYard Nacka Forum', !bookingDate && !bookingTime)}
                  ${buildBookingDetailRow('Bokningsnummer', bookingReference, false)}
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#ffffff;padding:8px 30px 30px 30px;">
                <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;margin:0 0 18px 0;text-align:center;">Om knappen inte fungerar kan du öppna länken direkt:<br><a href="${safeCheckinUrl}" target="_blank" style="color:#000000;font-weight:800;text-decoration:underline;word-break:break-all;">${safeCheckinUrl}</a></p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:2px solid #ef1742;">
                  <tr>
                    <td style="padding:15px 16px;">
                      <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;line-height:19px;margin:0 0 4px 0;">Din personliga incheckningslänk</p>
                      <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:19px;margin:0;">Länken hör till din bokning och ska inte delas vidare.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="mobile-pad" style="background-color:#111111;padding:24px 30px;">
                <p style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;line-height:21px;margin:0 0 5px 0;">Behöver du hjälp?</p>
                <p style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;margin:0;">Svara på det här mejlet så hjälper JumpYard Nacka dig.</p>
              </td>
            </tr>
          </table>
          <p style="color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;margin:16px auto 0 auto;max-width:540px;text-align:center;">Det här är ett servicemeddelande om din bokning hos JumpYard Nacka Forum.</p>
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

function buildBookingDetailRow(label, value, firstVisible) {
  if (!value) return '';

  const border = firstVisible ? '' : 'border-top:2px solid #000000;';
  return `<tr>
    <td class="details-label" valign="top" width="34%" style="${border}color:#000000;font-family:Impact,'Arial Black','Helvetica Neue',Arial,sans-serif;font-size:14px;font-style:italic;font-weight:900;letter-spacing:.4px;line-height:18px;padding:13px 15px;text-transform:uppercase;">${escapeHtml(label)}</td>
    <td valign="top" style="${border}color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;line-height:21px;padding:13px 15px;">${escapeHtml(value)}</td>
  </tr>`;
}

function formatBookingTime(value) {
  const time = stringOrNull(value);
  if (!time) return null;
  return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time;
}

function formatSwedishBookingDate(value) {
  const date = stringOrNull(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) return date;

  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (!SWEDISH_MONTHS[monthIndex] || day < 1 || day > 31) return date;
  return `${day} ${SWEDISH_MONTHS[monthIndex]} ${match[1]}`;
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
};
