# GH-530: the safety film starts by itself on the phone

Issue #530 removes the tap on the safety film's cover. On 2026-10-13 Love asked: "jag vill att säkerhetsvideon går igång automatiskt på både mobil och kiosk". After the first preview (which offered a "LJUD PÅ" control), Love answered the same day: "Det finns ingen ljud på videon så det ska inte finnas någon ljud på". Decision D0259; kiosk #212 is the counterpart (kiosk D0070).

## What the guest sees

1. **The screen opens:** the film starts by itself, muted, in the purchase, on an existing booking that adds something (#520) and on the page's own safety step. While it starts, the poster (variant B, Love 2026-10-01) stays, with a spinner in the white disc where the play button was.
2. **No sound control:** the films' audio tracks are digital silence (ffmpeg `volumedetect`: −91 dB mean and max in both languages), so nothing is lost by muting.
3. **Even a muted start refused (an iPhone in Low Power Mode):** the poster's play button, as before.
4. **Already approved** (Back from contact or from the add-on summary): the finished film and the approval at once, as before (#491 round 1). The docked film still replays with a tap.
5. **Unchanged:** the approval appears only after the film's genuine end. Back, Exit and the progress bar are unchanged.

## Why muted

The MP4s carry a silent AAC track, so browsers treat the film as having sound. iPhone Safari (and every iOS browser) then starts it only inside a tap, and Chrome only after a tap on the page. A muted, inline film (`muted` + `playsinline`) may start without a tap everywhere, except on an iPhone in Low Power Mode. Muting is therefore what makes the automatic start reliable on the iPhone.

## Code

- `safetyPlayback.start()` always sets `muted` before `play()`. A refused automatic start (`NotAllowedError`) ends in `idle` at zero, so the poster's play button shows. Before #530 such a refusal (only after a language switch) ended in `paused` ("Videon är pausad").
- `SafetyVideo`:
  - The `<video>` is `muted` and `playsInline`.
  - `startsByItself` is read once at mount from `!approvedAt`, so an approval given on this screen (the add-on flow's price check) never restarts the film.
  - `posterVisible` covers `idle` and the first `loading` (progress 0); a later buffering still shows "Laddar säkerhetsvideon".
- No new API calls; Cloud, ROLLER and the approval rules are unchanged. The media files are unchanged.

## Validation

- `test:safety-video`: `safetyPlayback.test.mjs` covers the muted automatic start reaching the approval, a muted tap, the refused start ending at the play button (async and synchronous) and a language switch. `SafetyScreen.test.mjs` pins the mount rule, `muted` + `playsInline`, the poster with its spinner, and that no sound control is left.
- Every phone suite, `tsc`, lint and `next build --webpack` pass.
- Localhost, headless Edge over CDP at 375×812 with Chrome's `document-user-activation-required` policy (no tap given), `/preview/flow?full=1&screen=safety-buy|safety&lang=sv|en` (purchase and existing booking): the film plays by itself, muted, past 4 s with no control on it. With the film file held back, the poster shows its spinner; with `play()` always refused, the poster shows its play button.
- After release: on an iPhone the film starts by itself in a purchase and in an existing booking with an add-on.

## Known gaps

- `scripts/verify-safety-video-browser.mjs` (#343) needs Playwright, which is not installed here, and still taps "Spela upp" after opening the film. It must be updated before its next use.
