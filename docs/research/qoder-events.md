# Qoder event research (gate G1)

Status: research complete; **Decision: `hook`**. The adapter is implemented in M3 (`src/adapters/qoderHook.ts`, `src/adapters/qoderInstall.ts`, `pocketpet hook qoder`). The blocking unknown — whether Qoder desktop 0.5.17 fires a hand-written user-level hook — is still to be verified with the real app; see "M3 implementation status" below.

- Observation date: 2026-11-21 (local time, UTC+08:00).
- Qoder desktop observed: **0.5.17** (`/Applications/Qoder.app/Contents/Info.plist` `CFBundleShortVersionString`, and `~/.qoder/.qoder-app-status.json` `"version": "0.5.17"`).
- Host: macOS (Darwin) arm64.
- Method: read-only inspection of the local Qoder installation, the public Qoder/Petdex/Clawd documentation, and third-party source. No Qoder configuration or state file was modified. No Qoder UI automation was run. No PocketPet hook was installed into Qoder. (The WebFetch tool saved its own temporary page captures under `~/.qoder/tmp/...`, outside Qoder config/state.)
- Confidence labels: **High** = official documentation plus a matching local file or observed execution; **Medium** = one authoritative source, or third-party source only; **Low** = inference from indirect evidence.

## Bottom line

Qoder exposes a documented, Claude-Code-shaped **command hook** system. Hooks are read from user-level `~/.qoder/settings.json`, project-level `.qoder/settings.json`, and `.qoder/settings.local.json`, and all sources are merged. The desktop app also executes hooks shipped by an installed plugin in this environment, which proves the runtime executes command hooks in 0.5.17. A hook adapter is therefore the smallest, most direct M3 integration.

Qoder's built-in desktop pet is a native Qoder feature. The documentation says Qoder accepts **Petdex-installed pet assets** as an appearance source, but the fetched documentation does not describe an external event API for the pet. Petdex Desktop separately installs its own hooks and runs its own local HTTP hook server; that is a parallel product, not an event feed from Qoder's pet. Neither path is needed for PocketPet.

## Observed environment

| Item | Observation |
| --- | --- |
| Qoder application | `/Applications/Qoder.app`, version 0.5.17 |
| Qoder config root | `~/.qoder` exists; `~/.qoder-cn` is absent on this Mac |
| User settings | `~/.qoder/settings.json` exists; keys are `enabledPlugins`; `jq 'has("hooks")'` returned `false`, so no hand-written user hooks are present |
| Installed Qoder plugin hooks | `~/.qoder/plugins/cache/qoderapp-bundler/qoder-context/1.0.109.4bd74a1a/hooks/hooks.json` defines `SessionStart`, `SubagentStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop` command hooks |
| Hook execution log | `~/.qoder/logs/qoder-context-hook.log` (4.7 MB), JSON lines with `command`, `component`, `status`, `timestamp`, `message: "native hook end"` |
| Internal daemon log | `~/.qoder/logs/qoder-context.log` (6.9 MB), JSON lines from `component: "qoder-search"`, including `command` and `message: "native hook daemon end"` |
| Session transcripts | `~/.qoder/projects/<workspace-slug>/<sessionId>.jsonl`; newest sampled file had 910 lines |
| Petdex | `~/.petdex` and `~/.codex` are absent; no `Petdex*.app` was found in `/Applications` or `~/Applications`; Petdex CLI and Petdex Desktop were not observed on this Mac |

### Local investigation record

The three brief commands were run unchanged (read-only):

```text
$ ls -la ~/Library/Application\ Support 2>/dev/null | grep -i qoder
Qoder/
com.qoder.app.stable/
com.qoder.installer/

$ ls -la ~/.qoder 2>/dev/null
settings.json, settings.json.bak-20261115, logs/, plugins/, projects/,
tasks/, agents/Worker.md, session-env/, and other state directories

$ find ~/.qoder ~/Library/Application\ Support/Qoder ~/Library/Logs -maxdepth 3 -iname '*qoder*' 2>/dev/null | head -50
~/.qoder
~/.qoder/logs/qoder-context-hook.log
~/.qoder/logs/qoder-context.log
~/.qoder/plugins/.../qoder-context/.../hooks/hooks.json
~/Library/Application Support/Qoder/qodercli
...
```

No Qoder-named file was returned under `~/Library/Logs` at depth 3. The Qoder application support directory contains only `qodercli/`; the Electron state lives in `com.qoder.app.stable/`.

### Observed hook event counts

Snapshot parsed from `~/.qoder/logs/qoder-context-hook.log` with `jq -R 'fromjson? | .command // empty'` at observation time:

| `command` | Count |
| --- | ---: |
| `qoder-context-prompt` | 4767 |
| `post-tool-use` | 4164 |
| `knowledge-edit-record` | 1439 |
| `user-prompt-submit` | 668 |
| `stop` | 351 |
| `knowledge-edit-upload` | 351 |
| `session-start` | 168 |

These command names correspond one-for-one to commands declared in the plugin's `hooks.json`. At observation time, all 12,238 parseable log lines had `"status":"success"`; one malformed/concatenated line is skipped by the parser and is not counted. This is direct local evidence that Qoder 0.5.17 dispatches `SessionStart`, `UserPromptSubmit`, `PostToolUse`, and `Stop` command hooks, not merely that it stores configuration.

Abridged observed line shape (fields omitted are IDs/timings):

```json
{"command":"post-tool-use","component":"qoder-context-hook","message":"native hook end","status":"success","timestamp":"2026-11-21T16:13:43.094+08:00"}
```

## Evidence table

| Candidate | Evidence (path or URL + quote) | Local observation | Confidence |
| --- | --- | --- | --- |
| **Hook** (user settings) | https://docs.qoder.com/qoder/hooks: "Go to **Settings → Hooks**. The page reads the user-level `~/.qoder/settings.json` file and groups configured Hooks by event."; "Projects can also use: `${project}/.qoder/settings.json` ... `${project}/.qoder/settings.local.json`"; "Hooks from all sources are merged." | `~/.qoder/settings.json` exists and currently has no `hooks` key. The app's plugin hooks prove the same Qoder process executes hooks. | High that hooks are the supported mechanism; medium-high that a hand-written user hook fires in 0.5.17 (not directly tested). |
| **Hook** (event set and schema) | https://docs.qoder.com/qoder/hooks: "Qoder uses Hooks compatible with Qoder CLI. ... Qoder supports the same event and handler types as the CLI." The supported-event table lists `SessionStart` / `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse` / `PostToolUseFailure`, `PermissionRequest` / `PermissionDenied`, `Stop` / `StopFailure`, `SubagentStart` / `SubagentStop`, `Notification`, and more. | The installed `qoder-context` plugin uses the same `hooks.<EventName>[] -> hooks[].type: "command"` shape. | High. |
| **Hook** (stdin contract) | https://docs.qoder.com/cli/hooks: "Hook scripts receive JSON data via **stdin**. All events include the following common fields: `session_id` ... `transcript_path` ... `cwd` ... `hook_event_name` ... `permission_mode` ... `agent_id` ... `agent_type`." Event-specific fields include `tool_name`, `tool_input`, `tool_response`, `notification_type`, `message`, `error_type`, and `last_assistant_message`. | Not yet exercised by PocketPet. This is the schema an M3 mapper must consume. | High (official schema); the desktop app's exact payload version is UNVERIFIED. |
| **Hook** (third-party precedence) | https://github.com/crafter-station/petdex/pull/629: "Its hook system is Claude Code's shape — same `settings.json` layout, same tool names, `Agent` where Claude says `Task` ..."; "confirmed one Install writes six events into both roots (12 hooks) while preserving the foreign hooks already in each and leaving `hooksConfig` alone." | Petdex Desktop is not installed here, so its installer was not run. This is independent implementation evidence, MIT-licensed. | Medium-high; current `agent_hooks.zig` on `main` declares twelve `qoder_events`, not six, so the PR prose and current source differ. |
| **Plugin** | https://docs.qoder.com/qoder/plugins: "A Plugin bundles related capabilities ... it can include Skills, connectors, Agents, commands, rules, or Hooks." | `~/.qoder/plugins/cache/qoderapp-bundler/qoder-context/1.0.109.4bd74a1a/hooks/hooks.json` contains `"SessionStart"`, `"SubagentStart"`, `"UserPromptSubmit"`, `"PostToolUse"`, `"Stop"`, each with `"type": "command"` and `"command": "${QODER_PLUGIN_ROOT}/bin/qoder-context-hook"`. The hook log shows those commands executing. | High that plugins can deliver hooks; plugin is a packaging wrapper, not a separate event source. |
| **Log tail** (session transcript) | `~/.qoder/projects/<workspace-slug>/<sessionId>.jsonl`, observed in this environment. Sample: 910 lines; `type` values `assistant` 337, `user` 175, `active-leaf` 319, `attachment` 29, `file-history-snapshot` 21, `runtime-config` 17, `last-prompt` 14, `workspace-directories` 15. `assistant.message.content[]` includes `tool_use` (156 in the sample); `user.message.content[]` includes `tool_result` (154). `assistant` and `user` records carry ISO `timestamp`; `isSidechain` is present. No explicit phase/status field was observed. | Yes, read-only. No documented transcript schema was found on the Qoder docs pages fetched. | Medium for "working"/"done" inference; low for "waiting"/"failed"; exact mapping is UNVERIFIED. |
| **Log tail** (Qoder daemon logs) | `~/.qoder/logs/qoder-context-hook.log` and `~/.qoder/logs/qoder-context.log` record hook invocations, e.g. `{"command":"post-tool-use","component":"qoder-context-hook","message":"native hook end","status":"success",...}`. | The daemon log records the hook command and duration but not the tool name or tool payload. One line in the hook log is visibly corrupted/concatenated (a malformed JSON line), so any parser must tolerate bad lines. | Medium for lifecycle timing; low for project/tool attribution. |
| **Blocked** | No source claims Qoder is closed to hooks; official docs document them and the local app executes them. | Contradicted by the evidence above. | Rejected. |
| **Qoder built-in pet as an event source** | https://docs.qoder.com/qoder/desktop-pet: "Choose a built-in pet or one installed through Petdex CLI, and adjust its desktop display."; "Qoder provides built-in desktop pets such as **Qoduck** and also supports pets installed with **Petdex CLI**."; "Use Dynamic Island ... to follow task progress and handle supported questions and permission requests." | No documented local socket, HTTP port, or event file for the pet was found in the Qoder docs fetched. Not investigated beyond public docs. | High that the pet is native Qoder UI; high that no public external event API is documented; any private IPC is UNVERIFIED and must not be depended on. |
| **Petdex as Qoder event source** | https://petdex.dev/docs: "The desktop app exposes an in-process local HTTP hook server on port `7777`. Anything that can `curl` + read the per-session token at `~/.petdex/runtime/update-token` can drive the pet."; "Agents. Shows which coding agents are on this machine and whether their hooks are wired. ... the app writes the hook files itself". | Petdex is not installed locally. The fetched Qoder desktop-pet page mentions Petdex only as an appearance source, and no fetched Qoder page says Petdex hooks drive Qoder's pet. | High that Petdex has its own hook server; **UNVERIFIED** that Qoder's pet consumes it. This is not a supported integration surface for PocketPet. |
| **Clawd on Desk** (architecture reference only) | https://github.com/rullerzhou-afk/clawd-on-desk: "**Live agent status**: 12 animated states driven by agent hooks and logs ..."; supported agents list includes "**Qoder**". | Not installed; AGPL-3.0, so used only as an architectural cross-check, not copied. | Medium corroboration that a Qoder integration via hooks/logs is feasible; the README does not state which mechanism is used for Qoder specifically. |

## What each mechanism would mean for PocketPet

### 1. Hook (selected)

Qoder's hook configuration is the same shape PocketPet already writes for Claude Code: `hooks.<EventName>` is an array of matcher groups, each group has a `hooks` array, and each entry is `{ "type": "command", "command": "...", "timeout": <seconds> }`. Qoder adds `async` at group or entry level. The hook receives JSON on stdin with `session_id`, `cwd`, `hook_event_name`, and event-specific fields. This lets PocketPet emit a `NormalizedEvent` synchronously without reading files or polling.

Command hooks also run for the Qoder desktop app, not only the CLI: the app's own `qoder-context` plugin uses this exact schema, and `~/.qoder/logs/qoder-context-hook.log` shows `session-start`, `user-prompt-submit`, `post-tool-use`, and `stop` invocations from the running desktop app (`runId: host-84456`; the app's `SingletonLock` points at PID 84456). The formal docs say the Settings → Hooks page reads `~/.qoder/settings.json`, and that project hooks are merged with it.

### 2. Plugin

A Qoder plugin can bundle hooks. The installed `qoder-context` plugin is proof: it ships a `hooks/hooks.json` with command hooks and Qoder executes it. But a plugin is a distribution container, not an event mechanism. Shipping PocketPet as a plugin would add ZIP/marketplace installation and versioning without changing the payload or lifecycle. It is a fallback packaging option if user-level `settings.json` hooks prove unreliable, not the primary design.

### 3. Log tail

The session transcript is usable as a fallback. It contains `tool_use` and `tool_result` blocks with timestamps and a `cwd`, so a tailer could infer "started", "working", and "done" from new assistant/user records. It is weaker than hooks:

- no explicit phase field, and no documented schema for these files;
- "waiting" has to be guessed (for example, an assistant message with no pending tool call is not necessarily waiting for the user);
- "failed" requires interpreting tool results;
- it requires polling, inode/rotation handling, and a heuristic that Qoder can change without notice;
- the daemon log does not include tool names, and one observed line was malformed.

A hook payload already contains `transcript_path`, so if the hook path is ever unavailable the transcript is the natural fallback. It should not be the first implementation.

### 4. Blocked

Rejected. Qoder documents hooks, and the local desktop app executes plugin hooks. There is no evidence that the mechanism is unavailable.

## Decision

**Decision: `hook`.**

Confidence: **high** for the mechanism and configuration shape; **medium-high** for a hand-written user-level hook firing in Qoder desktop 0.5.17, because that exact end-to-end path was not exercised under this task's read-only constraint.

### M3 adapter sketch

Add a Qoder hook adapter that mirrors the existing Claude adapter: `pocketpet init` optionally writes `pocketpet hook qoder` command hooks into `~/.qoder/settings.json` (and `~/.qoder-cn/settings.json` when that root exists), preserving every unrelated key and every foreign hook entry so Petdex/Clawd hooks continue to work; `pocketpet doctor` gains a `qoder hooks` check that is PASS when the PocketPet command is present for the required events, WARN when Qoder is absent, and never rewrites the file; `pocketpet hook qoder` reads the bounded stdin payload with the existing `readStdin` helper, maps it to the shared `NormalizedEvent` with `agent: "qoder"`, and POSTs it to the loopback bridge, swallowing all errors and printing nothing. The mapper reads only `session_id`, `cwd`, `hook_event_name`, `tool_name`, and `notification_type`; it must never forward `tool_input`, `tool_response`, `prompt`, `error`, `last_assistant_message`, or `transcript_path`. Event mapping: `SessionStart` → `started`; `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop` → `working`; `PermissionRequest` and `Notification` with `notification_type` `permission_prompt` or `elicitation_dialog` → `waiting`; `PostToolUseFailure` and `StopFailure` → `failed`; `Stop` → `done`; `SessionEnd` → `idle` (removes the session). Ignore `Notification` types `auth_success`, `elicitation_response`, and `elicitation_complete`, and decide explicitly whether `SubagentStart`/`SubagentStop` are separate sessions or folded into the parent. Write `timeout: 2` seconds and a resolved absolute hook command path (not bare `pocketpet`), because a macOS GUI app may not inherit the shell `PATH`; use `async: true` if testing shows it does not delay or drop events. Do not write `hooksConfig`; Petdex's merged implementation states that Qoder already defaults `hooksConfig.enabled` to true and that writing it could clobber a deliberate opt-out.

### M3 implementation status

Adapter implemented 2026-11-21 on branch `feat/qoder-adapter`:

- `src/adapters/qoderHook.ts` maps the hook payload to `NormalizedEvent` with `agent: "qoder"`. It reads only `session_id`, `cwd`, `hook_event_name`, `tool_name`, and `notification_type`; tool inputs/outputs, messages, errors, prompts, and transcript paths are never copied.
- `src/adapters/qoderInstall.ts` writes the twelve events listed below into `hooks.<EventName>` as `{ hooks: [{ type: "command", command, timeout: 2 }] }`, preserving unrelated keys and foreign hooks and never writing `hooksConfig`. Installation is atomic (same-directory temp + rename) and idempotent by exact command string.
- `pocketpet hook qoder` uses the same bounded stdin, 500 ms bridge POST, config loading, logging, and always-exit-0 behavior as the Claude hook.
- `pocketpet init` installs into every existing Qoder root and reports added/already per root; `pocketpet up` prompts `Install Qoder hooks? [Y/n]` only when a root exists; `pocketpet doctor` reports `qoder hooks` as WARN (not detected), PASS (all events wired), or FAIL (missing events/roots).
- Installed events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `SessionEnd`.
- Subagent events fold into the parent `session_id`; they do not create a separate visible session.
- The compiled CLI writes an absolute `<node> <dist/cli.js> hook qoder` command because the macOS GUI may not inherit the shell `PATH`; a TypeScript (tsx) entry point falls back to the linked `pocketpet hook qoder`.

**Verification gate (still open):** Qoder desktop 0.5.17 has not been observed executing a hand-written user-level hook, and no PocketPet payload has been observed from a real Qoder task. The mapping table below is therefore implemented but provisional. Remove this gate only after installing hooks with consent into a real Qoder root, running a Qoder task, and confirming the phone pet reacts (see `docs/acceptance/m3-qoder-manual.md`, currently NOT RUN).

## Mapping table for M3

| Qoder event | PocketPet phase | Notes |
| --- | --- | --- |
| `SessionStart` | `started` | Use `cwd` basename as project. |
| `UserPromptSubmit` | `working` | No prompt content is read. |
| `PreToolUse` / `PostToolUse` | `working` | `tool_name` may be included (max 120 chars). |
| `PostToolUseFailure` | `failed` | Use `tool_name` only; never `error`. |
| `PermissionRequest` | `waiting` | Duplicate with `Notification` is harmless. |
| `Notification` (`permission_prompt`, `elicitation_dialog`) | `waiting` | Ignore auth/elicitation-complete notifications. |
| `SubagentStart` / `SubagentStop` | `working` (tentative) | Must avoid creating a second visible session. |
| `Stop` | `done` | Triggers the `jumping` pet flash in the aggregator. |
| `StopFailure` | `failed` | Notification-only event; verify in 0.5.17. |
| `SessionEnd` | `idle` | Removes the session from the snapshot. |

## Unknowns that must be resolved before writing the M3 adapter

1. **Does Qoder desktop 0.5.17 execute a hand-written user-level hook?** The docs say the Settings → Hooks page reads `~/.qoder/settings.json`, and plugin hooks execute, but no hand-written user hook was added under this read-only task. Test with a harmless `SessionStart` hook that writes a timestamp to a temp file, then inspect Settings → Hooks status and the file. This is the blocking unknown.
2. **Does the desktop app reload `settings.json` immediately, or only after a restart/refresh?** The app docs say to reopen Settings → Hooks and refresh; the CLI docs say edits take effect immediately. Verify both.
3. **Is `async: true` safe for every event?** Check that a fast `PostToolUse` is not dropped and that event order remains usable. If async is unreliable, use the default synchronous mode with `timeout: 2`.
4. **What is the exact `Notification` behavior in the desktop app?** Confirm `permission_prompt` and `elicitation_dialog` are emitted for desktop tasks and that `idle_prompt`/`auth_success` do not appear as false "waiting" states.
5. **Are `PostToolUseFailure`, `StopFailure`, `PermissionRequest`, and `SubagentStart/Stop` present in desktop 0.5.17?** They are documented for the CLI; Petdex's current source lists them, but this Mac has not exercised them.
6. **What is the hook process environment?** Determine `PATH`, `QODER_PROJECT_DIR`, and the working directory for a GUI-launched Qoder hook. Use an absolute command path in the installer regardless.
7. **How stable is `session_id`?** Check whether each desktop task gets one ID, whether resumed tasks reuse it, and whether subagent hooks carry a different `agent_id`/`session_id`. Decide whether subagents create separate session chips.
8. **Are there multiple Qoder roots on a target machine?** Petdex's source checks both `~/.qoder` and `~/.qoder-cn`; only `~/.qoder` exists here. The installer must handle both without double-counting.
9. **Does Qoder enforce `hooksConfig.enabled`, and can an enterprise policy disable hooks?** Do not write the flag; detect a disabled/malformed config and report WARN rather than overwriting.
10. **What is the exact transcript schema in the target version?** Only relevant if the hook path fails and the log-tail fallback is implemented.

## What was not verified

- No PocketPet hook was installed into Qoder, and no Qoder task was run to observe a PocketPet payload. All statements about a hand-written user-level hook firing are based on official documentation plus the observed plugin-hook execution.
- No Qoder UI automation was performed, and no Qoder config was changed. `~/.qoder/settings.json` was read only.
- The Qoder built-in pet's internal event transport was not inspected. No public socket, port, or event-file API was found in the documentation; do not build against an undocumented private channel.
- Petdex Desktop was not installed, so the Petdex Qoder adapter was not executed. The PR/source evidence is third-party and version-specific.
- The exact asset discovery path for Qoder's Petdex integration was not found. Qoder documents "install a pet through Petdex CLI" but not which directory it reads. `docs/acceptance/m1-manual.md` therefore records the path Petdex actually writes.
- Personal account fields in `~/.qoder/.qoder-app-status.json` were not copied into this document. Values quoted here are limited to version and mechanism.

## Sources

- Qoder Desktop Pet: https://docs.qoder.com/qoder/desktop-pet
- Qoder Hooks: https://docs.qoder.com/qoder/hooks
- Qoder Plugins: https://docs.qoder.com/qoder/plugins
- Qoder CLI Hooks (schema and event reference): https://docs.qoder.com/cli/hooks
- Petdex docs: https://petdex.dev/docs
- Petdex repository (MIT; Qoder adapter source): https://github.com/crafter-station/petdex
  - `packages/petdex-desktop-native/src/agent_hooks.zig` (Qoder roots, events, installer)
  - Pull request #629: https://github.com/crafter-station/petdex/pull/629
- Clawd on Desk (AGPL-3.0, architecture reference only): https://github.com/rullerzhou-afk/clawd-on-desk
- Local read-only evidence: `/Applications/Qoder.app`, `~/.qoder/settings.json`, `~/.qoder/plugins/cache/.../hooks/hooks.json`, `~/.qoder/logs/qoder-context-hook.log`, `~/.qoder/logs/qoder-context.log`, `~/.qoder/projects/<workspace-slug>/<sessionId>.jsonl`.
