# Security

PocketPet is a local/LAN tool, not a hosted service.

- The bridge accepts agent events only from loopback.
- Phone routes require a per-install token. The token is carried once in the QR, stored as an HttpOnly cookie, and removed from the visible URL.
- `/setup` is loopback-only and uses a Host allowlist to block DNS rebinding.
- The service log is created mode 0600 and does not contain the token, URLs, or QR.
- No telemetry, no cloud storage, no third-party analytics.
- Events contain agent/session/project/tool names only — never code, prompts, outputs, or file contents.

## Reporting a vulnerability

Please use GitHub Security Advisories for this repository ("Report a vulnerability"). Do not paste tokens, QR screenshots, or personal data into a public issue. Rotate a leaked token by editing `token` in `~/.pocketpet/config.json` and re-pairing every phone.
