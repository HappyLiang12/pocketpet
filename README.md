# FoldPet

Turn a foldable phone into a desk clock with a live AI-agent pet. The Mac bridge collects coding-agent activity and streams it to a phone web page — no app install, no cloud.

## Requirements

- macOS with Node.js >= 20
- Phone on the same WiFi as the Mac (USB fallback below for different networks)
- Claude Code for the M1 adapter

## Quick start

```bash
npm install
npm run build
npm link          # gives a stable `fold-pet` command for Claude hooks and the login service
fold-pet up
```

`fold-pet up [--yes] [--no-hooks] [--no-service] [--no-open] [--qr-host ip|local]` is the one-command first run:

1. Creates `~/.fold-pet/config.json` if it is missing (directory 0700, file 0600) and prints the path — never the token.
2. Asks `Install Claude Code hooks? [Y/n]` when stdin is a terminal. `--yes` installs without asking, `--no-hooks` skips, and a non-TTY run skips with a reminder to run `fold-pet init` later. Existing settings and third-party hooks are preserved.
3. Asks `Start bridge at login? [y/N]` (default no). Answering yes, or passing `--yes`, installs the `dev.foldpet.bridge` LaunchAgent. Otherwise the bridge runs in the foreground until Ctrl+C; `--no-service` skips the question. If a bridge already answers on the configured port, `up` reprints the pairing details and reopens `/setup`.
4. Prints every LAN URL plus a full-size terminal QR code (first IPv4 address by default) and the three phone steps.
5. Opens `http://127.0.0.1:<port>/setup` in the Mac browser: a loopback-only page with the same QR, the URLs, and USB instructions. `--no-open` keeps it closed.

### On the phone

No app and no phone-side configuration:

1. Join the same WiFi as the Mac.
2. Point the phone **camera** at the QR code and open the link — no adb needed.
3. Add the page to the home screen and keep it open while charging.

The token in `?token=...` is stored as an HttpOnly cookie and then removed from the address bar, so the visible and bookmarked URL is just `/`. The API, WebSocket, and reloads keep using that cookie. A one-time add-to-home hint appears in the gear drawer; dismissing it is remembered on that phone and hidden automatically when the page already runs standalone.

### `.local` address

Next to each IP URL, `fold-pet up` prints the Mac's Bonjour name from `scutil --get LocalHostName` (for example `http://my-mac.local:7788/?token=...`). It survives DHCP address changes, but depends on multicast DNS: some WiFi networks block it and Android resolution varies by version. The QR keeps using the IP by default; `--qr-host local` puts the `.local` URL in the terminal QR instead (the `/setup` page still renders the IP QR). The `.local` address is not the universal default until it is verified on both Android and iPhone.

### Login service

```bash
fold-pet service install    # LaunchAgent dev.foldpet.bridge; starts now and at every login
fold-pet service status     # exit 0 + "running" line, exit 1 + "not running" line
fold-pet service uninstall  # stops it and removes the plist
```

The service runs `<node> <dist/cli.js> run --service`, which prints only `FoldPet bridge listening on port N`. The token, URLs, and QR never reach the service log `~/.fold-pet/logs/bridge.log` (file 0600, directory 0700). Run `fold-pet up` again while the service is running to reprint the QR and reopen `/setup`. A source `.ts` entry point is refused; install the service from the built `dist/cli.js`.

### Port

The port lives in `~/.fold-pet/config.json` (default 7788). `FOLDPET_PORT` overrides it only while a **new** config is created: an integer 0–65535 (0 asks the OS for a free port); invalid values fall back to 7788. Existing configs are never rewritten — edit `port` in the config file to change it later.

## Always-on screen

The page requests the Screen Wake Lock when the browser allows it. Over plain HTTP on a LAN IP the Wake Lock API is unavailable, so set the phone's auto-lock to Never (iOS) or extend the screen timeout / enable Stay awake (Android). A one-time local HTTPS certificate option may come later.

## USB fallback (different networks)

macOS Monterey and later removed Bluetooth PAN/tethering, so Bluetooth is not a fallback on current Macs. When the phone and Mac are on different networks, connect the phone by USB with debugging enabled and forward the bridge port:

```bash
adb reverse tcp:7788 tcp:7788
```

Then open `http://127.0.0.1:7788/?token=...` on the phone (the token is in the `fold-pet up`/`fold-pet run` output, and the `/setup` page repeats the USB command with the configured port). `127.0.0.1` is a secure context, so the Wake Lock can stay active. Pet state is tiny; the USB link is plenty. When no LAN URL exists, `fold-pet up` prints these two USB steps instead of a QR.

## Pets

FoldPet scans three local roots in order: `~/.fold-pet/pets`, `~/.codex/pets`, then `~/.petdex/pets`. The first copy of a slug wins.

- Install from the Petdex gallery: `npx petdex install boba` (lands in `~/.codex/pets` or `~/.petdex/pets` depending on the Petdex version).
- Or drop a pet folder (`pet.json` + `spritesheet.webp|png`, 8×9 or 8×11 atlas) into `~/.fold-pet/pets`.
- Pick the active pet from the phone's gear drawer; use the search box to filter the Petdex gallery (local pets stay pinned). Use the same Petdex slug on desktop to show the same character.

## Commands

- `fold-pet up` — first-run setup: config, hooks consent, optional login service, full-size QR, `/setup`
- `fold-pet service install|uninstall|status` — manage the launchd login item
- `fold-pet init` — create config and Claude hooks (still available for scripted setup)
- `fold-pet run` — start the bridge in the foreground and print the QR; auto-creates a missing config and reminds you that hooks need `init`
- `fold-pet doctor` — check config, hooks, pets, port
- `fold-pet hook claude` — internal; called by Claude Code hooks

## Status

M1: one-command onboarding (`fold-pet up`), loopback `/setup` pairing page, launchd login service, Claude Code adapter, phone display (folded + wide), pet catalog, QR pairing. Codex/OpenCode/Pi adapters, Qoder support, pet upload, and making `.local` the default QR host are later milestones. See `docs/superpowers/specs/2026-11-21-fold-pet-design.md`.

## Security

Events are accepted only from loopback. The phone API requires the per-install token; the QR carries it once, the browser stores it as an HttpOnly cookie, and the page removes `?token=` from the address bar after load. The token still appears in the terminal output and on the loopback-only `/setup` page, and the service log never contains it; avoid sharing screenshots that show the QR, URLs, or setup page. `/setup` is not cached (`Cache-Control: no-store`). No cloud, no telemetry. Events contain agent/session/project/tool names only — never code, prompts, or outputs.
