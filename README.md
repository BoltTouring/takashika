# Takashika

Takashika is a small WaniKani review app built as a static web app. The same codebase can be:

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

1. Get a WaniKani API token from [WaniKani Settings](https://www.wanikani.com/settings/personal_access_tokens)
2. Serve the repo root with any static web server
3. Open the served URL in a browser

Example:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Tests

The repo uses Node's built-in test runner for lightweight smoke tests.

```bash
npm test
```

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
- The repository currently contains static web assets only; any native shell would be external to this repo

## License

Apache 2.0. See `LICENSE`.
