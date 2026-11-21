import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { languageNames, setupCopy, type Lang } from "./i18n.js";
import { urlsForPort } from "./net.js";

export type CommandRunner = (command: string, args: string[]) => string;
export type InterfaceMap = NonNullable<Parameters<typeof urlsForPort>[2]>;
export type QrHost = "ip" | "local";

export type PairingLinksOptions = {
  interfaces?: InterfaceMap;
  hostname?: string | null;
  qrHost?: QrHost;
};

export type PairingLinks = {
  ipUrls: string[];
  localUrl: string | null;
  qrUrl: string | null;
  /** Loopback URL for the USB (`adb reverse`) fallback; always carries the token. */
  usbUrl: string;
};

export type SetupHtmlInput = {
  qrSvg: string;
  ipUrls: string[];
  localUrl: string | null;
  port: number;
  /** Overrides the USB fallback URL; the setup route passes the tokenized one. */
  usbUrl?: string | null;
  /** Page language; defaults to English. */
  lang?: Lang;
  /** Bonjour name used for the `.local` URL and the debug section. */
  hostname?: string | null;
};

export type Asker = (question: string) => Promise<string>;

function runCommand(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** macOS Bonjour host name, normalized to end in `.local`; null when scutil fails. */
export function localHostname(run: CommandRunner = runCommand): string | null {
  try {
    const name = run("scutil", ["--get", "LocalHostName"]).trim();
    if (!name) return null;
    return name.endsWith(".local") ? name : `${name}.local`;
  } catch {
    return null;
  }
}

function pairingUrl(hostname: string, port: number, token: string): string {
  return `http://${hostname}:${port}/?token=${encodeURIComponent(token)}`;
}

/**
 * LAN pairing URLs. The QR defaults to the first IP address; `qrHost: "local"`
 * selects the Bonjour name instead when one is known.
 */
export function pairingLinks(port: number, token: string, opts: PairingLinksOptions = {}): PairingLinks {
  const ipUrls = urlsForPort(port, token, opts.interfaces);
  const hostname = opts.hostname?.trim();
  const localUrl = hostname ? pairingUrl(hostname, port, token) : null;
  const qrUrl = opts.qrHost === "local" && localUrl ? localUrl : (ipUrls[0] ?? null);
  const usbUrl = pairingUrl("127.0.0.1", port, token);
  return { ipUrls, localUrl, qrUrl, usbUrl };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tokenFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}

/**
 * Which host the QR encodes. The server renders the QR from the first IP URL
 * (pairingLinks defaults to `qrHost: "ip"`), so no SVG means no QR at all.
 */
function qrHostKind(qrSvg: string, ipUrls: string[], localUrl: string | null): QrHost | "none" {
  if (!qrSvg) return "none";
  if (ipUrls.length > 0) return "ip";
  return localUrl ? "local" : "none";
}

function fontStack(lang: Lang): string {
  if (lang === "zh-Hant") return '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif';
  if (lang === "zh-Hans") return '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif';
  return "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
}

/** Self-contained pairing page in one of three languages. `qrSvg` is trusted (rendered by qrcode). */
export function setupHtml(input: SetupHtmlInput): string {
  const { qrSvg, ipUrls, localUrl, port, hostname } = input;
  const lang = input.lang ?? "en";
  const copy = setupCopy[lang];
  const ipItems =
    ipUrls.length > 0
      ? ipUrls.map((url) => `        <li><code>${escapeHtml(url)}</code></li>`).join("\n")
      : `        <li>${copy.noIpNote}</li>`;
  const localSection = localUrl
    ? `      <h2>${copy.localHeading}</h2>
      <p>${copy.localBody}</p>
      <ul>
        <li><code>${escapeHtml(localUrl)}</code></li>
      </ul>`
    : "";
  const token = tokenFromUrl(ipUrls[0]) ?? tokenFromUrl(localUrl);
  const usbUrl =
    input.usbUrl ??
    (token
      ? `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
      : `http://127.0.0.1:${port}/`);
  const qrSection = qrSvg
    ? `  <p class="lead">${copy.leadQr}</p>
  <div class="qr">${qrSvg}</div>`
    : `  <p class="lead">${copy.leadNoQr}</p>`;
  const scanStep = qrSvg
    ? `    <li>${copy.stepScan}</li>`
    : `    <li>${copy.stepOpenUrl}</li>`;
  const usbOpen = copy.usbOpen.replace("{usbUrl}", escapeHtml(usbUrl));
  const hostnameText = hostname?.trim() || copy.debugUnknown;
  const langLinks = (Object.keys(languageNames) as Lang[])
    .map((code) => `    <a href="?lang=${code}"${code === lang ? ' aria-current="page"' : ""}>${languageNames[code]}</a>`)
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.htmlTitle}</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    background: #f6f4ef;
    color: #24211c;
    font-family: ${fontStack(lang)};
    line-height: 1.6;
  }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  h2 { font-size: 1.1rem; margin: 28px 0 8px; }
  .lead { margin: 0 0 20px; color: #57514a; }
  .lang { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.9rem; margin: 0 0 20px; }
  .lang a { color: #57514a; }
  .lang a[aria-current="page"] { color: #24211c; font-weight: 600; text-decoration: none; }
  .qr {
    background: #fff;
    border-radius: 16px;
    padding: 16px;
    text-align: center;
    box-shadow: 0 2px 12px rgb(0 0 0 / 8%);
  }
  .qr svg { display: block; width: min(100%, 340px); height: auto; margin: 0 auto; }
  ol { padding-left: 1.4rem; }
  li { margin: 6px 0; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.88rem;
    overflow-wrap: anywhere;
  }
  ul { list-style: none; padding: 0; }
  ul li { background: #fff; border-radius: 10px; padding: 10px 12px; margin: 8px 0; }
  .usb { border-top: 1px solid #ddd6c8; margin-top: 32px; }
  .troubleshoot { border-top: 1px solid #ddd6c8; margin-top: 28px; padding-top: 8px; }
  .debug { border-top: 1px solid #ddd6c8; margin-top: 28px; padding-top: 8px; }
  pre { background: #24211c; color: #f6f4ef; border-radius: 10px; padding: 12px; overflow-x: auto; }
  pre code { font-size: 0.85rem; }
  .note { color: #6b655d; font-size: 0.9rem; margin-top: 28px; }
  @media (prefers-color-scheme: dark) {
    body { background: #171512; color: #f3efe7; }
    .lead, .note, .lang a { color: #b3aca2; }
    .lang a[aria-current="page"] { color: #f3efe7; }
    .qr, ul li { background: #24211c; }
    .usb, .troubleshoot, .debug { border-color: #3a352e; }
  }
</style>
</head>
<body>
<main>
  <nav class="lang" aria-label="${copy.languageHeading}">
${langLinks}
  </nav>
  <h1>${copy.heading}</h1>
${qrSection}

  <h2>${copy.stepsHeading}</h2>
  <ol>
    <li>${copy.stepWifi}</li>
${scanStep}
    <li>${copy.stepHomeScreen}</li>
  </ol>

  <h2>${copy.lanHeading}</h2>
  <ul>
${ipItems}
  </ul>
${localSection}
  <section class="usb">
    <h2>${copy.usbHeading}</h2>
    <p>${copy.usbBody}</p>
    <pre><code>adb reverse tcp:${port} tcp:${port}</code></pre>
    <p>${usbOpen}</p>
  </section>

  <section class="troubleshoot">
    <h2>${copy.troubleshootHeading}</h2>
    <ul>
      <li>${copy.troubleshootRetries}</li>
      <li>${copy.troubleshootUnauthorized}</li>
      <li>${copy.troubleshootMacOnly}</li>
      <li>${copy.troubleshootUnreachable}</li>
    </ul>
  </section>

  <section class="debug">
    <h2>${copy.debugHeading}</h2>
    <ul>
      <li><strong>${copy.debugPort}</strong>: <code>${port}</code></li>
      <li><strong>${copy.debugHostname}</strong>: <code>${escapeHtml(hostnameText)}</code></li>
      <li><strong>${copy.debugQrHost}</strong>: <code>${qrHostKind(qrSvg, ipUrls, localUrl)}</code></li>
      <li><strong>${copy.debugScope}</strong>: ${copy.debugScopeValue}</li>
      <li><strong>${copy.debugQrValidity}</strong>: ${copy.debugQrValidityValue}</li>
    </ul>
  </section>

  <p class="note">${copy.reusableNote}</p>
  <p class="note">${copy.macOnlyNote}</p>
</main>
</body>
</html>
`;
}

/** Shown when /setup is opened from a phone or a non-loopback Host. Contains no token. */
export function setupDeniedHtml(port: number, lang: Lang = "en"): string {
  const copy = setupCopy[lang];
  const setupUrl = `http://127.0.0.1:${port}/setup`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.deniedHtmlTitle}</title>
<style>
  body {
    margin: 0;
    padding: 40px 20px;
    background: #f6f4ef;
    color: #24211c;
    font-family: ${fontStack(lang)};
    line-height: 1.7;
  }
  main { max-width: 520px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 12px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  .note { color: #6b655d; font-size: 0.92rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #171512; color: #f3efe7; }
    .note { color: #b3aca2; }
  }
</style>
</head>
<body>
<main>
  <h1>${copy.deniedHeading}</h1>
  <p>${copy.deniedBody.replace("{setupUrl}", escapeHtml(setupUrl))}</p>
  <p class="note">${copy.deniedNote}</p>
</main>
</body>
</html>
`;
}

async function readlineAsker(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/** Ask a yes/no question; non-TTY callers get the default without a prompt. */
export async function askYesNo(
  question: string,
  defaultYes: boolean,
  tty: boolean,
  ask: Asker = readlineAsker,
): Promise<boolean> {
  if (!tty) return defaultYes;
  const label = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(`${question} ${label} `)).trim().toLowerCase();
  if (answer === "y" || answer === "yes") return true;
  if (answer === "n" || answer === "no") return false;
  return defaultYes;
}
