# Contributing

## Requirements

- macOS (the bridge and launchd service are macOS-only)
- Node.js >= 20.6
- A phone on the same WiFi for manual testing

## Setup

```bash
npm install
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

`npm run typecheck` checks the bridge sources. The web app is built and exercised by Vite/Playwright.

## Scope and principles

- Keep the phone zero-install: no native app, no account, no cloud requirement.
- Hooks and login items are opt-in; never modify a user's Claude settings without consent.
- Never log tokens, QR URLs, prompts, code, or file contents.
- The LAN bridge is HTTP-only by design; document browser HTTPS-First issues instead of silently weakening security.
- Add tests for behavior changes. Real-device/manual checks belong in `docs/acceptance/`.

## Pull requests

1. Create a branch, keep commits focused.
2. Run the unit suite and E2E locally.
3. Describe what changed and which manual gates (if any) remain NOT RUN.
4. Do not commit secrets, real tokens, personal screenshots, or generated pet art you do not own.

## Pet assets

Petdex pets are submitted by their creators. PocketPet does not bundle pet art; it reads locally installed Petdex packages. Do not add third-party pet art to this repository without permission.
