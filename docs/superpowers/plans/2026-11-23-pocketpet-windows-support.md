# PocketPet Windows 11 Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Windows 11 x64 support for the bridge, phone page, Studio, agent hooks, login service, `.local` pairing URL, and current-user config protection, with Windows CI and a real-machine compatibility gate.

**Architecture:** Introduce platform adapters for service lifecycle, hostname/mDNS, and private paths. Keep the existing launchd/scutil/chmod implementation as the Darwin adapters; add Task Scheduler/firewall/ACL/mDNS adapters for Windows. The CLI, server, config, and onboarding modules call only the adapters.

**Tech Stack:** TypeScript NodeNext ESM, Node.js >= 20.6, Vitest, Playwright, PowerShell, `schtasks`, `netsh advfirewall`, `multicast-dns`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-23-pocketpet-windows-support-design.md`

## Global Constraints

- Official Windows platform: **Windows 11 x64 only**. A Windows 10 22H2 desktop is a best-effort compatibility gate, not a support claim; if it fails, record the failure and do not broaden the official matrix without approval.
- Node.js >= 20.6. CI uses Node 20; the real Windows gate also runs Node 24, the issue environment.
- macOS behavior and launchd service semantics must remain unchanged. Linux remains best-effort with no service, `.local`, or ACL promise.
- Windows firewall rules are inbound, Private-profile only: TCP bridge port and UDP 5353.
- Windows config, logs, home, and launcher are current-user-only by default. Administrators can take ownership; backups may fail. Never print or persist the token in Task XML, launcher, or bridge log.
- One UAC prompt for service install and one for uninstall. UAC cancel has no side effects; `up` may fall back to foreground.
- Qoder adapter wiring is included; its real-app hook gate remains `NOT RUN`. Do not claim Qoder execution was observed.
- Automated tests use temporary homes and never modify the real `~/.pocketpet`. Windows integration tests use unique temporary task/rule names and clean up in `finally`.
- The plan's real Windows 10 gate is user-assisted unless a remote shell is provided; no credentials may be written to the repo.

---

## Implementation deviations and final behavior

**Read this before copying any snippet below.** Tasks 1-8 were implemented and reviewed after this plan was written. Several step snippets are the original design and are superseded by the shipped code, the tests, and the approved spec:

- **Launcher:** the generated launcher is `<home>\bridge-service.ps1`, written as UTF-8 with a BOM. The Task Scheduler action is `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "<home>\bridge-service.ps1"`. There is no `bridge-service.cmd`, no `cmd.exe` action, and no `/d /s /c`; the `.cmd` form corrupts Unicode paths and `%` sequences through the OEM code page.
- **Task XML bytes:** `windowsTaskXmlBytes()` writes UTF-16LE with a BOM (`FF FE`) before `schtasks /Create /XML`. A BOM-less UTF-16 file is rejected or mis-read; the JS string returned by `windowsTaskXml()` is not itself the registered file.
- **Service status:** the primary, locale-independent source is `Get-ScheduledTask -TaskName "PocketPet Bridge"` piped to `Select-Object -ExpandProperty State`. `Get-ScheduledTaskInfo` last result/run time is probe/diagnostic evidence only, not a product status input. English `schtasks /Query` parsing (`serviceStatusFromQuery`) is fallback only, because `schtasks` labels are localized.
- **ACL:** the generated script builds `$sidObj = New-Object System.Security.Principal.SecurityIdentifier($sid)` and passes `$sidObj` to `FileSystemAccessRule`. Passing the SID string directly would be treated as an `NTAccount` name and fail to translate. The script also verifies one protected allow FullControl ACE for that SID.
- **Install transaction:** validate the compiled CLI, Node path, port, and SID; protect logs; write and protect a staged launcher; run one elevated helper that ends any previous task, deletes stale rules, adds the current Private-profile rules, and registers the task with `/Create /XML /F`; only after elevation succeeds rename the staged launcher over the old one, protect it, and start the task. A canceled or failed elevation keeps the previous launcher and task, and a failed upgrade restores the previous task.
- **Hooks:** the Windows hook command is the absolute, double-quoted `"<node>" "<cli>" hook claude|qoder`, and stale bare entries are upgraded. The Qoder real-app gate remains `NOT RUN`.
- **Docs and evidence:** `README.md`, `README.zh-Hans.md`, `SECURITY.md`, `docs/acceptance/windows-support.md`, and `scripts/windows-acceptance.ps1` describe the final behavior. The acceptance record starts every manual gate as `NOT RUN`.

---

## File Map

| Path | Responsibility |
| --- | --- |
| `src/platform/types.ts` | Shared service, host, private-path, and platform interfaces |
| `src/platform/index.ts` | `platformFor()` and current-platform selection |
| `src/platform/darwin/index.ts` | Darwin adapter bundle |
| `src/platform/darwin/service.ts` | Existing launchd implementation, moved |
| `src/platform/darwin/hostname.ts` | Existing scutil hostname implementation |
| `src/platform/darwin/security.ts` | Existing chmod ownership behavior |
| `src/platform/unsupported/index.ts` | Linux/best-effort service/host behavior; POSIX file modes |
| `src/platform/windows/index.ts` | Windows adapter bundle |
| `src/platform/windows/service.ts` | Task Scheduler/launcher/status/install/uninstall; elevation |
| `src/platform/windows/firewall.ts` | Private-profile firewall rule add/remove/check |
| `src/platform/windows/builders.ts` | Task XML, launcher, status parser; no side effects |
| `src/platform/windows/security.ts` | SID lookup and current-user-only DACL |
| `src/platform/windows/hostname.ts` | DNS-label sanitization and `.local` name |
| `src/platform/windows/mdns.ts` | `multicast-dns` A-record responder |
| `src/config.ts` | Atomic writes using `Platform.privatePaths` |
| `src/onboarding.ts` | Pairing links; no direct platform commands |
| `src/server.ts` | Bridge lifecycle, setup status, host advertisement |
| `src/cli.ts` | `up`, `run`, `service`, `doctor`; UAC fallback and status |
| `src/net.ts` | Ranked LAN IPv4 list shared by QR and mDNS |
| `package.json` | Add `multicast-dns` runtime dependency |
| `.github/workflows/ci.yml` | macOS and Windows matrix, Windows integration step |
| `scripts/windows-acceptance.ps1` | Read-only Windows probe for ACL/service/firewall/mDNS/health |
| `docs/acceptance/windows-support.md` | Real-machine evidence and NOT RUN gates |
| `README.md`, `README.zh-Hans.md` | Per-OS support and Windows instructions |
| `tests/platform.test.ts` | Adapter selection and contract tests |
| `tests/windowsSecurity.test.ts` | ACL command and fail-closed tests |
| `tests/windowsHostname.test.ts` | Hostname sanitize and mDNS name tests |
| `tests/windowsService.test.ts` | Task XML, firewall, status, transaction tests |
| `tests/windowsHooks.test.ts` | Windows hook quoting and doctor checks |
| `tests/mdns.test.ts` | Exact-name A-answer and lifecycle tests |
| `scripts/windows-integration.mjs` | Windows CI task/firewall/ACL smoke with cleanup |
| `tests/net.test.ts` | Windows interface ranking |
| Existing service/config/install/cli/server tests | Move imports and platform-gate POSIX-only assertions |

---

### Task 1: Platform contracts and Darwin adapters

**Files:**
- Create: `src/platform/types.ts`, `src/platform/index.ts`
- Create: `src/platform/darwin/index.ts`, `src/platform/darwin/hostname.ts`, `src/platform/darwin/security.ts`
- Move: `src/service.ts` -> `src/platform/darwin/service.ts`
- Create: `src/platform/unsupported/index.ts`
- Modify: `src/cli.ts`, `src/server.ts`, `src/config.ts`, `src/onboarding.ts`
- Delete: `src/service.ts`
- Test: `tests/platform.test.ts`, `tests/service.test.ts`, `tests/onboarding.test.ts`

**Interfaces:**
- Consumes: existing launchd behavior in `src/service.ts` and scutil behavior in `src/onboarding.ts`
- Produces: `platformFor(name: NodeJS.Platform): Platform`, `ServiceManager`, `HostIdentity`, `PrivatePaths`, `ServiceConfig { home; nodePath; cliPath; port }`, `ServiceState { installed; running }`

- [ ] **Step 1: Write the failing platform contract test**

```ts
import { describe, expect, it } from "vitest";
import { platformFor } from "../src/platform/index.js";

describe("platform selection", () => {
  it("selects Darwin adapters and preserves the service contract", () => {
    const platform = platformFor("darwin");
    expect(typeof platform.service.install).toBe("function");
    expect(typeof platform.host.localHostname).toBe("function");
    expect(typeof platform.security.protectFile).toBe("function");
  });

  it("does not claim .local or a service on unsupported platforms", async () => {
    const platform = platformFor("linux");
    expect(platform.host.localHostname()).toBeNull();
    await expect(platform.service.status({ home: "/tmp/pocketpet-test", nodePath: process.execPath, cliPath: "/tmp/cli.js", port: 7788 }))
      .rejects.toThrow(/not supported/i);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/platform.test.ts`
Expected: FAIL because `src/platform/index.ts` does not exist.

- [ ] **Step 3: Create the contracts and Darwin adapters**

`src/platform/types.ts`:

```ts
export type CommandResult = { status: number; stdout: string; stderr: string };
export type CommandRunner = (command: string, args: string[]) => CommandResult;

export type ServiceConfig = {
  home: string;
  nodePath: string;
  cliPath: string;
  port: number;
};

export type ServiceState = { installed: boolean; running: boolean };

export type ServiceManager = {
  install(cfg: ServiceConfig): Promise<void>;
  uninstall(cfg: ServiceConfig): Promise<void>;
  status(cfg: ServiceConfig): Promise<ServiceState>;
};

export type HostIdentity = {
  localHostname(): string | null;
  startAdvertisement(): Promise<boolean>;
  stopAdvertisement(): Promise<void>;
};

export type PrivatePaths = {
  protectHome(home: string): void;
  protectLogs(home: string): void;
  protectFile(path: string): void;
};

export type Platform = {
  service: ServiceManager;
  host: HostIdentity;
  security: PrivatePaths;
};
```

Create `src/platform/darwin/hostname.ts` with the existing `localHostname` implementation. Export a `darwinHost: HostIdentity` whose `startAdvertisement` resolves `true` and whose `stopAdvertisement` does nothing.

Create `src/platform/darwin/security.ts` with `protectHome`/`protectLogs`/`protectFile` applying the current 0700/0600 modes. Keep existing error behavior.

Move `src/service.ts` to `src/platform/darwin/service.ts` without changing its launchd logic. Export `darwinService: ServiceManager` with:

```ts
status: async (cfg) => {
  const running = await serviceStatus(cfg);
  return { installed: running || existsSync(servicePath(cfg.home)), running };
}
```

Create `src/platform/darwin/index.ts` exporting `darwinPlatform: Platform`. Create `src/platform/index.ts`:

```ts
import { darwinPlatform } from "./darwin/index.js";
import { unsupportedPlatform } from "./unsupported/index.js";

export function platformFor(name: NodeJS.Platform): Platform {
  return name === "darwin" ? darwinPlatform : unsupportedPlatform;
}

export const platform = platformFor(process.platform);
```

Create `src/platform/unsupported/index.ts` with a service manager that rejects with `service is not supported on this platform`, a host returning `null`, and POSIX mode protection matching the current 0700/0600 behavior.

- [ ] **Step 4: Move callers and tests to the adapter imports**

Update `tests/service.test.ts` to import from `src/platform/darwin/service.js`; update `tests/onboarding.test.ts` to import `localHostname` from `src/platform/darwin/hostname.js`. Update `src/cli.ts` and `src/server.ts` to use `platform.service` and `platform.host`; pass `port: config.port` in every `ServiceConfig`.

Run: `npx vitest run tests/platform.test.ts tests/service.test.ts tests/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the macOS regression subset and commit**

Run: `npm run typecheck && npx vitest run tests/service.test.ts tests/onboarding.test.ts tests/server.test.ts`
Expected: PASS.

```bash
git add src/platform src/cli.ts src/server.ts src/config.ts src/onboarding.ts tests/platform.test.ts tests/service.test.ts tests/onboarding.test.ts
git commit -m "refactor: add platform adapters and preserve macOS behavior"
```

---

### Task 2: Windows ACL protection and fail-closed config

**Files:**
- Create: `src/platform/windows/security.ts`, `src/platform/windows/index.ts`
- Modify: `src/config.ts`, `src/platform/index.ts`
- Test: `tests/windowsSecurity.test.ts`, `tests/config.test.ts`

**Interfaces:**
- Consumes: `PrivatePaths` and `CommandRunner` from Task 1
- Produces: `windowsSecurity.protectHome`, `protectLogs`, `protectFile`; Windows platform selection; config fails closed on ACL failure

- [ ] **Step 1: Write the failing ACL tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { windowsSecurity } from "../src/platform/windows/security.js";

describe("Windows private paths", () => {
  it("replaces inheritance with one current-user ACE", () => {
    const run = vi.fn(() => ({ status: 0, stdout: "S-1-5-21-42\n", stderr: "" }));
    windowsSecurity.protectFile("C:\\Users\\happy\\.pocketpet\\config.json", run);
    const encoded = String(run.mock.calls.at(-1)?.[1]?.[2]);
    const script = Buffer.from(encoded, "base64").toString("utf16le");
    expect(script).toContain("SetAccessRuleProtection($true,$false)");
    expect(script).toContain("S-1-5-21-42");
    expect(script).toContain("Set-Acl");
  });

  it("throws when DACL verification fails", () => {
    const run = vi.fn(() => ({ status: 1, stdout: "", stderr: "denied" }));
    expect(() => windowsSecurity.protectFile("C:\\x", run)).toThrow(/SID|ACL|denied/i);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/windowsSecurity.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement SID lookup and DACL replacement**

> **Superseded snippet:** the `FileSystemAccessRule($sid, ...)` call below passes a SID string, which PowerShell treats as an `NTAccount` name. Final code creates `$sidObj = New-Object System.Security.Principal.SecurityIdentifier($sid)` and passes `$sidObj`; it also verifies the resulting protected single ACE. See the top note.

Create `src/platform/windows/security.ts` with this implementation shape:

```ts
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { CommandRunner } from "../types.js";

const SID_SCRIPT = "([WindowsIdentity]::GetCurrent()).User.Value";
const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const defaultRunner: CommandRunner = (command, args) => {
  try {
    return { status: 0, stdout: execFileSync(command, args, { encoding: "utf8", stdio: "pipe" }), stderr: "" };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failed.status ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
};

export function currentUserSid(run: CommandRunner = defaultRunner): string {
  const sidResult = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SID_SCRIPT]);
  const sid = sidResult.stdout.trim();
  if (sidResult.status !== 0 || !/^S-1-5-[0-9-]+$/.test(sid)) {
    throw new Error("cannot resolve the current user SID");
  }
  return sid;
}

function protect(path: string, kind: "dir" | "file", run: CommandRunner): void {
  const sid = currentUserSid(run);
  const inheritance = kind === "dir" ? "ContainerInherit,ObjectInherit" : "None";
  const script = [
    `$p=${psQuote(path)};$sid=${psQuote(sid)};`,
    "$acl=Get-Acl -LiteralPath $p;",
    "$acl.SetAccessRuleProtection($true,$false);",
    "foreach($r in @($acl.Access)){$null=$acl.RemoveAccessRule($r)};",
    `$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','${inheritance}','None','Allow')));`,
    "Set-Acl -LiteralPath $p -AclObject $acl;",
    "if((Get-Acl -LiteralPath $p).Access.Count -ne 1){exit 3}",
  ].join("");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
  if (result.status !== 0) {
    throw new Error(`could not protect ${path} with a current-user ACL (exit ${result.status})`);
  }
}

export const windowsSecurity = {
  protectHome: (home: string, run?: CommandRunner) => protect(home, "dir", run ?? defaultRunner),
  protectLogs: (home: string, run?: CommandRunner) => protect(join(home, "logs"), "dir", run ?? defaultRunner),
  protectFile: (path: string, run?: CommandRunner) => protect(path, "file", run ?? defaultRunner),
};
```

Use `-NoProfile -NonInteractive -EncodedCommand` (UTF-16LE base64). Never include config content. Throw a typed error with a safe path/operation message on non-zero exit or failed verification.

Wire `windowsSecurity` into `src/platform/windows/index.ts`; update `platformFor("win32")` to return it in Task 5 when the full Windows platform exists.

- [ ] **Step 4: Route config writes through `platform.security`**

Modify `ensureConfig` to create `home`, `pets`, `cache/petdex`, and `logs` with platform protection. Modify `saveConfig` to write the temp file, protect it before atomic rename, and on Windows verify after rename. On protection failure, remove the temp file and throw; do not leave a token file with weaker ACL. Add a config test using a fake platform security object that throws and assert no config file remains.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/windowsSecurity.test.ts tests/config.test.ts`
Expected: PASS.

```bash
git add src/platform/windows src/platform/index.ts src/config.ts tests/windowsSecurity.test.ts tests/config.test.ts
git commit -m "feat: protect Windows config with a current-user-only ACL"
```

---

### Task 3: Windows hostname, `.local` naming, and LAN ranking

**Files:**
- Create: `src/platform/windows/hostname.ts`
- Modify: `src/platform/windows/index.ts`, `src/platform/index.ts`, `src/onboarding.ts`, `src/server.ts`, `src/net.ts`
- Test: `tests/windowsHostname.test.ts`, `tests/net.test.ts`, `tests/onboarding.test.ts`

**Interfaces:**
- Consumes: `HostIdentity` from Task 1
- Produces: `sanitizeHostname(raw: string): string`, `windowsHost.localHostname()`, ranked LAN IPv4 list

- [ ] **Step 1: Write the failing hostname/net tests**

```ts
import { describe, expect, it } from "vitest";
import { sanitizeHostname } from "../src/platform/windows/hostname.js";
import { rankLanAddresses } from "../src/net.js";

describe("Windows hostname", () => {
  it("sanitizes computer names into a DNS label", () => {
    expect(sanitizeHostname("Happy PC_!!")).toBe("happy-pc");
    expect(sanitizeHostname("")).toBe("pocketpet");
  });
});

describe("LAN ranking", () => {
  it("puts Wi-Fi and Ethernet before VPN adapters", () => {
    const ranked = rankLanAddresses({
      "vEthernet (VPN)": [{ family: "IPv4", internal: false, address: "10.0.0.2" } as never],
      "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.1.2" } as never],
      "Ethernet 2": [{ family: "IPv4", internal: false, address: "192.168.1.3" } as never],
    });
    expect(ranked.map((item) => item.address)).toEqual(["192.168.1.2", "192.168.1.3", "10.0.0.2"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/windowsHostname.test.ts tests/net.test.ts`
Expected: FAIL because the modules/functions do not exist.

- [ ] **Step 3: Implement sanitization and ranking**

Implement `src/platform/windows/hostname.ts`:

```ts
import { hostname } from "node:os";
import type { HostIdentity } from "../types.js";

export function sanitizeHostname(raw: string): string {
  const label = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return label || "pocketpet";
}

let advertising = false;
const name = sanitizeHostname(hostname());

export const windowsHost: HostIdentity = {
  localHostname: () => (advertising ? `${name}.local` : null),
  startAdvertisement: async () => {
    advertising = false;
    return false;
  },
  stopAdvertisement: async () => {
    advertising = false;
  },
};
```

Task 6 replaces the two advertisement methods with the mDNS implementation. `localHostname()` never returns a URL before advertisement succeeds.

Refactor `src/net.ts`:

```ts
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

export type LanAddress = { address: string; interfaceName: string; rank: number };

export function rankLanAddresses(
  ifaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LanAddress[] {
  const ranked: LanAddress[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal || addr.address.startsWith("169.254.")) continue;
      const lower = name.toLowerCase();
      const virtual = /vEthernet|vpn|tailscale|virtual|utun/i.test(lower);
      const primary = /wi-fi|ethernet/i.test(lower) || (process.platform === "darwin" && lower.startsWith("en"));
      ranked.push({ address: addr.address, interfaceName: name, rank: virtual ? 2 : primary ? 0 : 1 });
    }
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.address.localeCompare(b.address))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.address === item.address) === index);
}

export function urlsForPort(port: number, token: string, ifaces = networkInterfaces()): string[] {
  return rankLanAddresses(ifaces).map(({ address }) =>
    `http://${address}:${port}/?token=${encodeURIComponent(token)}`
  );
}
```

macOS keeps `en*` as the primary adapter; virtual macOS `utun` remains rank 2. Add a test for `en0` ordering in `tests/net.test.ts`.

- [ ] **Step 4: Wire host selection and run tests**

Update `onboarding.ts` and `server.ts` to ask `platform.host.localHostname()` instead of importing scutil directly. Run:

`npx vitest run tests/windowsHostname.test.ts tests/net.test.ts tests/onboarding.test.ts`
Expected: PASS; macOS onboarding tests remain green.

- [ ] **Step 5: Commit**

```bash
git add src/platform/windows/hostname.ts src/platform/windows/index.ts src/platform/index.ts src/onboarding.ts src/server.ts src/net.ts tests/windowsHostname.test.ts tests/net.test.ts tests/onboarding.test.ts
git commit -m "feat: sanitize Windows hostnames and rank LAN addresses"
```

---

### Task 4: Windows firewall and Task Scheduler builders

**Files:**
- Create: `src/platform/windows/firewall.ts`, `src/platform/windows/builders.ts`
- Test: `tests/windowsService.test.ts`

**Interfaces:**
- Consumes: `ServiceConfig` from Task 1
- Produces: `windowsTaskXml(cfg)`, `windowsLauncher(cfg)`, `firewallAddCommands(port)`, `firewallRemoveCommands()`, `serviceStatusFromQuery(stdout)`

- [ ] **Step 1: Write the failing builder tests**

```ts
import { describe, expect, it } from "vitest";
import { firewallAddCommands, firewallRemoveCommands } from "../src/platform/windows/firewall.js";
import { windowsLauncher, windowsTaskXml } from "../src/platform/windows/builders.js";

const cfg = { home: "C:\\Users\\happy\\.pocketpet", nodePath: "C:\\Program Files\\nodejs\\node.exe", cliPath: "C:\\app\\dist\\cli.js", port: 7788 };

describe("Windows service builders", () => {
  it("creates private TCP and mDNS rules without a token", () => {
    const commands = firewallAddCommands(cfg.port, cfg.nodePath).join("\n");
    expect(commands).toContain("PocketPet Bridge TCP");
    expect(commands).toContain("PocketPet Bridge mDNS");
    expect(commands).toContain("protocol=TCP");
    expect(commands).toContain("protocol=UDP localport=5353");
    expect(commands).toContain("profile=private");
    expect(commands).not.toMatch(/token=/i);
    expect(firewallRemoveCommands()).toEqual(expect.arrayContaining([
      expect.stringContaining("PocketPet Bridge TCP"),
      expect.stringContaining("PocketPet Bridge mDNS"),
    ]));
  });

  it("writes a hidden logon task and launcher", () => {
    const xml = windowsTaskXml(cfg, "S-1-5-21-42");
    expect(xml).toContain("LogonTrigger");
    expect(xml).toContain("LeastPrivilege");
    expect(xml).toContain("bridge-service.cmd");
    expect(xml).toContain("PocketPet Bridge");
    expect(xml).not.toMatch(/token=/i);
    expect(windowsLauncher(cfg)).toContain("run --service");
    expect(windowsLauncher(cfg)).toContain("bridge.log");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/windowsService.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the builders**

Create `src/platform/windows/builders.ts` for `windowsLauncher`, `windowsTaskXml`, and `serviceStatusFromQuery`; create `src/platform/windows/firewall.ts` for the rule commands.

> **Superseded snippet:** the `.cmd` launcher, `cmd.exe /d /s /c` action, and English-only status parsing below are the original design. Final behavior is the UTF-8 BOM `.ps1` launcher run by PowerShell, UTF-16LE BOM task XML bytes, and `Get-ScheduledTask` State (see "Implementation deviations and final behavior" at the top).

`src/platform/windows/firewall.ts`:

```ts
import { execFileSync } from "node:child_process";
import type { CommandRunner } from "../types.js";

export const FIREWALL_TCP = "PocketPet Bridge TCP";
export const FIREWALL_MDNS = "PocketPet Bridge mDNS";
export const TASK_NAME = "PocketPet Bridge";

const defaultRunner: CommandRunner = (command, args) => {
  try {
    return { status: 0, stdout: execFileSync(command, args, { encoding: "utf8", stdio: "pipe" }), stderr: "" };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failed.status ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
};

const addRule = (name: string, protocol: "TCP" | "UDP", port: number, program: string): string =>
  `netsh advfirewall firewall add rule name="${name}" dir=in action=allow program="${program}" protocol=${protocol} localport=${port} profile=private`;

export function firewallAddCommands(port: number, program = process.execPath): string[] {
  return [
    `netsh advfirewall firewall delete rule name="${FIREWALL_TCP}"`,
    `netsh advfirewall firewall delete rule name="${FIREWALL_MDNS}"`,
    addRule(FIREWALL_TCP, "TCP", port, program),
    addRule(FIREWALL_MDNS, "UDP", 5353, program),
  ];
}

export function firewallRemoveCommands(): string[] {
  return [
    `netsh advfirewall firewall delete rule name="${FIREWALL_TCP}"`,
    `netsh advfirewall firewall delete rule name="${FIREWALL_MDNS}"`,
  ];
}

export function firewallRulesPresent(run = defaultRunner): boolean {
  return [FIREWALL_TCP, FIREWALL_MDNS].every((name) =>
    run("netsh", ["advfirewall", "firewall", "show", "rule", `name=${name}`]).status === 0,
  );
}
```

`src/platform/windows/builders.ts`:

```ts
import { join } from "node:path";
import type { ServiceConfig } from "../types.js";

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function windowsLauncher(cfg: ServiceConfig): string {
  return [
    "@echo off",
    `set "POCKETPET_HOME=${cfg.home}"`,
    `"${cfg.nodePath}" "${cfg.cliPath}" run --service >> "${join(cfg.home, "logs", "bridge.log")}" 2>&1`,
  ].join("\r\n");
}

export function windowsTaskXml(cfg: ServiceConfig, sid: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${esc(sid)}</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>${esc(sid)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Hidden>true</Hidden>
  </Settings>
  <Actions Context="Author"><Exec><Command>cmd.exe</Command><Arguments>${esc(`/d /s /c "${join(cfg.home, "bridge-service.cmd")}"`)}</Arguments><WorkingDirectory>${esc(cfg.home)}</WorkingDirectory></Exec></Actions>
  <RegistrationInfo><Description>PocketPet bridge at logon</Description></RegistrationInfo>
</Task>`;
}

export function serviceStatusFromQuery(stdout: string): { installed: boolean; running: boolean } {
  const installed = /TaskName:\s+PocketPet Bridge/i.test(stdout) || /PocketPet Bridge/i.test(stdout);
  const running = /Status:\s+Running/i.test(stdout) || /Scheduled Task State:\s+Running/i.test(stdout);
  return { installed, running };
}
```

Superseded final action: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "<home>\\bridge-service.ps1"`, with the task XML written as UTF-16LE with a BOM. Escape XML. Keep the task name, `InteractiveToken`, `LeastPrivilege`, hidden, and restart settings. `serviceStatusFromQuery` remains only a fallback parser for English `schtasks` output; the primary status source is the locale-independent `Get-ScheduledTask` State.

- [ ] **Step 4: Run builder tests and commit**

Run: `npx vitest run tests/windowsService.test.ts`
Expected: PASS.

```bash
git add src/platform/windows/firewall.ts src/platform/windows/service.ts tests/windowsService.test.ts
git commit -m "feat: add Windows firewall and Task Scheduler builders"
```

---

### Task 5: Windows service transaction, UAC, CLI, and setup status

**Files:**
- Modify: `src/platform/windows/service.ts`, `src/platform/windows/index.ts`, `src/platform/index.ts`, `src/cli.ts`, `src/server.ts`
- Test: `tests/windowsService.test.ts`, `tests/cli.test.ts`, `tests/server.test.ts`

**Interfaces:**
- Consumes: builders/firewall from Task 4; `platformFor` from Task 1
- Produces: `windowsService.install/uninstall/status`; `up` fallback; setup service status on Windows

- [ ] **Step 1: Write failing transaction tests**

Add tests with a fake `run`/elevated runner that assert install order `firewall -> task -> start`, rollback removes rules/task on task-registration failure, UAC cancellation is surfaced, and uninstall removes task then both rules. Add a CLI test where a fake Windows service install throws and `up --yes` continues to start the foreground bridge; assert exit code 0 and a foreground bridge is reported.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/windowsService.test.ts tests/cli.test.ts -t "windows|UAC|fallback"`
Expected: FAIL because the Windows service manager and fallback do not exist.

- [ ] **Step 3: Implement the Windows service manager**

Implement `src/platform/windows/service.ts` with this transaction shape:

> **Superseded snippet:** the `.cmd` launcher path, BOM-less XML, launcher deletion before elevation succeeds, and `schtasks /Query` status below are the original design. Final behavior stages the `.ps1` launcher, writes UTF-16LE XML with a BOM, preserves the previous install on cancel/failure, and uses `Get-ScheduledTask` State (see the top note).

```ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ServiceConfig, ServiceManager } from "../types.js";
import { firewallAddCommands, firewallRemoveCommands, TASK_NAME } from "./firewall.js";
import { currentUserSid } from "./security.js";
import { serviceStatusFromQuery, windowsLauncher, windowsTaskXml } from "./builders.js";

type WindowsDeps = {
  run: (command: string, args: string[]) => { status: number; stdout: string; stderr: string };
  elevated: (script: string) => Promise<{ status: number; stdout: string; stderr: string }>;
  protectDir: (path: string) => void;
  protectFile: (path: string) => void;
};

const launcherPath = (cfg: ServiceConfig) => join(cfg.home, "bridge-service.cmd");

export async function installWindowsService(cfg: ServiceConfig, deps: WindowsDeps): Promise<void> {
  if (cfg.cliPath.endsWith(".ts") || !existsSync(cfg.cliPath)) {
    throw new Error("refusing to install service from a source CLI; build dist/cli.js first");
  }
  const logs = join(cfg.home, "logs");
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  deps.protectDir(logs);
  const launcher = launcherPath(cfg);
  writeFileSync(launcher, windowsLauncher(cfg), { mode: 0o600 });
  deps.protectFile(launcher);
  const sid = currentUserSid(deps.run);
  const xml = windowsTaskXml(cfg, sid);
  const xml64 = Buffer.from(xml, "utf16le").toString("base64");
  const cleanup = [
    ...firewallRemoveCommands().map((command) => `& ${command};`),
    `& schtasks.exe /Delete /TN '${TASK_NAME}' /F 2>$null;`,
  ].join(" ");
  const script = [
    "$ErrorActionPreference = 'Stop';",
    `$xmlPath = Join-Path $env:TEMP 'pocketpet-task-${process.pid}.xml';`,
    `[IO.File]::WriteAllBytes($xmlPath, [Convert]::FromBase64String('${xml64}'));`,
    "try {",
    ...firewallAddCommands(cfg.port, cfg.nodePath).map((command) => `& ${command};`),
    `& schtasks.exe /Create /TN '${TASK_NAME}' /XML $xmlPath /F;`,
    "if ($LASTEXITCODE -ne 0) { throw 'task registration failed' }",
    "Remove-Item $xmlPath -Force;",
    `& schtasks.exe /Run /TN '${TASK_NAME}';`,
    "if ($LASTEXITCODE -ne 0) { throw 'task start failed' }",
    `} catch { ${cleanup} Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue; throw }`,
  ].join(" ");
  try {
    const result = await deps.elevated(script);
    if (result.status !== 0) throw new Error(`elevated install failed (exit ${result.status})`);
  } catch (error) {
    rmSync(launcher, { force: true });
    throw error;
  }
}

export function createWindowsService(deps: WindowsDeps): ServiceManager {
  return {
    install: (cfg) => installWindowsService(cfg, deps),
    uninstall: async (cfg) => {
      const script = [
        "& schtasks.exe /End /TN 'PocketPet Bridge' 2>$null;",
        "& schtasks.exe /Delete /TN 'PocketPet Bridge' /F 2>$null;",
        ...firewallRemoveCommands().map((command) => `& ${command};`),
      ].join(" ");
      const result = await deps.elevated(script);
      if (result.status !== 0) throw new Error(`elevated uninstall failed (exit ${result.status})`);
      rmSync(launcherPath(cfg), { force: true });
    },
    status: async () => {
      const result = deps.run("schtasks.exe", ["/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"]);
      return serviceStatusFromQuery(result.status === 0 ? result.stdout : "");
    },
  };
}
```

The injected `elevated` runner is the only UAC boundary. It must use `Start-Process powershell.exe -Verb RunAs -Wait -PassThru`, return a distinct cancellation failure, and never receive a token. The elevated script writes task XML to `$env:TEMP` only for `schtasks /XML`, then removes it. The installer's `except` path is explicit in PowerShell so a failed task/rule step rolls back inside the same elevation; the Node catch removes only the launcher. The exact task XML path is a temp file, not the current-user-only home, so a UAC that uses a different admin account still exposes no user secret.

In `runUp`, use this Windows fallback shape:

```ts
try {
  await platform.service.install({ home, nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url), port: config.port });
} catch (error) {
  console.error("Could not install the bridge service.");
  if (process.platform !== "win32") return 1;
  // Continue to the foreground bridge; print the exact elevated command.
  console.error("Continuing in the foreground; run `pocketpet service install` from an elevated shell later.");
}
```

`service install` standalone must still exit 1 on the same error. The `up` path must not claim the service is running when the install failed.

Implement `status` with `Get-ScheduledTask -TaskName "PocketPet Bridge" | Select-Object -ExpandProperty State` and `Get-ScheduledTaskInfo` (locale-independent; `schtasks /Query` text parsing only as fallback); implement `uninstall` with one elevated helper, idempotent rule removal, and a verified task deletion. Use injected runners for unit tests. Update the setup System card to call `platform.service.status()` on Windows; a stopped task reports `running: false`.

Update `platformFor("win32")` to return the Windows bundle. Update `runService`/`runUp` to pass `port: config.port`; when Windows install fails, print the exact elevated command and continue foreground in `up`; standalone `service install` still exits 1. Update `server.ts` to use `platform.service.status()` for the setup System card on Windows.

- [ ] **Step 4: Run the focused tests and commit**

Run: `npx vitest run tests/windowsService.test.ts tests/cli.test.ts tests/server.test.ts`
Expected: PASS on macOS; Windows-only assertions are gated to run in the Windows CI job.

```bash
git add src/platform/windows src/platform/index.ts src/cli.ts src/server.ts tests/windowsService.test.ts tests/cli.test.ts tests/server.test.ts
git commit -m "feat: install and manage the Windows bridge service"
```

---

### Task 6: Windows mDNS advertisement and bridge lifecycle

**Files:**
- Modify: `package.json`, `package-lock.json` by running `npm install multicast-dns@^7.2.5`
- Create: `src/platform/windows/mdns.ts`
- Modify: `src/platform/windows/hostname.ts`, `src/platform/windows/index.ts`, `src/server.ts`, `src/cli.ts`
- Test: `tests/mdns.test.ts`, `tests/windowsHostname.test.ts`, `tests/server.test.ts`

**Interfaces:**
- Consumes: ranked LAN addresses from Task 3; firewall readiness from Task 4
- Produces: `windowsHost.startAdvertisement(): Promise<boolean>`, `localHostname()` only while active; Bridge start/close lifecycle

- [ ] **Step 1: Write failing mDNS tests**

Use a fake transport that records `on("query", handler)` and `respond` calls. Assert:
- an A query for exactly `<hostname>.local` returns all ranked IPv4 A records;
- another name gets no response;
- no AAAA response;
- stop removes listeners/closes the transport;
- absent firewall permission/addresses returns `false` and leaves `localHostname()` null.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/mdns.test.ts`
Expected: FAIL because `src/platform/windows/mdns.ts` does not exist.

- [ ] **Step 3: Implement the responder**

Create `src/platform/windows/mdns.ts`:

```ts
import type { LanAddress } from "../../net.js";

type MdnsTransport = {
  on(event: "query", listener: (query: { questions?: Array<{ name?: string; type?: string | number }> }) => void): void;
  removeListener?(event: "query", listener: (query: unknown) => void): void;
  respond(packet: { answers: Array<{ name: string; type: "A"; ttl: number; data: string }> }): void;
  destroy(): void;
};

export function startMdns(options: {
  hostname: string;
  addresses: LanAddress[];
  transport: MdnsTransport;
}): { stop(): void } {
  const target = `${options.hostname}.local`.toLowerCase();
  const onQuery = (query: { questions?: Array<{ name?: string; type?: string | number }> }) => {
    const wantsA = (query.questions ?? []).some(
      (question) => String(question.name ?? "").toLowerCase() === target && (question.type === "A" || question.type === 1),
    );
    if (!wantsA) return;
    options.transport.respond({
      answers: options.addresses.map(({ address }) => ({ name: target, type: "A", ttl: 120, data: address })),
    });
  };
  options.transport.on("query", onQuery);
  return {
    stop() {
      options.transport.removeListener?.("query", onQuery);
      options.transport.destroy();
    },
  };
}
```

Update `src/platform/windows/firewall.ts` with a read-only probe:

```ts
export function firewallRulesPresent(run: (command: string, args: string[]) => { status: number } = defaultRunner): boolean {
  return [FIREWALL_TCP, FIREWALL_MDNS].every((name) =>
    run("netsh", ["advfirewall", "firewall", "show", "rule", `name=${name}`]).status === 0,
  );
}
```

Update `src/platform/windows/hostname.ts` to start `multicast-dns` only when `firewallRulesPresent()` and the ranked address list is non-empty. A bind/import failure sets `advertising = false` and returns `false`; a successful start sets `advertising = true` and keeps the transport in a module-level `active` handle so `stopAdvertisement()` destroys it.

- [ ] **Step 4: Wire bridge lifecycle**

Add `host?: HostIdentity` to `BridgeOptions`, default `platform.host`. Add these calls to `startBridge` and `Bridge.close`:

```ts
const host = opts.host ?? platform.host;
// after server.listen resolves:
const advertised = await host.startAdvertisement();
const hostname = host.localHostname();
return {
  port,
  config,
  aggregator,
  broadcast,
  close: async () => {
    await host.stopAdvertisement();
    for (const client of wsClients) client.close();
    wss.close();
    server.closeIdleConnections();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  },
};
```

Use the selected `hostname` for the setup page's pairing links; pass `advertised` or `hostname` through `BridgeOptions`/server state so a false advertisement yields `localUrl: null`. Update `server.ts` setup-page hostname to use the bridge's host instance. Add a server test with a fake host whose `startAdvertisement` returns `false` and assert `localUrl` is null and IP pairing still works.

- [ ] **Step 5: Run tests and commit**

Run: `npm install multicast-dns@^7.2.5 && npx vitest run tests/mdns.test.ts tests/windowsHostname.test.ts tests/server.test.ts`
Expected: PASS; macOS tests use the no-op host adapter.

```bash
git add package.json package-lock.json src/platform/windows src/server.ts src/cli.ts tests/mdns.test.ts tests/windowsHostname.test.ts tests/server.test.ts
git commit -m "feat: advertise the Windows .local hostname over mDNS"
```

---

### Task 7: Windows hook commands, doctor, and platform-gated tests

**Files:**
- Modify: `src/cli.ts`, `src/doctor.ts`, `src/adapters/claudeInstall.ts`, `src/adapters/qoderInstall.ts`
- Modify: `tests/claudeInstall.test.ts`, `tests/qoderInstall.test.ts`, `tests/cli.test.ts`, `tests/doctor.test.ts`, `tests/server.test.ts`
- Test: `tests/windowsHooks.test.ts`

**Interfaces:**
- Consumes: `platform.security`, Windows quoting rules
- Produces: Windows-safe `<node> <cli> hook ...` commands; doctor checks for service/firewall/mDNS/ACL; Qoder detail `wired; real-app gate NOT RUN`

- [ ] **Step 1: Write failing Windows hook/doctor tests**

Add tests for a Windows command builder that quotes `C:\Program Files\nodejs\node.exe` and `C:\Program Files\PocketPet\dist\cli.js`, and a doctor check that reports Qoder `wired; real-app gate NOT RUN` rather than a verified PASS. Add a test that Windows-specific doctor checks are present only when the platform is Windows.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run tests/windowsHooks.test.ts`
Expected: FAIL because the Windows quota/quoter and doctor checks do not exist.

- [ ] **Step 3: Implement quoting and doctor checks**

Use a Windows command builder with this behavior:

```ts
export function windowsHookCommand(nodePath: string, cliPath: string, agent: "claude" | "qoder"): string {
  const quote = (value: string): string => {
    if (value.includes('"')) throw new Error("path contains an unsupported quote");
    return `"${value}"`;
  };
  return `${quote(nodePath)} ${quote(cliPath)} hook ${agent}`;
}
```

Use it when `process.platform === "win32"`; keep the existing macOS `shellQuote` output unchanged. Update `doctor` to report Windows ACL, Task Scheduler, firewall, and mDNS status; Qoder detail explicitly includes `real-app gate NOT RUN`. Platform-gate launchd/mode/symlink test assertions:

- `process.platform === "win32"`: skip symlink creation tests and mode-bit assertions; run Windows ACL/command tests instead.
- `process.platform === "darwin"`: keep all existing assertions.
- Do not mark a test skipped if it can be converted to a platform-specific assertion.

- [ ] **Step 4: Run the affected test suite and commit**

Run: `npx vitest run tests/windowsHooks.test.ts tests/claudeInstall.test.ts tests/qoderInstall.test.ts tests/cli.test.ts tests/doctor.test.ts tests/server.test.ts`
Expected: PASS on macOS with Windows tests gated; Windows-specific tests run in Task 8 CI.

```bash
git add src/cli.ts src/doctor.ts src/adapters tests/windowsHooks.test.ts tests/claudeInstall.test.ts tests/qoderInstall.test.ts tests/cli.test.ts tests/doctor.test.ts tests/server.test.ts
git commit -m "fix: make hooks and doctor Windows-aware"
```

---

### Task 8: Windows CI matrix and integration smoke

**Files:**
- Modify: `.github/workflows/ci.yml`, `package.json`
- Create: `scripts/windows-integration.mjs`
- Test: `scripts/windows-integration.mjs` is the Windows CI producer; add `test:windows-integration` script

**Interfaces:**
- Consumes: all adapters from Tasks 1-7
- Produces: macOS+Windows CI; a Windows integration test that cleans up temporary task/rules/ACL

- [ ] **Step 1: Add the failing Windows integration script**

Create `scripts/windows-integration.mjs` with this top-level shape:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "win32") {
  console.log("SKIP non-Windows");
  process.exit(0);
}

const home = mkdtempSync(join(tmpdir(), "pocketpet-win-integration-"));
const taskName = `PocketPet Test ${process.pid}`;
const ruleName = `PocketPet Test Rule ${process.pid}`;
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: "pipe" });

try {
  const { ensureConfig } = await import("../dist/config.js");
  ensureConfig(home);
  const acl = run("icacls", [join(home, "config.json")]);
  if (/BUILTIN\\Users|Everyone|NT AUTHORITY\\SYSTEM/i.test(acl)) {
    throw new Error("config ACL contains a non-owner entry");
  }
  run("schtasks.exe", ["/Create", "/TN", taskName, "/SC", "ONCE", "/ST", "23:59", "/TR", "cmd.exe /c exit 0", "/F"]);
  run("schtasks.exe", ["/Query", "/TN", taskName]);
  run("netsh", ["advfirewall", "firewall", "add", "rule", `name=${ruleName}`, "dir=in", "action=allow", "protocol=TCP", "localport=59999", "profile=private"]);
  run("netsh", ["advfirewall", "firewall", "show", "rule", `name=${ruleName}`]);
  console.log("PASS windows integration");
} finally {
  try { run("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]); } catch {}
  try { run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${ruleName}`]); } catch {}
  rmSync(home, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run it locally and record the expected environment**

Run: `node scripts/windows-integration.mjs` on Windows; on macOS it must skip with exit 0 and `SKIP non-Windows`. Expected macOS: SKIP; Windows: PASS after implementation.

- [ ] **Step 3: Add the CI matrix**

Replace the single `test` job with:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [macos-latest, windows-latest]
runs-on: ${{ matrix.os }}
```

Keep `actions/checkout`, Node 20, `npm ci`, `npm test`, `npm run build`, `npm run typecheck`, `npx playwright install chromium`, `npx playwright test`. Add a Windows-only step `node scripts/windows-integration.mjs`.

- [ ] **Step 4: Add platform-gated E2E/test updates**

Ensure the Windows job runs the existing Playwright suite. Update setup/server tests that assume macOS service status; assert the Windows status adapter result. Run on macOS:

`npm run typecheck && npx vitest run && npx playwright test`
Expected: all existing tests pass; Windows-specific branches are covered by the Windows job.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json scripts/windows-integration.mjs tests
git commit -m "ci: add Windows coverage and integration smoke"
```

---

### Task 9: Windows docs, acceptance record, and probe

**Files:**
- Modify: `README.md`, `README.zh-Hans.md`, `SECURITY.md`
- Create: `docs/acceptance/windows-support.md`
- Create/Modify: `scripts/windows-acceptance.ps1`
- Test: `scripts/windows-acceptance.ps1` is the manual probe; no automated assertions

**Interfaces:**
- Consumes: built bridge plus installed service/firewall
- Produces: per-OS support docs; real-machine evidence template; token-free probe output

- [ ] **Step 1: Write the probe**

`scripts/windows-acceptance.ps1` must only read:
- Windows version and architecture; the build number decides Windows 10/11 because the registry `ProductName` can still say "Windows 10" on Windows 11,
- Node version,
- config path existence and `icacls` ACL entries (no file contents),
- `Get-ScheduledTask -TaskName "PocketPet Bridge"` for the locale-independent State; `Get-ScheduledTaskInfo` last result/run time is probe diagnostics only, and `schtasks /Query` is a manual fallback,
- `Get-NetFirewallRule -DisplayName` with `Get-NetFirewallPortFilter`/`Get-NetFirewallApplicationFilter` for both rules (enabled, direction, action, profile, protocol, local port, program),
- `Invoke-WebRequest http://127.0.0.1:<port>/health` (no token),
- a direct multicast DNS A query for `<hostname>.local`, with `Resolve-DnsName` as an indicative fallback; report `NOT RUN` only when the query cannot run,
- a final JSON summary with `PASS`, `FAIL`, `NOT RUN`, and a process exit code of 1 when any gate is `FAIL`.

It must never print config content or the token. This method list was corrected after implementation: the shipped probe uses the cmdlets above, not `schtasks /Query` or `netsh advfirewall firewall show rule`.

- [ ] **Step 2: Update README and security docs**

Add a per-OS table:
- macOS: current support.
- Windows 11 x64: bridge, phone page, Studio, hooks, Task Scheduler, `.local`, current-user ACL, private firewall.
- Linux: best-effort bridge only; no service/`.local`/ACL claim.
- Windows 10/ARM: compatibility/NOT claimed.

Document one UAC, firewall/private network, `.local` mDNS, service commands, logs, ACL admin/backup caveat, and the Windows 10 best-effort gate. Keep Qoder `NOT RUN`.

- [ ] **Step 3: Create the acceptance template**

`docs/acceptance/windows-support.md` lists every manual gate from the spec, with columns `Gate`, `Environment`, `Result`, `Evidence`. Start every unexecuted gate as `NOT RUN`; do not infer from CI.

- [ ] **Step 4: Run documentation checks and commit**

Run: `git diff --check && npm run typecheck`
Expected: clean.

```bash
git add README.md README.zh-Hans.md SECURITY.md docs/acceptance/windows-support.md scripts/windows-acceptance.ps1
git commit -m "docs: document Windows 11 support and acceptance"
```

---

### Task 10: Real Windows 10 compatibility gate

**Files:**
- Modify: `docs/acceptance/windows-support.md` only
- Use: `scripts/windows-acceptance.ps1`
- Test: manual real-machine gate; no code changes in this task

**Interfaces:**
- Consumes: the feature-complete branch and probe
- Produces: real Windows 10 evidence; official Windows 11 x64 support remains the only claimed matrix

The available desktop is Windows 10; this gate is compatibility evidence only. The official Windows 11 x64 gate remains `NOT RUN` until a Windows 11 host is available. Do not promote Windows 10 or Windows 11 to PASS from unit/E2E/CI alone.

- [ ] **Step 1: Prepare the Windows desktop**

On the available Windows 10 22H2 x64 desktop, use a temporary home such as `%TEMP%\pocketpet-win10-gate` and a clean checkout of `feat/windows-support`:

```powershell
git clone https://github.com/HappyLiang12/pocketpet.git
cd pocketpet
git switch feat/windows-support
node --version   # record; the issue gate expects Node 24.x, CI covers Node 20
npm ci
npm run build
npm link
$env:POCKETPET_HOME = "$env:TEMP\pocketpet-win10-gate"
```

The tester must approve the UAC prompt and any Windows Firewall prompt. Do not paste the pairing token into chat or logs.

- [ ] **Step 2: Run the foreground and service paths**

Foreground:

```powershell
pocketpet up --no-hooks --no-service --no-open
```

Service:

```powershell
pocketpet up --no-hooks --no-open --yes
pocketpet service status
```

Record the OS version, Node version, task status, and firewall rule names. Verify the log contains no token.

- [ ] **Step 3: Run the phone and `.local` gates**

On the same WiFi:
- Scan the IP QR from iPhone and Android; verify the phone page, clock/pet, Studio, and session card.
- Open the displayed `<hostname>.local` URL from both phones.
- If `.local` fails, record it as a compatibility failure; do not claim it passed.

- [ ] **Step 4: Run the probe and inspect ACL**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-acceptance.ps1 -Port 7788
icacls "$env:POCKETPET_HOME\config.json"
```

Confirm `icacls` shows only the current user SID and no inherited entries. Do not print the config contents.

- [ ] **Step 5: Uninstall and clean up**

```powershell
pocketpet service uninstall
Remove-Item -Recurse -Force "$env:TEMP\pocketpet-win10-gate"
```

Verify the task and both firewall rules are gone.

- [ ] **Step 6: Record the compatibility result**

Update `docs/acceptance/windows-support.md` with exact evidence. If Windows 10 fails, record the failing gate and stop; do not broaden official support or start speculative fixes without approval. If it passes, record Windows 10 as “tested best-effort; official support remains Windows 11 x64.”

Commit only the acceptance record:

```bash
git add docs/acceptance/windows-support.md
git commit -m "docs: record the Windows 10 compatibility gate"
```
