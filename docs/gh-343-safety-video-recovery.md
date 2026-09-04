# Phone safety video recovery — #343

## Approved scope and baseline

Love approved the concrete phone proposal with “kÖR” on 2026-09-04: a smaller
approved video and visible loading, error help and retry. The source is current
main `c5b58512af804d7eb1e5ded35250313c96a3b834`, containing #374 and #330. Work is
isolated on `codex/gh-343-safety-video-recovery`. Original worktrees are preserved.

After reviewing the result and the original/optimized quality comparison, Love
explicitly authorized “Comitta pusha merge deploya så jag kan testa”. This covers
commit, push, reviewed PR/merge, immutable release and protected Park then public
promotion after each exact plan is reviewed. Use the existing Nacka pilot only,
with migrations disabled and no new resource, provider or guest-send change.
The previously published #374 artifact is the rollback candidate. Physical
handset acceptance remains Love's test after publication.

## Behavior

The phone uses actual media events instead of marking playback started before
`play()` succeeds. Loading is visible immediately after the guest presses Play.
Playback and buffering follow actual frames; a paused video offers explicit
resume at its current position. A failed start/media request or 12 seconds
without frame progress pauses playback and shows an explanation, retry and help
from staff at the park. Repeated buffering signals cannot extend that deadline.

Retry reloads and starts the entire same video from zero. Late promises, media
events after failure, duplicate starts and component disposal cannot finish an
obsolete attempt. Only an active video reaching its valid end exposes the
existing explicit safety-rules action. No timeout or staff-help text completes
safety. Booking, payment, navigation, attest and Handoff contracts are unchanged.

The production component is exercised at the development-only
`/preview/safety` route. Production export renders a not-found page without the
fixture controls. The optimized source uses `?v=343` to avoid reusing a cached
original asset under the same static filename.

## Media evidence

| Property | Original | Optimized |
| --- | --- | --- |
| Bytes | 22,596,168 | 3,105,753 |
| Duration / frames | 15.000 s / 375 | 15.000 s / 375 |
| Frame rate | 25 fps | 25 fps |
| Dimensions | 1080 × 1920 | 720 × 1280 |
| Video | H.264 Main, yuv420p | H.264 Main, yuv420p |
| Audio streams | None | None |
| Overall bitrate | 12.051 Mbps | 1.656 Mbps |

The file is 86.26% smaller. No frame sequence, timing, crop, text, audio or safety
instruction was added/removed. The original remains recoverable in Git at the
base SHA. SHA256:

- Original: `5908afb1f1bedec7bde3cc1a6f2cc61e907647e93bef7890742ca2d3fd1ba6bc`
- Optimized: `7606140fbd6107ccf0928c74d9f49d610c79d4d8f2da4714e8fadae5ea83ab51`

Reproduction uses installed FFmpeg offline; no runtime dependency was added:

```text
ffmpeg -i <original> -map 0:v:0 -vf scale=720:1280:flags=lanczos
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p
  -profile:v main -level 3.1 -movflags +faststart <optimized>
```

FFprobe verified duration, frame count, dimensions and stream layout. The MP4
`moov` atom starts at byte 32, before `mdat` at byte 5,427, allowing metadata to
load without fetching the end of the file. SSIM against the original scaled to
720p with matched time bases is 0.983578. This is a compression comparison, not
a substitute for visual acceptance: representative frames at 0/5/10 seconds
were also inspected, and all three embedded instructions remain readable.

## Arrival profile and validation limits

The planning baseline is 100 guests/hour, with a conservative illustrative burst
of 20 separate phones requesting a complete video together. Guests sharing one
booking/phone reduce that demand; 100 guests/hour is not 100 concurrent players.
Twenty complete transfers total 62.1 MB instead of 451.9 MB. If each finishes in
15 seconds, average media payload demand is 33.1 Mbps instead of 241.0 Mbps,
before protocol overhead and other traffic. These are arithmetic estimates,
not a physical Wi-Fi capacity claim. Real park contention and handset acceptance
remain to be measured after an authorized publication.

## Validation

- `npm run test:safety-video`: 13 passing isolated controller regressions, zero
  failures/skips. Covers rejected/never-settling/synchronous play, buffering,
  silent stalls, repeated events, pause/resume, retry, late failures, duplicate
  starts, valid completion, replay and disposal. Wired into the phone CI job.
- `npx --no-install tsc --noEmit`: passed.
- Phone ESLint: passed with the same four existing image-element warnings.
- Phone production build/static export: passed; the local fixture exports as
  not-found without its controls.
- `validate:template`, `validate:current-ticket`, `validate:history-archives`,
  workflow YAML parsing and `git diff --check`: passed.
- Headless Edge at 320/393 px, Swedish/English: five browser scenarios passed,
  nine screenshots, no horizontal overflow or uncaught page errors. Actual
  H.264 decoding/full playback, pause/resume and explicit continuation passed.
  Blocked media requests produced error help and successfully retried after
  unblocking. A never-settling play showed loading then the bounded error.
- Browser evidence: `%TEMP%/jumpyard-gh343-ui/results.json` and screenshots.
  Media evidence: `%TEMP%/jumpyard-gh343-video-ssim-final.log` and frame strip.

The initial preview exposed a stored-language hydration mismatch; mounting its
provider only on the client fixed the fixture. No production language behavior
was changed. Full backend/admin validation was not repeated for this bounded
phone/media change. No physical iPhone, physical kiosk, live booking or park
Wi-Fi load test was performed.

## Documents and kiosk boundary

D0210 records the playback/media decision. PROJECT_CONTEXT points to it; its
existing long safety/staff summary was shortened, retaining the server-owned
handoff and #331 final paid check and linking existing #334 staff behavior. Full
staff identity facts remain in its architecture section and referenced evidence.
No history was deleted. REPO_CURRENT_STATE and AWS_RESOURCES remain unchanged
because no new merged/deployed fact or AWS resource change occurred.

Read-only kiosk comparison at local HEAD
`60a6870332a9f2d57d2bc7abfe42283d8f7cf6e5` found the same requested-play-before-
success behavior and the identical original media SHA256. Kiosk changes and
physical kiosk acceptance need separate scope. The Project draft
**Kiosk: återhämtning och mindre fil för säkerhetsvideon (#343-paritet)**,
`PVTI_lADOBXiXg84BdXuJzg5cKFw`, records the contract and larger-display review;
it is not implementation authorization. No kiosk file was edited.

Delivery uses one successful immutable release through protected Park verification
and public promotion, followed by physical phone/Wi-Fi acceptance. Kiosk parity
remains in that separate draft. Exact rollout runs and hashes are recorded in #343.
