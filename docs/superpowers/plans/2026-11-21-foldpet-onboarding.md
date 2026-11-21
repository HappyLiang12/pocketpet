# FoldPet Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first install and pairing a one-command, scan-only experience: `fold-pet up` creates config (with explicit hooks consent), optionally starts a launchd service, prints a full-size QR plus a local setup page, and the phone opens the pet with zero configuration. Add token-stripping from the URL and a one-time add-to-home hint.

**Architecture:** A new `up` command composes config creation, optional Claude hook installation, optional launchd service, and pairing output. A macOS `service` module manages a LaunchAgent. The bridge gains a loopback-only `/setup` page that renders a server-side QR (new `qrcode` dependency) and URLs. The web app strips `?token=` via `history.replaceState` after the cookie is set and shows a one-time add-to-home hint.

**Tech Stack:** Existing Node/TypeScript bridge, `qrcode` + `@types/qrcode`, macOS `launchctl`/`scutil`, existing Vite web app and Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-fold-pet-design.md` (onboarding design approved in chat 2026-11-21; this plan records it).

**Scope:** `up`, `service install|uninstall|status`, `/setup`, full-size terminal QR, token stripping, add-to-home hint, mDNS candidate display. No tunnel/relay, no native app, no Windows.

## Global Constraints

- macOS only (launchd, `open`, `scutil`); Node >= 20.
- Hooks are installed only after explicit consent (interactive prompt or `--yes`); existing settings and foreign hooks are preserved; writes stay atomic. If stdin is not a TTY, skip hooks/service prompts and start in the foreground.
- The launchd service must never write tokens or tokenized URLs to its log. `run --service` prints only a non-secret "listening" line. Pre-create the log as mode 0600 and the logs directory as 0700.
- `/setup` is loopback-only and `Cache-Control: no-store`; it may contain the token in the QR/URL text but never in the browser-visible setup URL.
- The phone needs no config: token in the QR sets the HttpOnly cookie, then `history.replaceState` removes `?token=` from the address bar; cookie keeps API/WS/reload working.
- Keep IP QR as the default. `.local` (Bonjour) is shown as a stable alternative and becomes selectable via `--qr-host local`; it is not the universal default until verified on Android and iPhone.
- No cloud, no telemetry; the only new dependency is `qrcode` (MIT) plus dev types, pending user install consent.
- All existing tests must stay green (112 unit / 7 E2E at plan time).

## File Map

| Path | Responsibility |
|---|---|
| `src/onboarding.ts` | local hostname, pairing URL choice, setup HTML, human prompts |
| `src/service.ts` | LaunchAgent plist generation, install/uninstall/status, launchctl runner |
| `src/cli.ts` | `up`, `service` commands, `run --service`, auto-config on `run` |
| `src/server.ts` | loopback `/setup` route rendering the QR page |
| `web/src/main.ts` | token strip, add-to-home hint wiring |
| `web/index.html`, `web/src/style.css` | hint markup/styles |
| `tests/onboarding.test.ts` | pairing URL, hostname, setup HTML, prompt decisions |
| `tests/service.test.ts` | plist content, install/uninstall command sequences |
| `tests/server.test.ts` | `/setup` loopback-only + no-store |
| `e2e/phone.spec.ts` | token strip + reload, add-to-home hint |
| `README.md`, spec, acceptance | first-run flow, service, QR scan, mDNS note |

---

### Task 1: Onboarding helpers and QR dependency

**Files:**
- Create: `src/onboarding.ts`
- Modify: `package.json` (add `qrcode`, `@types/qrcode`)
- Test: `tests/onboarding.test.ts`

**Interfaces:**
- Produces: `localHostname(): string | null` — `scutil --get LocalHostName` (trim, append `.local` if absent), null on failure.
- Produces: `type PairingLinks = { ipUrls: string[]; localUrl: string | null; qrUrl: string | null }`
- Produces: `pairingLinks(port: number, token: string, ifaces?, hostname?): PairingLinks` — IP URLs via `urlsForPort`; `localUrl = http://<hostname>:<port>/?token=...` when hostname; `qrUrl` = first IP unless `qrHost === "local"` and localUrl exists.
- Produces: `setupHtml(input: { qrSvg: string; ipUrls: string[]; localUrl: string | null; port: number }): string` — escaped, Traditional Chinese, includes same-WiFi steps, add-to-home steps, and USB fallback (no secret other than the URLs passed in).
- Produces: `askYesNo(question: string, defaultYes: boolean, tty: boolean): Promise<boolean>` — uses `node:readline/promises`; non-TTY returns the default without prompting.

- [ ] Write failing tests: hostname formatting (with/without `.local`), pairingLinks ordering and `qrHost`, setupHtml escapes URLs and includes USB instructions, non-TTY `askYesNo` returns the default.
- [ ] Run `npx vitest run tests/onboarding.test.ts` → fail.
- [ ] Implement `src/onboarding.ts` and add dependencies (`npm install qrcode && npm install -D @types/qrcode`), with user consent noted in the report.
- [ ] Run focused tests and typecheck.
- [ ] Commit: `feat: add onboarding pairing helpers`.

### Task 2: Loopback `/setup` page

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: `pairingLinks`, `setupHtml`, `localHostname` from Task 1; `qrcode.toString(qrUrl, { type: "svg", margin: 1, width: 320 })`.
- Produces: `GET /setup` — loopback only (403 otherwise), `content-type: text/html; charset=utf-8`, `cache-control: no-store`; renders 200 with `<svg` and the tokenized URL when a LAN URL exists; renders instructions and no QR when none.

- [ ] Add failing server test: loopback `/setup` without cookie → 200, no-store, contains `<svg` and `?token=`; (auth.ts unit already covers non-loopback).
- [ ] Implement the route before the auth gate; use the actual listening port, not `config.port` (tests use port 0).
- [ ] Run `npx vitest run tests/server.test.ts` → pass.
- [ ] Commit: `feat: add loopback pairing setup page`.

### Task 3: Web token strip and add-to-home hint

**Files:**
- Modify: `web/src/main.ts`, `web/index.html`, `web/src/style.css`
- Test: `e2e/phone.spec.ts`

**Interfaces:**
- Token strip: on boot, if the URL has a `token` query param, call `history.replaceState(null, "", location.pathname)`; the cookie remains the auth source.
- Hint: `#install-hint` inside the drawer with text per platform (iOS Safari share sheet / Android Chrome menu / generic), hidden when `display-mode: standalone` or `localStorage.foldpet.installHintDismissed === "1"`; a dismiss button sets the key.

- [ ] Add E2E tests: `goto('/?token=...')` → `page.url()` ends with `/`; reload still shows `已連線` and the pet loads; open drawer → hint visible; dismiss → reload → hint hidden.
- [ ] Run `npm run test:e2e` → fail.
- [ ] Implement token strip and hint (DOM via `createElement`/`textContent`, no innerHTML); add styles.
- [ ] Run E2E + unit + typecheck.
- [ ] Commit: `feat: strip pairing token and add install hint`.

### Task 4: launchd service module

**Files:**
- Create: `src/service.ts`
- Test: `tests/service.test.ts`

**Interfaces:**
- Produces: `SERVICE_LABEL = "dev.foldpet.bridge"`.
- Produces: `servicePath(home?: string): string` → `~/Library/LaunchAgents/dev.foldpet.bridge.plist`.
- Produces: `servicePlist({ home, nodePath, cliPath }): string` — Label, ProgramArguments `[nodePath, cliPath, "run", "--service"]`, EnvironmentVariables `FOLDPET_HOME`, RunAtLoad true, KeepAlive true, StandardOutPath/StandardErrorPath `<home>/logs/bridge.log`, XML-escaped.
- Produces: `installService(cfg, runner?): Promise<void>` / `uninstallService(cfg, runner?)` / `serviceStatus(cfg, runner?): Promise<boolean>`; default runner uses `execFileSync("launchctl", args)` for `bootstrap gui/<uid>`, `bootout gui/<uid>/<label>`, `print gui/<uid>/<label>`, `kickstart -k`.
- Refuses `cliPath` ending in `.ts` or missing, with a message to run the built CLI.

- [ ] Write failing tests with a fake runner: plist contains label, absolute node/cli paths, FOLDPET_HOME, log paths; install writes the plist (0600 log pre-created) and runs bootout (ignored if absent) then bootstrap; uninstall boots out then removes; status maps exit code; ts cli path refused.
- [ ] Implement; use atomic tmp+rename for the plist; `mkdirSync(logs, { recursive: true, mode: 0o700 })`, `writeFileSync(log, "", { mode: 0o600 })`.
- [ ] Run focused tests + typecheck.
- [ ] Commit: `feat: add macOS launchd service management`.
- [ ] Manual gate (user consent required): `fold-pet service install` with a temp home, `launchctl print`, `service uninstall`; if declined, mark NOT RUN.

### Task 5: `fold-pet up` and forgiving `run`

**Files:**
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts` (extend), plus a spawned CLI smoke

**Interfaces:**
- `fold-pet up [--yes] [--no-hooks] [--no-service] [--no-open] [--qr-host ip|local]`.
- Flow:
  1. `ensureConfig`; print config path (never the token).
  2. Claude settings at `CLAUDE_CONFIG_DIR` or `~/.claude/settings.json`: if no FoldPet hooks, ask `Install Claude Code hooks? [Y/n]` when TTY and not `--no-hooks`; `--yes` skips the prompt and installs. Non-TTY skips.
  3. If `http://127.0.0.1:<port>/health` responds, treat the bridge as running (service) and skip starting.
  4. Otherwise, if the service is not installed and TTY and not `--no-service`, ask `Start bridge at login? [y/N]`; `--yes` installs the service. Service mode waits for health, prints pairing, opens `/setup`, exits 0. Otherwise start in the foreground, print pairing, open `/setup`, wait for SIGINT.
  5. Pairing output: full-size terminal QR (`small: false`) for `qrUrl`, all IP URLs, optional `.local` URL, 3-step instructions, USB fallback hint when no LAN URL.
- `fold-pet run` auto-creates config via `ensureConfig` if load fails, prints a hint that hooks need `init`, and continues; `run --service` prints only `FoldPet bridge listening on port N` and no URLs/QR, and does not open a browser.
- `fold-pet service install|uninstall|status` calls Task 4.

- [ ] Extend CLI tests: `main(["up","--no-hooks","--no-service","--no-open"])` with a temp home and a fake `health`? Prefer spawning `node --import tsx src/cli.ts up --no-hooks --no-service --no-open` and reading stdout for "Scan" and a URL, then kill. Also test `run --service` stdout has no `?token=`.
- [ ] Implement; keep `init`/`run` behavior; use `askYesNo` from Task 1.
- [ ] Run focused tests, full unit, E2E, typecheck, build.
- [ ] Commit: `feat: add one-command onboarding`.
- [ ] Manual gate: open `/setup` from the Mac, scan the QR with the phone camera (not adb); test `.local` and `--qr-host local`; if `.local` resolves on vivo, document it (do not make it the universal default until iPhone is tested). Mark any unrun item NOT RUN.

### Task 6: Docs and acceptance

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-21-fold-pet-design.md`, `docs/acceptance/m1-manual.md`

- [ ] README quick start: `npm install && npm run build && npm link && fold-pet up`; QR steps; add-to-home; `fold-pet service install`; `--qr-host local`; USB fallback; note `.local` caveat.
- [ ] Spec: onboarding section (up flow, service, setup page, token strip, hint, mDNS gate) and a decision note that IP is the default QR until Android+iPhone verification.
- [ ] Acceptance: new item for `fold-pet up` + real camera scan + add-to-home; service install/reboot; `.local` result; keep unrun items NOT RUN.
- [ ] Run full unit + E2E + build; commit: `docs: document onboarding flow and service`.

## Self-Review

- Coverage: up (Task 5), service (4), setup page (2), QR (1/5), token strip + hint (3), mDNS gate (5), docs/acceptance (6).
- Security: hooks consent, no token in service logs, loopback setup, URL strip, log modes.
- Open risks: launchd is a real login item (consent gate); `.local` may fail on some networks (IP default); `qrcode` dependency needs install consent; real camera scan cannot be automated and is a manual gate.
