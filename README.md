# PocketPet

[![CI](https://github.com/HappyLiang12/pocketpet/actions/workflows/ci.yml/badge.svg)](https://github.com/HappyLiang12/pocketpet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.6-brightgreen)](package.json)

[English](README.md) | [简体中文](README.zh-Hans.md)

Turn a foldable phone into a desk clock with a live AI-agent pet. The PocketPet bridge runs on the computer that hosts your agents, collects coding-agent activity, and streams it to a phone web page — no app install, no cloud.

## Features

- Zero-install phone page: scan one QR, add it to the home screen, keep it charging.
- Folded outer screen shows a clock + pet; unfolding gives a wide stage with per-agent session cards.
- Phone bottom sheet with Live, Look, and About; the phone stays a display and never controls agents.
- Loopback-only setup dashboard on the computer with Pair, Look, and System cards.
- Host default look and host pet, with per-phone local overrides that never write host state.
- One shared Direct Canvas Studio for the host and each phone: drag, resize, numeric fields, undo/redo, reset, and folded/wide preview.
- Live states from Claude Code; the Qoder adapter remains local/unshipped, and Codex/OpenCode/Pi are next on the roadmap.
- Petdex pets: gallery search, capped picker, local installs, custom `pet.json` + spritesheet.
- One-command onboarding (`pocketpet up`), optional launchd login service, USB fallback.
- English, Traditional Chinese, and Simplified Chinese UI; an in-page debug panel and connection troubleshooting.
- Local-first: loopback events, per-install token, no telemetry.

## Requirements

- macOS with Node.js >= 20.6. The current bridge and login service support macOS only; Windows and Linux bridge/service support is a separate specification. The UI shows the actual OS label and does not assume a platform.
- Phone on the same WiFi as the computer (USB fallback below for different networks)
- Claude Code for the ready adapter; the Qoder adapter remains local/unshipped. Hooks are installed only into roots that already exist.

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
5. Opens `http://127.0.0.1:<port>/setup` in the computer's browser: a loopback-only setup dashboard with Pair, Look, and System cards. Pair shows the **IP** QR, the LAN URLs, and USB instructions; the page always shows the IP QR, so `--qr-host local` only changes the terminal QR. `--no-open` keeps the page closed.

### Setup dashboard

`/setup` opens only on the computer running the bridge (loopback, with a Host allowlist). The phone scans the QR; it does not open `/setup`. The page is one scrolling dashboard with three anchored cards, and pairing still works without JavaScript:

- **Pair**: the server-rendered QR, LAN and `.local` URLs, USB instructions, the reusable-QR note, and an **Open phone view** action.
- **Look**: a folded/wide preview, the host default appearance, the host pet picker, **Open Studio**, and a host reset. Host defaults are written only from this setup UI.
- **System**: bridge and login-service status, port, bridge version, the actual host OS and version, the loopback scope, log path, copy diagnostics, and service commands.

Agent and update cards, agent setup, and update controls are not part of this slice; they remain later work. No agent setup or update UI is added here.

### On the phone

No app and no phone-side configuration:

1. Join the same WiFi as the computer.
2. Point the phone **camera** at the QR code and open the link — no adb needed.
3. Add the page to the home screen and keep it open while charging.

Controls live in a bottom sheet with three tabs:

- **Live** (default) shows connection state, an **Edit look** action, and the one-time add-to-home hint.
- **Look** shows the host-default summary, **Follow host defaults**, the pet picker, **Open Studio**, and **Reset this phone**.
- **About** holds the language selector, Wake Lock status, computer/bridge details, and troubleshooting.

The same QR is reusable: every phone scans it once and stays paired until you change the token in `~/.pocketpet/config.json`. Do not share the cleaned `/` URL (it has no token and returns 401), and do not open `/setup` on a phone — it only opens on the computer running the bridge.

Host defaults are the starting point for every phone. Each phone follows the host by default; turning **Follow host defaults** off, or saving from the phone Studio, keeps a local override that stays on that phone and never writes the host. **Reset this phone** clears the local override and turns follow-host back on. If the browser blocks local storage, the phone still boots with host values and notes that changes last only until reload.

The token in `?token=...` is stored as an HttpOnly cookie and then removed from the address bar, so the visible and bookmarked URL is just `/`. The API, WebSocket, and reloads keep using that cookie. The one-time add-to-home hint appears in Live; dismissing it is remembered on that phone and hidden automatically when the page already runs standalone.

### Look and Studio

Host defaults and phone overrides use the same appearance schema, and both surfaces open the same Direct Canvas Studio:

- **Setup** → Look → **Open Studio** edits **Host defaults** and saves through the setup API.
- **Phone** → Look → **Open Studio** edits **This phone** and saves a sparse local override; no host write is made.

Drag or resize the clock and pet, or use numeric fields for exact values. The Studio also provides undo/redo, Reset element, Reset all, a Folded/Wide preview, snapping, and theme, motion, layout, and session-density controls. Keyboard access: Tab selects an element, arrows move by 1%, Shift+arrows move by 10%, `+`/`-` scale, and Escape cancels or closes. The setup preview frames are approximate; the phone preview uses its real viewport.

### `.local` address

Next to each IP URL, `pocketpet up` prints the computer's Bonjour name from `scutil --get LocalHostName` (for example `http://my-computer.local:7788/?token=...`). It survives DHCP address changes, but depends on multicast DNS: some WiFi networks block it and Android resolution varies by version. The QR keeps using the IP by default; `--qr-host local` puts the `.local` URL in the terminal QR instead (the `/setup` page still renders the IP QR). The `.local` address is not the universal default until it is verified on both Android and iPhone.

### Login service

```bash
pocketpet service install    # LaunchAgent dev.pocketpet.bridge; starts now and at every login
pocketpet service status     # exit 0 + "running" line, exit 1 + "not running" line
pocketpet service uninstall  # stops it and removes the plist
```

The service runs `<node> <dist/cli.js> run --service`, which prints only `PocketPet bridge listening on port N`. The token, URLs, and QR never reach the service log `~/.pocketpet/logs/bridge.log` (file 0600, directory 0700). Run `pocketpet up` again while the service is running to reprint the QR and reopen `/setup`. A source `.ts` entry point is refused; install the service from the built `dist/cli.js`.

### Qoder adapter

`pocketpet init` and `pocketpet up` wire Qoder user-level hooks into every existing root (`~/.qoder/settings.json` and `~/.qoder-cn/settings.json`) and never create a root that was not already there. The compiled CLI writes an absolute `<node> <dist/cli.js> hook qoder` command because the Qoder GUI may not inherit the shell `PATH`; a source (tsx) run falls back to the linked `pocketpet hook qoder`. Existing settings, foreign hooks, and `hooksConfig` are left untouched.

Qoder remains local/unshipped: it is not presented as ready support. Verification gate: Qoder desktop 0.5.17 has not yet been observed executing a hand-written user-level hook. Its plugin hooks do execute, and the user-level path is documented, but the end-to-end payload is unverified. Install Qoder hooks with consent, run a Qoder task, and confirm the phone pet reacts before treating Qoder support as shipped. See `docs/research/qoder-events.md` and `docs/acceptance/m3-qoder-manual.md` (result: NOT RUN).

### Port

The port lives in `~/.pocketpet/config.json` (default 7788). `POCKETPET_PORT` overrides it only while a **new** config is created: an integer 0–65535; invalid values fall back to 7788. Existing configs are never rewritten — edit `port` in the config file to change it later. `POCKETPET_PORT=0` asks the OS for a free port and is for automated tests only: do not persist port 0 in a real config, because the next start gets a different port and previously printed QR codes/URLs stop matching.

## Always-on screen

The page requests the Screen Wake Lock when the browser allows it. Over plain HTTP on a LAN IP the Wake Lock API is unavailable, so set the phone's auto-lock to Never (iOS) or extend the screen timeout / enable Stay awake (Android). A one-time local HTTPS certificate option may come later.

## USB fallback (different networks)

macOS Monterey and later removed Bluetooth PAN/tethering, so Bluetooth is not a fallback on current macOS releases. When the phone and computer are on different networks, connect the phone by USB with debugging enabled and forward the bridge port:

```bash
adb reverse tcp:7788 tcp:7788
```

Then open `http://127.0.0.1:7788/?token=...` on the phone (the token is in the `pocketpet up`/`pocketpet run` output, and the `/setup` page repeats the USB command with the configured port). `127.0.0.1` is a secure context, so the Wake Lock can stay active. Pet state is tiny; the USB link is plenty. When no LAN URL exists, `pocketpet up` prints these two USB steps instead of a QR.

## Pets

PocketPet scans three local roots in order: `~/.pocketpet/pets`, `~/.codex/pets`, then `~/.petdex/pets`. The first copy of a slug wins.

- Install from the Petdex gallery: `npx petdex install boba` (lands in `~/.codex/pets` or `~/.petdex/pets` depending on the Petdex version).
- Or drop a pet folder (`pet.json` + `spritesheet.webp|png`, 8×9 or 8×11 atlas) into `~/.pocketpet/pets`.
- Set the host default pet in the setup page Look card. Each phone can keep following the host or choose a local pet in its Look tab; **Reset this phone** returns to the host pet. Use the search box to filter the Petdex gallery (local pets stay pinned). Use the same Petdex slug on desktop to show the same character.

## Commands

- `pocketpet up` — first-run setup: config, hooks consent, optional login service, full-size QR, `/setup`
- `pocketpet service install|uninstall|status` — manage the launchd login item
- `pocketpet init` — create config and Claude/Qoder hooks (still available for scripted setup)
- `pocketpet run` — start the bridge in the foreground and print the QR; auto-creates a missing config and reminds you that hooks need `init`
- `pocketpet doctor` — check config, Claude/Qoder hooks, pets, port
- `pocketpet hook claude` — internal; called by Claude Code hooks
- `pocketpet hook qoder` — internal; called by Qoder hooks

## Status

Current: M1 + onboarding + Qoder adapter (local/unshipped) + UIUX foundation. One-command setup (`pocketpet up`), the loopback setup dashboard with Pair/Look/System, launchd login service, the Claude Code adapter, a Studio Neutral phone display with a Live/Look/About bottom sheet, host default appearance and pet with per-phone local overrides, the shared Direct Canvas Studio, folded/wide display, Petdex catalog, USB fallback, English/繁體中文/简体中文 UI, and an in-page debug panel. The Qoder adapter remains local/unshipped, and its real-app gate is NOT RUN. Agent setup and update UI are out of this slice; the updater mechanism is a separate specification. Codex/OpenCode/Pi adapters, pet upload, and making `.local` the default QR host are later milestones. See `docs/superpowers/specs/2026-11-21-pocketpet-design.md` and `docs/superpowers/specs/2026-11-21-pocketpet-uiux-direction-design.md`.

## Troubleshooting

- `ERR_TOO_MANY_RETRIES` / `ERR_SSL_PROTOCOL_ERROR`: the phone browser is forcing HTTPS (Chrome/Edge “Always use secure connections”), or a VPN/proxy is intercepting. Turn that setting off, try Safari/Firefox, or disable VPN/iCloud Private Relay. The LAN bridge is HTTP-only; local HTTPS/tunnel is a later option.
- `unauthorized`: you opened the cleaned `/` URL without the token. Scan the QR or use the tokenized URL listed on `/setup`.
- `Setup page opens on the computer` / `配對頁在電腦上開啟`: `/setup` only opens on the computer running the bridge; phones scan the QR.
- Can't reach the computer at all: confirm the phone is on the same WiFi/subnet (guest networks and AP isolation block it); otherwise use USB `adb reverse`.

## Security

Events are accepted only from loopback. The phone API requires the per-install token; the QR carries it once, the browser stores it as an HttpOnly cookie for one year (so a browser restart does not require a rescan), and the page removes `?token=` from the address bar after load. The token still appears in the terminal output and in the server-rendered QR and URL text on the loopback-only `/setup` page; setup APIs never return it, and the service log never contains it. Avoid sharing screenshots that show the QR, URLs, or setup page. `/setup` is loopback-only and Host-allowlisted; setup writes require a same-origin request with the setup header. The phone writes only its local override object — never the host appearance or host pet. `/setup` is not cached (`Cache-Control: no-store`). No cloud, no telemetry. Events contain agent/session/project/tool names only — never code, prompts, or outputs.

## Credits

- [Petdex](https://petdex.dev) — open-source pet format, gallery, and manifest (MIT). Pet art is owned by its submitters; PocketPet does not bundle pet art and reads locally installed packages.
- [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) — architecture reference only (AGPL-3.0); no code was copied.
- Qoder, Claude Code, Codex, OpenCode, Pi, and other agent names are trademarks of their respective owners. PocketPet is not affiliated with them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through GitHub Security Advisories; see [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).
