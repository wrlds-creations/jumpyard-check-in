# #541 A simpler staff app

Revised on 2026-10-15 by [#547](gh-547-ready-is-checked-in.md) (D0265): a finished guest is "Incheckad" at once, and the red "Behöver personal" box, "Checka in", "Redo" and "Bekräftas" are gone.

Decision: [D0263](../DECISIONS.md). Since D0230 Cloud checks every finished group in itself, so staff no longer check guests in. The entrance phone (the JumpYard Personal APK on the Motorola phones, 432 CSS px) answers guests and hands out bands, and the café works on a computer. The change is web only. The APK loads `https://staff-checkin.jumpyard.se/`, so it needs no rebuild; its camera permission is now unused.

## Entrance (phone first)

- **Two lists:** "Kommande" (every group that is not checked in yet) and "Incheckade". A started check-in shows a red "Påbörjad" tag and a finished one that Cloud is still checking in shows "Redo". Kommande is the default. The time slot picker and the "Nästa pass · HH:MM" line are unchanged.
- **"Behöver personal":** a group whose automatic check-in failed (`autoCheckin.status = needs_staff`) sits in a red box above the tabs. It stays there whatever the tab, time slot or search; while searching, the box shows the last whole-day list. Its one button, "Checka in", calls the staff redeem route with the key `staff-redeem:<checkinSessionId>`, the same key as the automatic check-in, so the two can never redeem twice. It hands nothing out.
- **Rows fold out** in place, one at a time. An open row loads the guest's detail and refreshes it every two seconds, as the old detail view did. An open row stays in the list it was opened from, even after "Checka in", until it is closed.
- **Goods are read-only:** bands with Cloud's colour and duration, padlocks, SkyRider and socks, plus a "Caféet: …" line. A checked-in group gets one "Lämna ut" that hands out everything left at the entrance. It is the existing handout API: a selection and its confirmation. Afterwards the row shows a check per line and "Utlämnat HH:MM · <staff>". Opening the same number again shows those checks, so bands are not handed out twice.
- **The check-in line** reads "Incheckad HH:MM". Cloud's automatic actor ("automatiskt") is hidden; a colleague's name stays.
- **Not checked in:** the goods show with the existing reason ("Check-in inte påbörjad", "Gästen slutför check-in i mobilen eller kiosken", "Bokningen bekräftas") and no button.
- **Jump time (follow-up, 2026-10-15):** every entrance row shows the time from start to end, for example "14:30–16:00". It is the booking's start and end from the board summary, the same as the guest's "Hopptid" (D0254). Without an end, the latest band end stands in.
- **Bands before check-in (follow-up, 2026-10-15):** a folded-out "Kommande" row shows the group's band lines like a checked-in group: "Besöksband", duration, colour and count.
  - Cloud's handout list keeps admissions only for tickets chosen at check-in (`buildManifest`), so before that the app builds the lines from the row's `bandColours` and `counts.admission` (`plannedBands` in `flow.ts`).
  - Any uncoloured rest gets its own line. Once Cloud lists the bands, only its lines show.

## Café (computer first)

- **Two lists:** "Kvar att hämta" (oldest check-in first) and "Utlämnat" (newest first). On a wide screen they sit side by side; on a phone a toggle switches between them.
- **Rows** show the number large (up to 60 px), the name and "N kvar". They fold out like the entrance rows.
- **Partial pickups:** each café line has − / + starting at everything left. "Lämna ut" hands out the chosen quantities: a selection and its confirmation. Earlier pickups are listed when part is still left or there were several.
- **Before admission:** café goods can be collected once the guest's check-in is ready (D0217).
- **Remembered counter:** the browser tab remembers the chosen counter (`sessionStorage`, key `jumpyard_staff_area_v1`), so the café computer stays on Café after "Byt personal" or an idle logout.

## Removed

- The "Skanna QR" button, the camera scanner and the legacy view's "Scanna ny QR".
- The `@zxing/browser` dependency.
- The staff site's camera permission (`Permissions-Policy: camera=()`).
- Search by name, booking or number stays, and so does a pasted handoff payload.
- The kiosk slip still prints a QR (kiosk scope).

## Font

The staff app uses the guest app's Acumin type system (D0247) unchanged:
- the same `AcuminVariableConcept.woff2`, byte-identical in `jumpyard-checkin-admin/public/fonts/`;
- the same `@font-face` and role rules, copied into the admin `globals.css` after the shared fallback stack (D0159, which T0194 pins);
- a font preload in `layout.tsx`.

Names, numbers, tab labels and goods are one size up, as the phone's titles are, because Acumin's headings are condensed.

## Calls

No Cloud, API, ROLLER or kiosk change. Per guest it is:
- one detail read when a row opens, then the usual two-second refresh while it stays open;
- one selection and one confirmation per "Lämna ut" (the old flow needed two or three selections first);
- one redeem per "Checka in".

The whole-day board polling is unchanged.

## Not included

The folded list cannot show whether a group's bands were handed out, because the board summary carries café totals only. That would need an entrance total in `staff-board.js` (Cloud).

## Validation

- `npm run validate:gh345-staff-handout`, which includes `jumpyard-checkin-admin/src/lib/staffExperience.test.mjs`, covers:
  - the two tabs and the red box;
  - the row that stays open after "Checka in";
  - the hidden "automatiskt";
  - the removed scanner and dependency;
  - one-tap "Lämna ut" and the café quantities;
  - the wide café layout, Acumin parity with the phone, and the page wiring.
- `validate:t0194-staff-identity-frontend`, `validate:gh274-redeem-success-visible` and `validate:gh456-auto-checkin` assert the removed scanner and the new "Behöver personal" source.
- Admin `npx tsc --noEmit`, `npm run lint` and `npx next build --webpack`.

Locally, T0194's Turbopack build cannot follow the `node_modules` junction, a known limitation; CI builds normally.

## After release

Test these after the release:
- **Motorola (APK):** reload it. Check the two tabs, a row that folds out, "Lämna ut" on a checked-in group, and that the same number then shows "Utlämnat".
- **Follow-up:** every entrance row shows start to end, and a group that has not checked in shows its bands when folded out under "Kommande".
- **Café computer:** open https://staff-checkin.jumpyard.se, choose Café, then fold out a guest, take one of two coffees with −, and press "Lämna ut".
- **"Behöver personal":** this case appears only when an automatic check-in fails.
