# Phone safety video recovery — #343

## Localized media extension — 2026-09-15

Love reopened #343 for new Swedish/English films, quality/size optimization and
fast language changes, then explicitly requested downloading Gustav's Dropbox
files and completing the implementation. The existing browser inventory exposed
the shared safety-video folder; browser attachment failed, so the ZIP was fetched
directly from that link. The mailbox message itself was not read. Originals are
retained outside Git in `Downloads/JumpYard-gh343-originals`; private share tokens
are not committed. The folder name mentions kiosk; this issue owns the phone
implementation. Love subsequently approved kiosk parity as a separate issue,
to be implemented after the phone publication.

Base: `93ce93c893e896d12ec5d81b0670152b38ace3ba` (`origin/main`), branch
`codex/gh-343-localized-safety-videos`, isolated worktree
`jumpyard-check-in-gh343-localized`. The uncommitted #396 checkout is preserved.
On 2026-09-15 Love explicitly requested push, merge and deployment of the phone
flow, then the kiosk implementation. This supersedes the earlier local-only
delivery boundary. Publication uses the reviewed PR, immutable release, reviewed
Park plan and protected approval, then the same artifact's protected Nacka public
phone/admin promotion. The workflow also republishes the unchanged admin output.
Migration apply remains disabled; no new infrastructure is in scope. Keep #343
open for a dependent rollout-evidence PR. The currently published #403 release
is the rollback candidate, subject to a fresh artifact/compatibility check.

### Sources and quality

| Language | Original | Original bytes | Optimized bytes | Reduction | SSIM |
| --- | --- | ---: | ---: | ---: | ---: |
| Swedish | `sakerhetsvideo_SE_9x16_TEST.mp4` | 23,381,452 | 3,819,815 | 83.66% | 0.981763 |
| English | `sakerhetsvideo_EN_9x16_TEST.mp4` | 23,383,454 | 3,809,758 | 83.71% | 0.981858 |

Combined: 7,629,573 bytes instead of 46,764,906. The superseded single-language
asset is removed from the new export. Each film retains all 375 frames at 25 fps,
the 9:16 framing and the four original instruction segments. Video remains
15.000 seconds; the MP4 reports 15.018667 seconds due to AAC packet padding.
Both originals are 1080x1920 H.264/AAC; outputs are 720x1280 H.264 Main/yuv420p
with the original AAC stream copied. Overall bitrate is 2.035/2.029 Mbps.

The decoded PCM audio SHA256 is identical across both originals and both outputs:
`2d4368dd8667fac3e52e9d314272c572a620f8d017d7c47e55c9ba8bac899221`.
Container/audio packet counts differ due to priming metadata; decoded samples
are identical. No audio re-encoding, cropping, instruction rewrite or runtime
dependency was introduced. Four-point image strips at 0/4/8/12 seconds were
visually compared in both languages; text remains readable. SSIM uses Lanczos
downscaled originals and matching 1/25 time bases, not a handset quality claim.

Original SHA256 values (SV, EN):

- `d2a4d49c3c0365f9791ad54e0fcc2cdaaf9568d1b328aabacb68360cc3082831`
- `096c688e8116dd5212db13d9d41fcf490cced32391b000e79076f854d80cecba`

Output SHA256 values (SV, EN):

- `f918b9754977bae7ff7e5540396d66df365180d06d17327964d628812f671d3c`
- `316c51ceb304cccf353e8dacfce33480fc77c76958e842a077f0047cd3fbb830`

Reproduction with installed FFmpeg:

```text
ffmpeg -i <original> -map 0:v:0 -map 0:a:0
  -vf scale=720:1280:flags=lanczos -c:v libx264 -preset slow -crf 23
  -pix_fmt yuv420p -profile:v main -level 3.1 -c:a copy
  -movflags +faststart <optimized>
```

A one-second keyframe experiment was 4.78/4.79 MB. Since language changes restart
at the first frame, the default keyframe interval retains the same measured
quality within the predeclared 4 MB/film budget. Source `moov` metadata is moved
ahead of media payload for early decoding; checked-in tests verify atom order.

### Playback and caching decision

D0219: the saved/current app language selects a content-addressed MP4 URL.
Only one selected video is mounted with `preload=auto` at the safety step.
No other language is fetched speculatively. `_headers` assigns one-year immutable
browser caching to these versioned media URLs, keeping future releases distinct.
Browser preload/cache behavior remains browser-controlled, especially on phones.

Each language change replaces the video/controller, clears progress/completion
and starts at zero. A playing/loading film requests immediate playback of the
new selection; idle, paused, failed and completed selections present Play.
Automatic sound permission denial presents explicit Resume at zero. Other media
errors retain retry/staff help and the existing 12-second no-progress deadline.
Cleanup pauses the old element, removes its source, aborts loading and clears
listeners/watchdogs. React StrictMode setup restores the source after its test
cleanup. No stale event or rejected play promise can complete the new selection.

The earlier delivery below is historical and does not prove these new assets
are deployed. Current local validation and timing evidence are recorded in the
extension closeout section below.

### Extension timing and validation — local only

Final measurements use Edge 153.0.4234.32, a 390x844 mobile viewport on this
Windows host, real H.264/AAC decoding, production-mode React components and
exported styles/media. The loopback server applies the declared media cache rule
and conservatively returns full-body HTTP 200, matching the earlier hosted range
observation. CDP throttles throughput/latency. First frame is measured with
`requestVideoFrameCallback` from the triggering click; page/JS loading precedes
the measurement. Each cold sample clears the browser cache. A cached-return
sample waits for the full response, not merely a nearly complete playback buffer.

| Profile | Samples | Cold first image | First language switch | Cached return |
| --- | ---: | ---: | ---: | ---: |
| 10 Mbps, 100 ms latency | 5 | 440–619 ms | 309–377 ms | 72–149 ms |
| 1 Mbps, 300 ms latency | 1 | 3,024 ms | 1,693 ms | 95 ms |

The final 10 Mbps run meets the proposed 1-second first-frame and 300-ms cached
return targets. An earlier five-sample run included one 2,736-ms cold-start
outlier (others 467–472 ms); it remains recorded and prevents a universal latency
claim. The 1 Mbps source rate is below the approximately 2 Mbps media bitrate,
so buffering is expected. Cache eviction and switches before response completion
can require another transfer; those cases are not claimed to be instant.

The five 10 Mbps sequences each fetched only the selected 3,819,815-byte Swedish
file, then the 3,809,758-byte English file on demand. Returning to Swedish made
zero server requests and Resource Timing reported zero transferred bytes for
that cache hit. No other-language request occurred before selection. Resource
lifecycle checks inspect one attached video and paused/source-free retired
elements; they do not measure native decoder memory or claim a heap benchmark.

Twenty cold Swedish viewers imply 76.4 MB of media, compared with 467.6 MB of
these new originals, or 40.7 Mbps if completed in 15 seconds before overhead.
If all twenty select both languages once, the two full assets total 152.6 MB.
These are illustrative payload calculations, not real park Wi-Fi load tests or
an equation between 100 arrivals/hour and 100 concurrent players.

Verified commands: 18 safety/media tests, 6 existing language-control tests,
11 add-on navigation/payment-guard tests and 8 production mock-boundary tests
pass. Phone lint passes with the four existing image warnings; TypeScript,
production build/export, template validation and `git diff --check` pass.
The export contains exactly the two new MP4s, the media cache declaration and
no superseded single video. The production safety preview remains not-found.

`npm run validate` stops at the known Windows newline-dependent context-size
check. At the unchanged base, PROJECT_CONTEXT has 11,909 LF characters but
12,020 in CRLF; REPO_CURRENT_STATE has 11,977 vs 12,062. The #343 one-line
context update is shorter (11,906 LF). The 12,000 raw-character check still fails
on the Windows checkout. Existing unapproved Project draft:
`PVTI_lADOBXiXg84BdXuJzg5PU2I`, **Make context-size validation consistent for
Windows line endings**. No duplicate draft or unrelated validator fix is added.

Physical Safari/PWA, Android handset audio/quality, actual hosted cache headers
and shared park Wi-Fi acceptance remain. No guest business request, payment,
booking, redemption, provider change or publication is used by the local fixture.
The relevant platform contracts are the [Pages static header rules](https://developers.cloudflare.com/pages/configuration/headers/)
and [script-initiated playback rejection behavior](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).

Final browser result: **passed**, zero uncaught page errors. Both 320/390px
scenarios pass idle selection, pause, ten rapid alternating switches, complete
Swedish and English playback, completion reset on language change and explicit
continuation. Additional scenarios pass saved English/StrictMode, a pending old
play promise plus late rejection/ended event, automatic permission denial with
manual resume, and HTTP media failure with successful retry. All six cached
return samples, including the 1 Mbps case, make zero new server requests.
Swedish/English screenshots were visually reviewed at the narrow/normal widths.

`npm run infra:check` also passes, including local synthesis and guarded self-tests.
Final machine-readable browser evidence and screenshots are retained locally at
`Downloads/JumpYard-gh343-originals/browser-final-complete/results.json` and sibling
PNGs. The earlier outlier is in `browser-verification/results.json`. Media probes,
aligned SSIM/decoded-audio comparisons, build/lint and validation logs are retained
under the same originals directory. The checked-in browser script reproduces the
verification with existing dependencies; no new runtime package is required.

Changed application files: `SafetyVideo.tsx`, `safetyPlayback.ts`, `safetyMedia.ts`,
the two duration strings in `LanguageContext.tsx`, the two hashed MP4s, `_headers`
and removal of `public/safety-video.mp4`. Tests and their package command accompany
the change. Durable updates: PROJECT_CONTEXT, D0219, TEST_PLAN and this evidence;
REPO_CURRENT_STATE and AWS_RESOURCES are unchanged. No new follow-up draft was
created; the existing Windows context-size draft covers the validation limitation.

Reviewable local preview: `http://127.0.0.1:3430/preview/safety`. Next step: review
the localized films and diff, then use an explicitly requested commit/PR and
protected immutable release/publication to obtain real handset/park evidence.
No release, deploy, rollback or re-promotion run was created by this extension.

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
The previously published #374 artifact is the rollback candidate. After
publication, Love instructed “Comitta pusha merge deolpya och testa om du kan och
sen stäng”. Closeout uses the available automated and hosted verification below;
it does not claim a physical handset or park Wi-Fi test.

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
not a physical Wi-Fi capacity claim. Real park contention and handset behavior
were not measured in this delivery.

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
was changed. Full backend/admin validation was not repeated locally; all four
required Repository, Infrastructure, Phone and Admin jobs subsequently passed in
[CI 33873295245](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33873295245).
No physical iPhone, physical kiosk, live booking or park Wi-Fi load test was
performed.

## Documents and kiosk boundary

D0210 records the playback/media decision. PROJECT_CONTEXT points to it; its
existing long safety/staff summary was shortened, retaining the server-owned
handoff and #331 final paid check and linking existing #334 staff behavior. Full
staff identity facts remain in its architecture section and referenced evidence.
No history was deleted. REPO_CURRENT_STATE and AWS_RESOURCES track the verified
merged/deployed facts recorded in the rollout below.

Read-only kiosk comparison at local HEAD
`60a6870332a9f2d57d2bc7abfe42283d8f7cf6e5` found the same requested-play-before-
success behavior and the identical original media SHA256. Kiosk changes and
physical kiosk acceptance need separate scope. The Project draft
**Kiosk: återhämtning och mindre fil för säkerhetsvideon (#343-paritet)**,
`PVTI_lADOBXiXg84BdXuJzg5cKFw`, records the contract and larger-display review;
it is not implementation authorization. No kiosk file was edited.

Delivery used one successful immutable release through protected Park verification
and public promotion. Kiosk parity remains in that separate draft. Exact rollout
runs, hashes and the physical-verification limitation are recorded in #343.

## Protected rollout — 2026-09-04

[PR #378](https://github.com/wrlds-creations/jumpyard-check-in/pull/378) was source
reviewed with no remaining blockers and merged after all four required checks.
The integrated base was `a2e6eb677f00a90505717585a550b4b5e9c88f75`, retaining
the #374 rollout documentation. The review was recorded by the author account,
not represented as an independent person's approval. No protection was bypassed.

- Merge/source: `5e163356cc7c30cd7b7d5b381db9472f42381172`.
- Successful immutable [release 33873617274](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33873617274).
- Artifact: `9937052826`, `park-test-release-5e163356cc7c30cd7b7d5b381db9472f42381172`.
- Artifact digest: `sha256:2aa7e5445bd0cb1fecd32a01ea8f7a3ba2d7a1d53331199c678a14cc86d20221`.
- Manifest SHA256: `4c7f6f7e4d50abab6249ac6e9d8390b992e662bc75b25050c6d88b51ab0a9ed4`.
- Local artifact validators passed all 556 checksums and both Park/public target
  contracts. The approved video hash matches the optimized media above.

The read-only plan for [Park 33874038259](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33874038259)
showed 202 resources and no resource or section changes. Both template hashes
were `1886c2000490398221f1147d4f9366ef03c3ee4495b683aae56ece8cf7847cf3`.
The entire CDK assembly, migration runtime and deployment config match the prior
proven #374 release. Delegated approval named this exact release/run and existing
Nacka target after plan review; migration apply was disabled.

Park completed successfully with CDK reporting no changes. Post-deploy template,
stack state, `IN_SYNC` drift, zero active alarms, empty queues and migrations
through `0020` passed. Independent readback matched 33 phone/admin responses,
including the optimized video and Apple association, to the selected artifact.
The hosted video decoded at 720 × 1280 and played all 15 seconds to native end
in headless Edge.

A supplementary HTTP Range probe returned the complete file with HTTP 200,
rather than the probe's expected 206. The previous public video behaved the
same way; this is not evidence of a new playback regression. Full-byte integrity
and hosted decoding passed. No range-serving or Safari guarantee is inferred;
physical iPhone/Wi-Fi behavior remains unverified.

After successful Park verification, the read-only plan for
[public 33874318192](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33874318192)
revalidated the same artifact, manifest and 556 files, the two existing public
projects/origins and the existing Nacka API. Delegated approval followed that
review and named the exact release and targets. Public deployment succeeded.
The workflow verified active domains, permitted/blocked CORS, Cognito callbacks,
exact Cloudflare commit and the Apple association (SHA256
`8939b5589a03bdbd9ea38686f90ef45e226f39eac61e131e2c325fbf1a95dcd6`).

Independent public readback at 12:46:29 UTC matched all 33 checked phone/admin
responses to the selected artifact, including the 3,105,753-byte video. Hosted
headless Edge playback then reached native end at 12:46:47 UTC: all 15 seconds,
720 × 1280, no media error. Combined Park/public readback matched 66 responses.
Evidence files are `%TEMP%/jumpyard-gh343-{park,public}-readback.json`,
`jumpyard-gh343-{park,public}-hosted-playback.json`, plan and deployment logs.

No new AWS resource, schema, backend, provider setting, guest message or real
financial transaction was introduced. Account `376129878018`, region
`eu-north-1`, WRLDS tags, gates and Nacka venue/date scope remain unchanged.
No rollback or re-promotion was needed. The public test link is
[checkin.jumpyard.se](https://checkin.jumpyard.se/).

The verified rollback candidate is successful #374 release `33864750849`, source
`4ed47e5c1aab56f0417866e4ad10a2e5419a0a7f`, artifact `9934011980`, digest
`sha256:b46f416c064ac043e60b0cd25e823ef3dff0e297610801b97d4f43ea6a378d0a`.
Its API record was rechecked as unexpired, retained until 2026-12-03T10:45:42Z.
Rollback would promote that same prior artifact through the protected workflows,
without rebuilding, and restore the previous larger video/playback behavior.

### Closeout boundary

Love explicitly requested available testing followed by closure. The approved
phone implementation and publication are complete; 13 controller tests, five
mobile browser scenarios, full CI/release checks, 66 live asset checks and hosted
Park/public playback passed. Physical iPhone, kiosk and shared park Wi-Fi tests
were not performed or reported as passed. Kiosk implementation/display review
stays in the existing separate unapproved Project draft above. These limits are
retained in the issue closeout rather than delaying the requested closure.
