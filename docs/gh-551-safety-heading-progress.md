# GH-551: a fixed heading and a clearer progress on the phone's safety film

Issue #551 makes the safety step easier to follow. On 2026-10-15 Love asked: "göra det lite tydligare under säkerhetsgenomgång i telefon och kiosk med tydligare progress bar och en statisk säkerhetsgenomgång text högst upp på videon". From three localhost variants (A a thick bar with the seconds left, B five steps like stories, C a heading band that fills with red), Love picked A. Decision D0267; kiosk #224 is the counterpart (kiosk D0076).

## What the guest sees

1. **A fixed heading.** "SÄKERHETSGENOMGÅNG" (EN "SAFETY BRIEFING") sits at the top of the film in white Acumin heading type, after the JumpYard flame, on a soft dark fade. It keeps its place in every phase: while the film starts, plays or is paused, and after the end, when it docks with the film. The film's own captions sit in the middle of the frame, so they never meet it.
2. **A thick bar.** A white bar with a red fill runs along the foot of the film, inset from its edges, about 9 px thick on a 375 px phone (before: a 4 px line on the very edge). It is full after the end.
3. **The seconds left.** A white chip with red text above the bar's right end counts down while the film plays: "9 SEK KVAR" (EN "9 SEC LEFT"). It is hidden on the poster and after the end.
4. **The poster** (about a second while the film starts, or with the play button where even a muted start is refused): the heading at the top replaces the title at the foot, and the "ca 15 sek" chip is gone. The spinner or play button and the line "Titta på videon tillsammans med alla som ska hoppa." stay.
5. **No Back or Exit while the film runs.** On the same day Love added: "vi ska gömma knapparna också under säkerhetsgenomgången på både kiosk och telefon". The round Back and Exit buttons fade out while the film starts or plays, and come back for the approval, a pause or an error, so a guest is never stuck. Their room stays, so nothing moves. The language switch stays.
6. **Unchanged:** muted autoplay with no sound control (#530/D0259), the approval only after the film's genuine end, the docked film's replay, cross-device resume (#305), the language switch (a new language plays its own film from the start, D0219), and where Back and Exit lead once they are back. The film, the rules text and the step order are unchanged.

## Code

- `SafetyVideo`:
  - The heading (`.safety-heading`, an `h1` with `t.safetyVideo.heading`), the bar (`.safety-bar`, full when done) and the chip (`.safety-time-left`, shown while `!approvable && !posterVisible`) are direct children of the film.
  - They sit above the poster, the pause and error cover and the replay control (z-index 40) and take no taps.
  - The film sets `--film-u` to a hundredth of its width. Every size uses it, so the phone and the kiosk match and everything scales when the film docks.
  - Removed: the corner flame, the poster title with its size and hyphen logic, and the duration chip.
- `SafetyVideo` marks its screen `data-safety-film-running` while the phase is `loading` or `playing`. `FlowNav` watches that attribute (a `MutationObserver`, like its dialog check) and steps aside as it does for the keyboard and dialogs: faded out and `inert`, with its spacer kept.
- `safetyPlayback.safetySecondsLeft(progress, durationSeconds)`: whole seconds left, rounded up (15 at the start, 1 in the last second, 0 at the end).
- Copy: `safetyVideo.heading` and `safetyVideo.timeLeft`. The unused `buyTitle` and `durationBadge` are removed.
- No API calls. Cloud, ROLLER, the media files and the approval rules are unchanged.

## Validation

- `test:safety-video`: `safetyPlayback.test.mjs` covers the seconds left; `SafetyScreen.test.mjs` pins the heading as a direct child of the film, the bar, the chip's rule, the copy and the CSS, and that the poster title and duration chip are gone, and the film's running signal; `FlowNav.test.mjs` pins that Back and Exit step aside on it.
- Every phone suite (including `test:workshop-flow`), `tsc`, lint and `next build --webpack` pass.
- Localhost, headless Edge over CDP at 375×812, `/preview/flow?full=1&screen=safety-buy&lang=sv|en`: the poster, the film at 6.4 s ("9 SEK KVAR", "9 SEC LEFT") and the docked film after the end. Back and Exit read `data-hidden="true"`, `inert` and opacity 0 on the poster and while the film plays, and come back after the end; the film keeps its size. At 320×568 (`screen=safety`) the heading fits and a paused film keeps the heading, chip and bar.
- After release: on a phone, the heading and the thick bar with the seconds left show in a purchase and on an existing booking.

## Known gaps

- The English film (phone and kiosk files) shows a stray second caption, "Only one person per trampoline", under the foam-pit caption from about 6 to 9 s. The Swedish film is clean. The film is out of scope here; it needs a new export from whoever edits the films.
