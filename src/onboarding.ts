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
};

export type SetupHtmlInput = {
  qrSvg: string;
  ipUrls: string[];
  localUrl: string | null;
  port: number;
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
  return { ipUrls, localUrl, qrUrl };
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
  const usbUrl = token
    ? `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
    : `http://127.0.0.1:${port}/`;

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FoldPet 配對</title>
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
  pre { background: #24211c; color: #f6f4ef; border-radius: 10px; padding: 12px; overflow-x: auto; }
  pre code { font-size: 0.85rem; }
  .note { color: #6b655d; font-size: 0.9rem; margin-top: 28px; }
  @media (prefers-color-scheme: dark) {
    body { background: #171512; color: #f3efe7; }
    .lead, .note { color: #b3aca2; }
    .qr, ul li { background: #24211c; }
    .usb { border-color: #3a352e; }
  }
</style>
</head>
<body>
<main>
  <h1>FoldPet 配對</h1>
  <p class="lead">用手機相機掃描下面嘅 QR code，就可以喺瀏覽器打開 FoldPet。</p>
  <div class="qr">${qrSvg}</div>

  <h2>三步完成配對</h2>
  <ol>
    <li><strong>同一個 Wi-Fi</strong>：確認 Mac 同手機連住同一個 Wi-Fi 網絡。</li>
    <li><strong>用相機掃描</strong>：打開手機相機，對準上面嘅 QR code。</li>
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

  <p class="note">QR code 預設用 IP 位址，方便大部分手機直接連線；配對網址入面嘅 token 就係開機憑證，唔好分享俾其他人。</p>
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
