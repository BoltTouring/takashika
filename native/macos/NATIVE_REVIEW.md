# Native Tsurukame review — updated 16 October 2026

## Scope and current status

Reviewed the restored Mac app, review settings, home/summary screens, session and item
logic, checkpointing, exclusion handling, local sync queue, and Catalyst build setup.
This is not a claim that every upstream file or every iOS/watchOS path has been tested.

Version **1.37 (1116)** is built and installed at `/Applications/Tsurukame.app`.
The optimized universal arm64/x86_64 Catalyst build launches with the existing account,
level and review counts intact. Verified the Do 5 reviews button and Return shortcut
both open a session with five remaining, and ending either session returns home.
No real answers were submitted, and existing personal settings were not changed.

Previous executable backup:
`/Applications/Tsurukame Backups/Before 1.36 20261016-102344/Tsurukame.app`.
macOS denied direct access to the app's data container, so no separate data backup was
made; the container was not moved or replaced. The updated app reads it successfully.

## Findings addressed in source

| Severity | Finding | Change |
| --- | --- | --- |
| High | Podfile targeted nonexistent Tsurukame-macOS and Tests-macOS targets and omitted MMDrawerController. | Restored the project's iOS/Catalyst targets and locked dependency list. Setup no longer overwrites Podfile with the abandoned AppKit experiment. |
| High | Combined Anki mode could mark another item automatically after completing a meaning-only item. | Only mark a second part when the current subject remains unfinished. |
| High | Ask again later reset correct halves and all earlier wrong answers. | Preserve review state while moving the item. |
| High | A caller omitting the practice flag could submit practice progress. | The session's own practice mode is authoritative. |
| Medium | Correcting a later typo could leave that typo counted in the SRS penalty. | Subtract only the latest overridden mistake; retain earlier genuine mistakes. |
| Medium | Repeated or stale marking actions could affect stats or resubmit a finished item. | Validate active queue membership and override context; guard the UI override action. |
| Medium | Leaving a session discarded unfinished answers and mistakes. | Account-scoped checkpoints after each answer, restored only for the same assignment ID, due time and SRS stage. Completed items still use the existing SQLite pending-progress queue. |
| Medium | Zero review-batch size created an apparently empty session. | Clamp active batch size to at least one. |
| Medium | Skip-kanji-reading settings could still begin by asking a reading. | Select meaning when readings are skipped. |
| Medium | Enter could submit Japanese text while an IME composition was active. | Ignore submit while marked text exists. |
| Medium | Theme changes before the first question could dereference an absent active assignment. | Guard the active task before updating question colors. |
| Low | Lesson comparator used <= for identical IDs, violating strict ordering. | Use <. |
| Low | SwiftFormat build phase assigned an array instead of evaluating xcrun for SDKROOT. | Use command substitution and export SDKROOT. |

Checkpoints deliberately exclude practice and lesson quizzes. Logout clears the current
account's checkpoint. Full eligible queues are used to prune stale/excluded checkpoints
before applying a session limit. Checkpoints contain no API token.

## Making it easier to come back

The installed app showed 2,152 reviews due, batches disabled, and ten items between
meaning and reading. That combination makes a casual visit feel open-ended.

Implemented and installed:
- A first-row **Do 5 reviews** action, also activated by Return.
- The full Reviews action and Command-R remain available.
- Unfinished items take priority so earlier effort is not lost.
- A summary that treats a small completed batch as a valid stopping point.

Suggested next, after testing the core changes:
1. A daily count of completed items, without a streak reset or guilt after a gap.
2. An optional quiet home screen that makes the backlog secondary.
3. One user-chosen reminder tied to an existing routine, rather than every due review.
4. A clear “saved locally / waiting to sync” indicator.

No reminders, notification settings, account settings, or automatic passing were enabled.

## Remaining issues and validation

- Xcode 27.1 is installed and the native app builds successfully. All 24 native
  XCTest tests and 18 review regression checks pass. XCTest uses a separate bundle
  suffix and container to avoid the personal account.
- Fixed unsupported deployment targets (iOS 15 / Catalyst macOS 12 minimum).
- Launch testing caught Xcode 27's required scene lifecycle. Added a single-window
  SceneDelegate with startup, activation, URL and user-activity forwarding.
- Source formatting is opt-in so routine builds do not rewrite unrelated files.
- This Mac has no valid Apple development signing identity; the personal build uses
  local ad-hoc signing without hardened runtime; App Sandbox and network-client
  entitlements remain enabled. This is not a notarized distribution build.
- Core checks compile the production ReviewItem/ReviewSession code against API doubles.
  They do not prove UIKit type checking, Catalyst layout, code signing, or live API sync.
- UI Swift syntax, project plist, Podfile Ruby syntax, and shell syntax are checked separately.
- Still requires a dedicated test account for end-to-end five-review completion,
  resume after quit, logout/account isolation, offline completion/reconnect, IME input,
  and combined Anki mode. These review-state cases have automated core coverage,
  but no live WaniKani submissions were made.
- sendPendingProgress currently drops every HTTP 422 as a presumed conflict. It should
  eventually verify server assignment state or retain the error for diagnosis rather than
  assume every 422 is an already-completed review. No speculative sync rewrite was applied.
- Local SRS estimates are simplified until the next authoritative sync.
- Earlier IMPLEMENTATION_SUMMARY.md claimed a known-word auto-pass feature and AppKit
  implementation that do not match the code. The historical text is retained with a warning.
- A full dependency/upstream merge is deferred until a working Catalyst build can validate it.

Lifecycle migration reference: [Apple UIKit scene migration](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).


## Native interface update — 16 October 2026

- A quiet Today screen centers a small review session and an account-scoped local
  daily count. Full queues, lessons, charts, forecasts and extra practice remain
  available through Study more and Progress.
- Daily counts reset at local midnight, deduplicate the same assignment cycle,
  exclude practice and lessons, and never create or reset a streak. They count
  reviews completed in this app from this update onward, not activity on other devices.
- Welcome-back copy and a small winged turtle make returning approachable.
- Mac review questions, prompts, inputs and explanations now share a bounded,
  centered column, neutral backgrounds and higher-contrast controls.
- A visible Pause action opens the saved-progress summary immediately. The primary
  completion action is Done for today; another small batch remains optional.
- Mac success feedback uses the completion counter instead of repeated confetti.
- Added a DEBUG-only `.native-preview` bundle suffix that activates the existing
  fake client. Its sendProgress is a no-op; it uses a separate sandbox container.

Verification: 24 native XCTest tests and 20 core checks pass. Added coverage for
local-midnight reset, duplicate prevention, returning-after-a-gap copy eligibility,
and account isolation. In the isolated UI preview, verified dark/light appearance,
Today/Progress navigation, incorrect-answer explanations, typo correction, partial
answer → Pause → Another batch restoration, completed-item count, completion summary,
and daily count persistence after relaunch. No unsatisfiable-layout warnings appeared
in the preview log. No answers were submitted to the personal account. Live API sync,
a complete offline/reconnect cycle, and the separate iOS/Watch apps were not retested.


Installation verified: `/Applications/Tsurukame.app` reports 1.37 (1116), passes
`codesign --verify --deep --strict`, and opens the new Today screen with the original
tricycle account (level 20, 673 learned kanji). Version 1.36 is preserved at
`/Applications/Tsurukame Backups/Before 1.37 20261016-105249/Tsurukame.app`.

## 16 October 2026: Today/Progress crash fix (1.39 / 1118)

The 1.38 crash report at 13:32:30 JST identified an index-out-of-range trap in TableModel.heightForHeaderInSection, called synchronously by setTableHeaderView during MainWaniKaniTabViewController.recreateTableModel. The replacement model had already attached as the table delegate but had no sections yet. Header assignment now happens after model population and reloadData. Section header/footer and row-count callbacks also handle empty/stale section queries safely.

Added three native regression tests covering empty/stale queries, hidden-section mapping, and replacing a populated grouped table with an empty model and header. All 27 native XCTest tests passed using the isolated .native-tests bundle. Log: /tmp/tsurukame-crash-tests.log.

Installed and signature-verified 1.39 (1118). Confirmed the real account still loads. Manual installed-app checks passed: Progress to Today, plus three repeated cycles of Progress / Today / Study more / Keep it simple (12 transitions). No new crash report appeared; latest remains the original 1.38 report. No review answers were submitted. Previous app retained at /Applications/Tsurukame Backups/Before 1.39 20261016-133720/Tsurukame.app.
