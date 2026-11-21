/** Languages shipped by the setup page and the CLI pairing output. */
export type Lang = "en" | "zh-Hant" | "zh-Hans";

/** Native labels for the setup page language switcher. */
export const languageNames: Record<Lang, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
};

const QUERY_LANGUAGES: Record<string, Lang> = {
  en: "en",
  "zh-hant": "zh-Hant",
  "zh-hans": "zh-Hans",
};

/** Maps one lower-cased Accept-Language tag to a supported language, or null. */
function fromAcceptTag(tag: string): Lang | null {
  if (tag === "en" || tag.startsWith("en-")) return "en";
  if (tag === "zh-cn" || tag === "zh-sg" || tag === "zh-hans" || tag.startsWith("zh-hans-")) return "zh-Hans";
  if (tag.startsWith("zh-")) return "zh-Hant";
  return null;
}

/**
 * Resolves the setup/CLI language. An explicit `?lang=` value wins; otherwise
 * the first supported Accept-Language tag in order decides, defaulting to
 * English. POSIX locales (`zh_TW.UTF-8`) are normalized so `LANG` works too.
 */
export function pickLanguage(acceptLanguage: string | null | undefined, query?: string | null): Lang {
  const requested = query?.trim().toLowerCase();
  if (requested) {
    const match = QUERY_LANGUAGES[requested];
    if (match) return match;
  }
  for (const entry of (acceptLanguage ?? "").split(",")) {
    const raw = entry.split(";")[0]?.trim().toLowerCase();
    if (!raw) continue;
    const tag = raw.replaceAll("_", "-").split(".")[0]!.split("@")[0]!;
    const match = fromAcceptTag(tag);
    if (match) return match;
  }
  return "en";
}

// English is the reference dictionary; the other two must provide every key.
const enSetup = {
  htmlTitle: "PocketPet Setup",
  heading: "PocketPet Setup",
  languageHeading: "Language",
  leadQr: "Scan the QR code below with your phone camera to open PocketPet in the browser.",
  leadNoQr:
    "The QR code could not be generated right now (the server failed to create it). You can still use one of the LAN URLs below, or connect over USB to open PocketPet.",
  stepsHeading: "Pair in three steps",
  stepWifi: "<strong>Same Wi-Fi</strong>: make sure the Mac and the phone are on the same Wi-Fi network.",
  stepScan: "<strong>Scan with the camera</strong>: open the phone camera and point it at the QR code above.",
  stepOpenUrl: "<strong>Open the URL</strong>: open one of the LAN URLs above in your phone browser.",
  stepHomeScreen:
    "<strong>Add to Home Screen</strong>: choose \u201cAdd to Home Screen\u201d in the browser menu to open it like an app.",
  lanHeading: "LAN URLs",
  noIpNote: "No LAN IP address found. Make sure the Mac is on the same Wi-Fi.",
  localHeading: "Stable address (Bonjour)",
  localBody: "If the IP address keeps changing, use this <code>.local</code> URL:",
  usbHeading: "Different Wi-Fi? Use a USB cable",
  usbBody: "Connect the phone to the Mac with a USB cable, then run this on the computer:",
  usbOpen: "Then open <code>{usbUrl}</code> on your phone.",
  troubleshootHeading: "Phone can't connect?",
  troubleshootRetries:
    "<strong>ERR_TOO_MANY_RETRIES / ERR_SSL_PROTOCOL_ERROR</strong>: Chrome/Edge \u201cAlways use secure connections\u201d or a VPN upgrades <code>http</code> to <code>https</code>. Turn that setting off, or use Safari/Firefox; on iPhone also turn off VPN/iCloud Private Relay.",
  troubleshootUnauthorized:
    "<strong>unauthorized</strong>: you opened <code>/</code> without a token. Scan the QR code, or use one of the tokenized URLs above.",
  troubleshootMacOnly:
    "<strong>Mac-only setup page</strong>: <code>/setup</code> is for the Mac only; scan the QR code on your phone.",
  troubleshootUnreachable:
    "<strong>No connection at all</strong>: confirm the phone and the Mac are on the same Wi-Fi/subnet (guest networks and AP isolation block this); if needed, use the USB <code>adb reverse</code> above.",
  reusableNote:
    "<strong>The same QR code can be reused</strong>: scan it once per phone, until you change the token.",
  macOnlyNote:
    "The setup page only opens on the Mac; phones do not need <code>/setup</code>. After pairing, the phone address bar only shows <code>/</code>, and that URL has no token \u2014 do not share it. To add another phone, come back to this page and scan the QR code.",
  debugHeading: "Debug",
  debugPort: "Port",
  debugHostname: "Hostname",
  debugQrHost: "QR host",
  debugScope: "Setup page scope",
  debugScopeValue: "loopback-only / Mac",
  debugQrValidity: "QR validity",
  debugQrValidityValue: "reusable until token changes",
  debugUnknown: "unknown",
  deniedHtmlTitle: "PocketPet setup page is Mac-only",
  deniedHeading: "Setup page is Mac-only",
  deniedBody:
    "This setup page only opens on the Mac itself. Open <code>{setupUrl}</code> on the Mac (or run <code>pocketpet up</code>), then scan the QR code on the page with your phone camera.",
  deniedNote:
    "Scan once per phone; the same QR code can be reused until you change the token. Phones do not need <code>/setup</code>.",
} as const;

export type SetupCopy = { [K in keyof typeof enSetup]: string };

const enPairing = {
  noLanUrl: "No LAN IPv4 address found.",
  usbFallbackHeading: "USB fallback (no LAN URL):",
  usbThenOpen: "then open {usbUrl} on your phone",
  stepsHeading: "Pair in three steps:",
  stepWifi: "Same Wi-Fi: make sure the Mac and the phone are on the same Wi-Fi network.",
  stepScan: "Scan with the camera: open the phone camera and point it at the QR code above.",
  stepOpenUrl: "Open the URL: open one of the LAN URLs above in your phone browser.",
  stepHomeScreen:
    "Add to Home Screen: choose \u201cAdd to Home Screen\u201d in the browser menu and it opens like an app.",
  keepRunning: "Bridge keeps running in the background.",
  scanCta: "Scan the QR code on your phone. Ctrl+C to stop.",
  usbCta: "Open the USB URL on your phone. Ctrl+C to stop.",
} as const;

export type PairingCopy = { [K in keyof typeof enPairing]: string };

/** Static, trusted setup-page copy. `{usbUrl}` / `{setupUrl}` are filled with escaped values. */
export const setupCopy = {
  en: enSetup,
  "zh-Hant": {
    htmlTitle: "PocketPet 配對",
    heading: "PocketPet 配對",
    languageHeading: "語言",
    leadQr: "用手機相機掃描下面嘅 QR code，就可以喺瀏覽器打開 PocketPet。",
    leadNoQr:
      "QR code 暫時無法產生（伺服器未能建立）。你仍然可以用下面嘅區網網址，或者用 USB 連接打開 PocketPet。",
    stepsHeading: "三步完成配對",
    stepWifi: "<strong>同一個 Wi-Fi</strong>：確認 Mac 同手機連住同一個 Wi-Fi 網絡。",
    stepScan: "<strong>用相機掃描</strong>：打開手機相機，對準上面嘅 QR code。",
    stepOpenUrl: "<strong>開啟網址</strong>：喺手機瀏覽器打開上面其中一個區網網址。",
    stepHomeScreen: "<strong>加到主畫面</strong>：喺瀏覽器選單揀「加到主畫面」，之後一開即用。",
    lanHeading: "區網網址",
    noIpNote: "搵唔到區網 IP 位址。請確認 Mac 已連上同一個 Wi-Fi。",
    localHeading: "穩定網址（Bonjour）",
    localBody: "如果 IP 位址成日轉，可以用呢個 <code>.local</code> 網址：",
    usbHeading: "唔同 Wi-Fi？用 USB 線",
    usbBody: "用 USB 線連接手機同 Mac，然後喺電腦執行：",
    usbOpen: "再用手機開 <code>{usbUrl}</code>。",
    troubleshootHeading: "手機連唔到？",
    troubleshootRetries:
      "<strong>ERR_TOO_MANY_RETRIES／ERR_SSL_PROTOCOL_ERROR</strong>：Chrome／Edge 嘅「Always use secure connections（永遠使用安全連線）」或 VPN 會將 <code>http</code> 升級做 <code>https</code>。關閉該設定，或改用 Safari／Firefox；iPhone 亦要關 VPN／iCloud Private Relay。",
    troubleshootUnauthorized:
      "<strong>unauthorized</strong>：你開咗冇 token 嘅 <code>/</code>。請掃 QR，或用上面列出嘅帶 token 網址。",
    troubleshootMacOnly: "<strong>配對頁只限 Mac</strong>：<code>/setup</code> 只供 Mac；手機請掃 QR。",
    troubleshootUnreachable:
      "<strong>完全連唔到</strong>：確認手機同 Mac 同一個 Wi-Fi／subnet（guest network／AP isolation 唔得）；必要時用上面的 USB <code>adb reverse</code>。",
    reusableNote: "<strong>同一個 QR 可以重複使用</strong>：每部手機各自掃一次，直到你更改 token 為止。",
    macOnlyNote:
      "配對頁只供 Mac 開啟；手機唔需要開 <code>/setup</code>。配對後手機地址欄只剩 <code>/</code>，嗰個 URL 冇 token，唔好分享俾其他人——要加新手機，請返嚟呢一頁掃 QR。",
    debugHeading: "偵錯資料",
    debugPort: "連接埠",
    debugHostname: "主機名稱",
    debugQrHost: "QR 主機",
    debugScope: "配對頁範圍",
    debugScopeValue: "loopback-only / Mac",
    debugQrValidity: "QR 有效期",
    debugQrValidityValue: "更改 token 前可重複使用",
    debugUnknown: "未知",
    deniedHtmlTitle: "PocketPet 配對頁只限 Mac",
    deniedHeading: "配對頁只限 Mac",
    deniedBody:
      "呢個配對頁只可以喺 Mac 本機開啟。請喺 Mac 開 <code>{setupUrl}</code>（或執行 <code>pocketpet up</code>），然後用手機相機掃描頁面上嘅 QR。",
    deniedNote:
      "每部手機各自掃一次；同一個 QR 可以重複使用，直到你更改 token。手機唔需要開 <code>/setup</code>。",
  },
  "zh-Hans": {
    htmlTitle: "PocketPet 配对",
    heading: "PocketPet 配对",
    languageHeading: "语言",
    leadQr: "用手机相机扫描下面的二维码，就可以在浏览器打开 PocketPet。",
    leadNoQr: "二维码暂时无法生成（服务器未能创建）。你仍然可以使用下面的局域网网址，或者通过 USB 连接打开 PocketPet。",
    stepsHeading: "三步完成配对",
    stepWifi: "<strong>同一个 Wi-Fi</strong>：确认 Mac 和手机连接同一个 Wi-Fi 网络。",
    stepScan: "<strong>用相机扫描</strong>：打开手机相机，对准上面的二维码。",
    stepOpenUrl: "<strong>打开网址</strong>：在手机浏览器打开上面其中一个局域网网址。",
    stepHomeScreen: "<strong>添加到主屏幕</strong>：在浏览器菜单选择“添加到主屏幕”，之后一打开就能用。",
    lanHeading: "局域网网址",
    noIpNote: "找不到局域网 IP 地址。请确认 Mac 已连接同一个 Wi-Fi。",
    localHeading: "稳定网址（Bonjour）",
    localBody: "如果 IP 地址经常变化，可以使用这个 <code>.local</code> 网址：",
    usbHeading: "不在同一个 Wi-Fi？用 USB 线",
    usbBody: "用 USB 线连接手机和 Mac，然后在电脑上执行：",
    usbOpen: "再用手机打开 <code>{usbUrl}</code>。",
    troubleshootHeading: "手机连接不上？",
    troubleshootRetries:
      "<strong>ERR_TOO_MANY_RETRIES／ERR_SSL_PROTOCOL_ERROR</strong>：Chrome／Edge 的“Always use secure connections（始终使用安全连接）”或 VPN 会把 <code>http</code> 升级为 <code>https</code>。请关闭该设置，或改用 Safari／Firefox；iPhone 还要关闭 VPN／iCloud Private Relay。",
    troubleshootUnauthorized:
      "<strong>unauthorized</strong>：你打开了没有 token 的 <code>/</code>。请扫描二维码，或使用上面列出的带 token 网址。",
    troubleshootMacOnly: "<strong>配对页仅限 Mac</strong>：<code>/setup</code> 只供 Mac 使用；手机请扫描二维码。",
    troubleshootUnreachable:
      "<strong>完全无法连接</strong>：确认手机和 Mac 在同一个 Wi-Fi／subnet（guest network／AP isolation 不行）；必要时使用上面的 USB <code>adb reverse</code>。",
    reusableNote: "<strong>同一个二维码可以重复使用</strong>：每部手机各自扫描一次，直到你更改 token 为止。",
    macOnlyNote:
      "配对页只能在 Mac 上打开；手机不需要打开 <code>/setup</code>。配对后手机地址栏只剩 <code>/</code>，那个 URL 没有 token，不要分享给别人——要添加新手机，请回到这一页扫描二维码。",
    debugHeading: "调试信息",
    debugPort: "端口",
    debugHostname: "主机名",
    debugQrHost: "二维码主机",
    debugScope: "配对页范围",
    debugScopeValue: "loopback-only / Mac",
    debugQrValidity: "二维码有效期",
    debugQrValidityValue: "更改 token 前可重复使用",
    debugUnknown: "未知",
    deniedHtmlTitle: "PocketPet 配对页仅限 Mac",
    deniedHeading: "配对页仅限 Mac",
    deniedBody:
      "这个配对页只能在 Mac 本机打开。请在 Mac 上打开 <code>{setupUrl}</code>（或执行 <code>pocketpet up</code>），然后用手机相机扫描页面上的二维码。",
    deniedNote: "每部手机各自扫描一次；同一个二维码可以重复使用，直到你更改 token。手机不需要打开 <code>/setup</code>。",
  },
} satisfies Record<Lang, SetupCopy>;

/** CLI pairing copy. Plain text only; URLs are inserted by `printPairing`. */
export const pairingCopy = {
  en: enPairing,
  "zh-Hant": {
    noLanUrl: "搵唔到區網 IPv4 位址。",
    usbFallbackHeading: "USB 後備（冇區網網址）：",
    usbThenOpen: "再用手機開 {usbUrl}",
    stepsHeading: "三步完成配對：",
    stepWifi: "同一個 Wi-Fi：確認 Mac 同手機連住同一個 Wi-Fi 網絡。",
    stepScan: "用相機掃描：打開手機相機，對準上面嘅 QR code。",
    stepOpenUrl: "開啟網址：喺手機瀏覽器打開上面其中一個區網網址。",
    stepHomeScreen: "加到主畫面：喺瀏覽器選單揀「加到主畫面」，之後一開即用。",
    keepRunning: "Bridge 會繼續喺背景執行。",
    scanCta: "用手機掃描 QR code。按 Ctrl+C 停止。",
    usbCta: "用手機打開 USB 網址。按 Ctrl+C 停止。",
  },
  "zh-Hans": {
    noLanUrl: "找不到局域网 IPv4 地址。",
    usbFallbackHeading: "USB 备用（没有局域网网址）：",
    usbThenOpen: "然后在手机上打开 {usbUrl}",
    stepsHeading: "三步完成配对：",
    stepWifi: "同一个 Wi-Fi：确认 Mac 和手机连接同一个 Wi-Fi 网络。",
    stepScan: "用相机扫描：打开手机相机，对准上面的二维码。",
    stepOpenUrl: "打开网址：在手机浏览器打开上面其中一个局域网网址。",
    stepHomeScreen: "添加到主屏幕：在浏览器菜单选择“添加到主屏幕”，之后一打开就能用。",
    keepRunning: "Bridge 会继续在后台运行。",
    scanCta: "用手机扫描二维码。按 Ctrl+C 停止。",
    usbCta: "用手机打开 USB 网址。按 Ctrl+C 停止。",
  },
} satisfies Record<Lang, PairingCopy>;
