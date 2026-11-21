# PocketPet M1 manual acceptance checklist

Status: **NOT RUN**. This is the checklist template; every result starts as `NOT RUN` and only becomes `PASS` when the named producer supplies the evidence.

Rules:

- The tester records the result in this file (or in the task/issue that links to it). **Do not infer a pass from unit tests, Playwright tests, or code inspection.** Automated tests are necessary but do not replace these manual checks.
- `PASS` requires the evidence described for that item. `FAIL` requires the observed result. `BLOCKED` requires the blocker. Anything else stays `NOT RUN`.
- Keep screenshots free of the bridge token. The QR/URL contains `?token=...`; crop the address bar or the `/setup` page before attaching a screenshot.
- M1 acceptance does not require Qoder. The Qoder adapter is implemented in M3; its real-app manual verification is tracked in `docs/acceptance/m3-qoder-manual.md` and remains NOT RUN.

## Preconditions

1. `npm install && npm run build` succeeds. `npm link` has been run, so `pocketpet` resolves to the built `dist/cli.js` in the shell used for items 1, 2, 11, and 12 (`pocketpet service install` refuses a `.ts` entry point).
2. Claude Code is installed and its settings file is writable (`~/.claude/settings.json` by default).
3. A pet is available: either `npx petdex install boba` has succeeded, or a local pet exists in `~/.pocketpet/pets`.
4. The phone and Mac are on the same WiFi for items 3–6, 8–9, 11, and 13; item 7 uses USB + `adb reverse` (macOS Monterey+ has no Bluetooth PAN); items 1, 2, and 10 are local to the Mac. Item 12 is run from the Mac, but its post-login reconnect step (step 5) needs the phone on the same WiFi.
5. The phone is a vivo X Fold 5 with Chrome for items 3–5, 7–8, and 11 (Android); an iPhone with Safari is also available for items 6 and 11 (iOS).
6. For item 11 (and its optional `.local` sub-check, item 13) the phone **camera** scans the QR; `adb reverse` must not be used as a substitute. The `.local` sub-check is recorded but does not gate M1.
7. Item 11 exercises the first-run prompts. If you reuse an existing `~/.pocketpet`, record which steps reported "already installed" instead of skipping the item.
8. Record the device OS/browser versions, Claude Code version, and the commit under test in the sign-off block.

## Summary

| # | Acceptance item | Evidence producer | Result |
| ---: | --- | --- | --- |
| 1 | `pocketpet init` output shows all Claude hook events added | Tester: pasted `pocketpet init` stdout | NOT RUN |
| 2 | `pocketpet doctor` passes config/claude hooks/pets; bridge WARN before run and PASS while running | Tester: pasted `pocketpet doctor` stdout from two runs | NOT RUN |
| 3 | Real Claude Code session: chip within 1–2 s, waiting on notification, jumping on stop | Tester: phone screen recording with timestamps | NOT RUN |
| 4 | Folded posture on vivo X Fold 5 (Chrome): clock + pet + chips readable | Tester: phone screenshot, folded | NOT RUN |
| 5 | Unfolded posture: session cards visible | Tester: phone screenshot, unfolded | NOT RUN |
| 6 | iPhone Safari: page loads, WS connects, pet reacts; drawer wake-lock status noted | Tester: iPhone screenshot + exact drawer label | NOT RUN |
| 7 | USB fallback: `adb reverse tcp:7788`, phone opens `127.0.0.1:7788`, pet reacts | Tester: `adb reverse` output + phone screenshot | NOT RUN |
| 8 | Kill bridge: `已斷線`; restart: reconnect without reload | Tester: screen recording or paired screenshots + terminal output | NOT RUN |
| 9 | Pet switching: `npx petdex install boba`, drawer switch, sprite changes | Tester: install output + before/after screenshots | NOT RUN |
| 10 | No-secret check: `git grep -nE 'token\|secret'` has only placeholders/fixtures | Tester/reviewer: pasted grep output and review | NOT RUN |
| 11 | `pocketpet up` creates config, prompts for hooks, prints a full-size QR and opens `/setup`; the phone **camera** opens the page, the token disappears from the address bar, and the add-to-home hint appears | Tester: redacted `pocketpet up` stdout, Mac `/setup` screenshot, Android and iOS phone screenshots + recorded results | NOT RUN |
| 12 | `pocketpet service install` registers `dev.pocketpet.bridge`, auto-starts the bridge after login/reboot, and `service uninstall` removes it | Tester: `launchctl print gui/<uid>/dev.pocketpet.bridge` output, log excerpt, login/reboot observation, uninstall output | NOT RUN |
| 13 | Optional `.local` sub-check: the printed `<LocalHostName>.local` URL opens on both phones (recorded, does not gate M1) | Tester: Android and iOS screenshots plus pass/fail per device | NOT RUN |

## Item details

### 1. `pocketpet init` wires all Claude hook events

**Steps**

1. From the worktree, run `pocketpet init`.
2. Paste the complete stdout into the evidence block.

**PASS criteria**

- Output names the config path (for example `/Users/<you>/.pocketpet/config.json`).
- Between the "Claude hooks added" and "Claude hooks already present" lines, all eight events are covered: `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Notification, SubagentStop, Stop, SessionEnd`.
- Running `pocketpet init` a second time reports those events under "already present" and adds none.
- No unrelated Claude settings or foreign hooks are removed (inspect `~/.claude/settings.json` before/after if it already had hooks).

**Producer of evidence:** tester, pasted terminal output from the first and second runs.

**Result:** NOT RUN

**Evidence:**

```text
(paste `pocketpet init` stdout here)
```

### 2. `pocketpet doctor` before and during `pocketpet run`

**Steps**

1. With the bridge stopped, run `pocketpet doctor`; paste stdout.
2. Start `pocketpet run` in another terminal; leave it running.
3. Run `pocketpet doctor` again; paste stdout.

**PASS criteria**

- Before the bridge: `PASS node`, `PASS config`, `PASS claude hooks`, `PASS pets`; `WARN bridge: not listening on <port>; run pocketpet run`.
- While the bridge runs: `PASS bridge: listening on <port>`.
- No `FAIL` line. (The bridge WARN before `run` is expected, not a failure.)
- If `pets` is `WARN` because Petdex installed to a directory PocketPet does not scan, record the path and treat it as a finding tied to item 9; do not edit the tree to make the check pass.

**Producer of evidence:** tester, two pasted `pocketpet doctor` outputs (before and during).

**Result:** NOT RUN

**Evidence:**

```text
(paste doctor output before `pocketpet run`)

(paste doctor output while `pocketpet run` is active)
```

### 3. Real Claude Code session drives the phone

**Steps**

1. Open the phone page and confirm the connection badge reads `已連線`.
2. Start a real Claude Code session in a project and make a tool call (for example, ask it to read a file or run a harmless command).
3. Trigger a notification that requires attention (for example, a tool permission prompt).
4. Let the turn stop normally.
5. Record the phone screen throughout, with a visible clock or elapsed timer.

**PASS criteria**

- Within 1–2 seconds of the first tool call, a chip appears reading `Claude Code · 工作中`. (The chip does not carry the project name; if the phone is unfolded, the session card shows the project.)
- On the notification, the chip reads `Claude Code · 等待中` and the pet shows the waiting state.
- On stop, the pet does the `jumping` flash and the chip reads `Claude Code · 完成`.
- No reload is needed; the page stays connected.

**Producer of evidence:** tester, a screen recording from the phone (or three timestamped screenshots) showing the first tool call, the notification, and the stop. There is no server-side event history to cite, so phone-side evidence is the primary record.

**Result:** NOT RUN

**Evidence:**

```text
(screen recording or screenshot links; note the observed timestamps)
```

### 4. Folded posture on vivo X Fold 5 (Chrome)

**Steps**

1. Fold the vivo X Fold 5 so the outer screen is active.
2. Open the PocketPet URL in Chrome (scan the QR or open the printed URL).
3. Wait for `已連線` and a pet to render.
4. Take a screenshot.

**PASS criteria**

- The clock, date, pet, and chips are readable without horizontal scrolling or overlap.
- The layout is the folded layout (`data-layout="folded"` in the DOM if inspected); session cards are not required in this posture.
- The address bar/token is cropped out of the screenshot.

**Producer of evidence:** tester, full-resolution phone screenshot in folded posture.

**Result:** NOT RUN

**Evidence:**

```text
(screenshot link; note device model, Chrome version, folded posture)
```

### 5. Unfolded posture on vivo X Fold 5

**Steps**

1. Unfold the phone to the inner screen.
2. Keep the same page open (rotate/reflow if needed).
3. Take a screenshot.

**PASS criteria**

- The wide layout is active (`data-layout="wide"` if inspected).
- Session cards are visible, each showing the agent/project, phase, elapsed minutes, and tool name when present.
- The clock and pet remain readable.

**Producer of evidence:** tester, full-resolution phone screenshot in unfolded posture.

**Result:** NOT RUN

**Evidence:**

```text
(screenshot link; note unfolded posture and inner-screen resolution)
```

### 6. iPhone Safari

**Steps**

1. Open the same PocketPet URL in iPhone Safari (same WiFi as the Mac).
2. Confirm the page loads and the connection badge reads `已連線`.
3. Trigger one Claude Code event (a tool call is enough) and confirm the pet reacts.
4. Open the gear drawer and record the exact wake-lock line, which starts with `螢幕長亮：`.

**PASS criteria**

- Page loads, WebSocket connects, and the pet reacts to a real event.
- The drawer's wake-lock status is recorded exactly. Do not mark this item as requiring `已啟用`: over plain HTTP on a LAN IP, `isSecureContext` is false and the expected label may be `非安全連線，請設定螢幕逾時`. The acceptance criterion is that the status is shown and recorded, not that the lock is granted.

**Producer of evidence:** tester, iPhone screenshot of the page and drawer plus the exact `螢幕長亮：...` text; note iPhone model and iOS version.

**Result:** NOT RUN

**Evidence:**

```text
(wake-lock line exactly as displayed; screenshot links; iPhone model/iOS version)
```

### 7. USB fallback (different networks)

macOS Monterey and later removed Bluetooth PAN, so Bluetooth tethering is not a fallback on current Macs. Use USB instead.

**Steps**

1. Connect the phone by USB and authorize USB debugging.
2. From the Mac, run `adb reverse tcp:7788 tcp:7788`.
3. On the phone, open `http://127.0.0.1:7788/?token=...` (token from `pocketpet run`).
4. Trigger one Claude Code event and confirm the pet reacts.

**PASS criteria**

- The page loads over the USB reverse mapping and shows `已連線`.
- The pet reacts after a real event.
- The drawer's `螢幕長亮` line is recorded. Over `127.0.0.1` this is a secure context, so `已啟用` is possible; do not require it.
- No Bluetooth tethering attempt is required or expected on macOS Monterey+.

**Producer of evidence:** tester, `adb reverse` output + phone screenshot showing the connected page and pet reaction.

**Result:** NOT RUN

**Evidence:**

```text
(paste adb reverse output, with no token)

(phone screenshot)
```

### 8. Bridge disconnect and reconnect

**Steps**

1. With the phone page open and connected, stop `pocketpet run` with Ctrl+C.
2. Observe the connection badge.
3. Restart `pocketpet run`.
4. Without reloading the phone page, wait for the badge to recover and confirm the pet reacts to a new event.

**PASS criteria**

- On stop, the phone shows `已斷線`.
- On restart, the page reconnects automatically and shows `已連線` without a manual reload. The WebSocket client uses exponential backoff capped at 30 seconds, so allow up to 30 seconds; record the observed delay.
- The pet reacts after reconnection.

**Producer of evidence:** tester, screen recording or paired screenshots of `已斷線` and `已連線`, plus the terminal output showing the bridge stopped and restarted.

**Result:** NOT RUN

**Evidence:**

```text
(terminal output; screenshot/recording of both connection states; observed reconnect delay)
```

### 9. Pet switching with Petdex `boba`

**Steps**

1. Run `npx petdex install boba` and paste the output.
2. Record where the pet landed: `ls -la ~/.pocketpet/pets ~/.codex/pets ~/.petdex/pets` (any may exist; the Petdex docs say `~/.codex/pets`, while its GitHub README says `~/.petdex/pets`).
3. On the phone, open the gear drawer and confirm `boba` is listed under the local pets.
4. Select `boba` and take a before/after screenshot of the sprite.

**PASS criteria**

- The install command succeeds and produces a pet folder with `pet.json` and a spritesheet.
- The drawer lists `boba` and selecting it changes the sprite without a page reload.

**Producer of evidence:** tester, pasted install output plus `ls` output and before/after screenshots.

**Note:** PocketPet scans `~/.pocketpet/pets`, `~/.codex/pets`, and `~/.petdex/pets` in that order (`src/server.ts`), and the first copy of a slug wins. If Petdex installs somewhere else, record this item as `FAIL` with the observed path; do not move files or change code as part of acceptance. This is an acceptance-time observation, not a pre-judged defect.

**Result:** NOT RUN

**Evidence:**

```text
(paste `npx petdex install boba` output and `ls -la ~/.pocketpet/pets ~/.codex/pets ~/.petdex/pets`)

(screenshot links before/after; note install path)
```

### 10. No real token or secret committed

**Steps**

1. From the repository root, run `git grep -nE 'token|secret'`.
2. Paste the complete output.
3. Inspect every match. Expected matches include documentation, the test plan, and test fixtures that use placeholders such as `e2e-token-...` or `secret` in sample event payloads.
4. Run `git status --short` and confirm there is no untracked `.env`, credential file, or generated config that contains a real token.

**PASS criteria**

- `git grep` shows only documentation, placeholders, and test fixtures; no live bridge token, API key, cookie, or account credential.
- `git status --short` shows only intended tracked changes; no untracked secret file.

**Producer of evidence:** tester or reviewer, pasted `git grep` and `git status --short` output plus a one-line review conclusion.

**Note:** This checklist and the README contain the words `token` and `secret`, so matches are expected. Review the values, not just the match count.

**Result:** NOT RUN

**Evidence:**

```text
(paste `git grep -nE 'token|secret'` output)

(paste `git status --short` output)
```

### 11. `pocketpet up` with a real camera scan

**Steps**

1. With the built, linked CLI, run `pocketpet up` in a terminal and observe the first-run output. If you want to test the first-run prompts, use a fresh `POCKETPET_HOME` (for example `POCKETPET_HOME=/tmp/pocketpet-accept pocketpet up`) and record that path instead of `~/.pocketpet`.
2. Answer the `Install Claude Code hooks? [Y/n]` prompt (or record the `--yes` / `--no-hooks` / non-TTY skip message). Record the `Start bridge at login? [y/N]` choice; if you answer no, leave the foreground bridge running until the scan is finished.
3. Confirm the output shows `Config: <path>`, a full-size terminal QR, all LAN URLs, the `.local` URL (if any), and the three Traditional Chinese steps. Confirm `http://127.0.0.1:<port>/setup` opened in the Mac browser (or was skipped with `--no-open`).
4. On the vivo X Fold 5, open the **camera** app and scan the QR code. Open the detected link. Do not use `adb reverse` or a copied URL for this step. The same QR is reusable: use it again for the second phone; it stays valid until the token changes.
5. After the page loads, inspect the address bar. Open the gear drawer and record the exact add-to-home hint, then dismiss it and reload.
6. Add the page to the home screen (`加到主畫面`), close the browser tab, then open PocketPet from the new icon and confirm it loads with `已連線` without scanning the QR again. If a rescan is required, record that as the observed result.
7. Repeat steps 4–6 with the iPhone camera and Safari.
8. Redact every `?token=...` value before pasting the `pocketpet up` output. Crop the QR and URLs out of any Mac `/setup` screenshot.

**PASS criteria**

- The first run creates (or reports) the config, prints the path without the token, handles Claude hooks per consent (prompt, `--yes` install, `--no-hooks`, non-TTY skip, or "already installed"), prints a full-size QR, and opens the loopback `/setup` page.
- Both phones load the page through a camera scan: the clock, pet, and `已連線` appear with no phone-side configuration.
- The same QR pairs both phones (it is not one-time); opening `/setup` on a phone shows the Mac-only 403 page, and a cleaned `/` URL without a token does not pair.
- After load the address bar shows the path only (`/...`), with no `?token=`; a reload still shows `已連線` and the pet loads (the HttpOnly cookie survives).
- The drawer shows the one-time add-to-home hint exactly once (platform-appropriate text), and after dismissing it a reload keeps it hidden.
- The page added to the home screen opens from its icon on Android and iOS and shows `已連線` without a rescan; if a rescan is required, that is recorded as the observed result (a finding, not a reason to relax this checklist).
- Android and iOS results are recorded separately as PASS/FAIL with the observed behavior. A failure is a finding, not a reason to relax this checklist.
- No step used `adb reverse`; no token appears in any pasted output or screenshot.

**Note (browser forcing HTTPS):** if a phone shows `ERR_TOO_MANY_RETRIES`/`ERR_SSL_PROTOCOL_ERROR`, disable Chrome/Edge “Always use secure connections” or VPN/iCloud Private Relay, or use Safari/Firefox; the LAN bridge is HTTP-only. Record the result.

**Note (stale token when a service already runs):** if a bridge is already listening on the configured port from a different `POCKETPET_HOME`, `pocketpet up` treats it as running and can print pairing details from the other config, so the printed token is stale and the scan fails. Either uninstall that service first, or use `--no-service` with a fresh `POCKETPET_HOME` and a distinct `POCKETPET_PORT` so the config and port belong together.

**Producer of evidence:** tester, `pocketpet up` stdout with tokens redacted, a Mac `/setup` screenshot with the QR/URLs cropped, and phone screenshots of the loaded page, address bar, drawer hint, and home-screen launch for both Android and iOS.

**Result:** NOT RUN

**Evidence:**

```text
(paste redacted `pocketpet up` stdout; list the prompt answers and whether /setup opened)

(Android: page screenshot, address bar after load, drawer hint text; home-screen icon open with/without rescan; result)
(iOS: page screenshot, address bar after load, drawer hint text; home-screen icon open with/without rescan; result)
```

### 12. launchd login service lifecycle

**Steps**

1. Run `pocketpet service install` and paste the stdout. This creates a real login item; only run it with consent.
2. Run `launchctl print gui/$(id -u)/dev.pocketpet.bridge` and paste the key lines (state, program arguments, RunAtLoad/KeepAlive). Confirm `~/Library/LaunchAgents/dev.pocketpet.bridge.plist` exists.
3. Run `pocketpet service status` and record the line plus the exit code with `echo $?`.
4. Inspect `~/.pocketpet/logs/bridge.log` and paste its contents.
5. Log out and back in (or reboot) without starting the bridge manually. Confirm the service is running: `pocketpet service status` exits 0 and the phone page reconnects with `已連線` (the existing pairing keeps working).
6. Run `pocketpet service uninstall`, confirm the plist is gone, `launchctl print gui/$(id -u)/dev.pocketpet.bridge` fails, and no bridge remains on the port. `pocketpet service status` should now exit 1.
7. Do not paste the config file or any tokenized URL. The log is expected to be token-free; if it is not, record that as FAIL immediately.

**PASS criteria**

- `service install` loads LaunchAgent `dev.pocketpet.bridge`; `launchctl print` shows the label, `ProgramArguments` ending in `run --service`, and `RunAtLoad`/`KeepAlive` true.
- `service status` reports running with exit code 0 after install; the log contains only the `PocketPet bridge listening on port <N>` line, with no token, URL, or QR.
- After logout/login or reboot, the bridge starts on its own and the phone reconnects without re-pairing.
- `service uninstall` boots the job out, removes the plist, and `service status` then reports not running with exit code 1.
- If the login/reboot step cannot be performed, record `BLOCKED` with the reason; do not infer auto-start from `launchctl bootstrap` alone.

**Producer of evidence:** tester, pasted `service install`/`status`/`uninstall` output, `launchctl print` excerpt, log excerpt with no secrets, and a note of the login/reboot observation.

**Result:** NOT RUN

**Evidence:**

```text
(paste `pocketpet service install` stdout)

(paste `launchctl print gui/$(id -u)/dev.pocketpet.bridge` key lines)

(paste log contents; `echo $?` for service status before/after uninstall)

(login/reboot auto-start observation; uninstall result)
```

### 13. `.local` Bonjour URL sub-check (optional, does not gate M1)

**Steps**

1. From the item 11 `pocketpet up` output, copy the printed `<LocalHostName>.local` URL and open it in vivo Chrome (same WiFi) and in iPhone Safari.
2. Record the result per device. If the name does not resolve, record the failure and the network/browser; do not change the default QR host or edit code to make it pass.
3. Optionally repeat the terminal QR selection with `pocketpet up --qr-host local --no-service --no-hooks --no-open` while a bridge is already running (this only reprints pairing) and record whether the QR contains the `.local` URL.

**PASS criteria**

- A pass/fail result is recorded for both Android and iOS. This is a sub-check: a FAIL is a documented finding, not an M1 blocker. The IP QR remains the default and `--qr-host local` remains opt-in until both platforms are verified.

**Producer of evidence:** tester, phone screenshots or exact error text per device.

**Result:** NOT RUN

**Evidence:**

```text
(Android: .local result and screenshot/error)
(iOS: .local result and screenshot/error)
```

## Sign-off

| Field | Value |
| --- | --- |
| Tester | |
| Date | |
| Commit under test | |
| Mac model / macOS version | |
| vivo X Fold 5 / Android / Chrome version | |
| iPhone / iOS / Safari version | |
| Claude Code version | |
| Network (WiFi SSID / USB adb reverse) | |
| Android camera-scan result (item 11) | |
| iOS camera-scan result (item 11) | |
| Login service install/reboot (item 12) | |
| `.local` result (item 13, optional) | |
| Overall result | NOT RUN |
| Notes / follow-ups | |
