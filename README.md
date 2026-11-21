# FoldPet

Turn a foldable phone into a desk clock with a live AI-agent pet. The Mac bridge collects coding-agent activity and streams it to a phone web page — no app install, no cloud.

## Requirements

- macOS with Node.js >= 20
- Phone on the same WiFi as the Mac (USB fallback below for different networks)
- Claude Code for the M1 adapter

## Setup

```bash
npm install
npm run build
npm link          # gives a stable `fold-pet` command for Claude hooks
fold-pet init     # creates ~/.fold-pet/config.json and wires Claude Code hooks
fold-pet run      # prints LAN URLs and a QR code
```

Scan the QR on the phone, add the page to the home screen, and keep it open while charging.

## Always-on screen

The page requests the Screen Wake Lock when the browser allows it. Over plain HTTP on a LAN IP the API is unavailable, so set the phone's auto-lock to Never (iOS) or extend the screen timeout / enable Stay awake (Android). A one-time local HTTPS certificate option may come later.

## USB fallback (different networks)

macOS Monterey and later removed Bluetooth PAN/tethering, so Bluetooth is not a fallback on current Macs. When the phone and Mac are on different networks, connect the phone by USB with debugging enabled and forward the bridge port:

```bash
adb reverse tcp:7788 tcp:7788
```

Then open `http://127.0.0.1:7788/?token=...` on the phone (the token is in the `fold-pet run` output). `127.0.0.1` is a secure context, so the Wake Lock can stay active. Pet state is tiny; the USB link is plenty.

## Pets

FoldPet scans three local roots in order: `~/.fold-pet/pets`, `~/.codex/pets`, then `~/.petdex/pets`. The first copy of a slug wins.

- Install from the Petdex gallery: `npx petdex install boba` (lands in `~/.codex/pets` or `~/.petdex/pets` depending on the Petdex version).
- Or drop a pet folder (`pet.json` + `spritesheet.webp|png`, 8×9 or 8×11 atlas) into `~/.fold-pet/pets`.
- Pick the active pet from the phone's gear drawer; use the search box to filter the Petdex gallery (local pets stay pinned). Use the same Petdex slug on desktop to show the same character.

## Commands

- `fold-pet init` — create config and Claude hooks
- `fold-pet run` — start the bridge and print the QR
- `fold-pet doctor` — check config, hooks, pets, port
- `fold-pet hook claude` — internal; called by Claude Code hooks

## Status

M1: Claude Code adapter, phone display (folded + wide), pet catalog, QR pairing. Codex/OpenCode/Pi adapters, Qoder support, pet upload, and USB fallback guidance are later milestones. See `docs/superpowers/specs/2026-11-21-fold-pet-design.md`.

## Security

Events are accepted only from loopback. The phone API requires the per-install token; the QR carries it once and the browser stores it as an HttpOnly cookie. The token still appears in the address bar and stays in browser history, so avoid sharing screenshots that show the address bar. No cloud, no telemetry. Events contain agent/session/project/tool names only — never code, prompts, or outputs.
