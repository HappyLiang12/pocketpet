# Security

PocketPet is a local/LAN tool, not a hosted service.

- The bridge accepts agent events only from loopback.
- Phone routes require a per-install token. The token is carried once in the QR, stored as an HttpOnly cookie, and removed from the visible URL.
- `/setup` is loopback-only and uses a Host allowlist to block DNS rebinding.
- On POSIX hosts (macOS) the service log is created mode 0600; on Windows it relies on the current-user-only ACL described below. The log does not contain the token, URLs, or QR on either platform.
- No telemetry, no cloud storage, no third-party analytics.
- Events contain agent/session/project/tool names only — never code, prompts, outputs, or file contents.

## Platform protection

### macOS

- `~/.pocketpet`, `logs`, and `config.json` use POSIX mode bits: directory 0700, files 0600.

### Windows 11 x64 / Windows 10 22H2 x64

- The home directory, `config.json`, logs, and the generated `bridge-service.ps1` launcher are protected by a current-user-only DACL: one full-control allow ACE for the signed-in user's SID, with inheritance disabled and inherited or explicit entries for other users and groups removed. The DACL is verified after every create or update; if verification fails, config creation/writes fail closed and the bridge refuses to start rather than leave or serve a token-bearing file in a weaker state. Existing configs are tightened at startup before the bridge reads or serves them.
- The guarantee is "current-user-only by default". An administrator can take ownership, so this is not a defense against a local administrator. Backup tools that run as SYSTEM may not be able to read the file; run the backup as the signed-in user or exclude the path.
- The Task Scheduler task runs as the signed-in user with `InteractiveToken` and `LeastPrivilege`; logon requires no elevation and the task does not run with an administrator token. Install and uninstall each use one UAC prompt.
- The Task Scheduler XML, the `bridge-service.ps1` launcher, and `%USERPROFILE%\.pocketpet\logs\bridge.log` contain no token, QR, or pairing URL. The launcher is written with a current-user ACL and is replaced only after the elevated install succeeds.
- Firewall rules are inbound allow, Private profile only, scoped to the installed `node.exe`, and limited to the configured TCP bridge port and UDP 5353. Public and Domain networks are not opened automatically.
- `scripts/windows-acceptance.ps1` is read-only. It may read path existence, ACL metadata (`icacls` entries and the inheritance flag), scheduled-task state, firewall rule properties, the token-free loopback `/health` response, and mDNS answers; it never reads or prints config content or the token.

### Windows Portable Mode (no admin)

- Portable Mode writes a token-free `PocketPet Portable.vbs` under the signed-in user's Startup folder and a token-free `bridge-portable.ps1` launcher in the PocketPet home. The launcher gets the same current-user-only ACL as the service launcher.
- The Startup entry runs the launcher hidden in the user's session at logon. It does not install a Windows service, Task Scheduler task, or firewall rule, and it does not advertise `.local`.
- The user Startup folder is user-writable by design. No token, QR, or pairing URL is stored there; the bridge still reads the protected config itself.
- Portable Mode refuses to install while the Windows service is installed. The service install elevation path fails closed on timeout and points the user at Portable Mode; it does not report a false success or leave a partially installed task.
- Pairing in Portable Mode uses the IP URL when Windows already permits the bridge, or the USB `adb reverse` path; the token/cookie/`/setup` protections are unchanged.

## Reporting a vulnerability

Please use GitHub Security Advisories for this repository ("Report a vulnerability"). Do not paste tokens, QR screenshots, or personal data into a public issue. Rotate a leaked token by editing `token` in `~/.pocketpet/config.json` (Windows: `%USERPROFILE%\.pocketpet\config.json`, or under `POCKETPET_HOME`) and re-pairing every phone.
