# FoldPet M1 manual acceptance checklist

Status: **NOT RUN**. This is the checklist template; every result starts as `NOT RUN` and only becomes `PASS` when the named producer supplies the evidence.

Rules:

- The tester records the result in this file (or in the task/issue that links to it). **Do not infer a pass from unit tests, Playwright tests, or code inspection.** Automated tests are necessary but do not replace these manual checks.
- `PASS` requires the evidence described for that item. `FAIL` requires the observed result. `BLOCKED` requires the blocker. Anything else stays `NOT RUN`.
- Keep screenshots free of the bridge token. The QR/URL contains `?token=...`; crop the address bar before attaching a screenshot.
- M1 acceptance does not require Qoder. Qoder is the M3 adapter gated by `docs/research/qoder-events.md`.

## Preconditions

1. `npm install && npm run build` succeeds.
2. `npm link` has been run, and `fold-pet` resolves in the shell that starts Claude Code.
3. Claude Code is installed and its settings file is writable (`~/.claude/settings.json` by default).
4. A pet is available: either `npx petdex install boba` has succeeded, or a local pet exists in `~/.fold-pet/pets`.
5. The phone and Mac are on the same WiFi for items 3–6 and 8–9; item 7 uses USB + `adb reverse` (macOS Monterey+ has no Bluetooth PAN); items 1, 2, and 10 are local to the Mac.
6. The phone is a vivo X Fold 5 with Chrome for items 3–5 and 7–8; an iPhone with Safari is also available for item 6.
7. Record the device OS/browser versions, Claude Code version, and the commit under test in the sign-off block.

## Summary

| # | Acceptance item | Evidence producer | Result |
| ---: | --- | --- | --- |
| 1 | `fold-pet init` output shows all Claude hook events added | Tester: pasted `fold-pet init` stdout | NOT RUN |
| 2 | `fold-pet doctor` passes config/claude hooks/pets; bridge WARN before run and PASS while running | Tester: pasted `fold-pet doctor` stdout from two runs | NOT RUN |
| 3 | Real Claude Code session: chip within 1–2 s, waiting on notification, jumping on stop | Tester: phone screen recording with timestamps | NOT RUN |
| 4 | Folded posture on vivo X Fold 5 (Chrome): clock + pet + chips readable | Tester: phone screenshot, folded | NOT RUN |
| 5 | Unfolded posture: session cards visible | Tester: phone screenshot, unfolded | NOT RUN |
| 6 | iPhone Safari: page loads, WS connects, pet reacts; drawer wake-lock status noted | Tester: iPhone screenshot + exact drawer label | NOT RUN |
| 7 | USB fallback: `adb reverse tcp:7788`, phone opens `127.0.0.1:7788`, pet reacts | Tester: `adb reverse` output + phone screenshot | NOT RUN |
| 8 | Kill bridge: `已斷線`; restart: reconnect without reload | Tester: screen recording or paired screenshots + terminal output | NOT RUN |
| 9 | Pet switching: `npx petdex install boba`, drawer switch, sprite changes | Tester: install output + before/after screenshots | NOT RUN |
| 10 | No-secret check: `git grep -nE 'token\|secret'` has only placeholders/fixtures | Tester/reviewer: pasted grep output and review | NOT RUN |

## Item details

### 1. `fold-pet init` wires all Claude hook events

**Steps**

1. From the worktree, run `fold-pet init`.
2. Paste the complete stdout into the evidence block.

**PASS criteria**

- Output names the config path (for example `/Users/<you>/.fold-pet/config.json`).
- Between the "Claude hooks added" and "Claude hooks already present" lines, all eight events are covered: `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Notification, SubagentStop, Stop, SessionEnd`.
- Running `fold-pet init` a second time reports those events under "already present" and adds none.
- No unrelated Claude settings or foreign hooks are removed (inspect `~/.claude/settings.json` before/after if it already had hooks).

**Producer of evidence:** tester, pasted terminal output from the first and second runs.

**Result:** NOT RUN

**Evidence:**

```text
(paste `fold-pet init` stdout here)
```

### 2. `fold-pet doctor` before and during `fold-pet run`

**Steps**

1. With the bridge stopped, run `fold-pet doctor`; paste stdout.
2. Start `fold-pet run` in another terminal; leave it running.
3. Run `fold-pet doctor` again; paste stdout.

**PASS criteria**

- Before the bridge: `PASS node`, `PASS config`, `PASS claude hooks`, `PASS pets`; `WARN bridge: not listening on <port>; run fold-pet run`.
- While the bridge runs: `PASS bridge: listening on <port>`.
- No `FAIL` line. (The bridge WARN before `run` is expected, not a failure.)
- If `pets` is `WARN` because Petdex installed to a directory FoldPet does not scan, record the path and treat it as a finding tied to item 9; do not edit the tree to make the check pass.

**Producer of evidence:** tester, two pasted `fold-pet doctor` outputs (before and during).

**Result:** NOT RUN

**Evidence:**

```text
(paste doctor output before `fold-pet run`)

(paste doctor output while `fold-pet run` is active)
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
2. Open the FoldPet URL in Chrome (scan the QR or open the printed URL).
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

1. Open the same FoldPet URL in iPhone Safari (same WiFi as the Mac).
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
3. On the phone, open `http://127.0.0.1:7788/?token=...` (token from `fold-pet run`).
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

1. With the phone page open and connected, stop `fold-pet run` with Ctrl+C.
2. Observe the connection badge.
3. Restart `fold-pet run`.
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
2. Record where the pet landed: `ls -la ~/.fold-pet/pets ~/.codex/pets ~/.petdex/pets` (any may exist; the Petdex docs say `~/.codex/pets`, while its GitHub README says `~/.petdex/pets`).
3. On the phone, open the gear drawer and confirm `boba` is listed under the local pets.
4. Select `boba` and take a before/after screenshot of the sprite.

**PASS criteria**

- The install command succeeds and produces a pet folder with `pet.json` and a spritesheet.
- The drawer lists `boba` and selecting it changes the sprite without a page reload.

**Producer of evidence:** tester, pasted install output plus `ls` output and before/after screenshots.

**Note:** FoldPet scans `~/.fold-pet/pets`, `~/.codex/pets`, and `~/.petdex/pets` in that order (`src/server.ts`), and the first copy of a slug wins. If Petdex installs somewhere else, record this item as `FAIL` with the observed path; do not move files or change code as part of acceptance. This is an acceptance-time observation, not a pre-judged defect.

**Result:** NOT RUN

**Evidence:**

```text
(paste `npx petdex install boba` output and `ls -la ~/.fold-pet/pets ~/.codex/pets ~/.petdex/pets`)

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
| Overall result | NOT RUN |
| Notes / follow-ups | |
