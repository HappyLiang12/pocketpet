import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Appearance } from "./appearance.js";
import type { HostInfo } from "./host.js";
import { languageNames, setupCopy, type Lang } from "./i18n.js";
import type { QrHost } from "./onboarding.js";

export type SetupAssets = { js: string; css: string[] };

export type SetupPageInput = {
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
  assets: SetupAssets;
  host: HostInfo;
  serviceRunning: boolean | null;
  logPath: string;
  appearance: Appearance;
};

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

/**
 * Resolves the hashed setup entry from the Vite manifest. Returns empty values
 * when the build or manifest entry is missing so the shell stays usable.
 */
export function setupAssets(webDist: string): SetupAssets {
  try {
    const manifest = JSON.parse(readFileSync(join(webDist, "manifest.json"), "utf8")) as Record<string, { file?: unknown; css?: unknown; isEntry?: unknown }>;
    const entry = Object.values(manifest).find((item) =>
      item.isEntry === true && typeof item.file === "string" && item.file.includes("setup")
    );
    if (!entry || typeof entry.file !== "string") return { js: "", css: [] };
    const css = Array.isArray(entry.css) ? entry.css.filter((value): value is string => typeof value === "string") : [];
    return { js: `/assets/web/${entry.file}`, css: css.map((file) => `/assets/web/${file}`) };
  } catch {
    return { js: "", css: [] };
  }
}

/** Server-rendered setup dashboard. QR SVG is trusted (rendered by qrcode). */
export function setupPageHtml(input: SetupPageInput): string {
  const { qrSvg, ipUrls, localUrl, port, assets, host, serviceRunning, logPath, appearance } = input;
  const lang = input.lang ?? "en";
  const copy = setupCopy[lang];
  const token = tokenFromUrl(ipUrls[0]) ?? tokenFromUrl(localUrl);
  const usbUrl =
    input.usbUrl ??
    (token
      ? `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`
      : `http://127.0.0.1:${port}/`);
  const openPhoneUrl = ipUrls[0] ?? usbUrl;
  const usbOpen = copy.usbOpen.replace("{usbUrl}", escapeHtml(usbUrl));

  const ipItems =
    ipUrls.length > 0
      ? ipUrls
          .map(
            (url, index) =>
              `        <li class="url-row"><code id="pair-lan-${index}">${escapeHtml(url)}</code><button type="button" class="button copy-button" data-copy-target="pair-lan-${index}">${copy.copyCommand}</button></li>`,
          )
          .join("\n")
      : `        <li>${copy.noIpNote}</li>`;
  const localSection = localUrl
    ? `      <h3>${copy.localHeading}</h3>
      <p>${copy.localBody}</p>
      <ul class="url-list">
        <li class="url-row"><code id="pair-local-url">${escapeHtml(localUrl)}</code><button type="button" class="button copy-button" data-copy-target="pair-local-url">${copy.copyCommand}</button></li>
      </ul>`
    : "";
  const qrSection = qrSvg
    ? `    <p class="lead">${copy.leadQr}</p>
    <div class="qr">${qrSvg}</div>`
    : `    <p class="lead">${copy.leadNoQr}</p>`;
  const scanStep = qrSvg
    ? `      <li>${copy.stepScan}</li>`
    : `      <li>${copy.stepOpenUrl}</li>`;
  const hostnameText = input.hostname?.trim() || copy.debugUnknown;
  const langLinks = (Object.keys(languageNames) as Lang[])
    .map(
      (code) =>
        `        <a href="?lang=${code}"${code === lang ? ' aria-current="page"' : ""}>${languageNames[code]}</a>`,
    )
    .join("\n");
  const serviceValue =
    serviceRunning === null
      ? copy.serviceUnavailable
      : serviceRunning
        ? copy.serviceRunning
        : copy.serviceNotRunning;
  const serviceDot =
    serviceRunning === null ? "" : serviceRunning ? " status-success" : " status-warning";
  const diagnostics = `${copy.portLabel} ${port} · ${copy.hostOsLabel} ${escapeHtml(host.os)} ${escapeHtml(host.osVersion)} · ${copy.bridgeVersionLabel} v${escapeHtml(host.bridgeVersion)} · ${copy.logPathLabel} ${escapeHtml(logPath)}`;
  const cssLinks = assets.css.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n");
  const scriptTag = assets.js ? `<script type="module" src="${escapeHtml(assets.js)}"></script>` : "";

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${copy.htmlTitle}</title>
${cssLinks}
<noscript><style>.copy-button { display: none; }</style></noscript>
${scriptTag}
</head>
<body>
<header class="setup-header">
  <div class="wordmark">PocketPet</div>
  <div class="host-badge" data-host-os>${copy.hostThisComputer} · ${escapeHtml(host.os)}</div>
  <div class="version"><span class="label">${copy.hostVersion}</span> v${escapeHtml(host.bridgeVersion)}</div>
  <div class="bridge-status"><span class="status-dot status-success" aria-hidden="true"></span>${copy.bridgeRunning} · ${copy.serviceRunning}</div>
  <nav class="language-links" aria-label="${copy.languageHeading}">
${langLinks}
  </nav>
</header>
<nav class="setup-tabs" aria-label="${copy.navSections}">
  <a href="#pair">${copy.navPair}</a>
  <a href="#look">${copy.navLook}</a>
  <a href="#system">${copy.navSystem}</a>
</nav>
<main class="setup-main" id="main">
  <h1 class="setup-title">${copy.heading}</h1>
  <section id="pair" class="setup-card card">
    <h2>${copy.navPair}</h2>
${qrSection}
    <p class="pair-actions">
      <a class="button button-primary" href="${escapeHtml(openPhoneUrl)}" target="_blank" rel="noreferrer">${copy.openPhoneView}</a>
    </p>

    <h3>${copy.stepsHeading}</h3>
    <ol>
      <li>${copy.stepWifi}</li>
${scanStep}
      <li>${copy.stepHomeScreen}</li>
    </ol>

    <h3>${copy.lanHeading}</h3>
    <ul class="url-list">
${ipItems}
    </ul>
${localSection}
    <section class="usb">
      <h3>${copy.usbHeading}</h3>
      <p>${copy.usbBody}</p>
      <div class="command-row">
        <pre><code>adb reverse tcp:${port} tcp:${port}</code></pre>
      </div>
      <p>${usbOpen}</p>
      <button type="button" class="button copy-button" data-copy-target="pair-usb-url">${copy.copyCommand}</button>
    </section>

    <section class="troubleshoot">
      <h3>${copy.troubleshootHeading}</h3>
      <ul>
        <li>${copy.troubleshootRetries}</li>
        <li>${copy.troubleshootUnauthorized}</li>
        <li>${copy.computerOnlyNote}</li>
        <li>${copy.troubleshootUnreachable}</li>
      </ul>
    </section>

    <details class="debug">
      <summary>${copy.debugHeading}</summary>
      <ul>
        <li><strong>${copy.debugPort}</strong>: <code>${port}</code></li>
        <li><strong>${copy.debugHostname}</strong>: <code>${escapeHtml(hostnameText)}</code></li>
        <li><strong>${copy.debugQrHost}</strong>: <code>${qrHostKind(qrSvg, ipUrls, localUrl)}</code></li>
        <li><strong>${copy.debugScope}</strong>: ${copy.debugScopeValue}</li>
        <li><strong>${copy.debugQrValidity}</strong>: ${copy.debugQrValidityValue}</li>
      </ul>
    </details>

    <p class="note">${copy.reusableNote}</p>
  </section>

  <section id="look" class="setup-card card">
    <h2>${copy.lookHeading}</h2>
    <div id="look-app">
      <div class="look-fallback">
        <p>${copy.lookEnableJavaScript}</p>
        <dl class="look-fallback-summary">
          <dt>${copy.lookClock}</dt><dd>${appearance.clock.scale}%</dd>
          <dt>${copy.lookPetSize}</dt><dd>${appearance.pet.scale}%</dd>
          <dt>${copy.lookLayout}</dt><dd>${escapeHtml(appearance.layout.mode)} · ${appearance.layout.gap}</dd>
        </dl>
        <button type="button" class="button" disabled>${copy.lookOpenStudio}</button>
      </div>
    </div>
  </section>

  <section id="system" class="setup-card card">
    <h2>${copy.systemHeading}</h2>
    <dl class="system-list">
      <div class="system-row"><dt>${copy.bridgeRunning}</dt><dd><span class="status-dot status-success" aria-hidden="true"></span>${copy.serviceRunning}</dd></div>
      <div class="system-row"><dt>${copy.portLabel}</dt><dd>${port}</dd></div>
      <div class="system-row"><dt>${copy.bridgeVersionLabel}</dt><dd>v${escapeHtml(host.bridgeVersion)}</dd></div>
      <div class="system-row"><dt>${copy.hostOsLabel}</dt><dd>${escapeHtml(host.os)} ${escapeHtml(host.osVersion)}</dd></div>
      <div class="system-row"><dt>${copy.loginServiceLabel}</dt><dd><span class="status-dot${serviceDot}" aria-hidden="true"></span>${serviceValue}</dd></div>
      <div class="system-row"><dt>${copy.scopeLabel}</dt><dd>${copy.loopbackOnly}</dd></div>
      <div class="system-row"><dt>${copy.logPathLabel}</dt><dd><code>${escapeHtml(logPath)}</code></dd></div>
    </dl>
    <p class="diagnostics" id="system-diagnostics">${diagnostics}</p>
    <button type="button" class="button copy-button" data-copy-target="system-diagnostics">${copy.copyDiagnostics}</button>

    <h3>${copy.commandsHeading}</h3>
    <div class="command-row">
      <pre><code id="service-status-command">pocketpet service status</code></pre>
      <button type="button" class="button copy-button" data-copy-target="service-status-command">${copy.copyCommand}</button>
    </div>
    <div class="command-row">
      <pre><code id="service-install-command">pocketpet service install</code></pre>
      <button type="button" class="button copy-button" data-copy-target="service-install-command">${copy.copyCommand}</button>
    </div>
  </section>
</main>
<noscript><p class="noscript">${copy.noJsNote}</p></noscript>
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
