import "./style.css";
import { PetRenderer, type PetState } from "./sprite.js";
import { connectState, type ConnStatus } from "./ws.js";
import { filterPets, type PetSummary } from "./catalog.js";
import { isQuiet } from "./quiet.js";
import { keepAwake, type WakeStatus } from "./wake.js";
import {
  LANG_STORAGE_KEY,
  isLang,
  langName,
  localeFor,
  minutesLabel,
  normalizeLangTag,
  t,
  type Lang,
  type MessageKey,
} from "./i18n.js";

interface Session { key: string; agent: string; project: string; phase: string; tool?: string; startedAt: number; lastEventAt: number; }
interface Snapshot { now: number; pet: string; sessions: Session[]; activePet: string | null; sleepAfterMinutes: number; quietHours: { start: string; end: string } | null; }

const AGENT_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode", pi: "Pi", qoder: "Qoder" };
const INSTALL_HINT_KEY = "pocketpet.installHintDismissed";
const PHASE_KEYS: Record<string, MessageKey> = {
  started: "phase.started",
  working: "phase.working",
  waiting: "phase.waiting",
  review: "phase.review",
  done: "phase.done",
  failed: "phase.failed",
  idle: "phase.idle",
};
const CONN_KEYS: Record<ConnStatus, MessageKey> = {
  connecting: "conn.connecting",
  open: "conn.connected",
  closed: "conn.disconnected",
};
const WAKE_KEYS: Record<WakeStatus, MessageKey> = {
  active: "wake.active",
  idle: "wake.idle",
  denied: "wake.denied",
  unsupported: "wake.unsupported",
  insecure: "wake.insecure",
};

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const timeEl = byId("time");
const dateEl = byId("date");
const connEl = byId("conn");
const chipsEl = byId("chips");
const sessionsEl = byId("sessions");
const stage = byId("stage");
const canvas = byId<HTMLCanvasElement>("pet");
const drawer = byId("drawer");
const gear = byId("gear");
const petList = byId("pet-list");
const petSearch = byId<HTMLInputElement>("pet-search");
const wakeInfo = byId("wake-info");
const langSelect = byId<HTMLSelectElement>("lang-select");
const installHint = byId("install-hint");
const installHintTextEl = byId("install-hint-text");
const debugHost = byId("debug-host");
const debugSecure = byId("debug-secure");
const debugConn = byId("debug-conn");
const debugWake = byId("debug-wake");
const debugPet = byId("debug-pet");
const debugLang = byId("debug-lang");
const renderer = new PetRenderer(canvas);
renderer.start();

let current: Snapshot | null = null;
let pets: PetSummary[] = [];
let petId: string | null = null;
let activeFromServer: string | null | undefined = undefined;
let lang: Lang = "en";
let connStatus: ConnStatus = "connecting";
let wakeStatus: WakeStatus | null = null;
let installHintShown = false;

// Storage can be denied (private mode or enterprise policy), so both the
// language read and write are best-effort and never block boot.
function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

function initialLang(): Lang {
  return storedLang() ?? normalizeLangTag(navigator.language);
}

function translateStatic(): void {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as MessageKey | undefined;
    if (key) element.textContent = t(lang, key);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder as MessageKey | undefined;
    if (key) element.setAttribute("placeholder", t(lang, key));
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel as MessageKey | undefined;
    if (key) element.setAttribute("aria-label", t(lang, key));
  });
}

function renderClock(): void {
  const now = new Date();
  const locale = localeFor(lang);
  timeEl.textContent = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  dateEl.textContent = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short" }).format(now);
}

function phaseLabel(phase: string): string {
  const key = PHASE_KEYS[phase];
  return key ? t(lang, key) : phase;
}

function renderSessions(): void {
  if (!current) return;
  chipsEl.replaceChildren(...current.sessions.map((session) => {
    const chip = document.createElement("span");
    chip.className = `chip${session.phase === "waiting" ? " waiting" : ""}`;
    chip.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} · ${phaseLabel(session.phase)}`;
    return chip;
  }));
  sessionsEl.replaceChildren(...current.sessions.map((session) => {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} — ${session.project}`;
    const meta = document.createElement("p");
    const minutes = Math.max(0, Math.round((Date.now() - session.startedAt) / 60_000));
    meta.textContent = `${phaseLabel(session.phase)} · ${minutesLabel(lang, minutes)}`;
    const tool = document.createElement("p");
    tool.className = "tool";
    tool.textContent = session.tool ? `${t(lang, "tool")}${session.tool}` : "";
    card.append(title, meta, tool);
    return card;
  }));
}

async function loadPets(): Promise<void> {
  try {
    const response = await fetch("/api/pets");
    if (!response.ok) return;
    const data = (await response.json()) as { pets: PetSummary[] };
    pets = data.pets;
    renderPetList();
  } catch {
    return;
  }
}

function renderPetList(): void {
  petList.replaceChildren(...filterPets(pets, petSearch.value).map((pet) => {
    const label = document.createElement("label");
    label.className = "pet-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "pet";
    input.value = pet.id;
    input.checked = pet.id === petId;
    input.addEventListener("change", () => { void selectPet(pet.id); });
    const name = document.createElement("span");
    name.textContent = pet.name;
    label.append(input, name);
    return label;
  }));
}

async function selectPet(id: string): Promise<void> {
  const response = await fetch("/api/active-pet", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  if (!response.ok) return;
  await applyPet(id);
}

let applyToken = 0;

async function applyPet(id: string | null): Promise<void> {
  const token = ++applyToken;
  if (pets.length === 0) await loadPets();
  if (token !== applyToken) return;
  const pet = pets.find((candidate) => candidate.id === id) ?? pets[0];
  petId = pet?.id ?? null;
  stage.dataset.petId = pet?.id ?? "fallback";
  stage.dataset.petReady = "false";
  renderDebug();
  if (pet) {
    try {
      await renderer.load(pet.spriteUrl);
      if (token !== applyToken) return;
      stage.dataset.petReady = "true";
    } catch {
      if (token !== applyToken) return;
      petId = null;
      stage.dataset.petId = "fallback";
      stage.dataset.petReady = "false";
    }
  } else {
    stage.dataset.petReady = "true";
  }
  renderPetList();
  renderDebug();
}

function applySnapshot(snapshot: Snapshot): void {
  current = snapshot;
  renderer.setState(snapshot.pet as PetState);
  renderSessions();
  if (snapshot.activePet !== activeFromServer) {
    activeFromServer = snapshot.activePet;
    void applyPet(snapshot.activePet);
  }
  renderDebug();
}

function stripTokenFromAddressBar(): void {
  if (!new URL(location.href).searchParams.has("token")) return;
  // The bootstrap request already set the HttpOnly cookie; the query string is
  // no longer needed and would leak the pairing token into history/screenshots.
  history.replaceState(null, "", location.pathname);
}

function installHintText(): string {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return t(lang, "install.ios");
  if (/Android/.test(ua)) return t(lang, "install.android");
  return t(lang, "install.generic");
}

// Storage can be denied (private mode or enterprise policy). Reading must never
// block boot, so a failure falls back to "not dismissed" and the hint shows.
function installHintDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

// The dismissal is best-effort: when the write throws, it only lasts for this page.
function rememberInstallHintDismissed(): void {
  try {
    localStorage.setItem(INSTALL_HINT_KEY, "1");
  } catch {
    // Ignore: the hint is already hidden in the current document.
  }
}

function setupInstallHint(): void {
  const standalone = window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || installHintDismissed()) return;
  installHintTextEl.textContent = installHintText();
  installHintShown = true;
  installHint.hidden = false;
  byId<HTMLButtonElement>("install-hint-dismiss").addEventListener("click", () => {
    rememberInstallHintDismissed();
    installHintShown = false;
    installHint.hidden = true;
  });
}

function renderConnection(): void {
  connEl.textContent = t(lang, CONN_KEYS[connStatus]);
  connEl.dataset.state = connStatus;
}

function wakeLabel(status: WakeStatus | null): string {
  return status ? t(lang, WAKE_KEYS[status]) : t(lang, "wake.unknown");
}

function renderWake(): void {
  wakeInfo.textContent = `${t(lang, "wake.prefix")}${wakeLabel(wakeStatus)}`;
}

function renderDebug(): void {
  debugHost.textContent = location.host;
  debugSecure.textContent = t(lang, window.isSecureContext ? "debug.yes" : "debug.no");
  debugConn.textContent = t(lang, CONN_KEYS[connStatus]);
  debugWake.textContent = wakeLabel(wakeStatus);
  debugPet.textContent = petId ?? stage.dataset.petId ?? t(lang, "debug.none");
  debugLang.textContent = langName(lang);
}

function applyLanguage(next: Lang, persist: boolean): void {
  lang = next;
  document.documentElement.lang = next;
  if (persist) {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Ignore: the choice still applies to this page.
    }
  }
  langSelect.value = next;
  translateStatic();
  renderClock();
  renderSessions();
  renderConnection();
  renderWake();
  if (installHintShown) installHintTextEl.textContent = installHintText();
  renderDebug();
}

function applyLayout(): void {
  const wide = window.matchMedia("(min-aspect-ratio: 1/1) and (min-width: 600px)").matches;
  document.body.dataset.layout = wide ? "wide" : "folded";
}

function boot(): void {
  stripTokenFromAddressBar();
  applyLayout();
  window.addEventListener("resize", applyLayout);
  applyLanguage(initialLang(), false);
  setInterval(() => {
    renderClock();
    renderSessions();
    document.body.classList.toggle("quiet", isQuiet(current?.quietHours ?? null, new Date()));
  }, 1000);

  langSelect.addEventListener("change", () => {
    const value = langSelect.value;
    if (isLang(value)) applyLanguage(value, true);
  });
  gear.addEventListener("click", () => {
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) {
      if (pets.length === 0) void loadPets();
      else renderPetList();
    }
  });
  petSearch.addEventListener("input", renderPetList);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") drawer.hidden = true; });

  fetch("/api/state").then((res) => (res.ok ? res.json() : null)).then((snapshot) => { if (snapshot) applySnapshot(snapshot as Snapshot); }).catch(() => undefined);

  connectState((snapshot) => applySnapshot(snapshot as Snapshot), (status) => {
    connStatus = status;
    renderConnection();
    renderDebug();
  });
  keepAwake((status) => {
    wakeStatus = status;
    renderWake();
    renderDebug();
  });
  // Optional enhancement only: runs after the networking setup above so that a
  // storage or rendering failure here can never keep the app offline.
  setupInstallHint();
}

boot();
