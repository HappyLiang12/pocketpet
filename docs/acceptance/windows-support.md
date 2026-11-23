# Windows Support Acceptance Record

Status: **NOT RUN**. This is the real-machine evidence template for the approved Windows 11 support design. Every gate below starts as `NOT RUN` and only becomes `PASS` when the named tester records the evidence. Do not infer a pass from unit tests, Playwright tests, CI, or code inspection.

- Spec: `docs/superpowers/specs/2026-11-23-pocketpet-windows-support-design.md`
- Plan: `docs/superpowers/plans/2026-11-23-pocketpet-windows-support.md`
- Support claim: Windows 11 x64 only. Windows 10 22H2 x64 is compatibility-only and is not an official support claim. Windows on ARM and Linux are not claimed.
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
- Pass `-NodePath` when the Node on `PATH` is not the executable recorded in the service task; the firewall gate compares the rule's program scope with it.
- The output is one JSON object with `PASS`, `FAIL`, and `NOT RUN` gates plus `host`, `node`, `config`, `service`, `firewall`, `bridge`, and `mdns` evidence.
- The probe reads only path existence, ACL state (`icacls` entries and the inheritance flag), the scheduled task state, firewall rule properties, the token-free loopback `/health` response, and a multicast DNS A answer. It never reads config content and never prints the token.
- The probe's `.local` gate runs on the bridge host itself, so same-host multicast filtering can produce a false FAIL. A system-resolver answer is indicative only; the phone-side gate below is authoritative.

Paste the JSON (with the built-in redaction) into the evidence block for each related gate.

## Summary

| # | Gate | Environment | Result | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | Clean Windows 11 x64 install: `npm ci`, `npm run build`, `npm link`, `pocketpet up`; bridge, `/setup`, phone page, Studio | Windows 11 x64, Node 24 | NOT RUN | Command output (token redacted), probe JSON, `/setup` screenshot, phone screenshot |
| 2 | Task Scheduler install, one UAC, reboot/logon start, `service status`, uninstall, reinstall | Windows 11 x64, standard user | NOT RUN | UAC observation, `Get-ScheduledTask`/probe output, log excerpt, reboot notes, uninstall output |
| 3 | `.local` resolves from iPhone Safari and Android Chrome on the same LAN | Windows 11 x64, Private network | NOT RUN | Probe `mdns` object, phone screenshots with URL visible |
| 4 | Firewall rules are inbound allow, Private-profile only, correct port/UDP 5353, scoped to Node, and the phone can reach the bridge | Windows 11 x64, Private network | NOT RUN | Probe `firewall` object, `Get-NetFirewallRule` output, phone screenshot |
| 5 | Config protection: home/config/logs/launcher are current-user-only; another standard user cannot read `config.json` | Windows 11 x64 with a second standard user | NOT RUN | Probe `config` object, `icacls` output (redacted), second-user access-denied observation |
| 6 | UAC cancel fallback; firewall/mDNS failure degradation; no false success | Windows 11 x64 | NOT RUN | `pocketpet up` output, service exit codes, probe/doctor output, foreground fallback |
| 7 | Official Windows 11 x64 real-machine gate on Node 24 (the issue environment), including upgrade from a prior install | Windows 11 x64, Node 24 | NOT RUN | Full command log, probe JSON, installed versions |
| 8 | Qoder real-app hook observation: a real Qoder task drives the phone pet | Windows 11 x64 with Qoder desktop | NOT RUN | Qoder version, hook settings excerpt (no token), phone screen recording; wiring alone is not a pass |
| 9 | macOS regression: existing unit/typecheck/build/E2E, final counts recorded | macOS current, Node 20+ | NOT RUN | Commands and counts in the sign-off block |
| 10 | Windows CI matrix (unit, build, typecheck, E2E, integration smoke) | `windows-latest` CI runner | NOT RUN | CI run URL and job result; not a substitute for gates 1-8 |
| 11 | Windows 10 22H2 x64 compatibility run (bridge, phone page, hooks; service/firewall/ACL best-effort) | Windows 10 22H2 x64 desktop | NOT RUN | Probe JSON, command log, explicit compatibility-only note |
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

- `pocketpet up` prints the config path, the pairing URLs, a full-size QR, and the USB fallback; it never prints the token inside the service log.
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

- Install asks for one UAC prompt; cancel has no side effects. Uninstall asks for one UAC prompt.
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

1. Install the service (the firewall rules are required for advertisement) and confirm the bridge is healthy.
2. On iPhone Safari, open the printed `http://<name>.local:<port>/?token=...` URL.
3. On Android Chrome, open the same URL.
4. Run the probe's `mdns` gate.

**PASS criteria**

- Both phones load the page and connect; the URL host is the `.local` name, not an IP.
- The probe reports `PASS` for `mdns .local` (direct multicast answer preferred).
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
3. Record the exit code, the printed retry command, and the foreground bridge pairing.
4. Run `pocketpet service install` directly and cancel the UAC prompt; record the exit code.
5. After `pocketpet service uninstall` (or on a machine that never installed the service), run `pocketpet run` in the foreground and confirm IP/USB pairing works and no `.local` name is claimed.
6. From an elevated PowerShell, temporarily disable one PocketPet firewall rule (then restore it) and confirm the doctor/probe report WARN/FAIL and `.local` is not advertised.

**PASS criteria**

- A canceled UAC leaves no task, rules, or launcher behind; `up` continues in the foreground and prints the exact elevated retry command without a token; standalone `service install` exits nonzero.
- With no firewall rules, `.local` is null and the IP QR/USB fallback works; no false "service running" or `.local` claim is printed.
- A firewall content mismatch or missing rule is reported as WARN/FAIL, not PASS.

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

**Result:** NOT RUN

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
| macOS unit/typecheck/build/E2E | `npm test`, `npm run typecheck`, `npm run build`, `npx playwright test` | NOT RUN for this record |
| Windows CI matrix | `.github/workflows/ci.yml` on `windows-latest` | NOT RUN for this record |

Record exact counts and the run URL in the sign-off block when executed. The last known automated head before this documentation task was `5b8b5c4`: macOS 35 files / 480 unit tests, 33 Playwright tests, typecheck and build green; the Windows matrix had not been executed because the branch had not been pushed. That is history, not this record's evidence.

### 11. Windows 10 22H2 compatibility-only run

**Steps**

1. Run the probe and `pocketpet up` on the available Windows 10 22H2 x64 desktop.
2. Exercise the bridge, phone page, hooks, service install/status/uninstall, firewall, `.local`, and ACL as time permits.
3. Record failures as failures. Do not patch production code to make this compatibility run pass.

**PASS criteria**

- This row records observed behavior only. It never changes the official support matrix.
- Any failure is documented as compatibility-only residual risk. Promoting Windows 10 requires a new approved spec and acceptance record.

**Result:** NOT RUN

**Evidence:**

```text
(paste probe JSON, command log, and an explicit "compatibility-only, not supported" note)
```

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
