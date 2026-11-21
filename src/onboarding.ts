import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
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

/** Self-contained Traditional Chinese pairing page. `qrSvg` is trusted (rendered by qrcode). */
export function setupHtml(input: SetupHtmlInput): string {
  const { qrSvg, ipUrls, localUrl, port } = input;
  const ipItems =
    ipUrls.length > 0
      ? ipUrls.map((url) => `        <li><code>${escapeHtml(url)}</code></li>`).join("\n")
      : `        <li>搵唔到區網 IP 位址。請確認 Mac 已連上同一個 Wi-Fi。</li>`;
  const localSection = localUrl
    ? `      <h2>穩定網址（Bonjour）</h2>
      <p>如果 IP 位址成日轉，可以用呢個 <code>.local</code> 網址：</p>
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
    ? `  <p class="lead">用手機相機掃描下面嘅 QR code，就可以喺瀏覽器打開 PocketPet。</p>
  <div class="qr">${qrSvg}</div>`
    : `  <p class="lead">QR code 暫時無法產生（伺服器未能建立）。你仍然可以用下面嘅區網網址，或者用 USB 連接打開 PocketPet。</p>`;
  const scanStep = qrSvg
    ? `    <li><strong>用相機掃描</strong>：打開手機相機，對準上面嘅 QR code。</li>`
    : `    <li><strong>開啟網址</strong>：喺手機瀏覽器打開上面其中一個區網網址。</li>`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PocketPet 配對</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 24px 16px 48px;
    background: #f6f4ef;
    color: #24211c;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif;
    line-height: 1.6;
  }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  h2 { font-size: 1.1rem; margin: 28px 0 8px; }
  .lead { margin: 0 0 20px; color: #57514a; }
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
  pre { background: #24211c; color: #f6f4ef; border-radius: 10px; padding: 12px; overflow-x: auto; }
  pre code { font-size: 0.85rem; }
  .note { color: #6b655d; font-size: 0.9rem; margin-top: 28px; }
  @media (prefers-color-scheme: dark) {
    body { background: #171512; color: #f3efe7; }
    .lead, .note { color: #b3aca2; }
    .qr, ul li { background: #24211c; }
    .usb, .troubleshoot { border-color: #3a352e; }
  }
</style>
</head>
<body>
<main>
  <h1>PocketPet 配對</h1>
${qrSection}

  <h2>三步完成配對</h2>
  <ol>
    <li><strong>同一個 Wi-Fi</strong>：確認 Mac 同手機連住同一個 Wi-Fi 網絡。</li>
${scanStep}
    <li><strong>加到主畫面</strong>：喺瀏覽器選單揀「加到主畫面」，之後一開即用。</li>
  </ol>

  <h2>區網網址</h2>
  <ul>
${ipItems}
  </ul>
${localSection}
  <section class="usb">
    <h2>唔同 Wi-Fi？用 USB 線</h2>
    <p>用 USB 線連接手機同 Mac，然後喺電腦執行：</p>
    <pre><code>adb reverse tcp:${port} tcp:${port}</code></pre>
    <p>再用手機開 <code>${escapeHtml(usbUrl)}</code>。</p>
  </section>

  <section class="troubleshoot">
    <h2>手機連唔到？</h2>
    <ul>
      <li><strong>ERR_TOO_MANY_RETRIES／ERR_SSL_PROTOCOL_ERROR</strong>：Chrome／Edge 嘅「Always use secure connections（永遠使用安全連線）」或 VPN 會將 <code>http</code> 升級做 <code>https</code>。關閉該設定，或改用 Safari／Firefox；iPhone 亦要關 VPN／iCloud Private Relay。</li>
      <li><strong>unauthorized</strong>：你開咗冇 token 嘅 <code>/</code>。請掃 QR，或用上面列出嘅帶 token 網址。</li>
      <li><strong>配對頁只限 Mac</strong>：<code>/setup</code> 只供 Mac；手機請掃 QR。</li>
      <li><strong>完全連唔到</strong>：確認手機同 Mac 同一個 Wi-Fi／subnet（guest network／AP isolation 唔得）；必要時用上面的 USB <code>adb reverse</code>。</li>
    </ul>
  </section>

  <p class="note"><strong>同一個 QR 可以重複使用</strong>：每部手機各自掃一次，直到你更改 token 為止。</p>
  <p class="note">配對頁只供 Mac 開啟；手機唔需要開 <code>/setup</code>。配對後手機地址欄只剩 <code>/</code>，嗰個 URL 冇 token，唔好分享俾其他人——要加新手機，請返嚟呢一頁掃 QR。</p>
</main>
</body>
</html>
`;
}

/** Shown when /setup is opened from a phone or a non-loopback Host. Contains no token. */
export function setupDeniedHtml(port: number): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PocketPet 配對頁只限 Mac</title>
<style>
  body {
    margin: 0;
    padding: 40px 20px;
    background: #f6f4ef;
    color: #24211c;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif;
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
  <h1>配對頁只限 Mac</h1>
  <p>呢個配對頁只可以喺 Mac 本機開啟。請喺 Mac 開 <code>http://127.0.0.1:${port}/setup</code>（或執行 <code>pocketpet up</code>），然後用手機相機掃描頁面上嘅 QR。</p>
  <p class="note">每部手機各自掃一次；同一個 QR 可以重複使用，直到你更改 token。手機唔需要開 <code>/setup</code>。</p>
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
