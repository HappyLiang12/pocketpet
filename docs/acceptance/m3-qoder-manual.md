# PocketPet Qoder adapter manual acceptance (M3)

Status: **NOT RUN**. Every result starts as `NOT RUN` and only becomes `PASS` when the named producer supplies the evidence.

This gate verifies the blocking unknown in `docs/research/qoder-events.md`: Qoder desktop 0.5.17 is documented to read user-level hooks and does execute plugin hooks, but it has not been observed executing a hand-written PocketPet hook.

## Preconditions

1. `npm install && npm run build && npm link` succeeds, so `pocketpet` resolves to the compiled `dist/cli.js`.
2. Qoder desktop 0.5.17 (or the version under test, recorded below) is installed and has been opened at least once so `~/.qoder` (and/or `~/.qoder-cn`) exists.
3. The PocketPet bridge is running (`pocketpet up` or `pocketpet service install`), and the phone page shows `已連線`.
4. The tester consents to modifying the real Qoder user settings. Back up `~/.qoder/settings.json` (and `~/.qoder-cn/settings.json` if present) before installing. Do not paste tokenized URLs or settings contents containing unrelated secrets.

## Summary

| # | Acceptance item | Evidence producer | Result |
| ---: | --- | --- | --- |
| 1 | Qoder root detected; `pocketpet init` adds all 12 Qoder events and preserves existing settings/foreign hooks | Tester: redacted `pocketpet init` stdout + before/after key list | NOT RUN |
| 2 | `pocketpet doctor` reports `PASS qoder hooks` | Tester: pasted doctor stdout | NOT RUN |
| 3 | A real Qoder task fires hooks and the phone pet reacts (started/working/waiting/done or idle) | Tester: phone screen recording with timestamps + Qoder task description | NOT RUN |

## Item details

### 1. Install real Qoder hooks with consent

**Steps**

1. Record the Qoder version and the Qoder root(s) present (`~/.qoder`, `~/.qoder-cn`).
2. Run `pocketpet init` (or `pocketpet up` and answer `Install Qoder hooks? [Y/n]`). Paste redacted stdout.
3. Inspect `~/.qoder/settings.json` (redact unrelated values) and confirm:
   - all twelve events are present: `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubagentStart, SubagentStop, Stop, StopFailure, SessionEnd`;
   - each PocketPet entry is `{ "hooks": [{ "type": "command", "command": "<node> <dist/cli.js> hook qoder", "timeout": 2 }] }`;
   - pre-existing keys, foreign hooks (for example Petdex/Clawd), and `hooksConfig` are unchanged;
   - no Qoder root that did not exist before was created.
4. Run `pocketpet init` again and confirm it reports the events under "already present" and adds none.

**PASS criteria**

- Output names the root(s) and the twelve added events; the second run adds none.
- The file preserves unrelated settings and foreign hooks, and `hooksConfig` was not written by PocketPet.
- No token appears in any pasted output.

**Result:** NOT RUN

**Evidence:**

```text
(paste redacted `pocketpet init` stdout)

(paste the before/after key list and one redacted PocketPet hook entry)
```

### 2. `pocketpet doctor` reports Qoder hooks

**Steps**

1. With hooks installed, run `pocketpet doctor` and paste stdout.

**PASS criteria**

- `PASS qoder hooks: all events wired (<root>)` for every existing root.
- No token or settings contents are printed.

**Result:** NOT RUN

**Evidence:**

```text
(paste `pocketpet doctor` stdout)
```

### 3. A real Qoder task drives the phone pet

**Steps**

1. Open the phone page and confirm `已連線`.
2. In Qoder desktop, run a small task in a project that makes at least one tool call (for example, read a file) and can trigger a permission or elicitation prompt.
3. Let the turn stop normally, then close/end the session.
4. Record the phone screen throughout with a visible clock or elapsed timer.

**PASS criteria**

- A Qoder session chip appears within 1–2 seconds of the task start/tool call; the unfolded card shows the project.
- A permission/elicitation prompt produces the waiting state; stop produces the `jumping` flash and a done phase; ending the session removes the chip.
- No duplicate chip is created for subagent activity.
- If no event arrives, record `FAIL` with the Qoder version, the settings excerpt, and any Qoder Settings → Hooks status. Do not edit the tree or relax this checklist to make it pass.

**Producer of evidence:** tester, phone screen recording (or timestamped screenshots) plus the Qoder version and task description.

**Result:** NOT RUN

**Evidence:**

```text
(screen recording or screenshot links; note observed timestamps, Qoder version, and root)
```

## Sign-off

| Field | Value |
| --- | --- |
| Tester | |
| Date | |
| Commit under test | |
| Qoder desktop version | |
| Qoder root(s) | |
| macOS version | |
| Phone / browser | |
| Overall result | NOT RUN |
| Notes / follow-ups | |
