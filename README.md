# PocketPet

[![CI](https://github.com/HappyLiang12/pocketpet/actions/workflows/ci.yml/badge.svg)](https://github.com/HappyLiang12/pocketpet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.6-brightgreen)](package.json)

[English](README.md) | [简体中文](README.zh-Hans.md)

Turn a foldable phone into a desk clock with a live AI-agent pet. The Mac bridge collects coding-agent activity and streams it to a phone web page — no app install, no cloud.

## Features

- Zero-install phone page: scan one QR, add it to the home screen, keep it charging.
- Folded outer screen shows a clock + pet; unfolding gives a wide stage with per-agent session cards.
- Live states from Claude Code and Qoder (M1/M3), with Codex/OpenCode/Pi adapters on the roadmap.
- Petdex pets: gallery search, capped picker, local installs, custom `pet.json` + spritesheet.
- One-command onboarding (`pocketpet up`), optional launchd login service, USB fallback.
- English, Traditional Chinese, and Simplified Chinese UI; an in-page debug panel and connection troubleshooting.
- Local-first: loopback events, per-install token, no telemetry.

## Requirements

- macOS with Node.js >= 20.6
- Phone on the same WiFi as the Mac (USB fallback below for different networks)
- Claude Code and/or Qoder for the adapters (hooks are installed only into roots that already exist)

## Quick start

```bash
npm install
npm run build
npm link          # gives a stable `pocketpet` command for Claude hooks and the login service
pocketpet up
```

`pocketpet up [--yes] [--no-hooks] [--no-service] [--no-open] [--qr-host ip|local]` is the one-command first run:

1. Creates `~/.pocketpet/config.json` if it is missing (directory 0700, file 0600) and prints the path — never the token.
2. Asks `Install Claude Code hooks? [Y/n]` when stdin is a terminal. `--yes` installs without asking, `--no-hooks` skips, and a non-TTY run skips with a reminder to run `pocketpet init` later. Existing settings and third-party hooks are preserved. If `~/.qoder` or `~/.qoder-cn` exists, it asks the same question for Qoder; an absent Qoder root is never created.
3. Asks `Start bridge at login? [y/N]` (default no). Answering yes, or passing `--yes`, installs the `dev.pocketpet.bridge` LaunchAgent. Otherwise the bridge runs in the foreground until Ctrl+C; `--no-service` skips the question. If a bridge already answers on the configured port, `up` reprints the pairing details and reopens `/setup`.
4. Prints every LAN URL plus a full-size terminal QR code (first IPv4 address by default) and the three phone steps.
5. Opens `http://127.0.0.1:<port>/setup` in the Mac browser: a loopback-only page with the **IP** QR, the URLs, and USB instructions. The page always shows the IP QR, so `--qr-host local` only changes the terminal QR. `--no-open` keeps the page closed.

### On the phone

No app and no phone-side configuration:

1. Join the same WiFi as the Mac.
2. Point the phone **camera** at the QR code and open the link — no adb needed.
3. Add the page to the home screen and keep it open while charging.

The same QR is reusable: every phone scans it once and stays paired until you change the token in `~/.pocketpet/config.json`. Do not share the cleaned `/` URL (it has no token and returns 401), and do not open `/setup` on a phone — it is Mac-only and shows a Mac-only page.

The token in `?token=...` is stored as an HttpOnly cookie and then removed from the address bar, so the visible and bookmarked URL is just `/`. The API, WebSocket, and reloads keep using that cookie. A one-time add-to-home hint appears in the gear drawer; dismissing it is remembered on that phone and hidden automatically when the page already runs standalone.

### `.local` address

Next to each IP URL, `pocketpet up` prints the Mac's Bonjour name from `scutil --get LocalHostName` (for example `http://my-mac.local:7788/?token=...`). It survives DHCP address changes, but depends on multicast DNS: some WiFi networks block it and Android resolution varies by version. The QR keeps using the IP by default; `--qr-host local` puts the `.local` URL in the terminal QR instead (the `/setup` page still renders the IP QR). The `.local` address is not the universal default until it is verified on both Android and iPhone.

### Login service

```bash
pocketpet service install    # LaunchAgent dev.pocketpet.bridge; starts now and at every login
pocketpet service status     # exit 0 + "running" line, exit 1 + "not running" line
pocketpet service uninstall  # stops it and removes the plist
```

The service runs `<node> <dist/cli.js> run --service`, which prints only `PocketPet bridge listening on port N`. The token, URLs, and QR never reach the service log `~/.pocketpet/logs/bridge.log` (file 0600, directory 0700). Run `pocketpet up` again while the service is running to reprint the QR and reopen `/setup`. A source `.ts` entry point is refused; install the service from the built `dist/cli.js`.

### Qoder adapter

`pocketpet init` and `pocketpet up` wire Qoder user-level hooks into every existing root (`~/.qoder/settings.json` and `~/.qoder-cn/settings.json`) and never create a root that was not already there. The compiled CLI writes an absolute `<node> <dist/cli.js> hook qoder` command because the Qoder GUI may not inherit the shell `PATH`; a source (tsx) run falls back to the linked `pocketpet hook qoder`. Existing settings, foreign hooks, and `hooksConfig` are left untouched.

Verification gate: Qoder desktop 0.5.17 has not yet been observed executing a hand-written user-level hook. Its plugin hooks do execute, and the user-level path is documented, but the end-to-end payload is unverified. Install Qoder hooks with consent, run a Qoder task, and confirm the phone pet reacts before treating Qoder support as fully shipped. See `docs/research/qoder-events.md` and `docs/acceptance/m3-qoder-manual.md` (result: NOT RUN).

### Port

The port lives in `~/.pocketpet/config.json` (default 7788). `POCKETPET_PORT` overrides it only while a **new** config is created: an integer 0–65535; invalid values fall back to 7788. Existing configs are never rewritten — edit `port` in the config file to change it later. `POCKETPET_PORT=0` asks the OS for a free port and is for automated tests only: do not persist port 0 in a real config, because the next start gets a different port and previously printed QR codes/URLs stop matching.

## Always-on screen

The page requests the Screen Wake Lock when the browser allows it. Over plain HTTP on a LAN IP the Wake Lock API is unavailable, so set the phone's auto-lock to Never (iOS) or extend the screen timeout / enable Stay awake (Android). A one-time local HTTPS certificate option may come later.

## USB fallback (different networks)

macOS Monterey and later removed Bluetooth PAN/tethering, so Bluetooth is not a fallback on current Macs. When the phone and Mac are on different networks, connect the phone by USB with debugging enabled and forward the bridge port:

```bash
adb reverse tcp:7788 tcp:7788
```

Then open `http://127.0.0.1:7788/?token=...` on the phone (the token is in the `pocketpet up`/`pocketpet run` output, and the `/setup` page repeats the USB command with the configured port). `127.0.0.1` is a secure context, so the Wake Lock can stay active. Pet state is tiny; the USB link is plenty. When no LAN URL exists, `pocketpet up` prints these two USB steps instead of a QR.

## Pets

PocketPet scans three local roots in order: `~/.pocketpet/pets`, `~/.codex/pets`, then `~/.petdex/pets`. The first copy of a slug wins.

- Install from the Petdex gallery: `npx petdex install boba` (lands in `~/.codex/pets` or `~/.petdex/pets` depending on the Petdex version).
- Or drop a pet folder (`pet.json` + `spritesheet.webp|png`, 8×9 or 8×11 atlas) into `~/.pocketpet/pets`.
- Pick the active pet from the phone's gear drawer; use the search box to filter the Petdex gallery (local pets stay pinned). Use the same Petdex slug on desktop to show the same character.

## Commands

- `pocketpet up` — first-run setup: config, hooks consent, optional login service, full-size QR, `/setup`
- `pocketpet service install|uninstall|status` — manage the launchd login item
- `pocketpet init` — create config and Claude/Qoder hooks (still available for scripted setup)
- `pocketpet run` — start the bridge in the foreground and print the QR; auto-creates a missing config and reminds you that hooks need `init`
- `pocketpet doctor` — check config, Claude/Qoder hooks, pets, port
- `pocketpet hook claude` — internal; called by Claude Code hooks
- `pocketpet hook qoder` — internal; called by Qoder hooks

## Status

Current: M1 + onboarding + Qoder adapter. One-command setup (`pocketpet up`), loopback `/setup` pairing, launchd login service, Claude Code and Qoder adapters, foldable folded/wide display, Petdex catalog, USB fallback, English/繁體中文/简体中文 UI, and an in-page debug panel. The Qoder adapter is implemented, but Qoder desktop 0.5.17 executing a hand-written user-level hook is still a verification gate with the real app (NOT RUN). Codex/OpenCode/Pi adapters, pet upload, and making `.local` the default QR host are later milestones. See `docs/superpowers/specs/2026-11-21-pocketpet-design.md`.

## Troubleshooting

- `ERR_TOO_MANY_RETRIES` / `ERR_SSL_PROTOCOL_ERROR`: the phone browser is forcing HTTPS (Chrome/Edge “Always use secure connections”), or a VPN/proxy is intercepting. Turn that setting off, try Safari/Firefox, or disable VPN/iCloud Private Relay. The LAN bridge is HTTP-only; local HTTPS/tunnel is a later option.
- `unauthorized`: you opened the cleaned `/` URL without the token. Scan the QR or use the tokenized URL listed on `/setup`.
- `配對頁只限 Mac` / Mac-only page: `/setup` must be opened on the Mac; phones scan the QR.
- Can't reach the Mac at all: confirm the phone is on the same WiFi/subnet (guest networks and AP isolation block it); otherwise use USB `adb reverse`.

## Security

Events are accepted only from loopback. The phone API requires the per-install token; the QR carries it once, the browser stores it as an HttpOnly cookie for one year (so a browser restart does not require a rescan), and the page removes `?token=` from the address bar after load. The token still appears in the terminal output and on the loopback-only `/setup` page, and the service log never contains it; avoid sharing screenshots that show the QR, URLs, or setup page. `/setup` is not cached (`Cache-Control: no-store`). No cloud, no telemetry. Events contain agent/session/project/tool names only — never code, prompts, or outputs.

## Credits

- [Petdex](https://petdex.dev) — open-source pet format, gallery, and manifest (MIT). Pet art is owned by its submitters; PocketPet does not bundle pet art and reads locally installed packages.
- [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) — architecture reference only (AGPL-3.0); no code was copied.
- Qoder, Claude Code, Codex, OpenCode, Pi, and other agent names are trademarks of their respective owners. PocketPet is not affiliated with them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through GitHub Security Advisories; see [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
