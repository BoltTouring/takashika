# Tsurukame for Mac

The restored app is the **Tsurukame Mac Catalyst target**, using UIKit on macOS.
Open `ios/Tsurukame.xcworkspace` and select **Tsurukame → My Mac (Mac Catalyst)**.
Keep the existing `com.takashika.wanikani` bundle identifier to retain the app's account data.

## Local build on this Mac

With Xcode selected, run `bash scripts/build-native-mac.sh`. This uses the checked-in
Pods and locked Swift packages, creates an optimized, locally signed app, and prints
its location. No developer certificate is needed for this personal build. Do not use
that signature for distribution. CocoaPods is only needed when regenerating Pods.

The deployment baseline is iOS 15 / macOS 12 for Catalyst. Xcode 27 requires the
scene lifecycle now implemented in AppDelegate.swift. Source formatters run only
when `RUN_SOURCE_FORMATTERS=YES` is explicitly supplied to xcodebuild.

## Build in Xcode

1. Install full Xcode, launch it once, and complete its component installation.
2. Select Xcode's Command Line Tools in Xcode Settings → Locations.
3. With CocoaPods available, run `bash ios/setup-macos.sh`. It uses `pod install` and
   the existing lockfile, not a dependency upgrade.
4. Open the workspace, select the Tsurukame scheme and Mac Catalyst destination,
   and configure your existing development team under Signing & Capabilities.
5. Build and run. Test with a separate test account before replacing the installed app.

The separate Takashika AppKit target and untracked `*-macOS.swift`, `Info-macOS.plist`,
and `Podfile-macOS` files are earlier experiments, not the restored Tsurukame app.
Do not copy `Podfile-macOS` over the working Podfile.

## Review improvements

- **Do 5 reviews** appears before the full queue. Return starts this small session;
  the existing Reviews row and Command-R keep their existing behavior.
- Partly answered real reviews resume first. Checkpoints preserve wrong-answer counts
  and only match the same account, assignment, due timestamp and SRS stage.
- Checkpoints are written after each answer; completed answers continue using the
  existing SQLite offline progress queue. Practice and lesson quizzes start fresh.
- Deferring a question no longer erases prior answers or penalties.
- Summary copy provides a natural stopping point without demanding the entire backlog.

## Verification

Run `bash scripts/check-native-core.sh` with Swift Command Line Tools. It compiles
production ReviewItem/ReviewSession logic against small API boundary doubles and
runs regression checks without accessing your account.

These checks do not replace a full Xcode build, XCTest, Catalyst launch, signing,
or end-to-end WaniKani sync testing. See `NATIVE_REVIEW.md` for verified findings
and remaining validation.

## Existing exclusion behavior

`#tsurukameExclude` in study material notes excludes items from review selection.
The local `knownWords` setting currently has no consumers. Earlier documentation
describing automatic passing and a “Mark as Known” action did not match the source;
this review does not enable automatic passing of real reviews.

Native XCTest (isolated from your personal app container):

```sh
xcodebuild -workspace ios/Tsurukame.xcworkspace -scheme Tsurukame \
  -configuration Debug -destination 'platform=macOS,variant=Mac Catalyst' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= \
  TSURUKAME_BUNDLE_SUFFIX=.native-tests -only-testing:Tests test
```

Verified on 16 October 2026: Xcode 27.1 build succeeds; 24 native XCTest tests
and 20 review regression checks pass. See NATIVE_REVIEW.md for launch checks.


## Calm study interface (1.37)

Today emphasizes a small batch and reviews completed here today. Progress retains
all charts and full study options. The Mac review screen uses a centered reading
column, explicit Pause, and a Done for today / Another batch completion screen.
Daily counts are local to this app, account-specific, and reset at local midnight.

For safe visual testing, build Debug with `TSURUKAME_BUNDLE_SUFFIX=.native-preview`.
This activates the existing fake-data client in a separate sandbox; release builds
never activate it. Do not use the personal bundle ID for fixture-based UI testing.
