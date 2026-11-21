export type Lang = "en" | "zh-Hant" | "zh-Hans";

export const LANGS: readonly Lang[] = ["en", "zh-Hant", "zh-Hans"];

export const LANG_STORAGE_KEY = "pocketpet.lang";

const en = {
  "conn.connecting": "Connecting",
  "conn.connected": "Connected",
  "conn.disconnected": "Disconnected",
  "phase.started": "Started",
  "phase.working": "Working",
  "phase.waiting": "Waiting",
  "phase.review": "Review",
  "phase.done": "Done",
  "phase.failed": "Failed",
  "phase.idle": "Idle",
  "minutes": "{n} min",
  "tool": "Tool: ",
  "drawer.title": "Settings",
  "drawer.search": "Search pets…",
  "drawer.language": "Language",
  "gear.label": "Settings",
  "wake.prefix": "Screen awake: ",
  "wake.unknown": "unknown",
  "wake.active": "on",
  "wake.idle": "standby",
  "wake.denied": "denied",
  "wake.unsupported": "unsupported",
  "wake.insecure": "not a secure context — set a screen timeout",
  "install.ios": "Share → Add to Home Screen",
  "install.android": "Menu → Add to Home screen",
  "install.generic": "Choose “Add to Home screen” in your browser menu for quicker access",
  "install.dismiss": "Got it",
  "lang.en": "English",
  "lang.zhHant": "繁體中文",
  "lang.zhHans": "简体中文",
  "debug.title": "Debug",
  "debug.host": "Host",
  "debug.secure": "Secure context",
  "debug.connection": "Connection",
  "debug.wake": "Wake",
  "debug.pet": "Pet",
  "debug.language": "Language",
  "debug.yes": "yes",
  "debug.no": "no",
  "debug.none": "—",
  "trouble.title": "Troubleshooting",
  "trouble.httpsTitle": "ERR_TOO_MANY_RETRIES / ERR_SSL_PROTOCOL_ERROR",
  "trouble.httpsBody": "Chrome/Edge “Always use secure connections” or a VPN forces HTTPS on the HTTP address. Turn it off, try Safari/Firefox, or on iPhone disable VPN/iCloud Private Relay.",
  "trouble.authTitle": "unauthorized",
  "trouble.authBody": "You opened the cleaned / URL without the token. Scan the QR code or use the tokenized URL listed on /setup.",
  "trouble.setupTitle": "Setup page is Mac-only",
  "trouble.setupBody": "/setup only opens on the Mac; phones scan the QR code.",
  "trouble.reachTitle": "Cannot reach the Mac",
  "trouble.reachBody": "Confirm the phone is on the same WiFi/subnet (guest networks and AP isolation block it), or use USB: adb reverse tcp:7788 tcp:7788.",
} as const;

export type MessageKey = keyof typeof en;

const zhHant: Record<MessageKey, string> = {
  "conn.connecting": "連線中",
  "conn.connected": "已連線",
  "conn.disconnected": "已斷線",
  "phase.started": "開始",
  "phase.working": "工作中",
  "phase.waiting": "等待中",
  "phase.review": "待審",
  "phase.done": "完成",
  "phase.failed": "失敗",
  "phase.idle": "閒置",
  "minutes": "{n} 分鐘",
  "tool": "工具：",
  "drawer.title": "設定",
  "drawer.search": "搜尋寵物…",
  "drawer.language": "語言",
  "gear.label": "設定",
  "wake.prefix": "螢幕長亮：",
  "wake.unknown": "未知",
  "wake.active": "已啟用",
  "wake.idle": "待命",
  "wake.denied": "已拒絕",
  "wake.unsupported": "不支援",
  "wake.insecure": "非安全連線，請設定螢幕逾時",
  "install.ios": "分享 → 加入主畫面",
  "install.android": "選單 → 加到主畫面",
  "install.generic": "在瀏覽器選單選擇「加到主畫面」，開啟更方便",
  "install.dismiss": "知道了",
  "lang.en": "English",
  "lang.zhHant": "繁體中文",
  "lang.zhHans": "简体中文",
  "debug.title": "偵錯",
  "debug.host": "主機",
  "debug.secure": "安全內容",
  "debug.connection": "連線",
  "debug.wake": "螢幕長亮",
  "debug.pet": "寵物",
  "debug.language": "語言",
  "debug.yes": "是",
  "debug.no": "否",
  "debug.none": "—",
  "trouble.title": "疑難排解",
  "trouble.httpsTitle": "ERR_TOO_MANY_RETRIES / ERR_SSL_PROTOCOL_ERROR",
  "trouble.httpsBody": "Chrome/Edge 的「永遠使用安全連線」或 VPN 會把 HTTP 位址強制轉成 HTTPS。關閉該設定、改用 Safari/Firefox；iPhone 也可停用 VPN 或 iCloud 私密轉送。",
  "trouble.authTitle": "未授權（unauthorized）",
  "trouble.authBody": "你開啟了不含 token 的 / 網址。請掃描 QR Code，或使用 /setup 上列出的含 token 網址。",
  "trouble.setupTitle": "配對頁只限 Mac",
  "trouble.setupBody": "/setup 必須在 Mac 上開啟；手機請掃描 QR Code。",
  "trouble.reachTitle": "連不到 Mac",
  "trouble.reachBody": "確認手機與 Mac 在同一個 WiFi／子網（訪客網路與 AP 隔離會阻擋），或改用 USB：adb reverse tcp:7788 tcp:7788。",
};

const zhHans: Record<MessageKey, string> = {
  "conn.connecting": "连接中",
  "conn.connected": "已连接",
  "conn.disconnected": "已断开",
  "phase.started": "开始",
  "phase.working": "工作中",
  "phase.waiting": "等待中",
  "phase.review": "待审",
  "phase.done": "完成",
  "phase.failed": "失败",
  "phase.idle": "空闲",
  "minutes": "{n} 分钟",
  "tool": "工具：",
  "drawer.title": "设置",
  "drawer.search": "搜索宠物…",
  "drawer.language": "语言",
  "gear.label": "设置",
  "wake.prefix": "屏幕常亮：",
  "wake.unknown": "未知",
  "wake.active": "已启用",
  "wake.idle": "待命",
  "wake.denied": "已拒绝",
  "wake.unsupported": "不支持",
  "wake.insecure": "非安全连接，请设置屏幕超时",
  "install.ios": "分享 → 添加到主屏幕",
  "install.android": "菜单 → 添加到主屏幕",
  "install.generic": "在浏览器菜单中选择“添加到主屏幕”，打开更方便",
  "install.dismiss": "知道了",
  "lang.en": "English",
  "lang.zhHant": "繁體中文",
  "lang.zhHans": "简体中文",
  "debug.title": "调试",
  "debug.host": "主机",
  "debug.secure": "安全上下文",
  "debug.connection": "连接",
  "debug.wake": "屏幕常亮",
  "debug.pet": "宠物",
  "debug.language": "语言",
  "debug.yes": "是",
  "debug.no": "否",
  "debug.none": "—",
  "trouble.title": "疑难解答",
  "trouble.httpsTitle": "ERR_TOO_MANY_RETRIES / ERR_SSL_PROTOCOL_ERROR",
  "trouble.httpsBody": "Chrome/Edge 的“始终使用安全连接”或 VPN 会把 HTTP 地址强制转换成 HTTPS。关闭该设置、改用 Safari/Firefox；iPhone 也可停用 VPN 或 iCloud 私人中继。",
  "trouble.authTitle": "未授权（unauthorized）",
  "trouble.authBody": "你打开了不含 token 的 / 网址。请扫描二维码，或使用 /setup 上列出的含 token 网址。",
  "trouble.setupTitle": "配对页仅限 Mac",
  "trouble.setupBody": "/setup 必须在 Mac 上打开；手机请扫描二维码。",
  "trouble.reachTitle": "连不上 Mac",
  "trouble.reachBody": "确认手机与 Mac 在同一个 WiFi／子网（访客网络与 AP 隔离会阻挡），或改用 USB：adb reverse tcp:7788 tcp:7788。",
};

export const STRINGS: Record<Lang, Record<MessageKey, string>> = {
  en,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
};

export function isLang(value: string | null | undefined): value is Lang {
  return value === "en" || value === "zh-Hant" || value === "zh-Hans";
}

// Maps a browser locale tag onto one of the three UI languages. Chinese
// variants are split by script: Hans for the explicitly simplified tags,
// everything else Chinese (TW/HK/MO/und) is treated as Traditional.
export function normalizeLangTag(tag: string | null | undefined): Lang {
  const value = (tag ?? "").trim().toLowerCase();
  if (value === "en" || value.startsWith("en-")) return "en";
  if (value === "zh" || value.startsWith("zh-")) {
    if (/^zh-(hans|cn|sg)(-|$)/.test(value)) return "zh-Hans";
    return "zh-Hant";
  }
  return "en";
}

export function t(lang: Lang, key: MessageKey): string {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

export function localeFor(lang: Lang): Lang {
  return lang;
}

export function langName(lang: Lang): string {
  const key: MessageKey = lang === "en" ? "lang.en" : lang === "zh-Hant" ? "lang.zhHant" : "lang.zhHans";
  return t(lang, key);
}

export function minutesLabel(lang: Lang, minutes: number): string {
  const value = Math.max(0, Math.round(minutes));
  return t(lang, "minutes").replace("{n}", String(value));
}
