# PocketPet Windows Portable Mode Design

Date: 2026-11-24
Status: approved scope; implementation branch `feat/portable-mode`

## Goal

Let a standard Windows user start PocketPet at logon without an administrator token and without adding firewall rules.

Portable Mode is for the bridge and phone page. It is deliberately smaller than the Windows login service.

## Scope

- Windows 10 22H2 x64 and Windows 11 x64.
- A per-user Startup entry under `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.
- A hidden, token-free PowerShell launcher in the PocketPet home.
- `pocketpet startup install|status|uninstall`.
- Pairing over the LAN IP when Windows already permits it, or over USB with `adb reverse` (Android).
- No UAC, no Task Scheduler task, no firewall rules, no Windows service.
- `.local` remains unavailable in Portable Mode because its firewall rules are not installed.
- The existing service install gets a bounded elevation timeout and an actionable Portable Mode fallback instead of hanging indefinitely.

## Non-goals

- iPhone wireless without administrator firewall access.
- Cloud or third-party tunnels.
- Administrator firewall rules, Task Scheduler, or `.local` in Portable Mode.
- Changing the token model, bridge authentication, ACL protection, or phone UI.
- Replacing the existing admin login service for users who can and want to use it.

## Expected behavior

### Startup files

- Launcher: `<home>/bridge-portable.ps1`, UTF-8 with BOM, current-user ACL, token-free.
  - Runs the compiled `<node> <dist/cli.js> run --service`.
  - Appends only the fixed listening/error output to `<home>/logs/bridge.log`.
- Startup entry: `PocketPet Portable.vbs` in the per-user Startup folder.
  - Runs `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "<launcher>"`.
  - No console window, no token, QR, or URL.
- Install does not start a second bridge immediately. It becomes active at the next user logon; the user can run `pocketpet up` or `pocketpet run` now.

### CLI

- `pocketpet startup install`: Windows only; creates the launcher and Startup entry, protects the launcher, no elevation.
  - Refuses if the Task Scheduler service is installed, because both would start at logon and compete for the port.
  - Idempotent; repairs a missing launcher/entry.
- `pocketpet startup status`: reports whether the Startup entry and launcher are installed; states that this is no-admin/no-firewall and has no `.local`.
- `pocketpet startup uninstall`: removes the Startup entry and launcher; leaves config, pets, cache, and logs.
- Non-Windows hosts reject the command with a pointer to their normal login service/foreground mode.

### Service install timeout

- `defaultElevatedRunner` gets a 30-second default timeout.
- A timed-out elevation fails closed with a specific error; it never reports success.
- `pocketpet service install` and the `up` fallback print the exact Portable Mode alternative when elevation is unavailable.
- The timeout is test-injectable and covered by a unit test.

### Doctor / setup / docs

- README explains Portable Mode, its limits, and the exact commands.
- Doctor reports Portable Mode status without treating the missing service/firewall/`.local` as a failure.
- Setup System card mentions the no-admin path; it does not claim a Windows service.

## Security

- The Startup `.vbs` and PowerShell launcher contain no token, QR, or pairing URL.
- The launcher is current-user-only by ACL, like the service launcher.
- The bridge keeps its existing loopback event boundary, phone token, HttpOnly cookie, and loopback-only `/setup`.
- Portable Mode does not weaken or add Windows Firewall rules.
- A standard user's Startup folder is user-writable by design; no secret is stored there.

## Failure behavior

- Missing compiled CLI or Node path: refuse before writing files.
- Existing service installed: refuse and tell the user to uninstall it first.
- Launcher write/protection failure: fail closed; do not leave a Startup entry pointing at an unprotected script.
- Startup entry write failure: remove the new launcher only if this invocation created it; report the path.
- UAC timeout: clear error; suggest `pocketpet startup install` for a no-admin setup.
- Corporate policy blocks VBS/Startup: report failure; foreground `pocketpet up --no-service` remains usable.

## Acceptance

- Unit tests with a temporary Startup directory and injected security:
  - install writes both files, no token/URL, BOM, hidden launcher;
  - idempotent install;
  - status and uninstall;
  - refusal when the service is installed;
  - non-Windows rejection;
  - timeout error mapping.
- macOS unit/typecheck/build/E2E unchanged.
- Windows CI unit/build/typecheck/E2E.
- Real corporate standard-user test: `startup install`, sign out/in, bridge starts with no UAC; phone via IP and USB; `localHostname` null; `startup uninstall` removes only the startup files.
