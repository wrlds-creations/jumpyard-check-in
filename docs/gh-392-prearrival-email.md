# #392 pre-arrival email (Nacka, Monday 2026-09-28)

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/392

Branch `codex/gh-392-prearrival-email`. Love approved local preparation on 2026-09-08, which was built on `6b938a9`. On 2026-09-25 Love made four decisions: the machinery must work on Monday 2026-09-28 and only that day, only for Nacka Forum, and only for bookings with products the check-in system handles. Love chose the product scope "strikt + allt café", approved the arrival line in the email, and authorized commit, PR, merge, release and protected park-test promotion the same day. The work was then rebased onto `origin/main` `4c6d730`. Decision: D0227.

## Behavior

- **Audience:** ROLLER Live Nacka `50871` bookings whose selected start falls on 2026-09-28 (Europe/Stockholm). A booking is eligible only if all of the following hold:
  - it is active, fresh, not tombstoned and fully paid;
  - it has at least one redeemable ticket that is not already redeemed (`evaluateStartContext`);
  - it passes the product filter below;
  - the booking owner (`bookingCustomerId` guest profile) has a valid email.
- **Recipient and messages:** one email per booking, never per participant.
- **Supported products:**
  - Every line must be one of these:
    - Entré 60/90/120 min, including Drop-In and Familj (parents `1189805`, `1189823`, `1189771`, `1189814`, `1189832`, `1189794`);
    - Weekday Combo (`1242135`/`1242136`);
    - SkyRider `970335`, JumpSocks `970337` or Hänglås `970333`;
    - café parents: Cold Drinks `970363` (which includes JumpYard Vatten), Cold Drinks 2 `1027668`, coffee `970346`, ice cream `1065933`, food `970461`, food other `970488`, confectionery `970441` or pizza `970540`.
  - At least one line must be Entré or Weekday Combo.
  - Any other line stops the email (`unsupported_products`). This covers parties (MINI/MIDI/MAXI), party food and birthday extras, punch cards (5/10/20/30-Kort, Benify, Epassi, Benefits), gift cards, memberships, PT, school/club groups, JumpSchool, time extensions and merchandise.
  - Those guests use the ordinary kiosk/staff check-in.
- **Already in our flow:** bookings bought in our phone or kiosk flow (a `prepayment_booking_drafts` row with the same ROLLER id) and bookings with any `checkin_sessions` row get no email (`own_flow_purchase`, `checkin_already_started`; unknown values fail closed). Love chose this on 2026-09-25 after read-only data showed 2–5 own purchases per weekday would otherwise have been emailed minutes after buying. Add-on purchases made during check-in are separate bookings without an Entré line, so they never qualify either. Love chose not to add a minimum-notice rule, so counter sales with an email and last-minute web bookings can still be emailed right up to start.
- **Controlled proof day:** on 2026-09-25 (Stockholm) the same gate also opens, but only for visits that day whose booking contact is `love@wrlds.com` or `love+tag@wrlds.com`; every other booking counts as `outside_rollout_date`.
- **Timing:**
  - New bookings reach the cache through ROLLER webhooks. Over the last seven days, 1,420 `Created` events had a median of 2.9 s and a 95th percentile of 6.1 s. The Data API sync only runs daily at 04:00.
  - The scheduler runs every five minutes and considers bookings that start after "now" and at most 120 minutes ahead.
  - A booking normally gets its email between T-120 and T-115.
  - A booking made or paid later is sent on the next run before its start.
  - Started visits never get a catch-up email.
- **Date lock (code-owned):** delivery requires every one of these:
  - the release flag `ENABLE_GH392_PREARRIVAL_EMAIL=true`;
  - `JUMPYARD_ENVIRONMENT=park-test`;
  - a released emergency stop;
  - the current Stockholm day equal to `2026-09-28`, or to the `2026-09-25` proof day;
  - the candidate's visit date equal to `2026-09-28`, or to `2026-09-25` with a love@ / love+tag@wrlds.com booking contact.
  - The lock is checked before any database read, between recipients, before the ROLLER read, and immediately before SES. Outside 2026-09-25 (proof) and 2026-09-28, every scheduled run returns `409 prearrival_rollout_not_approved` without reading bookings; this was read back on 2026-09-25 at 08:41:47Z before the proof day was added.
- **Delivery boundary:**
  - An authoritative ROLLER read confirms the booking, venue, start, payment and booking owner.
  - One stable reservation is made per booking and visit before the token or SES call. A failed or ambiguous provider call stays reserved for review and is never sent automatically a second time.
  - The link is booking-bound, `https://checkin.jumpyard.se/?jy_token=…`.
  - The existing SES identity, configuration set, suppression and telemetry are used.
- **Scheduled run:**
  - The run walks every page of 25 bookings with one fixed clock and stops starting new pages or sends after 40 seconds; the session Lambda timeout is 60 seconds.
  - Rows it did not reach are not reserved, so the next run re-plans them.
  - Each run logs one aggregate line, `gh392_prearrival_email_run`, with the status, page count, `complete` and reason counts. The line has no booking ids, contacts or cursor.
- **Operator route:** the authenticated route stays read-only planning (`confirmSend` other than `false` returns `prearrival_rollout_not_approved`). Its request and continuation format is unchanged from the 2026-09-08 preparation: `{"messagePolicy":"prearrival_email_v1","confirmSend":false}`, with an optional explicit-offset `now` for planning, plus the returned `cursor`.
- **Sessions:** new regular and provisional kiosk sessions last four hours from creation, and resuming never extends them. Reopening the email link resumes the same idempotent session and its saved safety state. Link validity stays at 72 hours, and each successful opening grants one hour of guest access.
- **Email copy:** redesigned on 2026-09-25 after Love's proof review, to raise pre-arrival check-in.
  - Subject: "Checka in nu – gå direkt in kl. HH:MM". Preheader: "Tar under 2 minuter. Visa QR-koden i entrén så får ni armbanden direkt." The safety video is 15 s.
  - A compact red hero ("Idag kl. HH:MM", "Checka in hemifrån", time promise) is followed directly by one `CHECKA IN NU` button, above the iPhone fold.
  - "Så funkar det" lists three steps with library icons (open the booking, safety film and rules, show the QR code at the entrance for wristbands and purchases).
  - Booking details are on one line. A kiosk reassurance line follows. The personal-link note sits under the button; the help text and fallback link sit in the footer.
  - The red link warning box and the bordered details table were removed.

## Infrastructure change

- The park-test release profile `infra/config/park-test-full-flow-rehearsal.json` adds `safetyGates.prearrivalEmailApproval=GH392_NACKA_2026_09_28_PREARRIVAL_EMAIL_APPROVED`.
- This is accepted only in park-test, and only together with the confirmed controlled email schedule, which supplies the reviewed SES/IAM path.
- **Existing resources that change:**
  - The `jumpyard-check-in-park-test-booking-time-sms-schedule` rule input becomes exactly `{confirmSend:true, messagePolicy:"prearrival_email_v1", trigger:"scheduled_booking_time_messaging"}`.
  - The session Lambda gains `ENABLE_GH392_PREARRIVAL_EMAIL=true` and a 60-second timeout.
- **What stays the same:**
  - No new AWS resource, IAM action, schema, migration or dependency.
  - `guestMessagingSendsEnabled` stays false and the T0201 secret control stays disarmed.
  - The general T-30 path is no longer scheduled.

## Expected volume (read-only cache aggregates, 2026-09-25)

- **Recent Mondays:** 12 (09-07), 19 (09-14) and 18 (09-21) Nacka bookings had an owner email and passed the product filter, out of 52–102 bookings per day. Most bookings without email are counter or kiosk sales made on the day.
- **Monday 2026-09-28 so far:** 2 bookings, 1 supported. More are expected over the weekend and on the day.
- **Plan:** roughly 15–25 emails, first around 08:00–08:30 for 10:00–10:30 starts, last around 17:00 for 19:00 starts.
- **Budget:** SES quota (50,000/day, 14/s) and ROLLER reads (two per email) are far above this.
- **SQL check:** the page SQL was executed read-only against the Park cache and returned only aggregate counts.

## Operating the day

- **Owner:** Love monitors. Park staff handle fallback: guests without email, with unsupported products or without completed preparation use the kiosk/staff check-in as usual.
- **Readback:** the session Lambda log group, filtered on `gh392_prearrival_email_run`. Expect `prearrival_email_processed`, `complete:true` and counts such as `sent`, `already_sent`, `unsupported_products` and `booking_contact_missing`. Any `delivery_requires_review` or `previous_attempt_requires_review` needs manual review; nothing is resent automatically.
- **Stop conditions:** a wrong recipient or content, repeated `delivery_requires_review`, SES bounces or complaints, or park confusion.
- **Emergency stop:** disable the existing rule. Record the action in #392, then restore the rule before the next protected deploy, because the deploy expects `IN_SYNC`:

  ```bash
  aws events disable-rule --name jumpyard-check-in-park-test-booking-time-sms-schedule --profile wrlds-dev --region eu-north-1
  ```

- **Closing:** the date lock closes delivery at midnight without any action. A later release may restore the closed T-30 profile shape; removing `prearrivalEmailApproval` alone keeps T0201 disarmed.
- **Suggested proof:** Love books an early Monday Entré slot with an own address. That email, the phone preparation at home, reopening the link and the staff handout form the controlled end-to-end proof before most guests arrive.

## Validation (2026-09-25)

| Command | Result |
|---|---|
| `npm run validate:gh392-prearrival-email` | 25 passed, 3 PostgreSQL fixture tests skipped (no local PostgreSQL on this machine; the page SQL was instead run read-only against Aurora). |
| `node scripts/validate-t0201-controlled-t30-email.js` | Passed; historical single-booking controls preserved. |
| `npm run infra:check` | See the PR for the final result, including config guards and park-test synth (prearrival rule input, 60 s session timeout, flag). |
| `npm run validate` | See the PR. |

The 2026-09-08 preparation evidence still applies. It ran 20 focused tests, three of them isolated PostgreSQL tests, plus the historical T0201 and #305 regressions.

## #345 integration

#345 (daily numbers and staff handout) is merged and live. This change touches only the session messaging and lifetime code, and uses the same guest QR/number for entrance handout. The Monday walkthrough should confirm that a home-prepared booking reopens with the same safety state and number, and that handout works without duplicate collection.
