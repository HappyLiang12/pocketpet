# Windows Support Acceptance Record

Status: **PARTIAL**. Windows 10 22H2 x64 real-machine evidence is recorded below; gates not named as passed remain `NOT RUN`. Do not infer a pass from unit tests, Playwright tests, CI, or code inspection.

- Spec: `docs/superpowers/specs/2026-11-23-pocketpet-windows-support-design.md`
- Plan: `docs/superpowers/plans/2026-11-23-pocketpet-windows-support.md`
- Support claim: Windows 11 x64 and Windows 10 22H2 x64 are supported. The user expanded the original Windows-11-only scope after the Windows 10 real-machine run; the original spec's Windows-10 exclusion is historical. Windows on ARM and Linux are not claimed.
- Qoder: the adapter is included and wired, but the real-app hook gate remains `NOT RUN`; no row here may describe Qoder as verified.

## Evidence rules

- Never attach or commit `%USERPROFILE%\.pocketpet\config.json`, the pairing token, a tokenized URL, or a QR image that contains it.
- Redact the token from screenshots of the terminal, `/setup`, and the phone address bar.
- Redact the account name and profile path when pasting terminal output. `scripts/windows-acceptance.ps1` already prints `%USERPROFILE%` and `<user>` instead of the real values.
- Record the commit under test (`git rev-parse HEAD`), Windows edition/build, architecture, Node version, phone models, and browser versions.
- `PASS` requires the named evidence. `FAIL` requires the observed error. `BLOCKED` requires the blocker. Anything else stays `NOT RUN`.
- A green Windows CI matrix is a regression producer only; it is not Windows 11 firewall, Task Scheduler, mDNS, UAC, or phone evidence.

## Preconditions

1. A clean Windows 11 x64 machine (or VM) with a local standard user account. Node.js 24.x is the issue environment; the Node 20.6 minimum is covered by CI.
2. PowerShell 5.1 (built in) and an interactive desktop session. The Task Scheduler task is a per-user logon task, not a Windows Service.
3. The machine is on a Private network profile with a phone on the same subnet. Guest Wi-Fi, AP isolation, VPN, and corporate proxies are not valid first-run conditions.
4. A checkout of the commit under test, with `npm ci`, `npm run build`, and `npm link` already done in the shell used for the gates.
5. iPhone with Safari and an Android phone (12 or later preferred) for `.local` and phone-page gates.
6. The probe is run from a normal, non-elevated PowerShell in the repository root. It never elevates and never changes state.

## Read-only probe

Run after `pocketpet up` (or after `pocketpet service install` and a foreground/`service` start):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows-acceptance.ps1 -Port 7788
```

- Pass `-Port` when the configured port is not 7788.
- Pass `-Hostname` only when the advertised `.local` name differs from the sanitized computer name.
- Pass `-NodePath` when the `node` on `PATH` is not the Node executable recorded by the installed launcher and firewall rules; the firewall gate compares each rule's program scope with it. The Task Scheduler action itself runs `powershell.exe -File <home>\bridge-service.ps1`, not `node`.
- Pass `-HomePath` when `POCKETPET_HOME` is not set in this shell or the home is not `%USERPROFILE%\.pocketpet`.
- The output is one JSON object with `PASS`, `FAIL`, and `NOT RUN` gates plus `host`, `node`, `config`, `service`, `firewall`, `bridge`, and `mdns` evidence. The process exits 1 when any gate is `FAIL` and 0 otherwise; `NOT RUN` alone still exits 0, so expect exit 1 before the service is installed.
- The probe reads only path existence, ACL state (`icacls` entries and the inheritance flag), the scheduled task state, firewall rule properties, the token-free loopback `/health` response, and a multicast DNS A answer. It never reads config content and never prints the token. `Get-ScheduledTask` State is the same signal as `service status`; `Get-ScheduledTaskInfo` last result/run time is read for diagnostics and probe evidence only.
- A non-admin token can make `Get-NetFirewallRule` return no rule content even when `netsh advfirewall firewall show rule` sees the rules. In that case the probe reports `firewall` = `NOT RUN` with the `netshOnly` names, not a false `FAIL`; verify the content with an elevated `Get-NetFirewallRule` or netsh and the phone test.
- The probe's `.local` gate only reports `PASS` when `/health` advertises a non-null `localHostname` and a direct multicast A query answers. A system-resolver answer alone is `NOT RUN`/indicative, because it can be another host or a stale cache; the phone-side gate below is authoritative. With `localHostname: null` the gate is `NOT RUN` regardless of any resolver answer.

Paste the JSON (with the built-in redaction) into the evidence block for each related gate.

## Summary

| # | Gate | Environment | Result | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Clean Windows 11 x64 install: `npm ci`, `npm run build`, `npm link`, `pocketpet up`; bridge, `/setup`, phone page, Studio | Windows 11 x64, Node 24 | NOT RUN | Command output (token redacted), probe JSON, `/setup` screenshot, phone screenshot |
| 2 | Task Scheduler install, one UAC, reboot/logon start, `service status`, uninstall, reinstall | Windows 11 x64, standard user | NOT RUN | UAC observation, `Get-ScheduledTask`/probe output, log excerpt, reboot notes, uninstall output |
| 3 | `.local` resolves from iPhone Safari and Android Chrome on the same LAN | Windows 11 x64, Private network | NOT RUN | Probe `mdns` object, phone screenshots with URL visible |
| 4 | Firewall rules are inbound allow, Private-profile only, correct port/UDP 5353, scoped to Node, and the phone can reach the bridge | Windows 11 x64, Private network | NOT RUN | Probe `firewall` object, `Get-NetFirewallRule` output, phone screenshot |
| 5 | Config protection: home/config/logs/launcher are current-user-only; another standard user cannot read `config.json` | Windows 11 x64 with a second standard user | NOT RUN | Probe `config` object, `icacls` output (redacted), second-user access-denied observation |
| 6 | UAC cancel fallback; start-time firewall gating for `.local` after a rule is deleted; no false success | Windows 11 x64 | NOT RUN | `pocketpet up` output, service exit codes, probe/doctor output before and after restart, restored rule state |
| 7 | Official Windows 11 x64 real-machine gate on Node 24 (the issue environment), including upgrade from a prior install | Windows 11 x64, Node 24 | NOT RUN | Post-merge user test; full command log, probe JSON, installed versions |
| 8 | Qoder real-app hook observation: a real Qoder task drives the phone pet | Windows 11 x64 with Qoder desktop | NOT RUN | Qoder version, hook settings excerpt (no token), phone screen recording; wiring alone is not a pass |
| 9 | macOS regression: existing unit/typecheck/build/E2E, final counts recorded | macOS current, Node 20+ | PASS | 485 unit tests, 33 Playwright tests, build, typecheck at `d12d559` (macOS CI run 45320732161) |
| 10 | Windows CI matrix (unit, build, typecheck, E2E, integration smoke) | `windows-latest` CI runner | PASS | macOS + Windows jobs green in run 45320732161; Windows integration smoke PASS; not a substitute for gates 1-8 |
| 11 | Windows 10 22H2 x64 support evidence (bridge, phone IP, service install/status, firewall content; lifecycle gates not run) | Windows 10 22H2 x64 desktop | PARTIAL | Probe JSON, netsh content, phone connection, explicit remaining-gate list |
| 12 | Linux / Windows on ARM | Not claimed | NOT RUN | Best-effort only; no service, `.local`, or ACL promise |

Gates 1-8 and 11 are manual. Gate 9 is automated plus a manual macOS sanity check; gate 10 is automated. None of them may be marked `PASS` from a different gate's evidence.

## Gate details

### 1. Clean Windows 11 install and first run

**Steps**

1. On a clean machine, run `npm ci`, `npm run build`, and `npm link` from the checkout.
2. Run `pocketpet up` and accept the hook and login-service prompts as needed.
3. Open `/setup` on the computer; scan the QR from the phone.
4. Open the phone page, edit this phone in Studio, and reload.

**PASS criteria**

- On a normal LAN run `pocketpet up` prints the config path, the LAN pairing URLs, and a full-size QR; it never prints the token inside the service log. The terminal USB fallback (`adb reverse ...`) is printed only when no LAN URL or QR exists, while the `/setup` Pair card always shows the USB command.
- `/setup` opens only on the computer; the phone opens the phone page, not `/setup`.
- The phone page connects, the pet and clock render, and Studio saves a local override that survives reload.
- The probe reports `PASS` for `host` (Windows 11 x64), `node`, `config ACL`, `scheduled task`, `firewall`, and `loopback health` when the service is installed and running.
- No unhandled error, console crash, or token in the browser-visible URL after load.

**Result:** NOT RUN

**Evidence:**

```text
(paste redacted command output and probe JSON; attach token-free screenshots)
```

### 2. Task Scheduler service lifecycle

**Steps**

1. Run `pocketpet service install` from a normal PowerShell; accept exactly one UAC prompt.
2. Run `pocketpet service status`; record the exit code and output.
3. Sign out and sign in again (or reboot). Do not open a terminal first.
4. Confirm the phone page reconnects without running `pocketpet up`.
5. Run `pocketpet service uninstall`; accept exactly one UAC prompt.
6. Reinstall and repeat status once.

**PASS criteria**

- Install asks for one UAC prompt; cancel leaves no task, firewall rule, or launcher behind (the empty `logs` directory may be created first). Uninstall asks for one UAC prompt.
- `service status` exits 0 only when the task is running; a stopped or missing task exits 1.
- After logon the hidden task starts the bridge with no UAC prompt and the phone reconnects.
- The log is append-only at `%USERPROFILE%\.pocketpet\logs\bridge.log` (or the configured home) and contains only the fixed listening line, never the token, URLs, or QR.
- Uninstall removes the task, both firewall rules, and the launcher, but keeps config, pets, cache, and logs.
- Reinstall updates the launcher after a Node upgrade and starts the task.

**Result:** NOT RUN

**Evidence:**

```text
(paste UAC observation, service status output/exit codes, probe service object, log tail, reboot notes, uninstall output)
```

### 3. `.local` resolution from both phones

**Steps**

1. Install the service (the firewall rules must exist when the bridge starts for advertisement) and confirm the bridge is healthy.
2. On iPhone Safari, open the printed `http://<name>.local:<port>/?token=...` URL.
3. On Android Chrome, open the same URL.
4. Run the probe's `mdns` gate.

**PASS criteria**

- Both phones load the page and connect; the URL host is the `.local` name, not an IP.
- The probe reports `PASS` for `mdns .local` only when `/health` advertises a non-null `localHostname` and a direct multicast A query answers; a system-resolver-only answer is `NOT RUN`, not a pass. A same-host multicast filter can produce a false `FAIL`, so the phone-side result is authoritative.
- `pocketpet doctor` shows `PASS mdns: advertising <name>.local` while the service bridge runs.
- A hostname collision or blocked multicast is recorded as a FAIL with the IP/USB fallback used, not silently excused.

**Result:** NOT RUN

**Evidence:**

```text
(paste probe mdns object, doctor line, iPhone and Android screenshots with URL visible)
```

### 4. Private-only firewall and phone reachability

**Steps**

1. Run the probe and save the `firewall` object.
2. Confirm both rules in Windows Security > Firewall > Advanced settings or with `Get-NetFirewallRule`.
3. With the phone on the same Private network, open the IP URL.
4. Switch the network profile to Public (or use a guest network) and record what happens; do not weaken the rules to force a pass.

**PASS criteria**

- `PocketPet Bridge TCP` is inbound, allow, Private profile only, protocol TCP, the configured port, scoped to the installed `node.exe`.
- `PocketPet Bridge mDNS` is inbound, allow, Private profile only, protocol UDP, local port 5353, same program.
- If the normal probe's NetSecurity read is empty while netsh shows both rules, record probe `firewall` = `NOT RUN` plus the `netsh` content and an elevated `Get-NetFirewallRule` read, and the phone connection. Do not report the rules as missing.
- The phone reaches the bridge on the Private network. Public/Domain networks stay closed and the phone failure is recorded with the fallback.
- No rule opens Public or Domain profiles and no rule is unscoped.

**Result:** NOT RUN

**Evidence:**

```text
(paste probe firewall object and Get-NetFirewallRule output with paths redacted)
```

### 5. Current-user-only config ACL

**Steps**

1. Run the probe and save the `config` object for home, config, logs, and launcher.
2. Create a second standard local user (or use an existing one) and try to read `%USERPROFILE%\.pocketpet\config.json` from that account.
3. Sign back in as the owner and run `pocketpet doctor`.

**PASS criteria**

- Each protected path has exactly one allow ACE for the current user, inheritance is removed, and no Administrators/SYSTEM/inherited entry remains.
- The second standard user gets access denied; record the exact error. Administrators can take ownership by design, so this gate uses a standard user.
- `pocketpet doctor` reports `PASS config ACL`.
- A failed ACL tightening stops the bridge before it serves; no token-bearing config is left readable.

**Result:** NOT RUN

**Evidence:**

```text
(paste probe config object, redacted icacls output, second-user access-denied observation, doctor line)
```

### 6. UAC cancel and degradation fallbacks

**Steps**

1. Start from a machine with no PocketPet task and no PocketPet firewall rules.
2. Run `pocketpet up`, choose the service, and cancel the UAC prompt.
3. Record the exit code, the printed retry command, and the foreground bridge pairing. Confirm no task, rule, or launcher exists (an empty `logs` directory may exist).
4. Run `pocketpet service install` directly and cancel the UAC prompt; record the nonzero exit code and confirm no task, rule, or launcher exists.
5. Stop the foreground bridge, then run `pocketpet run` on the machine with no rules. Confirm IP/USB pairing works, `/health` reports `localHostname: null`, and no `.local` name is claimed.
6. Install the service normally and accept the one UAC prompt. Confirm both rules exist, `pocketpet doctor` reports `PASS firewall` and `PASS mdns`, and the probe reports `PASS` for `firewall` and `mdns .local`.
7. In an elevated PowerShell, delete only the mDNS rule and keep the TCP rule: `Remove-NetFirewallRule -DisplayName 'PocketPet Bridge mDNS'`. Do not reinstall the service, because install re-adds both rules. Run the probe once now: record the firewall result and whether `.local` still answers. The bridge does not re-check the rules at runtime and does not stop a responder it already started, but the changed firewall can block the probe's own query, so record what is observed.
8. Restart the bridge so it evaluates the rules at start, in the same elevated shell: `Stop-ScheduledTask -TaskName 'PocketPet Bridge'; Start-ScheduledTask -TaskName 'PocketPet Bridge'` (or sign out and back in for a logon start). Wait for `http://127.0.0.1:<port>/health`.
9. Run `pocketpet doctor` and the probe. Record `localHostname`, the `mdns` result, and the firewall result.
10. Restore the rule by rerunning `pocketpet service install` (one UAC prompt), wait for `/health`, and confirm `.local` is advertised again.

Disabling the rule instead of deleting it is a diagnostic variant only: the advertisement gate is a rule-name presence check, so a disabled rule can still start the responder while `doctor`/probe report the content mismatch. Record it as WARN/FAIL evidence, not as a start-time gating test.

**PASS criteria**

- A canceled UAC leaves no task, rules, or launcher behind (the empty `logs` directory is not a failure); `up` continues in the foreground and prints the exact elevated retry command without a token; standalone `service install` exits nonzero.
- With no firewall rules, `.local` is null and the IP QR/USB fallback works; no false "service running" or `.local` claim is printed.
- Deleting the mDNS rule while the bridge runs does not make the bridge stop the responder it already started; record whether `.local` still answers. After the bridge is restarted with the rule missing, `.local` is not advertised, `/health` reports `localHostname: null`, `doctor` reports WARN for `firewall` and `mdns`, and the probe reports FAIL (or at least not PASS) for those gates.
- Restoring the rule and restarting the bridge makes `.local` advertised again.
- A firewall content mismatch, disabled rule, or missing rule is reported as WARN/FAIL, never PASS.

**Result:** NOT RUN

**Evidence:**

```text
(paste up/service output and exit codes, probe/doctor output before and after, restored-state note)
```

### 7. Official Windows 11 x64 Node 24 gate

**Steps**

1. Repeat gates 1-6 on the issue-environment machine with Node.js 24.x and the built `dist/cli.js`.
2. Upgrade over an existing install: change the port and Node path, reinstall the service, and confirm stale firewall rules are removed and the new launcher/task is used.
3. Record `git rev-parse HEAD`, Windows build, Node version, and the probe JSON.

**PASS criteria**

- Gates 1-6 pass on this machine and version combination.
- Reinstall is idempotent; no duplicate firewall rules or stale task action remain.
- Health failure after task start keeps the task/rules/log for diagnosis and does not claim success.

**Result:** NOT RUN (post-merge user test on the Windows 11 x64 machine)

**Evidence:**

```text
(paste full command log, probe JSON, versions, and reinstall observations)
```

### 8. Qoder real-app hook observation (NOT RUN)

**Steps**

1. Confirm `pocketpet init`/`up` wrote an absolute quoted `<node> <dist/cli.js> hook qoder` command into an existing Qoder root.
2. Run a real Qoder task that emits hook events; watch the phone.
3. Record whether the pet reacts.

**PASS criteria**

- The phone reacts to a real Qoder task with no hand-written relay.
- Wiring alone, a settings-file diff, or unit tests are not a PASS. Until observed, this gate stays `NOT RUN` and no doc may imply verified Qoder support.

**Result:** NOT RUN

**Evidence:**

```text
(paste Qoder version, redacted settings snippet, phone recording/screenshot)
```

### 9-10. Automated producers

These are regression evidence only. They do not turn any manual gate above into `PASS`.

| Producer | Command | Result |
| --- | --- | --- |
| macOS unit/typecheck/build/E2E | `npm test`, `npm run typecheck`, `npm run build`, `npx playwright test` | PASS at `d12d559`: 35 files / 485 unit tests, 33 Playwright tests, build and typecheck green |
| Windows CI matrix | `.github/workflows/ci.yml` on `windows-latest` | PASS: run 45320732161, both jobs green, Windows integration smoke PASS |

Record exact counts and the run URL in the sign-off block when executed. The latest local automated evidence is `d12d559`: macOS 35 files / 485 unit tests, 33 Playwright tests, build and typecheck green. The Windows CI matrix passed on the PR; it remains a regression producer, not a substitute for the manual gates.

### 11. Windows 10 22H2 x64 support evidence

**Steps**

1. Run the probe and `pocketpet up` on the available Windows 10 22H2 x64 desktop.
2. Exercise the bridge, phone page, hooks, service install/status/uninstall, firewall, `.local`, and ACL as time permits.
3. Record failures as failures. Do not patch production code to make this run pass.

**PASS criteria**

- This row records the evidence behind the user-approved Windows 10 support expansion.
- PASS is claimed only for the named observed checks; lifecycle, `.local`, Qoder, and Windows 11 gates stay separate and `NOT RUN`.

**Result:** PARTIAL — PASS for bridge/ACL/service install/firewall content/phone-over-IP; uninstall/reinstall, logon persistence, phone `.local`, Qoder real-app, and Windows 11 gate NOT RUN

**Evidence:**

Observed on the available Windows 10 desktop on 2026-11-24 across commits `8de5513`, `686bcb4`, `86cb6e0`, and `f507fb2`. The user approved Windows 10 22H2 x64 support after this evidence; the remaining gates are explicit residual risk.

- Environment: Windows 10 Enterprise 22H2, 10.0.19045, x64; Windows PowerShell 5.1.19041.6456; Node v24.14.1; account non-admin (`Elevated=False`). The initial bridge/ACL run used a temporary home with network Public; the later service run used the real `%USERPROFILE%\.pocketpet` and the user approved changing `UberFi_5G` to Private.
- Repeated-start bridge: a fresh temporary home was started twice with `node dist/cli.js up --no-hooks --no-service --no-open`. Both runs stayed alive and answered `/health` 200 with `localHostname: null`; no `SeSecurityPrivilege`/`could not protect` error. This is the repeated-start path that failed before the ACL idempotence fix.
- ACL: home `(OI)(CI)(F)`, config `(F)`, and logs `(OI)(CI)(F)` each showed one non-inherited ACE for `HAPPY\<user>`; no `.tmp` files remained. Probe `config ACL` = PASS.
- Service and network: after the PS 5.1 task-probe fix in `686bcb4`, `node dist/cli.js service install` was run from the normal `HAPPY\User` shell and exited 0 after one product UAC. The task was Running with `Principal.UserId=User` and the exported XML SID matched the current `HAPPY\User` SID; RunLevel Limited, LogonType Interactive. The bridge answered `/health` 200 with `localHostname: happy.local`.
- Firewall: `Get-NetFirewallRule` returned no rule content for the non-admin token, so the probe reported `firewall` = NOT RUN with both names in `netshOnly`, not a false FAIL. Read-only `netsh` content showed TCP 7788 and UDP 5353 both Enabled/Inbound/Allow/Private, scoped to `C:\Program Files\nodejs\node.exe`.
- Phone: the user confirmed the vivo page displayed the clock/pet over the IP URL; established non-loopback connections from `192.168.0.105` to `192.168.0.101:7788` were observed. Phone `.local` remains NOT RUN; `/health` `sessions` counts agent sessions, not phone clients.
- 401 UX: the cleaned phone URL copied to another browser returns a token-free 401 HTML explanation and points to `/setup`; API calls remain plain 401. Verified at `f507fb2`.
- Probe at `86cb6e0`: summary `PASS 4 / FAIL 0 / NOT RUN 3`.
  - PASS: `node` (v24.14.1, minimum v20.6.0), `config ACL`, `scheduled task` (Running), `loopback health` (200 without a token).
  - NOT RUN: `host` (the gate is defined for Windows 11; this run is Windows 10), `firewall` (non-admin NetSecurity content unreadable; netsh shows both), and `mdns .local` (bridge advertises `happy.local`, but no direct multicast answer; no attribution from the system resolver).
- Not run: uninstall/reinstall, Task Scheduler logon persistence after sign-out/reboot, phone `.local`, Qoder real-app hook, official Windows 11 x64 gate (post-merge user test), and the Windows CI matrix (runs on the PR). This is a partial support record, not a PASS for every Windows gate.

### 12. Linux and Windows on ARM

Not claimed. Linux keeps the best-effort bridge only: no service, no `.local`, no ACL promise. Windows on ARM was not tested and is not supported.

**Result:** NOT RUN

## Sign-off

| Field | Value |
| --- | --- |
| Commit under test | `git rev-parse HEAD` |
| Windows edition / build / architecture | |
| Node version | |
| PowerShell version | |
| iPhone model / iOS / Safari | |
| Android model / version / Chrome | |
| Probe command and output | |
| macOS regression counts | |
| Windows CI run URL | |
| Tester and date | |

All gates remain `NOT RUN` until this table and the evidence blocks are filled from the named machine.
