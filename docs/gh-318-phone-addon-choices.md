# Phone add-on choice parity

Issue: https://github.com/wrlds-creations/jumpyard-check-in/issues/318

## Scope and source

Love approved applying the final kiosk #69 choice model to phone and Park on
2026-08-27. Source: kiosk PR #75, commit
`028f174b4738c496d8399059abd6ec092ab93293`. This branch starts from shared main
`64d36753bdb13f3b86366256aeb77840a58033e1`; it is not stacked on a kiosk branch.

The shared `AddonChoices` component replaces the duplicated selection markup in
`BuyTickets` and `AddonsOffer`. It uses mobile touch sizes, the approved benefit
copy and transparent warning asset. Sock quantity is a recommendation. Owning
socks or a bottle never removes a purchase. Included items remain locked; new
quantities and the amount for new purchases remain separate. Own-item choices
hide while an item is purchased/included. Continue remains actionable and only
its validation attempt reveals missing-choice alerts and focuses the first one.

No payment/safety/session contract, Cloud request, availability prefetch, catalog
mapping, cache cadence, gift-card behavior, admin code or infrastructure changed.
Cloud #315 already owns the live 20 SEK water selection. Preview prices are
synthetic and are not evidence of live pricing. D0196 records the UX decision;
merged-mainline context and AWS inventory were intentionally not changed.

## Local validation, 2026-08-27

- `npm run validate:gh318-phone-addon-choices`: 16 focused tests passed, including
  opt-in same-WiFi address validation and the compact-card/copy regressions.
- `npm run validate`: passed, including existing guest-access, payment,
  linked-add-on, product-cache and cross-device resume regressions.
- Phone `test:exit-flow` and `test:product-visibility`: five tests each passed.
- Phone lint: zero errors; four existing `no-img-element` warnings.
- Phone TypeScript and production static build: passed.
- `git diff --check`: passed.
- `npm run infra:check`: passed, including local `synth:example`; no deployment.

The first full validation attempt lacked the separate admin dependencies in the
fresh worktree. Installing the locked dependencies and rerunning resolved it;
no dependency manifest/lockfile or admin source was changed.

## Browser verification

Used the real phone/Park app against a loopback-only fixture server, not a
standalone reimplementation. Swedish and English selections were checked at
390 x 844 and narrow 320 x 568 sizes. Continue remains visible and the list
scrolls without horizontal overflow. The viewport overrides were reset afterward.

- No missing-choice warnings on initial display. Continue shows the two precise
  warnings and focuses socks first. A valid decision removes its warning.
- Add/remove socks hides/restores ownership. An explicit ownership choice survives
  adding and removing a purchase. Water selection hides its own-item checkbox.
- New entry: 200 SEK entry plus one 20 SEK bottle becomes a 220 SEK summary.
- Sky Rider still requires its separate height confirmation before proceeding.
- Existing booking `DEMO318PAID`: one pair and an old bottle are marked included,
  both decrement buttons are locked and there are no ownership checkboxes.
  Adding one new bottle produces only a 20 SEK add-on quote.
- Two jumpers: recommend two pairs, decrement to one, confirm own bottle and
  continue to a quote for one pair. The recommended count is not forced.
- English benefits, environmental guidance, warnings and singular/plural sock
  actions were checked. No real booking, payment or redemption was attempted.

An unrelated startup issue was observed when reloading after selecting English
through the existing `/extend` toggle: Swedish server HTML differs from the
stored English first client render. The unchanged language initializer causes a
recoverable hydration warning. It is captured as the unapproved Project draft
`Make persisted phone language hydration-safe` (`PVTI_lADOBXiXg84BdXuJzg4Rg8w`),
not silently fixed in this issue.

## Physical-phone feedback refinement, 2026-08-27

Love's phone screenshot showed excessive card height. Required-item
recommendations now share a row with quantity controls. Benefits span the full
width instead of being squeezed alongside a stepper. Spacing and preview copy
are shorter; body text remains 14px and quantity targets remain 44px. Very narrow
optional cards reflow the title above the controls rather than truncating it.
The water-station and no-disposable-cups guidance remains explicit. Ownership,
included-item minimums, quantities, validation timing and quoted prices are unchanged.

At 390 x 700, four selected pairs reduced the socks card from about 203px to
139px. The unselected bottle card reduced from about 300px to 211px. Swedish
new-entry and English existing-booking views were rechecked at 320 x 568 with
no card overflow and Continue within the viewport. Removing the new bottle
still reveals its ownership choice; only Continue reveals the missing-choice
warning and focuses that card. Paid-item decrement controls remain disabled.

Love additionally requested `Bryggkaffe` (`Filter coffee` in English), and removal
of the `Minst 100 cm. Rekommenderas efter hopptiden.` sentence from the list.
Only that repeated shop sentence was removed. Both existing `SkyRiderAttest`
steps, their height/safety confirmation, and the small recommendation badge remain.
Focused tests, phone lint (the same four existing image warnings), TypeScript
and diff checks passed after this refinement. No production build or deployment
was performed for this visual-only iteration; the earlier full-build evidence
above describes the preceding local revision.

## Preview and publication approval

From the phone directory run `node scripts/preview-phone-addons.mjs`, then open
http://localhost:3318/preview. Use Buy entry, or find `DEMO318`, `DEMO318SOCKS` or
`DEMO318PAID`. The preview is visibly labelled, binds loopback, rejects real
identifiers/product IDs and blocks all financial/write endpoints. No upstream
forwarding is implemented. The sizing wrapper is preview-only.

Love additionally requested same-WiFi phone access on 2026-08-27. The preview
still defaults to loopback. Setting `PREVIEW_LAN_HOST` explicitly to an assigned
private IPv4 address adds a listener only on that interface, with an exact Host
allowlist and same-origin fixture/upgrade checks. It never binds all interfaces
or forwards to a real API. All financial writes remain blocked. Use the root URL
on the physical phone so its real viewport is used; `/preview` is the desktop
sizing wrapper. This opt-in lasts only while the local preview process runs.
The LAN root and existing loopback wrapper returned HTTP 200. Fixture
availability worked on the LAN origin; draft/payment and foreign-origin calls
remained blocked with HTTP 403. No firewall settings were changed. Reachability
from Love's physical phone was confirmed by the subsequently supplied screenshot;
Love subsequently accepted the compact-card revision on 2026-08-27.

After that acceptance, Love explicitly approved commit, push, reviewed PR merge
and protected publication. Issue #318 now records that approval and the narrowly
allowed release-evidence documentation. No real booking, payment or redemption
is authorized by this release work. Kiosk PR #75 and its keyboard integration
remain independent.

## Pre-publication review

The actual latest public frontend deployment was run `32827234527`, selecting
release `2c9185f2eb3952dd3f7761545657d6b803788a40` from build `32826760100`.
The older `a150767` deployment summary in repository context is superseded by
that successful GitHub run. Comparing that release to this branch's mainline
base shows no intervening phone or admin source changes. The only additional
runtime difference is the already deployed #312/#315 Booking Lambda work; it
must not be redeployed with a different template as part of this UI change.

The final diff is confined to shared add-on markup, ownership-choice handling,
mobile styles/copy, the approved icon, fixture-only preview, focused tests and
the issue decision/evidence. The new-entry and existing-booking paths retain
their existing quote, draft, payment and Sky Rider consent handlers. There is
no new dependency, catalog call, language-selection flow or time-extension work.

Publication uses one immutable mainline release, then the existing protected
Park verification and public frontend promotion. The expected AWS resource
delta is zero and migrations remain disabled. The unchanged admin artifact is
republished only because the existing workflow promotes both frontend outputs.
Production output must use the approved Cloud API and must not enable the local
fixture server or preview banner. The prior public release above is the
frontend-only rollback candidate; no rollback is being executed preemptively.
Post-merge deployment and verification evidence is recorded below.

## Final validation and merge

Implementation [PR #319](https://github.com/wrlds-creations/jumpyard-check-in/pull/319)
merged on 2026-08-27 as `d2283aaa59211a8425c98add95337ceae3c88c3e`.
The implementing agent recorded its scoped review explicitly, without claiming
an independent human review. All four required checks passed in
[CI 33080820763](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33080820763):
Repository, Infrastructure, Phone and Admin. Main protection was not bypassed.
The final compact revision also passed the full local `npm run validate`, phone
lint, TypeScript and diff check. CI rebuilt the exact final production phone
and admin source, superseding the earlier local-build timing note above.

The dependent evidence branch starts from that merged mainline commit. No
additional runtime or infrastructure change is included in its documentation.
Rollback candidate build `32826760100` still has unexpired artifact `9555336280`,
digest `sha256:2b73c7ec43f0b088ebdc8f017bb296bbb5f8db43b0209da1f93a355b0b96172d`.
Only its frontend outputs are a rollback candidate; rolling the backend back
past the deployed #312/#315 fixes is outside this issue.

## Immutable release and protected plan

[Release build 33081106676](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081106676)
passed for exact source `d2283aaa59211a8425c98add95337ceae3c88c3e`, as did
post-merge [CI 33081106542](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081106542).
The immutable artifact is `9650194100` (`park-test-release-d2283aaa59211a8425c98add95337ceae3c88c3e`),
digest `sha256:a9d6820b929dfa79792eab0a7e2bae277da5c13ede04fdb1ddfbff6a0cd860f9`.
Local artifact validation independently verified all 493 files and manifest hash
`c8f8a1002d72fd8d250a6180d5710a38f30b48cf6160089bb97035eeeca91f7f`, plus the
public domain/API/Cognito/Apple Pay target contract.

The production JavaScript contains the new shared UI and approved copy, with the
exact Park API. It contains no fixture identifiers/token, LAN configuration or
localhost preview address, and the export has no preview route/server. An initial
overly strict string check rejected the retained preview CSS class in JavaScript;
inspection confirmed it remains behind the sole strict `NEXT_PUBLIC_PHONE_ADDON_PREVIEW`
opt-in check, with no assignment enabling it and the normal empty browser process
environment. The corrected check passed before any deployment approval. Presence
of guarded copy is not evidence that fixture mode is active.

Protected [Park plan 33081517580](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081517580)
showed 202 resources before and after, zero additions/changes/removals and no
parameter/output/rule/condition/mapping changes. Current and release template
hashes both equal `b227888a573552adb362baebbf0cd866c5e0eeec9ffab06e13e908ad191ecf07`.
The target remains JumpYard account `376129878018`, `eu-north-1`, technical
`park-test`, owner/creator `love`, managed by CDK, confidential/exportable,
repository `wrlds-creations/jumpyard-check-in`, Client/CostCenter `JumpYard`.
No new resource, tag, route, secret, catalog, schema or gate is introduced.
Migrations are explicitly disabled. The visible plan and exact artifact were
approved through the existing protected environment under Love's delegated
publication request, with that provenance recorded in the approval comment.

## Park verification

Park run `33081517580` completed successfully. CDK explicitly reported
`no changes`. Post-deploy assertions passed exact template equality,
`UPDATE_COMPLETE`, `IN_SYNC` drift, zero Park alarms, empty related queues,
exact-SHA Cloudflare deployments and migrations applied through `0020`, with
none requested or applied by this run. Stable phone/admin routes returned
HTTP 200 with the expected API/Cognito targets and Apple Pay association.

Immutable Park outputs:

- Phone: https://ee296048.jumpyard-check-in-park-test.pages.dev
- Unchanged admin: https://5d81f017.jumpyard-checkin-admin-park-test.pages.dev

No real booking, payment, refund, redemption, guest message or ROLLER catalog
write was performed by this deployment or its verification.

## Protected public publication and readback

[Public run 33081923334](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33081923334)
completed successfully on 2026-08-27 at approximately 16:24 Europe/Stockholm.
Its visible plan revalidated the same release/manifest, exact public projects
and existing Nacka backend target. Protected approval followed the successful
Park run and recorded Love's delegated approval, exact source and rollback
boundary. No gate was bypassed. The workflow rebuilt nothing and made no AWS
mutation. The existing API/CORS, Cognito callback, custom-domain and exact-SHA
Cloudflare checks passed. Guest/staff roots, admin/callback routes and the
unchanged Apple Pay association returned HTTP 200 with the correct targets.

Published surfaces:

- Guest: https://checkin.jumpyard.se
- Guest immutable output: https://44924b9b.jumpyard-check-in-production.pages.dev
- Unchanged staff/admin: https://staff-checkin.jumpyard.se
- Staff/admin immutable output: https://33d2aa20.jumpyard-checkin-admin-production.pages.dev

An independent read-only check downloaded the root-referenced JavaScript/CSS
from both the stable Park phone and public guest origins. All 11 assets per
origin byte-matched the selected immutable release, including the shared add-on
component, and the transparent warning icon matched too. No application flow
was executed by this readback and no booking/payment/redemption was created.

No rollback was needed or performed. The previously successful public artifact
`9555336280` remains available for the same protected **frontend-only** rollback
path; the current #312/#315 backend must remain intact. This records rollback
readiness, not a fresh live rollback rehearsal or the unrelated #264 pilot gate.

The dependent evidence PR updates only this document, `REPO_CURRENT_STATE.md`,
`PROJECT_CONTEXT.md` and `AWS_RESOURCES.md`. It corrects stale release pointers
without rewriting earlier issue histories. The issue is complete for the
approved mobile UI and publication scope. Supervised real purchase/payment
acceptance remains separate from the synthetic/visual and deployment checks.
The unrelated stored-language hydration draft remains unapproved; no new
English-flow, time-extension, kiosk or keyboard work was added.
