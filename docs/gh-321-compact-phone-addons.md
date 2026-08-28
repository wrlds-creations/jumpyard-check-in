# Phone add-on spacing follow-up (#321)

## Scope and implementation

Approved issue: [#321](https://github.com/wrlds-creations/jumpyard-check-in/issues/321).
Branch: `codex/gh-321-compact-phone-addons`, based on mainline
`cb23d8a44c442ce0222b95d90173cfb2182241cb` after #318 / PRs #319 and #320.

The shared phone `AddonChoices` component no longer renders the separate
`Tips` recommendation text or the miniature sock row. On 2026-08-28 Love also
approved removing the separate `Lägg till` buttons for socks and water. Plus and
minus are now the only purchase controls and adjust one item at a time. The main
product icon, benefits, availability/paid limits and ownership choices remain.
Unused recommendation/button copy, props, helper and styles were removed.

Love's subsequent 2026-08-28 screenshot refinement places the selling text and
quantity controls on the same row for every add-on. Required and optional cards
share a two-column row: wrapping 13px selling copy on the left and unchanged
44px minus/plus controls on the right. Product names, prices and ownership
confirmation remain at their existing sizes. In the next approved refinement,
the water refill sentence was removed; the environmental sentence remains.

Love's final 2026-08-28 request removes the locally previewed `Fler tillägg`
control before publication. Both paths retain ordinary native scrolling. Its
component, geometry helper, observers, styles, copy and dedicated tests were
removed, with a regression test preventing their return. Continue is unchanged.

The new-booking add-on screen previously used `calc(100dvh - 160px)` even when
its actual top was 102px, leaving 58px below Continue. Both phone add-on paths
now use a scoped flex layout: the real header takes its natural height, the
product list takes the remaining space, and the total/Continue footer stays in
flow. The bottom padding is `max(12px, env(safe-area-inset-bottom, 0px))`.
The rule applies only while an add-on selection screen is present, not to
contact, payment, safety, summary or other pages.

Changed implementation files under `jumpyard-checkin-phone/src/`:

- `components/AddonChoices.tsx`: remove the recommendation row and extra add
  buttons; put selling text and quantity controls in the shared side-by-side row;
  remove the water refill sentence.
- `context/LanguageContext.tsx`: remove unused Swedish and English keys,
  including the discarded scroll label and water refill sentence.
- `flow/addonChoices.ts`: remove the unused sock recommendation helper only.
- `app/globals.css`: shared, add-on-scoped viewport and card layout; remove
  decorative and obsolete optional-card grid styles.
- `app/page.tsx`, `components/BuyTickets.tsx`, `components/AddonsOffer.tsx`:
  stable layout classes, selection-only height integration and removal of the
  unused recommendation prop; retain native list scrolling in both entry paths.
- `../scripts/test-addon-choices.mjs`: regression coverage for this follow-up.

No kiosk, backend, price/cache, payment, session, safety, dependency or deployment
code changes. Mainline context remains unchanged on the implementation branch;
the approved dependent evidence PR will record confirmed merged/deployed facts.
The scroll-discovery draft was incorporated into #321, then archived as a
duplicate planning record, not deleted (see below).

## Validation

Local checks on 2026-08-27, with 19 updated add-on tests rerun successfully on
2026-08-28 after the extra-button removal and side-by-side selling-text refinement:

- `node --no-warnings --experimental-strip-types --test scripts/test-addon-choices.mjs`:
  19 passed, including one-at-a-time quantity changes, paid minima, explicit ownership,
  side-by-side markup/CSS, validation timing and the fixture-only preview boundary.
- `npm run test:exit-flow`: 5 passed.
- `npm run test:product-visibility`: 5 passed.
- Root `npm run validate:gh305-cross-device-safety-resume` and
  `npm run validate:gh300-guest-linked-addons`: passed.
- Phone `npm run lint`: no errors, four pre-existing image-element warnings.
- Phone `npm run build`: passed on 2026-08-27 before the later card refinements,
  including TypeScript and static export.
- After both 2026-08-28 refinements: `npx tsc --noEmit` and focused ESLint over
  the changed components, copy, helper and tests passed with no warnings/errors.
- `git diff --check`: passed.

During the intermediate 2026-08-28 water-copy and scroll-control preview:

- All 24 focused add-on tests passed. Five additional tests cover end-of-list
  detection, fractional/overscroll positions, all-fit/resize/content-shrink
  stability, next-card/oversized-card navigation, and shared integration,
  reduced-motion handling and observer cleanup.
- `npx tsc --noEmit` and focused ESLint on the changed components, copy, helpers
  and test script passed without errors or warnings.
- `git diff --check` passed. The local fixture server is still listening on
  `127.0.0.1:3318` and `192.168.0.10:3318`.
- Read-only inspection of the already-open preview still shows its old iframe
  connection error. No new visual validation is claimed for this refinement;
  physical phone refresh/review remains necessary.

Browser measurements taken on 2026-08-27 with synthetic fixtures only, before
the separately approved removal of the extra add buttons:

| Phone viewport | New-booking list height | Existing-booking list height | Gap below footer |
|---|---:|---:|---:|
| 320 x 568 | 293px | 288px | 12px |
| 390 x 720 | 445px | 440px | 12px |
| 412 x 732 | 457px | 452px | 12px |

At 390 x 720, the empty sock card decreased from approximately 231px to 189px;
the new-booking list gained 46px and the footer gap decreased from 58px to 12px.
New-booking resize checks at 390 x 600 and 390 x 844 also retained the 12px gap.
These are browser CSS-pixel measurements with a zero bottom safe-area inset,
not measurements from physical Safari chrome.

Both entry paths had no horizontal or document-height overflow, no Tips row or
miniature socks, and 44 x 44px quantity buttons. Continue showed the two correct
inline warnings only after activation. In the new-booking fixture, adding one
pair for four jumpers left the suggested action at three pairs; confirming an
own bottle allowed Continue to reach the correct 845 SEK fixture summary. The
add-on-only viewport layout was absent from that summary. The exit confirmation
and subsequent existing-booking lookup also worked.

## Local review and remaining verification

The existing fixture-only preview was restarted from this worktree on
2026-08-28 at `http://localhost:3318/preview`. The assigned Wi-Fi address for
phone review is `http://192.168.0.10:3318/`; it can change with the network.
Preview writes cannot reach JumpYard Cloud or ROLLER and real payments are disabled.

The resumed browser session rejected automatic reload of the failed test tab;
no alternate browser or bypass was attempted. The user needs to reload the local
preview manually. A later read-only inspection of the already-open preview
confirmed its iframe still held the old connection-error page; no blocked-tab
reload or alternative-browser workaround was attempted. The measurements above
document the earlier iteration, not a new visual verification of the button-free,
side-by-side cards or the later scroll control. The pending `DEMO318PAID`
visual walkthrough is not claimed as completed; paid-item behavior is covered
by the focused tests.

Still needed: Love's visual approval on the physical phone, including Safari's
address bar/safe-area behavior and the previously paid add-on fixture if desired.
For that fixture, search `DEMO318PAID`, start check-in and confirm that the included
sock/bottle lines remain visible, cannot be decremented below their paid minimum,
and the total counts only new additions.

For the final native-scroll version, review both new entry and existing booking
on the phone: swipe to the last product and back, verify there is no `Fler tillägg`
control, and confirm that Continue stays visible. Continue still validates only
the existing sock/bottle choices, not whether the list has been scrolled.

Love explicitly approved commit, push, reviewed merge and public deployment on
2026-08-28 after requesting removal of the scroll control. Publication uses the
existing immutable release, read-only Park plan, protected Park verification and
protected public promotion. The expected AWS template/resource delta is zero;
migrations remain disabled and no financial or guest-message action is authorized.
The existing workflow also republishes the unchanged admin artifact. Release,
deployment and rollback-candidate evidence will be added after verification.

## Superseded local scroll discovery experiment

Project draft: **Help phone guests discover remaining add-ons without forced
scrolling**, item `PVTI_lADOBXiXg84BdXuJzg4X1rk` in
[Project #5](https://github.com/orgs/wrlds-creations/projects/5).

Love initially approved the draft on 2026-08-28, then explicitly asked to remove
the previewed control before publication. #321 records both approvals and the
final superseding request. The duplicate Project draft is archived and
recoverable; it is not a second implementation workstream. No scroll-hint
component or helper is included in the published change.

## Final pre-publication review

The final native-scroll version passed all 20 focused add-on tests, phone
TypeScript, phone lint (zero errors; the same four existing image warnings),
five exit-flow tests and five product-visibility tests. Full repository and
infrastructure validation are also run before protected promotion; exact final
production builds are required by the PR checks and immutable release workflow.
An initial attempt at those broader local checks lacked the separate infra/admin
dependencies. Installing their existing locked dependencies fixed the setup;
no package manifest or lockfile was changed. Existing dependency audit findings
are not fixed in this UI issue; the Project's security/tooling readiness and
phone QR advisory items remain separate.

The implementing agent reviewed the full source diff, without claiming an
independent human review. Only add-on presentation, unused recommendation code,
focused tests and this evidence file change. Quote/draft/payment handlers,
ownership validation, paid minima, pricing/cache, safety, resume and handoff
contracts remain unchanged. The final native scroll wrappers are the original
ones, with no automatic scrolling or additional runtime event listeners.

Read-only GitHub checks confirmed main still requires Repository, Infrastructure,
Phone and Admin checks, with strict status validation and admin enforcement.
The latest successful public deployment remains run `33081923334`, selecting
`d2283aaa59211a8425c98add95337ceae3c88c3e` from build `33081106676`.
Rollback candidate artifact `9650194100` is unexpired through 2026-11-25 and has
digest `sha256:a9d6820b929dfa79792eab0a7e2bae277da5c13ede04fdb1ddfbff6a0cd860f9`.
It is a frontend-only rollback candidate; no rollback is performed preemptively.

## Final validation and merged implementation

[PR #322](https://github.com/wrlds-creations/jumpyard-check-in/pull/322) merged
on 2026-08-28 as `b6142086e7b5d6be8222848a5be59e816b74d64f`. All four required
checks (Repository, Infrastructure, Phone, Admin) passed in
[CI 33144271166](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144271166).
The Phone and Admin jobs built the exact final production source; no branch
protection was bypassed. Full local `npm run validate` and `npm run infra:check`
also passed after installing the unchanged locked dependencies. The final add-on
suite has 20 tests; the intermediate 24-test scroll-hint suite above is historical.

The dependent `codex/gh-321-publication-evidence` branch starts from that merged
commit and changes documentation only. D0197 records the final compact/native
scroll presentation while preserving D0196's ownership/validation behavior.
Repository context records merged behavior without treating pending publication
as deployed. The previous public release was downloaded independently and all
493 files passed its manifest/checksum validation; manifest SHA256 is
`c8f8a1002d72fd8d250a6180d5710a38f30b48cf6160089bb97035eeeca91f7f`.

## Immutable release and protected Park plan

[Release 33144446818](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144446818)
successfully built exact merged source `b6142086e7b5d6be8222848a5be59e816b74d64f`.
Artifact `9675268479` has digest
`sha256:c139a0617d980600ea7ec0bb3091bad996b69aa30215254fed77c67b0edafe09`.
Independent local validation verified all 493 files, manifest SHA256
`492bfc40358b57a63b5713bb852b2a1f2bf69497036181fa653947ad395a30c3`, and the exact
public domain/API/Cognito target contract. The 124-file phone export contains
the compact card CSS and approved API target, and excludes the discarded scroll
hint, sock recommendation keys, refill sentence, synthetic fixture identifiers,
LAN address and preview route. Nothing is rebuilt during promotion.

Protected [Park plan 33144666359](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144666359)
reported 202 current/release resources with zero additions, changes or removals
and no parameter/output/rule/condition/mapping changes. Current and selected
template hashes are identical:
`b227888a573552adb362baebbf0cd866c5e0eeec9ffab06e13e908ad191ecf07`.
The target remains account `376129878018`, `eu-north-1`, technical `park-test`,
Client/CostCenter `JumpYard`, Project `jumpyard-check-in`, Owner/CreatedBy `love`,
Repository `wrlds-creations/jumpyard-check-in`, ManagedBy `cdk`, confidential
and exportable. No new resource, gate, secret, role, route, schema or venue is
introduced, and migrations are explicitly disabled.

The protected environment permitted the configured reviewer to approve. Codex
recorded Love's explicit delegated publication request, exact source/artifact,
reviewed zero-change plan and frontend-only rollback boundary in the approval
comment before the deployment job started. No environment protection was bypassed.

## Successful Park verification

Park run `33144666359` completed successfully. CDK explicitly reported
`no changes`; no migration was requested or applied. Existing migrations remain
complete through `0020`. The workflow passed exact template equality, successful
stack status, `IN_SYNC` drift, zero alarms in ALARM, empty related queues,
exact-SHA Pages checks and public API/config/Apple Pay checks.

- Phone immutable output: https://d5e6ed65.jumpyard-check-in-park-test.pages.dev
- Unchanged admin output: https://e0982190.jumpyard-checkin-admin-park-test.pages.dev

Independent read-only verification of the stable Park phone root returned HTTP
200 and byte-matched all 11 root-referenced JavaScript/CSS assets plus the
transparent warning icon against the selected immutable output. No guest flow,
booking, payment, refund, redemption or message was triggered. Post-merge
[CI 33144446845](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144446845)
also passed for the exact release source.

## Successful protected public publication

[Public run 33144851459](https://github.com/wrlds-creations/jumpyard-check-in/actions/runs/33144851459)
completed successfully on 2026-08-28 at 07:29:52 Europe/Stockholm. Its completed
plan revalidated all 493 files, the same source/manifest and exact two public
projects. The plan job log was read through the GitHub jobs API before approval
because the CLI's whole-run log view was unavailable while approval was pending.
Protected approval recorded Love's delegated request, successful Park run,
independent asset verification and the exact frontend-only target/rollback scope.
No gate was bypassed, no output was rebuilt, and the public workflow changed no
AWS resource. Exact-SHA Cloudflare, public routes, CORS and Cognito checks passed.
The existing Apple Pay association remained HTTP 200 with its expected hash.

- Guest site: https://checkin.jumpyard.se
- Guest immutable output: https://a692e1e0.jumpyard-check-in-production.pages.dev
- Unchanged staff/admin site: https://staff-checkin.jumpyard.se
- Staff/admin immutable output: https://25950672.jumpyard-checkin-admin-production.pages.dev

Independent read-only verification of the guest root returned HTTP 200 and
byte-matched all 11 root-referenced JavaScript/CSS assets plus the transparent
warning icon against the exact selected release. The verified output contains
the compact cards and native scrolling and excludes `Fler tillägg`, the refill
sentence, the removed recommendation UI and fixture identifiers/routes. This is
deployment/asset verification, not a new physical Safari or real-payment test.

No rollback was needed or executed. The downloaded and hash-verified prior
artifact `9650194100` (source `d2283aa`, build `33081106676`) remains the compatible
frontend-only rollback candidate. No live rollback rehearsal, purchase, payment,
refund, redemption, guest message or ROLLER business write was authorized or run.

The dependent evidence PR updates only this document, `REPO_CURRENT_STATE.md`,
`PROJECT_CONTEXT.md`, `DECISIONS.md` and `AWS_RESOURCES.md`. It records D0197 and
the confirmed merged/deployed state without modifying runtime code or rewriting
earlier release histories. The scroll-discovery draft remains archived as a
superseded local experiment; no new Project draft was created. Existing security,
QR-dependency and stored-language hydration items remain separate. Physical
phone review after a page reload is the remaining recommended user check, not
an uncompleted deployment step.
