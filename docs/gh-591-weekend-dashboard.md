# GH-591 weekend results dashboard

A read-only report for Gustav on the Nacka test weekend (Saturday 17 – Sunday 18 October 2026). It compares the weekend with the weekend before (10–11 October) and with three earlier weekends of about the same size. Love approved the metrics and the look in the issue chat on 2026-10-20. Love then asked for the comparison weekends, each add-on and the split of the groups that did not check in through us ("få med allt"), then for "drop-in" in the wording, the 90-minute comparison and kronor per jumper ("kör allt!"). On 2026-10-21 Love agreed to compare paying groups only, after the free-entry effect below came to light.

## Deliverable

- Private Artifact page "Pilotrapport Nacka": https://claude.ai/artifact/9FT8qktahwzCmjJjQDTBsy (version 4). Love decides whether and how to share it.
- A one-page summary image of the drop-in comparison (paying groups only, with a "Så mätte vi" box) was made from the same numbers for Love's reply to JumpYard.
- Look: JumpYard's guest-app profile, on Love's request ("gärna i jumpyards font och grafiska profil"). It uses the four Acumin roles from `jumpyard-checkin-phone/src/app/globals.css` (D0247), red `#E31837`, bordered cards and JumpYard Next icons. WRLDS stays the visible sender: the wrlds wordmark sits in the masthead and footer, and the footer reads "Pilotrapport från WRLDS Creations om JumpYard Next. Inte en officiell JumpYard-publikation." The page has no JumpYard logo.
- Aggregates only. The page holds no names, email addresses, phone numbers or booking numbers.
- Every number sits in one JSON block (`<script type="application/json" id="pilot-data">`). It holds the per-day output of the metrics query below, unchanged; the page computes sums, shares and the p-value from it.
- No product code, Cloud, AWS or ROLLER change. The data was read on 2026-10-20 with SELECT statements only. Love declined ROLLER calls for this report.

## The weekends

- **10–11 October (the weekend before):** no kiosks and no self check-in. Those days have no `checkin_sessions` rows and no `Api` bookings; the kiosks were installed on 12 October. Every regular group went through the kassan: 286 bought there and 286 had pre-booked (285 web bookings, 1 staff booking). It was the biggest weekend in the cache (572 regular groups).
- **Comparison weekends of about the same size:** 12–13 September (378 regular groups), 19–20 September (380) and 3–4 October (367), against 375 on the test weekend. None of them used our system. 26–27 September (489) was left out for its size.
- **The same weekend last year** is not in the Aurora copy, which starts on 2026-06-14. It would need ROLLER, and Love declined that.
- Weekend sizes differ, so the page compares shares and amounts per jumper, not counts.

## Data access

Park Aurora, database `jumpyard_cloud`, through the RDS Data API with the Booking Lambda's runtime secret. That role can read every table used here, including `checkin_sessions` and `idempotency_records`.

```bash
SECRET=$(MSYS_NO_PATHCONV=1 aws lambda get-function-configuration --function-name jumpyard-check-in-park-test-stack-booking --query Environment.Variables.DATABASE_SECRET_ARN --output text --profile wrlds-dev --region eu-north-1)
MSYS_NO_PATHCONV=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8 aws rds-data execute-statement --profile wrlds-dev --region eu-north-1 --resource-arn arn:aws:rds:eu-north-1:376129878018:cluster:jumpyard-check-in-park-test-aurora --secret-arn "$SECRET" --database jumpyard_cloud --format-records-as JSON --sql "$(cat gh591-metrics.sql)"
```

Save the queries below as `gh591-metrics.sql`, `gh591-team-check.sql` and `gh591-crosscheck.sql`. The two `PYTHON…` variables keep the CLI output in UTF-8 on Windows; product names contain å, ä, ö and é.

## Definitions and filters

Everything below is part of the one metrics query.

- **Days and venue.** The query reads the days in its `days` list. All ten days hold one venue (`50871`, Nacka, ROLLER `live`).
- **Team purchases and tests are not counted.** A booking is left out when any of these holds:
  - its draft has a masked customer email on the domain `wrlds.com`;
  - its draft comes from the kiosk `test-k1`;
  - it is a 0 kr code purchase created before 10:00 Stockholm time (the morning opening checks);
  - it belongs to a ROLLER customer (`bookingCustomerId`) who made one of the purchases above, in any channel and at any amount. This catches the team's later 0 kr tests and six paid afternoon kiosk purchases made with the address of the opening checks. Love decided on 2026-10-20 that the team's own purchases are not counted.
  - Result: 16 bookings on 17 October, none on the other days. Keep 17–18 October in the `days` list when a weekend is added, because their tests identify the team's ROLLER customers.
- **Regular jump group.** A booking that is not cancelled or tombstoned, has at least one `Entré …` line, and has no kalas (`MINI`, `MIDI` or `MAXI …`) or `Föreningsgrupp` line. Jumpers are the Entré quantity; a `… - Familj` line counts 4 jumpers (#564).
- **Channel.**
  - Kiosk: a published `card_present` new purchase at `nacka-k1` … `nacka-k5` whose payment was approved (`reconciled`) or that cost 0 kr after a code.
  - Kiosk add-on purchase: the same for `flow_type = 'add_product'` (a pre-booked guest buying add-ons at the kiosk).
  - Phone: a published `ecommerce` new purchase.
  - Otherwise `normalized_summary.bookingLocation` decides: `Doorlist` is the kassan, `Consumer` is the web, and anything else (staff bookings) is "other".
- **Checked in through our system.** The booking has a `checkin_sessions` row on its visit day with status `redeemed` or `ready_for_staff`.
- **Pre-booked.** Regular groups in the web, phone or other channel.
- **Via the kassan, or likely did not come.** The kassan sends no webhook when it checks a group in, and our copy has no redeem status for kassan check-ins (`redeem_status_last_seen` is written only by our own flows). ROLLER's change time (`roller_modified_at`, the Data API `bookingModifiedDate`) does move. A pre-booked group that did not check in through us counts as checked in at the kassan when its booking changed at least one minute after it was made, on its visit day (`prebooked_kassan_groups`); otherwise it most likely did not come (`prebooked_absent_groups`). On 17–18 October that gives 14 and 4: all 14 changes fell between 16 minutes before and 12 minutes after the start time, and the 4 unchanged bookings were made on the day.
- **Amounts.** ROLLER's `total_cents` as it stands after later kassan changes, summed per day and shown in whole kronor (the öre of each sum are cut off, which never moves a figure on the page). One Sunday kiosk purchase (440 kr) was cancelled in the kassan afterwards and is not counted; another was reduced from 480 to 240 kr and counts as 240 kr.
- **Kiosk add-ons.** JumpSocks, SkyRider, Hänglås, JumpYard Vatten and Bryggkaffe lines in kiosk purchases and kiosk add-on purchases. Their value is `costCents × quantity − discountAmountCents`.
- **Fair comparison (drop-in, paying groups only).** Regular entry purchases made on the spot: the kiosk on 17–18 October against the kassan on each comparison weekend. The drop-in price lists were identical on all five weekends (60, 90 and 120 minutes at 200–240, 250–290 and 300–340 kr; add-ons 49, 40 and 45 kr).
  - **Free entries are left out** (`…_paid_…` metrics). A group counts as a free entry when one of its entry lines has a discount covering its whole price (`free_entry`; most likely punch cards, vouchers or free tickets, ROLLER does not say). The kassan had 86 such groups on the four weekends (about one in ten drop-in groups) and the kiosk 5. They rarely buy add-ons, and they mostly go to the kassan: on the test weekend 12 of the kassan's 39 drop-in groups were free against 5 of the kiosk's 161. Counting them would credit the kiosk with the kassan's free guests, so the page compares paying groups only (`kassan_free_groups`, `kiosk_free_groups`). With all groups the kiosk looked better (add-ons 48 % against 37–40 %, kronor 266 against 223–237 kr).
  - Add-ons in the same purchase: groups whose booking holds JumpSocks, SkyRider or Hänglås. A pooled two-proportion z test of the kiosk (76 of 156) against the four kassan weekends together (330 of 798) gives z ≈ 1.7 and a two-sided p ≈ 0.09, so the page says the difference is not yet statistically certain.
  - Chose 90 minutes: groups with at least one `Entré 90 min …` line. The kiosk (56 of 156) against the four kassan weekends (168 of 798) gives z ≈ 4.0, p < 0.001. The card's footer also gives the share of jumpers on 90 minutes.
  - Kronor per jumper: ROLLER's booking totals for the paying drop-in groups divided by their jumpers. The entry part is the total minus every non-entry item (`…_paid_entry_kr`), so a line without an item price still counts at its booking total. No test is applied to kronor; the page states whether the kiosk is above every kassan weekend.
  - The page computes every p from the JSON and says "statistiskt säker" only below 0.05.
  - Control 1: the web bookings' own add-on and 90-minute shares for paying groups (`web_paid_…`), computed the same way. On the web the guests also choose on a screen.
  - Control 2: the whole park, that is every booking without kalas or Föreningsgrupp lines (all channels, café sales included), per regular jumper: jump add-on kronor (`park_jump_addon_kr`) and visit spend (`park_visit_kr`, the booking totals minus gift cards, multi-visit cards, memberships, merchandise and other items that are not part of the visit).
- **Each add-on in the whole park.** Quantities in every booking without kalas or Föreningsgrupp lines, all channels and café sales included, per 100 regular jumpers: JumpSocks (`park_socks`), SkyRider (`park_skyrider`), Hänglås (`park_lock`), water as JumpYard Vatten plus Mineralvatten (`park_water`), and coffee as Bryggkaffe, Cappuccino, Latte, Americano and Dubbel Espresso (`park_coffee`). Kalas coffee products are not included.
- **New email addresses.** Distinct `customer_email_hash` values among kiosk and phone purchases whose last name is `Gäst`. The Cloud sets `Gäst` only when the exact Klaviyo lookup did not know the address (D0234), so "new" means unknown to JumpYard's Klaviyo at the time of purchase. A few of these customers may still exist in ROLLER (#579).
- **Marketing opt-ins.** Purchases with a `jumpyard.idempotency_records` row where `operation = 'phone_email_marketing'` and the grant says `granted: true` (D0225, #444). "New guests" are opt-ins whose purchase also has `Gäst`. These rows expire after 30 days, so read a weekend within 30 days.
- **Kassan's own customer.** The kassan books most walk-ins on one shared ROLLER customer. A kassan group counts as having its own customer when its `bookingCustomerId` is not the day's most common one.

## Metrics query

One statement. It returns one row per day and metric, and its output is what the page's JSON block holds.

```sql
-- GH-591 weekend metrics. Read-only. One row per (day, metric). Change the day list to add a weekend.
WITH days(d) AS (
  VALUES (DATE '2026-09-12'), (DATE '2026-09-13'), (DATE '2026-09-19'), (DATE '2026-09-20'),
         (DATE '2026-10-03'), (DATE '2026-10-04'), (DATE '2026-10-10'), (DATE '2026-10-11'),
         (DATE '2026-10-17'), (DATE '2026-10-18')
), drafts AS (
  SELECT d.*, k.kiosk_name_id
  FROM jumpyard.prepayment_booking_drafts d
  LEFT JOIN jumpyard.kiosk_installations k ON k.installation_id = d.kiosk_installation_id
  WHERE d.booking_date IN (SELECT d FROM days)
), test_drafts AS (
  -- Team tests: the team address domain, the test kiosk, and 0 kr code purchases before opening (10:00).
  SELECT roller_draft_unique_id uid FROM drafts
  WHERE split_part(customer_email_masked, '@', 2) = 'wrlds.com'
     OR kiosk_name_id = 'test-k1'
     OR (total_cents = 0 AND (created_at AT TIME ZONE 'Europe/Stockholm')::time < TIME '10:00')
), test_customers AS (
  SELECT DISTINCT b.normalized_summary->>'bookingCustomerId' cid
  FROM jumpyard.roller_bookings b JOIN test_drafts t ON t.uid = b.roller_unique_id
), tests AS (
  SELECT uid FROM test_drafts WHERE uid IS NOT NULL
  UNION
  -- Every booking, in any channel and at any amount, by a ROLLER customer who made a team test purchase
  -- (Love 2026-10-20: the team's own purchases are not counted).
  SELECT b.roller_unique_id FROM jumpyard.roller_bookings b
  JOIN test_customers c ON c.cid = b.normalized_summary->>'bookingCustomerId'
  WHERE b.booking_date IN (SELECT d FROM days)
), kiosk_new AS (
  SELECT roller_draft_unique_id uid, customer_email_hash eh, customer_last_name = 'Gäst' gast,
    payment_attempt_status = 'reconciled' AND total_cents > 0 card
  FROM drafts
  WHERE payment_channel = 'card_present' AND flow_type = 'new_booking' AND status = 'published'
    AND (payment_attempt_status = 'reconciled' OR total_cents = 0) AND kiosk_name_id LIKE 'nacka-k%'
), kiosk_addon AS (
  SELECT roller_draft_unique_id uid FROM drafts
  WHERE payment_channel = 'card_present' AND flow_type = 'add_product' AND status = 'published'
    AND payment_attempt_status = 'reconciled' AND kiosk_name_id LIKE 'nacka-k%'
), phone_new AS (
  SELECT roller_draft_unique_id uid, customer_email_hash eh, customer_last_name = 'Gäst' gast FROM drafts
  WHERE payment_channel = 'ecommerce' AND flow_type = 'new_booking' AND status = 'published'
), optin AS (
  SELECT DISTINCT r.result_ref::jsonb->>'uniqueId' uid FROM jumpyard.idempotency_records r
  WHERE r.operation = 'phone_email_marketing' AND r.result_ref::jsonb->>'granted' = 'true'
), b AS (
  SELECT b.roller_unique_id uid, b.booking_date d, b.total_cents, b.roller_modified_at,
    b.normalized_summary->>'bookingLocation' loc, b.normalized_summary->>'bookingCustomerId' cid
  FROM jumpyard.roller_bookings b
  WHERE b.booking_date IN (SELECT d FROM days) AND b.booking_status <> 'Cancelled' AND NOT b.is_tombstoned
    AND b.roller_unique_id NOT IN (SELECT uid FROM tests)
), it AS (
  SELECT i.roller_unique_id uid,
    sum(CASE WHEN i.parent_product_name IN ('Entré 60 min', 'Entré 90 min', 'Entré 120 min') THEN i.quantity
             WHEN i.parent_product_name IN ('Entré 60 min - Familj', 'Entré 90 min - Familj', 'Entré 120 min - Familj') THEN 4 * i.quantity
             ELSE 0 END) jumpers,
    count(*) FILTER (WHERE i.parent_product_name LIKE 'Entré %') entry_lines,
    count(*) FILTER (WHERE i.parent_product_name ~ '^(MINI|MIDI|MAXI) ' OR i.parent_product_name LIKE 'Föreningsgrupp%') party_lines,
    coalesce(sum(i.quantity) FILTER (WHERE i.parent_product_name = 'JumpSocks'), 0) socks,
    coalesce(sum(i.quantity) FILTER (WHERE i.parent_product_name = 'SkyRider'), 0) skyrider,
    coalesce(sum(i.quantity) FILTER (WHERE i.parent_product_name = 'Hänglås'), 0) lock,
    coalesce(sum(i.quantity) FILTER (WHERE i.product_name = 'JumpYard Vatten'), 0) water,
    coalesce(sum(i.quantity) FILTER (WHERE i.product_name = 'Bryggkaffe'), 0) coffee,
    coalesce(sum(i.quantity) FILTER (WHERE i.product_name = 'JumpYard Vatten' OR i.product_name LIKE 'Mineralvatten%'), 0) water_all,
    coalesce(sum(i.quantity) FILTER (WHERE i.product_name IN ('Bryggkaffe', 'Cappuccino', 'Latte', 'Americano', 'Dubbel Espresso')), 0) coffee_all,
    min(left(i.item_summary->>'createdDate', 19))::timestamp AT TIME ZONE 'UTC' created_at,
    sum(CASE WHEN i.parent_product_name LIKE 'Entré 60 min%' THEN CASE WHEN i.parent_product_name LIKE '%Familj' THEN 4 ELSE 1 END * i.quantity ELSE 0 END) j60,
    sum(CASE WHEN i.parent_product_name LIKE 'Entré 90 min%' THEN CASE WHEN i.parent_product_name LIKE '%Familj' THEN 4 ELSE 1 END * i.quantity ELSE 0 END) j90,
    bool_or(i.parent_product_name LIKE 'Entré 90 min%') has90,
    -- A free entry: an entry line whose discount covers its whole price (punch cards, vouchers and the like).
    bool_or(i.parent_product_name LIKE 'Entré %' AND coalesce((i.item_summary->>'discountAmountCents')::int, 0) > 0
      AND (i.item_summary->>'discountAmountCents')::int >= coalesce((i.item_summary->>'costCents')::int, 0) * i.quantity) free_entry,
    coalesce(sum(coalesce((i.item_summary->>'costCents')::int, 0) * i.quantity - coalesce((i.item_summary->>'discountAmountCents')::int, 0)) FILTER (WHERE i.parent_product_name NOT LIKE 'Entré %'), 0) nonentry_cents,
    -- Spending that is not part of the visit: gift cards, multi-visit cards, memberships, merchandise and the like.
    coalesce(sum(coalesce((i.item_summary->>'costCents')::int, 0) * i.quantity - coalesce((i.item_summary->>'discountAmountCents')::int, 0)) FILTER (WHERE i.parent_product_name NOT LIKE 'Entré %'
      AND i.parent_product_name NOT IN ('JumpSocks', 'SkyRider', 'Hänglås', 'Coffee and Tea (Sweden)', 'Cold Drinks',
        'Confectionary', 'Food', 'Food Other', 'Ice Cream GB', 'Pizza', 'Extra 30 minuter', 'Extra timme')), 0) other_cents,
    coalesce(sum(coalesce((i.item_summary->>'costCents')::int, 0) * i.quantity - coalesce((i.item_summary->>'discountAmountCents')::int, 0))
      FILTER (WHERE i.parent_product_name IN ('JumpSocks', 'SkyRider', 'Hänglås')), 0) jump_addon_cents,
    coalesce(sum(coalesce((i.item_summary->>'costCents')::int, 0) * i.quantity - coalesce((i.item_summary->>'discountAmountCents')::int, 0))
      FILTER (WHERE i.parent_product_name IN ('JumpSocks', 'SkyRider', 'Hänglås') OR i.product_name IN ('JumpYard Vatten', 'Bryggkaffe')), 0) addon_cents
  FROM jumpyard.roller_booking_items i
  WHERE i.roller_unique_id IN (SELECT uid FROM b)
  GROUP BY i.roller_unique_id
), g AS (
  SELECT b.uid, b.d, b.total_cents, b.loc, b.cid, it.jumpers, it.party_lines, it.socks, it.skyrider, it.lock,
    it.water, it.coffee, it.water_all, it.coffee_all, it.jump_addon_cents, it.addon_cents,
    it.j60, it.j90, it.has90, it.nonentry_cents, it.other_cents, coalesce(it.free_entry, false) free_entry,
    -- The kassan sends no signal when it checks a group in, but ROLLER's change time moves: a booking changed
    -- at least a minute after it was made, on its visit day, was most likely checked in at the kassan.
    coalesce(b.roller_modified_at > it.created_at + interval '1 minute'
      AND (b.roller_modified_at AT TIME ZONE 'Europe/Stockholm')::date = b.d, false) changed_on_day,
    it.entry_lines > 0 AND it.party_lines = 0 regular,
    it.socks + it.skyrider + it.lock > 0 has_jump_addon,
    CASE WHEN b.uid IN (SELECT uid FROM kiosk_new) THEN 'kiosk'
         WHEN b.uid IN (SELECT uid FROM kiosk_addon) THEN 'kiosk_addon'
         WHEN b.uid IN (SELECT uid FROM phone_new) THEN 'phone'
         WHEN b.loc = 'Doorlist' THEN 'kassan'
         WHEN b.loc = 'Consumer' THEN 'web'
         ELSE 'other' END ch,
    EXISTS (SELECT 1 FROM jumpyard.checkin_sessions s WHERE s.roller_unique_id = b.uid AND s.visit_date = b.d
            AND s.status IN ('redeemed', 'ready_for_staff')) via_us
  FROM b JOIN it USING (uid)
), kassan_walkin AS (
  -- The kassan books most walk-ins on one shared customer; the day's most common customer is that one.
  SELECT DISTINCT ON (d) d, cid FROM g WHERE regular AND ch = 'kassan'
  GROUP BY d, cid ORDER BY d, count(*) DESC
), buyers AS (
  SELECT g.d, n.eh, n.gast, n.card, g.uid IN (SELECT uid FROM optin) optin, g.total_cents
  FROM g JOIN kiosk_new n ON n.uid = g.uid
  UNION ALL
  SELECT g.d, p.eh, p.gast, false, g.uid IN (SELECT uid FROM optin), g.total_cents
  FROM g JOIN phone_new p ON p.uid = g.uid
), day_rows AS (
  SELECT days.d,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular) regular_groups,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular) regular_jumpers,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND via_us) via_us_groups,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND via_us) via_us_jumpers,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_groups,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_jumpers,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_groups,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_jumpers,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch IN ('web', 'other', 'phone')) prebooked_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch IN ('web', 'other', 'phone') AND via_us) prebooked_via_us_groups,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND ch IN ('web', 'other', 'phone') AND via_us) prebooked_via_us_jumpers,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch IN ('web', 'other', 'phone') AND NOT via_us AND changed_on_day) prebooked_kassan_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch IN ('web', 'other', 'phone') AND NOT via_us AND NOT changed_on_day) prebooked_absent_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND has_jump_addon) kassan_addon_groups,
    (SELECT coalesce(sum(jump_addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_jump_addon_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND has_jump_addon) kiosk_addon_groups,
    (SELECT coalesce(sum(jump_addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_jump_addon_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web') web_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web' AND has_jump_addon) web_addon_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry AND has_jump_addon) kiosk_paid_addon_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry AND has90) kiosk_paid_groups_90,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_jumpers,
    (SELECT coalesce(sum(j90), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_jumpers_90,
    (SELECT coalesce(sum(total_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_total_kr,
    (SELECT coalesce(sum(total_cents - nonentry_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_entry_kr,
    (SELECT coalesce(sum(jump_addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND NOT free_entry) kiosk_paid_jump_addon_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND free_entry) kiosk_free_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry AND has_jump_addon) kassan_paid_addon_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry AND has90) kassan_paid_groups_90,
    (SELECT coalesce(sum(jumpers), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_jumpers,
    (SELECT coalesce(sum(j90), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_jumpers_90,
    (SELECT coalesce(sum(total_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_total_kr,
    (SELECT coalesce(sum(total_cents - nonentry_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_entry_kr,
    (SELECT coalesce(sum(jump_addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND NOT free_entry) kassan_paid_jump_addon_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND free_entry) kassan_free_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web' AND NOT free_entry) web_paid_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web' AND NOT free_entry AND has_jump_addon) web_paid_addon_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web' AND NOT free_entry AND has90) web_paid_groups_90,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk' AND has90) kiosk_groups_90,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan' AND has90) kassan_groups_90,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'web' AND has90) web_groups_90,
    (SELECT coalesce(sum(j60), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_jumpers_60,
    (SELECT coalesce(sum(j90), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_jumpers_90,
    (SELECT coalesce(sum(j60), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_jumpers_60,
    (SELECT coalesce(sum(j90), 0) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_jumpers_90,
    (SELECT coalesce(sum(total_cents - nonentry_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kiosk') kiosk_entry_kr,
    (SELECT coalesce(sum(total_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_total_kr,
    (SELECT coalesce(sum(total_cents - nonentry_cents), 0) / 100 FROM g WHERE g.d = days.d AND regular AND ch = 'kassan') kassan_entry_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND regular AND ch = 'kassan'
       AND cid IS DISTINCT FROM (SELECT w.cid FROM kassan_walkin w WHERE w.d = days.d)) kassan_own_customer_groups,
    (SELECT count(*) FROM g WHERE g.d = days.d AND ch = 'kiosk') kiosk_purchases,
    (SELECT count(*) FROM g JOIN kiosk_new n USING (uid) WHERE g.d = days.d AND n.card) kiosk_card_purchases,
    (SELECT coalesce(sum(total_cents), 0) / 100 FROM g WHERE g.d = days.d AND ch = 'kiosk') kiosk_ticket_kr,
    (SELECT count(*) FROM g WHERE g.d = days.d AND ch = 'kiosk_addon') kiosk_addon_purchases,
    (SELECT coalesce(sum(total_cents), 0) / 100 FROM g WHERE g.d = days.d AND ch = 'kiosk_addon') kiosk_addon_purchase_kr,
    (SELECT coalesce(sum(socks), 0) FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_socks,
    (SELECT coalesce(sum(skyrider), 0) FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_skyrider,
    (SELECT coalesce(sum(lock), 0) FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_lock,
    (SELECT coalesce(sum(water), 0) FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_water,
    (SELECT coalesce(sum(coffee), 0) FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_coffee,
    (SELECT coalesce(sum(addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND ch IN ('kiosk', 'kiosk_addon')) kiosk_addon_items_kr,
    (SELECT count(*) FROM buyers WHERE buyers.d = days.d) buyer_purchases,
    (SELECT count(DISTINCT eh) FROM buyers WHERE buyers.d = days.d) buyer_emails,
    (SELECT count(DISTINCT eh) FROM buyers WHERE buyers.d = days.d AND gast) new_emails,
    (SELECT count(*) FROM buyers WHERE buyers.d = days.d AND optin) optins,
    (SELECT count(*) FROM buyers WHERE buyers.d = days.d AND optin AND gast) optins_new_guests,
    (SELECT coalesce(sum(jump_addon_cents), 0) / 100 FROM g WHERE g.d = days.d AND party_lines = 0) park_jump_addon_kr,
    (SELECT coalesce(sum(socks), 0) FROM g WHERE g.d = days.d AND party_lines = 0) park_socks,
    (SELECT coalesce(sum(skyrider), 0) FROM g WHERE g.d = days.d AND party_lines = 0) park_skyrider,
    (SELECT coalesce(sum(lock), 0) FROM g WHERE g.d = days.d AND party_lines = 0) park_lock,
    (SELECT coalesce(sum(water_all), 0) FROM g WHERE g.d = days.d AND party_lines = 0) park_water,
    (SELECT coalesce(sum(coffee_all), 0) FROM g WHERE g.d = days.d AND party_lines = 0) park_coffee,
    (SELECT coalesce(sum(total_cents - other_cents), 0) / 100 FROM g WHERE g.d = days.d AND party_lines = 0) park_visit_kr,
    (SELECT count(*) FROM jumpyard.roller_bookings t WHERE t.booking_date = days.d AND t.roller_unique_id IN (SELECT uid FROM tests)) test_bookings,
    (SELECT count(*) FROM jumpyard.roller_bookings c JOIN kiosk_new n ON n.uid = c.roller_unique_id
       WHERE c.booking_date = days.d AND c.booking_status = 'Cancelled' AND c.roller_unique_id NOT IN (SELECT uid FROM tests)) kiosk_cancelled
  FROM days
)
SELECT d, m.metric, m.value
FROM day_rows CROSS JOIN LATERAL (VALUES
  ('regular_groups', regular_groups), ('regular_jumpers', regular_jumpers),
  ('via_us_groups', via_us_groups), ('via_us_jumpers', via_us_jumpers),
  ('kiosk_groups', kiosk_groups), ('kiosk_jumpers', kiosk_jumpers),
  ('kassan_groups', kassan_groups), ('kassan_jumpers', kassan_jumpers),
  ('prebooked_groups', prebooked_groups), ('prebooked_via_us_groups', prebooked_via_us_groups),
  ('prebooked_via_us_jumpers', prebooked_via_us_jumpers),
  ('prebooked_kassan_groups', prebooked_kassan_groups), ('prebooked_absent_groups', prebooked_absent_groups),
  ('kassan_addon_groups', kassan_addon_groups), ('kassan_jump_addon_kr', kassan_jump_addon_kr),
  ('kiosk_addon_groups', kiosk_addon_groups), ('kiosk_jump_addon_kr', kiosk_jump_addon_kr),
  ('web_groups', web_groups), ('web_addon_groups', web_addon_groups),
  ('kiosk_paid_groups', kiosk_paid_groups), ('kiosk_paid_addon_groups', kiosk_paid_addon_groups), ('kiosk_paid_groups_90', kiosk_paid_groups_90),
  ('kiosk_paid_jumpers', kiosk_paid_jumpers), ('kiosk_paid_jumpers_90', kiosk_paid_jumpers_90), ('kiosk_paid_total_kr', kiosk_paid_total_kr),
  ('kiosk_paid_entry_kr', kiosk_paid_entry_kr), ('kiosk_paid_jump_addon_kr', kiosk_paid_jump_addon_kr), ('kiosk_free_groups', kiosk_free_groups),
  ('kassan_paid_groups', kassan_paid_groups), ('kassan_paid_addon_groups', kassan_paid_addon_groups), ('kassan_paid_groups_90', kassan_paid_groups_90),
  ('kassan_paid_jumpers', kassan_paid_jumpers), ('kassan_paid_jumpers_90', kassan_paid_jumpers_90), ('kassan_paid_total_kr', kassan_paid_total_kr),
  ('kassan_paid_entry_kr', kassan_paid_entry_kr), ('kassan_paid_jump_addon_kr', kassan_paid_jump_addon_kr), ('kassan_free_groups', kassan_free_groups),
  ('web_paid_groups', web_paid_groups), ('web_paid_addon_groups', web_paid_addon_groups), ('web_paid_groups_90', web_paid_groups_90),
  ('kiosk_groups_90', kiosk_groups_90), ('kassan_groups_90', kassan_groups_90), ('web_groups_90', web_groups_90),
  ('kiosk_jumpers_60', kiosk_jumpers_60), ('kiosk_jumpers_90', kiosk_jumpers_90),
  ('kassan_jumpers_60', kassan_jumpers_60), ('kassan_jumpers_90', kassan_jumpers_90),
  ('kiosk_entry_kr', kiosk_entry_kr), ('kassan_total_kr', kassan_total_kr), ('kassan_entry_kr', kassan_entry_kr),
  ('kassan_own_customer_groups', kassan_own_customer_groups),
  ('kiosk_purchases', kiosk_purchases), ('kiosk_card_purchases', kiosk_card_purchases), ('kiosk_ticket_kr', kiosk_ticket_kr),
  ('kiosk_addon_purchases', kiosk_addon_purchases), ('kiosk_addon_purchase_kr', kiosk_addon_purchase_kr),
  ('kiosk_socks', kiosk_socks), ('kiosk_skyrider', kiosk_skyrider), ('kiosk_lock', kiosk_lock),
  ('kiosk_water', kiosk_water), ('kiosk_coffee', kiosk_coffee), ('kiosk_addon_items_kr', kiosk_addon_items_kr),
  ('buyer_purchases', buyer_purchases), ('buyer_emails', buyer_emails), ('new_emails', new_emails),
  ('optins', optins), ('optins_new_guests', optins_new_guests),
  ('park_jump_addon_kr', park_jump_addon_kr),
  ('park_socks', park_socks), ('park_skyrider', park_skyrider), ('park_lock', park_lock),
  ('park_water', park_water), ('park_coffee', park_coffee), ('park_visit_kr', park_visit_kr),
  ('test_bookings', test_bookings), ('kiosk_cancelled', kiosk_cancelled)
) m(metric, value)
ORDER BY m.metric, d
```

## Results

Read on 2026-10-20. The weekend columns are the sums of their two days.

| Metric | 12–13 Sep | 19–20 Sep | 3–4 Oct | 10–11 Oct | Sat 17 Oct | Sun 18 Oct | 17–18 Oct |
|---|--:|--:|--:|--:|--:|--:|--:|
| `buyer_emails` | 0 | 0 | 0 | 0 | 104 | 55 | 159 |
| `buyer_purchases` | 0 | 0 | 0 | 0 | 106 | 55 | 161 |
| `kassan_addon_groups` | 76 | 78 | 70 | 114 | 3 | 5 | 8 |
| `kassan_entry_kr` | 81 260 | 78 651.33 | 71 629.49 | 104 715 | 4 395 | 5 930 | 10 325 |
| `kassan_free_groups` | 20 | 16 | 22 | 28 | 7 | 5 | 12 |
| `kassan_groups` | 206 | 206 | 186 | 286 | 21 | 18 | 39 |
| `kassan_groups_90` | 38 | 40 | 33 | 59 | 3 | 2 | 5 |
| `kassan_jump_addon_kr` | 5 371.75 | 5 605.22 | 5 862.51 | 9 336 | 183.75 | 543 | 726.75 |
| `kassan_jumpers` | 376 | 357 | 350 | 505 | 34 | 36 | 70 |
| `kassan_jumpers_60` | 268 | 250 | 257 | 393 | 30 | 31 | 61 |
| `kassan_jumpers_90` | 80 | 71 | 65 | 95 | 4 | 5 | 9 |
| `kassan_own_customer_groups` | 20 | 16 | 24 | 28 | 6 | 4 | 10 |
| `kassan_paid_addon_groups` | 75 | 77 | 69 | 109 | 3 | 5 | 8 |
| `kassan_paid_entry_kr` | 81 260 | 78 651.33 | 71 629.49 | 104 715 | 4 395 | 5 930 | 10 325 |
| `kassan_paid_groups` | 186 | 190 | 164 | 258 | 14 | 13 | 27 |
| `kassan_paid_groups_90` | 36 | 40 | 33 | 59 | 2 | 1 | 3 |
| `kassan_paid_jump_addon_kr` | 5 322.75 | 5 556.22 | 5 813.51 | 8 993 | 183.75 | 543 | 726.75 |
| `kassan_paid_jumpers` | 334 | 327 | 304 | 439 | 21 | 27 | 48 |
| `kassan_paid_jumpers_90` | 76 | 71 | 65 | 95 | 2 | 3 | 5 |
| `kassan_paid_total_kr` | 87 390 | 84 546 | 77 901 | 113 932 | 4 709 | 6 473 | 11 182 |
| `kassan_total_kr` | 87 439 | 84 595 | 77 950 | 114 275 | 4 709 | 6 473 | 11 182 |
| `kiosk_addon_groups` | 0 | 0 | 0 | 0 | 55 | 23 | 78 |
| `kiosk_addon_items_kr` | 0 | 0 | 0 | 0 | 6 296 | 1 968 | 8 264 |
| `kiosk_addon_purchase_kr` | 0 | 0 | 0 | 0 | 1 820 | 168 | 1 988 |
| `kiosk_addon_purchases` | 0 | 0 | 0 | 0 | 24 | 4 | 28 |
| `kiosk_cancelled` | 0 | 0 | 0 | 0 | 0 | 1 | 1 |
| `kiosk_card_purchases` | 0 | 0 | 0 | 0 | 105 | 53 | 158 |
| `kiosk_coffee` | 0 | 0 | 0 | 0 | 4 | 2 | 6 |
| `kiosk_entry_kr` | 0 | 0 | 0 | 0 | 45 522 | 20 780 | 66 302 |
| `kiosk_free_groups` | 0 | 0 | 0 | 0 | 3 | 2 | 5 |
| `kiosk_groups` | 0 | 0 | 0 | 0 | 106 | 55 | 161 |
| `kiosk_groups_90` | 0 | 0 | 0 | 0 | 37 | 19 | 56 |
| `kiosk_jump_addon_kr` | 0 | 0 | 0 | 0 | 4 356 | 1 800 | 6 156 |
| `kiosk_jumpers` | 0 | 0 | 0 | 0 | 189 | 84 | 273 |
| `kiosk_jumpers_60` | 0 | 0 | 0 | 0 | 109 | 48 | 157 |
| `kiosk_jumpers_90` | 0 | 0 | 0 | 0 | 70 | 32 | 102 |
| `kiosk_lock` | 0 | 0 | 0 | 0 | 3 | 2 | 5 |
| `kiosk_paid_addon_groups` | 0 | 0 | 0 | 0 | 53 | 23 | 76 |
| `kiosk_paid_entry_kr` | 0 | 0 | 0 | 0 | 45 522 | 20 780 | 66 302 |
| `kiosk_paid_groups` | 0 | 0 | 0 | 0 | 103 | 53 | 156 |
| `kiosk_paid_groups_90` | 0 | 0 | 0 | 0 | 37 | 19 | 56 |
| `kiosk_paid_jump_addon_kr` | 0 | 0 | 0 | 0 | 4 213 | 1 800 | 6 013 |
| `kiosk_paid_jumpers` | 0 | 0 | 0 | 0 | 183 | 82 | 265 |
| `kiosk_paid_jumpers_90` | 0 | 0 | 0 | 0 | 70 | 32 | 102 |
| `kiosk_paid_total_kr` | 0 | 0 | 0 | 0 | 49 855 | 22 580 | 72 435 |
| `kiosk_purchases` | 0 | 0 | 0 | 0 | 106 | 55 | 161 |
| `kiosk_skyrider` | 0 | 0 | 0 | 0 | 20 | 6 | 26 |
| `kiosk_socks` | 0 | 0 | 0 | 0 | 104 | 32 | 136 |
| `kiosk_ticket_kr` | 0 | 0 | 0 | 0 | 49 998 | 22 580 | 72 578 |
| `kiosk_water` | 0 | 0 | 0 | 0 | 5 | 0 | 5 |
| `new_emails` | 0 | 0 | 0 | 0 | 66 | 43 | 109 |
| `optins` | 0 | 0 | 0 | 0 | 7 | 5 | 12 |
| `optins_new_guests` | 0 | 0 | 0 | 0 | 4 | 4 | 8 |
| `park_coffee` | 92 | 108 | 107 | 152 | 83 | 48 | 131 |
| `park_jump_addon_kr` | 17 513.75 | 16 675.22 | 20 514.51 | 28 348 | 12 170.75 | 6 047 | 18 217.75 |
| `park_lock` | 8 | 13 | 15 | 8 | 7 | 4 | 11 |
| `park_skyrider` | 167 | 128 | 178 | 195 | 86 | 45 | 131 |
| `park_socks` | 214 | 225 | 260 | 412 | 172 | 83 | 255 |
| `park_visit_kr` | 209 796.25 | 222 482.95 | 220 900.4 | 328 308.7 | 135 201.15 | 76 828 | 212 029.15 |
| `park_water` | 56 | 96 | 68 | 23 | 84 | 43 | 127 |
| `prebooked_absent_groups` | 27 | 23 | 29 | 32 | 4 | 0 | 4 |
| `prebooked_groups` | 172 | 174 | 181 | 286 | 114 | 61 | 175 |
| `prebooked_kassan_groups` | 145 | 151 | 152 | 254 | 8 | 6 | 14 |
| `prebooked_via_us_groups` | 0 | 0 | 0 | 0 | 102 | 55 | 157 |
| `prebooked_via_us_jumpers` | 0 | 0 | 0 | 0 | 227 | 137 | 364 |
| `regular_groups` | 378 | 380 | 367 | 572 | 241 | 134 | 375 |
| `regular_jumpers` | 780 | 809 | 781 | 1 226 | 475 | 270 | 745 |
| `test_bookings` | 0 | 0 | 0 | 0 | 16 | 0 | 16 |
| `via_us_groups` | 0 | 0 | 0 | 0 | 208 | 110 | 318 |
| `via_us_jumpers` | 0 | 0 | 0 | 0 | 416 | 221 | 637 |
| `web_addon_groups` | 61 | 53 | 63 | 87 | 37 | 20 | 57 |
| `web_groups` | 170 | 173 | 180 | 285 | 113 | 60 | 173 |
| `web_groups_90` | 56 | 53 | 67 | 110 | 47 | 20 | 67 |
| `web_paid_addon_groups` | 61 | 53 | 63 | 86 | 36 | 19 | 55 |
| `web_paid_groups` | 166 | 170 | 173 | 278 | 112 | 57 | 169 |
| `web_paid_groups_90` | 56 | 52 | 67 | 110 | 47 | 19 | 66 |

## Page numbers

Every figure on the page, from the results for 17–18 October unless the row says otherwise.

| Page element | From the metrics | Value |
|---|---|---|
| Hero: share that checked in themselves | `via_us_groups / regular_groups` | 318 / 375 = 85 % (Saturday 208 / 241 = 86 %, Sunday 110 / 134 = 82 %) |
| Hero: share of the groups that came | `via_us_groups / (regular_groups − prebooked_absent_groups)` | 318 / 371 = 86 % |
| Hero: groups and jumpers | `via_us_groups`, `via_us_jumpers` | 318 groups, 637 jumpers |
| Split bar, test weekend | `kiosk_groups`, `prebooked_via_us_groups`, `kassan_groups + prebooked_kassan_groups`, `prebooked_absent_groups` | 161, 157, 53 (39 + 14) and 4 groups |
| Split bar, 10–11 October | `kassan_groups + prebooked_kassan_groups`, `prebooked_absent_groups` | 540 (286 + 254) and 32 groups |
| Köp på plats | `kiosk_groups / (kiosk_groups + kassan_groups)` | 161 / 200 = 81 % |
| Förbokade | `prebooked_via_us_groups / prebooked_groups` | 157 / 175 = 90 % |
| Sålt i kiosken | `kiosk_ticket_kr + kiosk_addon_purchase_kr`, `kiosk_purchases`, `kiosk_addon_purchases` | 72 578 + 1 988 = 74 566 kr; 161 ticket purchases and 28 add-on purchases |
| Tillägg via kiosken | `kiosk_socks + kiosk_skyrider + kiosk_lock + kiosk_water + kiosk_coffee`, `kiosk_addon_items_kr` | 136 + 26 + 5 + 5 + 6 = 178 items for 8 264 kr (part of the 74 566 kr) |
| Nya e-postadresser | `new_emails` of `buyer_emails` | 109 of 159 |
| Ja till nyhetsbrev | `optins`, `optins_new_guests` | 12, of which 8 new and 4 returning guests |
| Card: add-ons in the same purchase | `kiosk_paid_addon_groups / kiosk_paid_groups`, and the same for the kassan per comparison weekend | kiosk 76 / 156 = 49 %; kassan 109 / 258 = 42 % (10–11 Oct), 69 / 164 = 42 % (3–4 Oct), 77 / 190 = 41 % (19–20 Sep), 75 / 186 = 40 % (12–13 Sep) |
| Card footer: add-ons per jumper | `kiosk_paid_jump_addon_kr / kiosk_paid_jumpers` against the four weekends' kassan figures together | 6 013 / 265 = 22.7 kr against 25 685.48 / 1 404 = 18.3 kr (+24 %) |
| Card: chose 90 minutes | `kiosk_paid_groups_90 / kiosk_paid_groups`, and the same for the kassan per comparison weekend | kiosk 56 / 156 = 36 %; kassan 59 / 258 = 23 % (10–11 Oct), 33 / 164 = 20 % (3–4 Oct), 40 / 190 = 21 % (19–20 Sep), 36 / 186 = 19 % (12–13 Sep) |
| Card footer: jumpers on 90 minutes | `kiosk_paid_jumpers_90 / kiosk_paid_jumpers`, and the same for the kassan | kiosk 102 / 265 = 38 %; kassan 21–23 % (95 / 439, 65 / 304, 71 / 327, 76 / 334) |
| Card: kronor per jumper | `kiosk_paid_total_kr / kiosk_paid_jumpers`, and the same for the kassan per comparison weekend | kiosk 72 435 / 265 = 273 kr; kassan 260 kr (10–11 Oct), 256 kr (3–4 Oct), 259 kr (19–20 Sep), 262 kr (12–13 Sep) |
| Card footer: kronor split and average | `kiosk_paid_entry_kr / kiosk_paid_jumpers`, `kiosk_paid_jump_addon_kr / kiosk_paid_jumpers`, the four weekends' kassan totals together | entry 66 302 / 265 = 250 kr, add-ons 23 kr; kassan average 363 769 / 1 404 = 259 kr (+5 %) |
| Comparison note: free entries | `kassan_free_groups` on the four weekends, `kiosk_free_groups` | 86 and 5 groups |
| Control: web bookings | `web_paid_addon_groups / web_paid_groups` and `web_paid_groups_90 / web_paid_groups` per weekend | add-ons 31–37 % and 90 minutes 31–40 % on all five weekends; 33 % and 39 % on the test weekend |
| Control: whole park | `park_visit_kr / regular_jumpers` and `park_jump_addon_kr / regular_jumpers` per weekend | visit spend 285 kr against 268–283 kr; add-ons 24.5 kr against 20.6–26.3 kr |
| Each add-on, per 100 jumpers | `park_<product> / regular_jumpers × 100` per weekend | Socks 34.2 (comparison weekends 27.4–33.6), SkyRider 17.6 (15.8–22.8), Hänglås 1.5 (0.7–1.9), water 17.0 (1.9–11.9), coffee 17.6 (11.8–13.7) |
| Sold in the kiosk, per add-on | `kiosk_<product>` of `park_<product>` | 136 of 255 socks, 26 of 131 SkyRider, 5 of 11 Hänglås, 5 of 127 water, 6 of 131 coffee |
| Small print | `test_bookings`, `kiosk_cancelled`, `prebooked_absent_groups`, `kassan_own_customer_groups` on 10–11 October | 16 team bookings, 1 cancelled kiosk purchase, 4 and 32 groups that likely did not come, 28 of 286 kassan groups with their own customer |

## Cross-checks

- Approved kiosk card payments (cross-check query): on 17 October, 111 new purchases for 51 874 kr and 24 add-on purchases for 1 820 kr; on 18 October, 54 new purchases for 23 260 kr (one cancelled later, 22 580 kr kept in ROLLER) and 4 add-on purchases for 168 kr. These match the monitor's live numbers.
- From those to the page: 111 − 6 team purchases (1 876 kr) = 105 card purchases on Saturday for 49 998 kr; 54 − 1 cancelled = 53 on Sunday for 22 580 kr. Adding the three code-paid 0 kr purchases (1 on Saturday, 2 on Sunday) gives 161 kiosk purchases.
- Saturday's 7 marketing opt-ins match the monitor's live count.
- Regular groups add up on every weekend: `kiosk + prebooked_via_us + kassan + prebooked_kassan + prebooked_absent = regular_groups` (375 on 17–18 October, 572 on 10–11 October).

## Differences from the live counts in the issue

- Saturday has 241 regular groups instead of 253, and 208 instead of 220 went through our system. All 14 team bookings among Saturday's regular groups are now left out; the live count left out 2. The share stays at 86–87 %.
- On Sunday, 18 groups bought on the spot at the kassan (all created that day), not about 10. The kiosk has 55 groups because one kiosk purchase was cancelled in the kassan afterwards.
- "13 of 121" in the issue described the two-word names from #579. The new email addresses are 109 of 159 distinct addresses.

## Observation, not on the page

On the four comparison weekends, 11–16 % of pre-booked groups never changed in ROLLER (27, 23, 29 and 32 groups), against 2 % (4 groups) on the test weekend. Either fewer guests stayed away, or more pre-booked guests got a ROLLER check-in once they could check in themselves. Our data cannot tell which.

## Adding the go-live weekend (24–25 October)

1. Add `(DATE '2026-10-24'), (DATE '2026-10-25')` to `days` and keep the existing days. Check that the drop-in price lists are still the same before comparing kronor.
2. Run the metrics query and the team check query. Look through the team bookings, and extend the team rules if a team member used another address.
3. Read the Artifact with `Artifact read`, add a weekend object to the JSON block and publish to the same URL. Example:
   `{"id": "2026-10-24", "kind": "pilot", "title": "Premiärhelg", "compareTo": ["2026-10-10", "2026-10-03", "2026-09-19", "2026-09-12"], "label": "24–25 okt", "longLabel": "24–25 oktober 2026", "caveat": "…", "days": [{"date": "2026-10-24", "label": "Lör 24/10", "m": {…}}, {"date": "2026-10-25", "label": "Sön 25/10", "m": {…}}]}`.
   The first `compareTo` weekend is "the weekend before" in the hero, split bar and day table. With two pilot weekends the masthead shows a switch, and the page opens on the newest one. A link ending in `#2026-10-17` opens the test weekend.
4. Read the opt-in rows within 30 days of the weekend.

**Read every weekend within 30 days.** The page is updated by hand and never reads live data. The approved lifecycle policy ([T0195](t0195-data-lifecycle-policy.md)) deletes bookings, items, tickets and check-in sessions 30 days after the visit, removes draft contact fields at 30 days, and deletes expired idempotency rows (the opt-ins). Lifecycle apply was not running on 2026-10-21, but once it runs, older days can no longer be re-queried. The page keeps every number already added, and this document keeps the results. The team rule identifies team customers from the 17–18 October tests; once those days are deleted (from about 17 November), base the team rule on each weekend's own team purchases.

## Team check query

Lists the bookings that the metrics query leaves out. On 2026-10-20 it returned 16 bookings, all on 17 October: eight 0 kr kiosk opening checks and tests, one 0 kr phone test, six paid kiosk purchases made with the team address and one cancelled 0 kr web booking.

```sql
-- GH-591 team check. Read-only. Lists the bookings the metrics query leaves out as team purchases and tests.
WITH days(d) AS (
  VALUES (DATE '2026-09-12'), (DATE '2026-09-13'), (DATE '2026-09-19'), (DATE '2026-09-20'),
         (DATE '2026-10-03'), (DATE '2026-10-04'), (DATE '2026-10-10'), (DATE '2026-10-11'),
         (DATE '2026-10-17'), (DATE '2026-10-18')
), drafts AS (
  SELECT d.*, k.kiosk_name_id
  FROM jumpyard.prepayment_booking_drafts d
  LEFT JOIN jumpyard.kiosk_installations k ON k.installation_id = d.kiosk_installation_id
  WHERE d.booking_date IN (SELECT d FROM days)
), test_drafts AS (
  -- Team tests: the team address domain, the test kiosk, and 0 kr code purchases before opening (10:00).
  SELECT roller_draft_unique_id uid FROM drafts
  WHERE split_part(customer_email_masked, '@', 2) = 'wrlds.com'
     OR kiosk_name_id = 'test-k1'
     OR (total_cents = 0 AND (created_at AT TIME ZONE 'Europe/Stockholm')::time < TIME '10:00')
), test_customers AS (
  SELECT DISTINCT b.normalized_summary->>'bookingCustomerId' cid
  FROM jumpyard.roller_bookings b JOIN test_drafts t ON t.uid = b.roller_unique_id
), tests AS (
  SELECT uid FROM test_drafts WHERE uid IS NOT NULL
  UNION
  -- Every booking, in any channel and at any amount, by a ROLLER customer who made a team test purchase
  -- (Love 2026-10-20: the team's own purchases are not counted).
  SELECT b.roller_unique_id FROM jumpyard.roller_bookings b
  JOIN test_customers c ON c.cid = b.normalized_summary->>'bookingCustomerId'
  WHERE b.booking_date IN (SELECT d FROM days)
)
SELECT b.booking_date, b.booking_reference, coalesce(b.normalized_summary->>'bookingLocation', '-') loc,
  b.booking_status, b.total_cents / 100 kr,
  coalesce(k.kiosk_name_id, d.payment_channel, '-') channel,
  to_char(d.created_at AT TIME ZONE 'Europe/Stockholm', 'HH24:MI') bought_at
FROM jumpyard.roller_bookings b
LEFT JOIN jumpyard.prepayment_booking_drafts d ON d.roller_draft_unique_id = b.roller_unique_id
LEFT JOIN jumpyard.kiosk_installations k ON k.installation_id = d.kiosk_installation_id
WHERE b.roller_unique_id IN (SELECT uid FROM tests)
ORDER BY b.booking_date, bought_at NULLS LAST, b.booking_reference
```

## Cross-check query

```sql
-- GH-591 cross-check. Read-only. Approved kiosk card payments per day, before team and cancellation filters.
SELECT d.booking_date, d.flow_type, count(*) approved, sum(d.total_cents) / 100 approved_kr,
  count(*) FILTER (WHERE b.booking_status = 'Cancelled') cancelled_in_roller,
  sum(b.total_cents) FILTER (WHERE b.booking_status <> 'Cancelled') / 100 roller_kr_kept
FROM jumpyard.prepayment_booking_drafts d
JOIN jumpyard.kiosk_installations k ON k.installation_id = d.kiosk_installation_id
LEFT JOIN jumpyard.roller_bookings b ON b.roller_unique_id = d.roller_draft_unique_id
WHERE d.booking_date IN ('2026-10-17', '2026-10-18') AND d.payment_channel = 'card_present'
  AND d.status = 'published' AND d.payment_attempt_status = 'reconciled' AND k.kiosk_name_id LIKE 'nacka-k%'
GROUP BY 1, 2 ORDER BY 1, 2
```
