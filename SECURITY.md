# Security

PocketPet is a local/LAN tool, not a hosted service.

- The bridge accepts agent events only from loopback.
- Phone routes require a per-install token. The token is carried once in the QR, stored as an HttpOnly cookie, and removed from the visible URL.
- `/setup` is loopback-only and uses a Host allowlist to block DNS rebinding.
- The service log is created mode 0600 and does not contain the token, URLs, or QR.
- No telemetry, no cloud storage, no third-party analytics.
- Events contain agent/session/project/tool names only — never code, prompts, outputs, or file contents.

## Platform protection

### macOS

- `~/.pocketpet`, `logs`, and `config.json` use POSIX mode bits: directory 0700, files 0600.

### Windows 11 x64

- The home directory, `config.json`, logs, and the generated `bridge-service.ps1` launcher are protected by a current-user-only DACL: one full-control allow ACE for the signed-in user's SID, with inheritance disabled and inherited or explicit entries for other users and groups removed. The DACL is verified after every create or update; if verification fails, config creation/writes fail closed and the bridge refuses to start rather than leave or serve a token-bearing file in a weaker state. Existing configs are tightened at startup before the bridge reads or serves them.
- The guarantee is "current-user-only by default". An administrator can take ownership, so this is not a defense against a local administrator. Backup tools that run as SYSTEM may not be able to read the file; run the backup as the signed-in user or exclude the path.
- The Task Scheduler task runs as the signed-in user with `InteractiveToken` and `LeastPrivilege`; logon requires no elevation and the task does not run with an administrator token. Install and uninstall each use one UAC prompt.
- The Task Scheduler XML, the `bridge-service.ps1` launcher, and `%USERPROFILE%\.pocketpet\logs\bridge.log` contain no token, QR, or pairing URL. The launcher is written with a current-user ACL and is replaced only after the elevated install succeeds.
- Firewall rules are inbound allow, Private profile only, scoped to the installed `node.exe`, and limited to the configured TCP bridge port and UDP 5353. Public and Domain networks are not opened automatically.
- `scripts/windows-acceptance.ps1` is read-only. It may read path existence, ACL metadata (`icacls` entries and the inheritance flag), scheduled-task state, firewall rule properties, the token-free loopback `/health` response, and mDNS answers; it never reads or prints config content or the token.

## Reporting a vulnerability

Please use GitHub Security Advisories for this repository ("Report a vulnerability"). Do not paste tokens, QR screenshots, or personal data into a public issue. Rotate a leaked token by editing `token` in `~/.pocketpet/config.json` (Windows: `%USERPROFILE%\.pocketpet\config.json`, or under `POCKETPET_HOME`) and re-pairing every phone.
