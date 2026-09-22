# Phone completion preview — #432

final result: passed

The initial local review below is historical. Love approved the design and QR shadow, then explicitly requested commit, push, merge and deployment on 2026-09-22. The production integration review follows the original record.

## Source and implementation

- Source: kiosk #116's approved implementation, copied from kiosk origin/main as `kiosk-reference.png` (1080 × 1920).
- Implementation: `http://127.0.0.1:3000/preview/completion`, development-only route on `codex/gh-432-phone-completion-preview`, base `8f31c5459658aeff591441e809ad5c2d11410ad2`.
- `comparison.png` places the approved kiosk capture and the phone capture together. The kiosk reference is normalized to 390px width; aspect ratio, content density and added QR deliberately differ for phone use. This is a responsive adaptation, not a pixel-identical kiosk port.
- Browser review: 320 × 740, 390 × 844 and 430 × 932 CSS viewports. Screenshots were captured through the in-app browser. Vertical scrolling is allowed on smaller phones; no horizontal overflow was observed.

## Fidelity review

- Typography: copied official Acumin variable font; same heavy italic uppercase heading, dominant white four-digit number and italic red quantities. Readable SV/EN copy at 320px.
- Spacing: red hero with diagonal boundary, centered QR overlapping the boundary, clear pickup heading and separated open rows. Phone-sized icons and touch controls replace kiosk-sized spacing.
- Colors: source red `#e31837`, white background and dark text; retained gray secondary booking action. QR stays black on white with the generator's four-module quiet zone.
- Assets: exact approved kiosk success icon and font; current phone product icons. Existing QR generator supplies the SVG. No approximated logo or icon artwork.
- Content: standard fixture is one 60-minute entry, one pair of socks and one bottle. Combo fixture shows two entries and a separate café pizza. The phone QR persists and has a tap-to-enlarge action; kiosk printing and automatic reset are intentionally absent.

## Iteration and interactions

Initial composition passed review against the source. Love then requested more shadow. Replaced the faint single shadow with two soft layers: `0 12px 28px #1c1c1e29, 0 3px 8px #1c1c1e14`; recaptured and visually checked the result. No open P0/P1/P2 visual findings.

Verified language switch, enlarged QR dialog and close, simulated new-booking screen and return, and Combo selection. Browser error/warning log was empty. The example QR deliberately uses `JY_DESIGN_PREVIEW:0001:NOT_A_VALID_HANDOFF`, outside the live handoff protocol.

## Validation

- Focused ESLint and TypeScript: pass.
- Production webpack build: pass; existing baseline-browser-mapping age warning only.
- Existing production mock boundary script: pass.
- Explicit completion export check: 404 output, no preview controls or synthetic payload.
- `git diff --check`: pass.

At this initial review only the isolated preview route, two copied assets and this evidence had been added; no live flow or deployment had changed. Physical phone/scanner acceptance was not claimed.

## Approved production integration

The same visual now renders through the actual `ConfirmationScreen` and its existing session/product projection. Preview fixtures use an intentionally nonexistent session with the production QR grammar; the original preview sentinel above describes only the historical design iteration.

- `production-320-en.png`: actual component at 320 × 740, English, quantity one, no horizontal clipping.
- `production-390-sv.png`: actual component at 390 × 844, Swedish and approved shadow.
- `production-430-sv.png`: actual component at 430 × 932, full footer visible; document width equals viewport width.
- `production-legacy-combo.png`: full older code wraps without truncation; two visit bands and one later pizza retain their package labels.
- Browser verified language change, enlarged native QR dialog and close, and existing missing-number/completed fallbacks. The original root flow was not driven through a real booking; tests verify the ready predicate and existing reset callback.
- All 347 phone flow/component tests pass; lint has zero errors and four existing image warnings. Production webpack export and preview-404 guard pass. Infrastructure check and repository structure checks pass.
- OpenCV decoded the rendered 390px QR as `JY_HANDOFF:0001:local-design-preview-not-a-real-session`. This proves the synthetic render's payload, not physical scanner acceptance. The preview return action also invoked its supplied callback and returned to completion.

No live guest, payment, message or redemption was created. Release and deployment evidence is recorded in [the implementation record](../../gh432-phone-completion.md).
