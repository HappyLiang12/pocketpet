# FoldPet

Turn a foldable phone into a desk clock with a live AI-agent pet. The Mac bridge collects coding-agent activity and streams it to a phone web page — no app install, no cloud.

## Requirements

- macOS with Node.js >= 20
- Phone on the same WiFi as the Mac, or the Mac joined to the phone's Bluetooth tethering
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

## Bluetooth tethering

When the Mac and phone are on different networks: pair them once, enable the phone's Personal Hotspot / Bluetooth tethering, join it from the Mac, then restart `fold-pet run` (the bridge prints the new address). `fold-pet run` lists every LAN address but encodes only the first one in the QR, so if WiFi and tethering are both active the QR usually points at the WiFi address. In that case, open the printed URL for the tethering interface directly instead of scanning the QR. Pet state is tiny; the slow link is fine.

## Pets

FoldPet scans three local roots in order: `~/.fold-pet/pets`, `~/.codex/pets`, then `~/.petdex/pets`. The first copy of a slug wins.

- Install from the Petdex gallery: `npx petdex install boba` (lands in `~/.codex/pets` or `~/.petdex/pets` depending on the Petdex version).
- Or drop a pet folder (`pet.json` + `spritesheet.webp|png`, 8×9 or 8×11 atlas) into `~/.fold-pet/pets`.
- Pick the active pet from the phone's gear drawer. Use the same Petdex slug on desktop to show the same character.

## Commands

- `fold-pet init` — create config and Claude hooks
- `fold-pet run` — start the bridge and print the QR
- `fold-pet doctor` — check config, hooks, pets, port
- `fold-pet hook claude` — internal; called by Claude Code hooks

## Status

M1: Claude Code adapter, phone display (folded + wide), pet catalog, QR pairing. Codex/OpenCode/Pi adapters, Qoder support, pet upload, and guided Bluetooth setup are later milestones. See `docs/superpowers/specs/2026-11-21-fold-pet-design.md`.

## Security

Events are accepted only from loopback. The phone API requires the per-install token; the QR carries it once and the browser stores it as an HttpOnly cookie. The token still appears in the address bar and stays in browser history, so avoid sharing screenshots that show the address bar. No cloud, no telemetry. Events contain agent/session/project/tool names only — never code, prompts, or outputs.
