/** Languages shipped by the setup page and the CLI pairing output. */
export type Lang = "en" | "zh-Hant" | "zh-Hans";

/** Narrows a document language tag to one of the shipped setup languages. */
export function isLang(value: string | null | undefined): value is Lang {
  return value === "en" || value === "zh-Hant" || value === "zh-Hans";
}

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
  stepWifi: "<strong>Same Wi-Fi</strong>: make sure this computer and the phone are on the same Wi-Fi network.",
  stepScan: "<strong>Scan with the camera</strong>: open the phone camera and point it at the QR code above.",
  stepOpenUrl: "<strong>Open the URL</strong>: open one of the LAN URLs above in your phone browser.",
  stepHomeScreen:
    "<strong>Add to Home Screen</strong>: choose \u201cAdd to Home Screen\u201d in the browser menu to open it like an app.",
  lanHeading: "LAN URLs",
  noIpNote: "No LAN IP address found. Make sure this computer is on the same Wi-Fi.",
  localHeading: "Stable address (Bonjour)",
  localBody: "If the IP address keeps changing, use this <code>.local</code> URL:",
  usbHeading: "Different Wi-Fi? Use a USB cable",
  usbBody: "Connect the phone to this computer with a USB cable, then run this on the computer:",
  usbOpen: "Then open <code id=\"pair-usb-url\">{usbUrl}</code> on your phone.",
  troubleshootHeading: "Phone can't connect?",
  troubleshootRetries:
    "<strong>ERR_TOO_MANY_RETRIES / ERR_SSL_PROTOCOL_ERROR</strong>: Chrome/Edge \u201cAlways use secure connections\u201d or a VPN upgrades <code>http</code> to <code>https</code>. Turn that setting off, or use Safari/Firefox; on iPhone also turn off VPN/iCloud Private Relay.",
  troubleshootUnauthorized:
    "<strong>unauthorized</strong>: you opened <code>/</code> without a token. Scan the QR code, or use one of the tokenized URLs above.",
  troubleshootUnreachable:
    "<strong>No connection at all</strong>: confirm the phone and this computer are on the same Wi-Fi/subnet (guest networks and AP isolation block this); if needed, use the USB <code>adb reverse</code> above.",
  reusableNote:
    "<strong>The same QR code can be reused</strong>: scan it once per phone, until you change the token.",
  debugHeading: "Debug",
  debugPort: "Port",
  debugHostname: "Hostname",
  debugQrHost: "QR host",
  debugScope: "Setup page scope",
  debugScopeValue: "loopback-only",
  debugQrValidity: "QR validity",
  debugQrValidityValue: "reusable until token changes",
  debugUnknown: "unknown",
  deniedHtmlTitle: "PocketPet setup page opens on the computer",
  deniedHeading: "Open setup on the computer running PocketPet",
  deniedBody:
    "This setup page opens only on the computer running PocketPet. Open <code>{setupUrl}</code> on that computer (or run <code>pocketpet up</code>), then scan the QR code on the page with your phone camera.",
  deniedNote:
    "Scan once per phone; the same QR code can be reused until you change the token. Phones do not need <code>/setup</code>.",
  unauthorizedHtmlTitle: "This browser is not paired",
  unauthorizedHeading: "This browser is not paired",
  unauthorizedBody:
    "You opened the cleaned phone URL. PocketPet removes the pairing token from the phone address bar after the first request and keeps it in an HttpOnly cookie in that browser. A copied clean URL has no token, so another browser cannot authenticate with it.",
  unauthorizedNote:
    "On the computer running PocketPet, open <code>{setupUrl}</code>, then scan the QR code with the phone you want to pair, or copy one of the tokenized URLs from that page into this browser. The same QR code can be reused until you change the token. Do not share the cleaned URL.",
  hostThisComputer: "This computer",
  hostVersion: "Version",
  navPair: "Pair",
  navLook: "Look",
  navSystem: "System",
  navSections: "Sections",
  lookHeading: "Look",
  lookEnableJavaScript:
    "Enable JavaScript to edit the current look. The preview, pet picker, and Studio need the setup app.",
  lookClock: "Clock",
  lookPet: "Pet",
  lookPetSize: "Pet size",
  lookLayout: "Layout",
  lookOpenStudio: "Open Studio",
  systemHeading: "System",
  bridgeRunning: "Bridge",
  portLabel: "Port",
  bridgeVersionLabel: "Bridge version",
  hostOsLabel: "Host OS",
  loginServiceLabel: "Login service",
  serviceRunning: "Running",
  serviceNotRunning: "Not running",
  serviceUnavailable: "Not available on this platform",
  scopeLabel: "Scope",
  loopbackOnly: "loopback-only",
  logPathLabel: "Log",
  commandsHeading: "Service commands",
  openPhoneView: "Open phone view",
  copyDiagnostics: "Copy diagnostics",
  copyCommand: "Copy",
  copied: "Copied",
  noJsNote:
    "Pairing works without JavaScript. Choosing a look needs the setup app, which requires JavaScript; the URLs and commands above stay usable without it.",
  computerOnlyNote:
    "The setup page opens only on the computer running PocketPet. Phones do not need <code>/setup</code>. After pairing, the phone address bar only shows <code>/</code> and that URL has no token \u2014 do not share it. To add another phone, come back to this page and scan the QR code.",
} as const;

export type SetupCopy = { [K in keyof typeof enSetup]: string };

const enPairing = {
  noLanUrl: "No LAN IPv4 address found.",
  usbFallbackHeading: "USB fallback (no LAN URL):",
  usbThenOpen: "then open {usbUrl} on your phone",
  stepsHeading: "Pair in three steps:",
  stepWifi: "Same Wi-Fi: make sure this computer and the phone are on the same Wi-Fi network.",
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
    htmlTitle: "PocketPet 設定",
    heading: "PocketPet 設定",
    languageHeading: "語言",
    leadQr: "用手機相機掃描下面嘅 QR code，就可以喺瀏覽器打開 PocketPet。",
    leadNoQr:
      "QR code 暫時無法產生（伺服器未能建立）。你仍然可以用下面嘅區網網址，或者用 USB 連接打開 PocketPet。",
    stepsHeading: "三步完成配對",
    stepWifi: "<strong>同一個 Wi-Fi</strong>：確認此電腦同手機連住同一個 Wi-Fi 網絡。",
    stepScan: "<strong>用相機掃描</strong>：打開手機相機，對準上面嘅 QR code。",
    stepOpenUrl: "<strong>開啟網址</strong>：喺手機瀏覽器打開上面其中一個區網網址。",
    stepHomeScreen: "<strong>加到主畫面</strong>：喺瀏覽器選單揀「加到主畫面」，之後一開即用。",
    lanHeading: "區網網址",
    noIpNote: "搵唔到區網 IP 位址。請確認此電腦已連上同一個 Wi-Fi。",
    localHeading: "穩定網址（Bonjour）",
    localBody: "如果 IP 位址成日轉，可以用呢個 <code>.local</code> 網址：",
    usbHeading: "唔同 Wi-Fi？用 USB 線",
    usbBody: "用 USB 線連接手機同此電腦，然後喺電腦執行：",
    usbOpen: "再用手機開 <code id=\"pair-usb-url\">{usbUrl}</code>。",
    troubleshootHeading: "手機連唔到？",
    troubleshootRetries:
      "<strong>ERR_TOO_MANY_RETRIES／ERR_SSL_PROTOCOL_ERROR</strong>：Chrome／Edge 嘅「Always use secure connections（永遠使用安全連線）」或 VPN 會將 <code>http</code> 升級做 <code>https</code>。關閉該設定，或改用 Safari／Firefox；iPhone 亦要關 VPN／iCloud Private Relay。",
    troubleshootUnauthorized:
      "<strong>unauthorized</strong>：你開咗冇 token 嘅 <code>/</code>。請掃 QR，或用上面列出嘅帶 token 網址。",
    troubleshootUnreachable:
      "<strong>完全連唔到</strong>：確認手機同此電腦同一個 Wi-Fi／subnet（guest network／AP isolation 唔得）；必要時用上面的 USB <code>adb reverse</code>。",
    reusableNote: "<strong>同一個 QR 可以重複使用</strong>：每部手機各自掃一次，直到你更改 token 為止。",
    debugHeading: "偵錯資料",
    debugPort: "連接埠",
    debugHostname: "主機名稱",
    debugQrHost: "QR 主機",
    debugScope: "配對頁範圍",
    debugScopeValue: "loopback-only",
    debugQrValidity: "QR 有效期",
    debugQrValidityValue: "更改 token 前可重複使用",
    debugUnknown: "未知",
    deniedHtmlTitle: "PocketPet 配對頁喺電腦開啟",
    deniedHeading: "請喺執行 PocketPet 嘅電腦開啟配對頁",
    deniedBody:
      "呢個配對頁只可以喺執行 PocketPet 嘅電腦本機開啟。請喺嗰部電腦開 <code>{setupUrl}</code>（或執行 <code>pocketpet up</code>），然後用手機相機掃描頁面上嘅 QR。",
    deniedNote:
      "每部手機各自掃一次；同一個 QR 可以重複使用，直到你更改 token。手機唔需要開 <code>/setup</code>。",
    unauthorizedHtmlTitle: "此瀏覽器尚未配對",
    unauthorizedHeading: "此瀏覽器尚未配對",
    unauthorizedBody:
      "你開啟的是清理後的手機網址。PocketPet 在第一次請求後會從手機地址欄移除配對 token，並把 token 存成該瀏覽器的 HttpOnly cookie；把清理後的網址複製到另一個瀏覽器不會帶同 token，因此無法通過驗證。",
    unauthorizedNote:
      "在執行 PocketPet 的電腦開啟 <code>{setupUrl}</code>，用手機掃描 QR，或把該頁的帶 token 網址複製到這個瀏覽器。同一個 QR 可重複使用，直到你更改 token。不要分享清理後的網址。",
    hostThisComputer: "此電腦",
    hostVersion: "版本",
    navPair: "配對",
    navLook: "外觀",
    navSystem: "系統",
    navSections: "區段",
    lookHeading: "外觀",
    lookEnableJavaScript:
      "啟用 JavaScript 以編輯目前外觀。預覽、寵物選擇器與 Studio 都需要 setup app。",
    lookClock: "時鐘",
    lookPet: "寵物",
    lookPetSize: "寵物大小",
    lookLayout: "版面",
    lookOpenStudio: "開啟 Studio",
    systemHeading: "系統",
    bridgeRunning: "橋接",
    portLabel: "連接埠",
    bridgeVersionLabel: "Bridge 版本",
    hostOsLabel: "主機系統",
    loginServiceLabel: "登入服務",
    serviceRunning: "執行中",
    serviceNotRunning: "未執行",
    serviceUnavailable: "此平台不支援",
    scopeLabel: "範圍",
    loopbackOnly: "loopback-only",
    logPathLabel: "日誌",
    commandsHeading: "服務指令",
    openPhoneView: "開啟手機畫面",
    copyDiagnostics: "複製診斷資料",
    copyCommand: "複製",
    copied: "已複製",
    noJsNote: "冇 JavaScript 都可以配對。選擇外觀需要 setup app，即係需要 JavaScript；上面嘅網址同指令照樣可用。",
    computerOnlyNote:
      "配對頁只會喺執行 PocketPet 嘅電腦開啟。手機唔需要開 <code>/setup</code>。配對後手機地址欄只剩 <code>/</code>，嗰個 URL 冇 token，唔好分享。要加新手機，請返嚟呢一頁掃 QR code。",
  },
  "zh-Hans": {
    htmlTitle: "PocketPet 设置",
    heading: "PocketPet 设置",
    languageHeading: "语言",
    leadQr: "用手机相机扫描下面的二维码，就可以在浏览器打开 PocketPet。",
    leadNoQr: "二维码暂时无法生成（服务器未能创建）。你仍然可以使用下面的局域网网址，或者通过 USB 连接打开 PocketPet。",
    stepsHeading: "三步完成配对",
    stepWifi: "<strong>同一个 Wi-Fi</strong>：确认这台电脑和手机连接同一个 Wi-Fi 网络。",
    stepScan: "<strong>用相机扫描</strong>：打开手机相机，对准上面的二维码。",
    stepOpenUrl: "<strong>打开网址</strong>：在手机浏览器打开上面其中一个局域网网址。",
    stepHomeScreen: "<strong>添加到主屏幕</strong>：在浏览器菜单选择“添加到主屏幕”，之后一打开就能用。",
    lanHeading: "局域网网址",
    noIpNote: "找不到局域网 IP 地址。请确认这台电脑已连接同一个 Wi-Fi。",
    localHeading: "稳定网址（Bonjour）",
    localBody: "如果 IP 地址经常变化，可以使用这个 <code>.local</code> 网址：",
    usbHeading: "不在同一个 Wi-Fi？用 USB 线",
    usbBody: "用 USB 线连接手机和这台电脑，然后在电脑上执行：",
    usbOpen: "再用手机打开 <code id=\"pair-usb-url\">{usbUrl}</code>。",
    troubleshootHeading: "手机连接不上？",
    troubleshootRetries:
      "<strong>ERR_TOO_MANY_RETRIES／ERR_SSL_PROTOCOL_ERROR</strong>：Chrome／Edge 的“Always use secure connections（始终使用安全连接）”或 VPN 会把 <code>http</code> 升级为 <code>https</code>。请关闭该设置，或改用 Safari／Firefox；iPhone 还要关闭 VPN／iCloud Private Relay。",
    troubleshootUnauthorized:
      "<strong>unauthorized</strong>：你打开了没有 token 的 <code>/</code>。请扫描二维码，或使用上面列出的带 token 网址。",
    troubleshootUnreachable:
      "<strong>完全无法连接</strong>：确认手机和这台电脑在同一个 Wi-Fi／subnet（guest network／AP isolation 不行）；必要时使用上面的 USB <code>adb reverse</code>。",
    reusableNote: "<strong>同一个二维码可以重复使用</strong>：每部手机各自扫描一次，直到你更改 token 为止。",
    debugHeading: "调试信息",
    debugPort: "端口",
    debugHostname: "主机名",
    debugQrHost: "二维码主机",
    debugScope: "配对页范围",
    debugScopeValue: "loopback-only",
    debugQrValidity: "二维码有效期",
    debugQrValidityValue: "更改 token 前可重复使用",
    debugUnknown: "未知",
    deniedHtmlTitle: "PocketPet 配对页在电脑上打开",
    deniedHeading: "请在运行 PocketPet 的电脑上打开配对页",
    deniedBody:
      "这个配对页只能在运行 PocketPet 的电脑本机打开。请在那台电脑上打开 <code>{setupUrl}</code>（或执行 <code>pocketpet up</code>），然后用手机相机扫描页面上的二维码。",
    deniedNote: "每部手机各自扫描一次；同一个二维码可以重复使用，直到你更改 token。手机不需要打开 <code>/setup</code>。",
    unauthorizedHtmlTitle: "此浏览器尚未配对",
    unauthorizedHeading: "此浏览器尚未配对",
    unauthorizedBody:
      "你打开的是清理后的手机网址。PocketPet 在第一次请求后会从手机地址栏移除配对 token，并把 token 存成该浏览器的 HttpOnly cookie；把清理后的网址复制到另一个浏览器不会带上 token，因此无法通过验证。",
    unauthorizedNote:
      "在运行 PocketPet 的电脑上打开 <code>{setupUrl}</code>，用手机扫描二维码，或把该页的带 token 网址复制到这个浏览器。同一个二维码可以重复使用，直到你更改 token。不要分享清理后的网址。",
    hostThisComputer: "这台电脑",
    hostVersion: "版本",
    navPair: "配对",
    navLook: "外观",
    navSystem: "系统",
    navSections: "分区",
    lookHeading: "外观",
    lookEnableJavaScript:
      "启用 JavaScript 以编辑当前外观。预览、宠物选择器与 Studio 都需要 setup app。",
    lookClock: "时钟",
    lookPet: "宠物",
    lookPetSize: "宠物大小",
    lookLayout: "布局",
    lookOpenStudio: "打开 Studio",
    systemHeading: "系统",
    bridgeRunning: "桥接",
    portLabel: "端口",
    bridgeVersionLabel: "Bridge 版本",
    hostOsLabel: "主机系统",
    loginServiceLabel: "登录服务",
    serviceRunning: "运行中",
    serviceNotRunning: "未运行",
    serviceUnavailable: "此平台不支持",
    scopeLabel: "范围",
    loopbackOnly: "loopback-only",
    logPathLabel: "日志",
    commandsHeading: "服务命令",
    openPhoneView: "打开手机视图",
    copyDiagnostics: "复制诊断信息",
    copyCommand: "复制",
    copied: "已复制",
    noJsNote: "没有 JavaScript 也可以配对。选择外观需要 setup app，也就是需要 JavaScript；上面的网址和命令仍可使用。",
    computerOnlyNote:
      "配对页只会在运行 PocketPet 的电脑上打开。手机不需要打开 <code>/setup</code>。配对后手机地址栏只剩 <code>/</code>，该 URL 没有 token，请不要分享。要添加新手机，请回到这一页扫描二维码。",
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
    stepWifi: "同一個 Wi-Fi：確認此電腦同手機連住同一個 Wi-Fi 網絡。",
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
    stepWifi: "同一个 Wi-Fi：确认这台电脑和手机连接同一个 Wi-Fi 网络。",
    stepScan: "用相机扫描：打开手机相机，对准上面的二维码。",
    stepOpenUrl: "打开网址：在手机浏览器打开上面其中一个局域网网址。",
    stepHomeScreen: "添加到主屏幕：在浏览器菜单选择“添加到主屏幕”，之后一打开就能用。",
    keepRunning: "Bridge 会继续在后台运行。",
    scanCta: "用手机扫描二维码。按 Ctrl+C 停止。",
    usbCta: "用手机打开 USB 网址。按 Ctrl+C 停止。",
  },
} satisfies Record<Lang, PairingCopy>;
