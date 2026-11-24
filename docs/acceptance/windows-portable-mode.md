# Windows Portable Mode Acceptance Record

Status: **NOT RUN**. This record covers the no-admin, no-firewall Windows Portable Mode. No gate is a PASS until the named real-machine evidence is recorded.

- Design: `docs/superpowers/specs/2026-11-24-pocketpet-portable-mode-design.md`
- Parent Windows support: `docs/acceptance/windows-support.md`
- Scope: Windows 10 22H2 x64 and Windows 11 x64; per-user Startup; no UAC, no Task Scheduler, no firewall rules, no `.local`; IP or USB pairing. Android USB uses `adb reverse`. iPhone wireless without admin is not claimed.

## Why this exists

The Windows service requires an administrator for the Task Scheduler task and Private firewall rules. A standard user without administrator credentials cannot complete that setup. Portable Mode uses a per-user Startup entry so the bridge starts after logon without elevation. It cannot provide `.local` or firewall-backed LAN access; IP (when Windows permits it) and USB remain the pairing paths.

A standard-user `pocketpet service install` also previously waited indefinitely at the UAC credential prompt. The implementation now bounds that wait and points the user at Portable Mode; the real-machine timeout behavior is still part of this record.

## Gates

| # | Gate | Environment | Result | Evidence |
| ---: | --- | --- | --- | --- |
| 1 | `pocketpet startup install` succeeds as a standard user with no UAC, writes the token-free Startup entry and launcher, and adds no firewall rules | Windows 10/11 standard user | NOT RUN | Command/exit, UAC observation, file list, `Get-NetFirewallRule`/netsh before-after, probe |
| 2 | Sign out/in starts the bridge with no console and no UAC; bridge health is up; service status is not required | Windows 10/11 standard user | NOT RUN | Sign-out/in notes, `/health`, process/log evidence |
| 3 | Phone pairing works over IP when Windows permits it or over USB `adb reverse`; `.local` is not advertised | Windows 10/11 standard user, Android | NOT RUN | Phone screenshot/URL, `adb reverse` output, `/health` `localHostname: null` |
| 4 | `pocketpet startup status` and `uninstall` are accurate; uninstall removes only the Startup entry and launcher and keeps config/logs | Windows 10/11 standard user | NOT RUN | Before/after file list, status output |
| 5 | Portable Mode refuses while the Task Scheduler service is installed; `service install` no longer hangs and directs a no-admin user to Portable Mode | Windows 10/11 standard user with no admin token | NOT RUN | Service refusal, bounded timeout/error, no partial task/rule |
| 6 | macOS unit/typecheck/build/E2E, Windows unit/build/typecheck/E2E, and the Windows integration smoke remain green | PR CI | PASS | CI run 45397955733: both jobs green; 499 unit tests, build/typecheck/E2E, Windows integration smoke |
| 7 | Corporate standard-user real-machine run with the user's actual account | Corporate Windows machine | NOT RUN | Full command log, no UAC, startup after sign-in, phone IP/USB, redacted paths |

## Evidence rules

- Never record the pairing token, a tokenized URL, a QR image, or the full user profile path.
- `PASS` requires the named command/file/health evidence; a unit test or CI pass is not a substitute for gates 1-5 and 7.
- `.local` is explicitly out of scope in Portable Mode. A system-resolver answer is not evidence of the bridge's `.local` advertisement.
- A blocked Startup policy is a documented corporate limitation, not a PASS; foreground `pocketpet up --no-service` remains the fallback.

## Sign-off

| Field | Value |
| --- | --- |
| Commit under test | |
| Windows edition/build/architecture | |
| Account type | standard user, no administrator token |
| Node / PowerShell | |
| Phone model / browser | |
| CI run URL | |
| Tester and date | |
