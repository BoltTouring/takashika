# Takashika

Takashika is a WaniKani review app for Mac, Android, and the web.

Download the Mac ZIP or Android APK from [GitHub Releases](https://github.com/BoltTouring/takashika/releases).
The Android app bundles the web reviewer and needs no Google Play services. It is a review-focused companion, not a full port of the Mac app's lessons, charts, and settings. See [Android installation and build instructions](android/README.md).
The native Mac source is in [native/macos](native/macos), derived from Tsurukame under Apache 2.0.

The web reviewer can also be:

- served as a mobile PWA
- installed as a desktop web app on macOS
- deployed on GitHub Pages or any static host

It started from the Tsurukame exclusion workflow and keeps support for items marked with `#tsurukameExclude`.

## What it does

- Loads assignments, subjects, and study materials directly from the WaniKani API
- Builds separate meaning and reading review prompts
- Accepts WaniKani meaning synonyms from study materials
- Supports installable PWA behavior
- Preloads pronunciation audio for faster playback when available
- Tracks simple in-session accuracy stats

## Local development

Requires Node.js 22 or newer. No package installation or build step is needed.

1. Get a WaniKani API token with **reviews:create** permission from [WaniKani Settings](https://www.wanikani.com/settings/personal_access_tokens)
2. Run `npm start` from this directory
3. Open the served URL in a browser

Example:

```bash
npm start
```

Then open `http://localhost:4173`. Use `PORT=4174 npm start` if the port is occupied.
A Python alternative is `python3 -m http.server 4173 --bind 127.0.0.1`.

Type readings in hiragana, katakana, or romaji; conversion happens when checking the answer so editing and Japanese IME input remain intact. Press Enter to submit and again to continue. Audio is available after checking an answer.

Completed items update your real WaniKani schedule. If a save fails, keep the page open and use **Retry save**. The answer is counted only once. Partially answered reviews and mistake counts are saved locally per account and restored for the same assignment cycle. A browser warning is provided where supported. The Android app has the same checkpoints.

## Tests

The repo uses Node's built-in test runner for regression tests for answer checking, queue construction, review state, and API error handling.

```bash
npm test
```

For optional end-to-end checks, `scripts/check-browser.cjs` uses Playwright and an installed Google Chrome with isolated temporary profiles and mocked WaniKani responses. With Playwright available to Node and `npm start` running on port 4173, run `node scripts/check-browser.cjs`. Screenshots are written to the system temporary directory. These checks never submit real reviews.

## Deploying

GitHub Pages works if the repository is published from the repo root on the `main` branch.

Because the app is static, any equivalent static host also works.

## Install as an app

Once deployed over HTTPS, modern browsers can install it as a standalone app experience on mobile and desktop.

Typical options:

- iPhone/iPad: Add to Home Screen
- Android: Install app / Add to Home screen
- macOS desktop browsers: install or add to dock/app launcher, depending on browser

## Project structure

```text
.
├── app.js                  # Entry point and DOM wiring
├── js/
│   ├── answer-checker.js   # Meaning/reading normalization and checks
│   ├── audio-manager.js    # Pronunciation preloading and playback
│   ├── review-queue.js     # Queue construction
│   ├── reviewer.js         # Main review session controller
│   └── wanikani-client.js  # API client
├── index.html              # Main UI shell
├── styles.css              # App styles
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── tests/                  # Smoke tests
```

## Notes

- API tokens are stored locally in the browser via `localStorage`
- The app talks directly to the official WaniKani API over HTTPS
- `android/` contains the APK shell and build script; `native/macos/` contains the native Mac app source.
- Start with 10 reviews, choose another 10 when finished, or use Review all. Meaning is pink, Reading purple, and Radical Name blue.

## License

Apache 2.0. See `LICENSE`.

## Current limitations and suggested follow-ups

- An internet connection is required for loading and saving reviews. The PWA caches the app shell, not account data.
- Updates activate after all app tabs/windows close. When deploying shell changes, bump the cache version in `sw.js`.
- If a save times out after WaniKani accepted it, retry may report that the review is already saved. Check WaniKani before reloading; this app does not reconcile ambiguous submissions automatically.
- Suggested next improvements: reconcile ambiguous saves against assignments and add a token-free practice/demo mode.
- Meaning answers use normalized exact matching, including your synonyms; typo tolerance is not enabled.
