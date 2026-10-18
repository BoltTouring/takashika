# Takashika for Android / GrapheneOS

Download `Takashika-1.0.0-android.apk` from the GitHub release on your phone, open it, and allow that browser or file manager to install apps when Android asks. Open Takashika and enter a WaniKani personal access token with `reviews:create` enabled. The app needs network access for WaniKani, including GrapheneOS's per-app Network permission.

Android 9 or newer. No Google Play services, Google account, trackers, or native CPU-specific libraries. Uses the system WebView (Vanadium WebView on GrapheneOS). This first Android release is review-focused: ten-item batches or all due reviews, meaning/reading/radical cues, pronunciation, answer override, exclusion notes, and local partial-review checkpoints. It does not port the Mac app's lessons, charts, or full settings. Internet is required to load and save reviews; no background/offline submissions.

The API token and partial reviews stay in private app storage. Backups are disabled. Uninstalling or clearing storage removes them. Links to WaniKani settings open in your browser. Back pauses the current review and returns to the home screen.

## Build

Use Python 3, JDK 17, Android SDK platform 36, and build-tools 36.0.0. No Gradle or third-party Android libraries are needed. `MainActivity` serves only bundled assets under the reserved HTTPS origin `appassets.androidplatform.net`, blocks file/content access and cleartext traffic, and exposes no native JavaScript bridge.

Set `ANDROID_HOME` and `JAVA_HOME` if they differ from the defaults in `build.py`.

Create a private release key once, outside Git. The build expects `.signing/release.jks` (alias `takashika`) and `.signing/password`, or another directory selected with `TAKASHIKA_SIGNING_DIR`. Never publish either file. Generate your own key using `keytool -genkeypair` with RSA 3072, alias `takashika`, and a long validity period. Keep a secure backup: Android updates must use the same signing key.

```sh
python3 android/build.py
```

The script packages an allowlist of web files, compiles Java and resources using SDK tools, aligns the APK, signs it, and verifies the signature and alignment. Output: `release/Takashika-1.0.0-android.apk`. Increment `versionCode` for subsequent updates.

## Validation

Unit tests: `npm test`. Browser tests with mocked API responses: run `npm start`, then `node scripts/check-browser.cjs` and `node scripts/check-batches.cjs` (requires Playwright and Chrome). These tests never submit real reviews.

The first release was package-verified and browser-tested. It has not yet been tested on a physical GrapheneOS phone.

References: [Android local web content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [APK signing](https://developer.android.com/tools/apksigner).
