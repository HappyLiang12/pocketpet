import "./style.css";
import {
  DEFAULT_APPEARANCE,
  diffAppearance,
  normalizeAppearance,
  resolveLook,
  type Appearance,
  type LocalLook,
} from "../../src/appearance.js";
import { PetRenderer, type PetState } from "./sprite.js";
import { connectState, type ConnStatus } from "./ws.js";
import { filterPets, type PetSummary } from "./catalog.js";
import { isQuiet } from "./quiet.js";
import { keepAwake, type WakeStatus } from "./wake.js";
import { bindStage, applyStage, formatClock, resolveMotion, watchSystemAppearance } from "./look/stage.js";
import { canUseLocalStorage, readLocalLook, writeLocalLook } from "./look/store.js";
import { openStudio } from "./look/studio.js";
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
interface HostInfo { os: string; osVersion: string; bridgeVersion: string; }
interface Snapshot {
  now: number;
  pet: string;
  sessions: Session[];
  activePet: string | null;
  sleepAfterMinutes: number;
  quietHours: { start: string; end: string } | null;
  appearance: Appearance;
  host: HostInfo;
}

type TabName = "live" | "look" | "about";

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
const TAB_KEYS: Record<TabName, MessageKey> = {
  live: "sheet.live",
  look: "sheet.look",
  about: "sheet.about",
};

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const boundStage = bindStage(document);
if (!boundStage) throw new Error("stage is missing");
const stage = boundStage;

const renderer = new PetRenderer(stage.pet);
renderer.start();

const connEl = byId("conn");
const connText = byId("conn-text");
const chipsEl = byId("chips");
const sessionsEl = byId("sessions");
const sheet = byId<HTMLElement>("sheet");
const scrim = byId<HTMLElement>("scrim");
const sheetHandle = byId<HTMLButtonElement>("sheet-handle");
const tabList = byId<HTMLElement>("sheet-tabs");
const tabs = [...document.querySelectorAll<HTMLButtonElement>("#sheet-tabs [data-tab]")];
const panels = [...document.querySelectorAll<HTMLElement>("[data-panel]")];
const followHost = byId<HTMLInputElement>("follow-host");
const followHostLabel = byId<HTMLElement>("follow-host-label");
const openStudioButton = byId<HTMLButtonElement>("open-studio");
const resetLookButton = byId<HTMLButtonElement>("reset-look");
const lookSummary = byId<HTMLElement>("look-summary");
const lookSource = byId<HTMLElement>("look-source");
const lookNote = byId<HTMLElement>("look-note");
const lookStorageNotice = byId<HTMLElement>("look-storage");
const openLookButton = byId<HTMLButtonElement>("open-look");
const liveConnection = byId<HTMLElement>("live-connection");
const petList = byId("pet-list");
const petSearch = byId<HTMLInputElement>("pet-search");
const wakeInfo = byId("wake-info");
const langSelect = byId<HTMLSelectElement>("lang-select");
const langLabel = byId("lang-label");
const installHint = byId("install-hint");
const installHintTextEl = byId("install-hint-text");
const debugVersion = byId("debug-version");
const debugComputerLabel = byId("debug-computer-label");
const debugVersionLabel = byId("debug-version-label");
const debugConnectionLabel = byId("debug-connection-label");
const debugSecureLabel = byId("debug-secure-label");
const debugWakeLabel = byId("debug-wake-label");
const debugPetLabel = byId("debug-pet-label");
const debugLanguageLabel = byId("debug-language-label");
const debugComputerValue = byId("debug-host");
const debugSecure = byId("debug-secure");
const debugConn = byId("debug-conn");
const debugWake = byId("debug-wake");
const debugPet = byId("debug-pet");
const debugLang = byId("debug-lang");

let current: Snapshot | null = null;
let pets: PetSummary[] = [];
let petsLoad: Promise<void> | null = null;
let renderedPetIds: string[] = [];
let renderedPetFilter = "";
let petId: string | null = null;
let lang: Lang = "en";
let connStatus: ConnStatus = "connecting";
let wakeStatus: WakeStatus | null = null;
let installHintShown = false;
let activeTab: TabName = "live";

let hostAppearance: Appearance = normalizeAppearance(DEFAULT_APPEARANCE);
let hostPet: string | null = null;
let hostInfo: HostInfo | null = null;
let localLook = readLocalLook();
let localWriteFailed = !canUseLocalStorage();

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

function currentAppearance(): Appearance {
  return resolveLook(hostAppearance, localLook).appearance;
}

function currentPetId(): string | null {
  if (localLook.followHost) return hostPet;
  const localId = localLook.petId;
  if (!localId) return hostPet;
  // A saved pet that disappeared from the catalog falls back to the host pet
  // rather than silently picking the first gallery entry.
  if (pets.length > 0 && !pets.some((candidate) => candidate.id === localId)) return hostPet;
  return localId;
}

function saveLocal(next: LocalLook): void {
  localLook = next;
  localWriteFailed = !writeLocalLook(next);
  applyLook();
}

function showTab(name: TabName, open = true): void {
  activeTab = name;
  sheet.dataset.open = open ? "true" : "false";
  scrim.dataset.visible = open ? "true" : "false";
  sheetHandle.setAttribute("aria-expanded", String(open));
  sheetHandle.setAttribute("aria-label", t(lang, open ? "sheet.close" : "sheet.open"));
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", String(selected));
    // Roving tabindex: only the active tab is in the Tab order.
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
}

function closeSheet(): void {
  showTab("live", false);
  sheetHandle.focus();
}

function toggleSheet(): void {
  if (sheet.dataset.open === "true") closeSheet();
  else showTab("live", true);
}

function phaseLabel(phase: string): string {
  const key = PHASE_KEYS[phase];
  return key ? t(lang, key) : phase;
}

function renderClock(appearance: Appearance): void {
  const value = formatClock(lang, appearance.clock.format, new Date());
  stage.time.textContent = value.time;
  stage.date.textContent = value.date;
}

function renderSessions(appearance: Appearance): void {
  if (!current) return;
  const sessions = current.sessions.slice(0, appearance.sessions.maxVisible);
  chipsEl.replaceChildren(...sessions.map((session) => {
    const chip = document.createElement("span");
    chip.className = `chip${session.phase === "waiting" ? " waiting" : ""}`;
    chip.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} · ${phaseLabel(session.phase)}`;
    return chip;
  }));
  sessionsEl.replaceChildren(...sessions.map((session) => {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = appearance.sessions.showProject
      ? `${AGENT_LABEL[session.agent] ?? session.agent} — ${session.project}`
      : (AGENT_LABEL[session.agent] ?? session.agent);
    const meta = document.createElement("p");
    const minutes = Math.max(0, Math.round((Date.now() - session.startedAt) / 60_000));
    meta.textContent = appearance.sessions.showElapsed ? `${phaseLabel(session.phase)} · ${minutesLabel(lang, minutes)}` : phaseLabel(session.phase);
    card.append(title, meta);
    if (appearance.sessions.showTool && session.tool) {
      const tool = document.createElement("p");
      tool.className = "tool";
      tool.textContent = `${t(lang, "tool")}${session.tool}`;
      card.append(tool);
    }
    return card;
  }));
}

// The initial /api/state snapshot and the first WS snapshot can both arrive
// before the catalog resolves; share one request/result instead of fetching
// /api/pets twice. A failed load clears the cache so a later snapshot retries.
function loadPets(): Promise<void> {
  if (petsLoad) return petsLoad;
  petsLoad = (async () => {
    try {
      const response = await fetch("/api/pets");
      if (!response.ok) {
        petsLoad = null;
        return;
      }
      const data = (await response.json()) as { pets: PetSummary[] };
      pets = data.pets;
      renderPetList();
    } catch {
      petsLoad = null;
    }
  })();
  return petsLoad;
}

function createPetOption(pet: PetSummary): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "pet-option";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "pet";
  input.value = pet.id;
  input.addEventListener("change", () => { selectPet(pet.id); });
  const name = document.createElement("span");
  name.textContent = pet.name;
  label.append(input, name);
  return label;
}

function renderPetList(): void {
  petList.setAttribute("role", "radiogroup");
  petList.setAttribute("aria-label", t(lang, "look.pet"));
  const visible = filterPets(pets, petSearch.value);
  const ids = visible.map((pet) => pet.id);
  const filterChanged = petSearch.value !== renderedPetFilter;
  const listChanged = ids.length !== renderedPetIds.length || ids.some((id, index) => id !== renderedPetIds[index]);
  if (filterChanged || listChanged) {
    petList.replaceChildren(...visible.map(createPetOption));
    renderedPetIds = ids;
    renderedPetFilter = petSearch.value;
  }
  // Snapshots and local changes only update the checked state; the rows (and
  // focus) survive instead of being rebuilt on every render.
  const selected = currentPetId();
  for (const input of petList.querySelectorAll<HTMLInputElement>('input[name="pet"]')) {
    input.checked = input.value === selected;
  }
}

function selectPet(id: string): void {
  saveLocal({ v: 1, followHost: false, overrides: localLook.overrides, petId: id });
}

function setFollowHost(value: boolean): void {
  saveLocal(value
    ? { v: 1, followHost: true, overrides: {}, petId: null }
    : { v: 1, followHost: false, overrides: localLook.overrides, petId: localLook.petId });
}

function renderLook(appearance: Appearance): void {
  followHost.checked = localLook.followHost;
  followHostLabel.textContent = t(lang, "look.followHost");
  lookSource.textContent = localLook.followHost ? t(lang, "look.hostDefault") : t(lang, "look.custom");
  petSearch.placeholder = t(lang, "look.search");
  petSearch.setAttribute("aria-label", t(lang, "look.search"));
  const selectedId = currentPetId();
  const selectedPet = selectedId ? pets.find((candidate) => candidate.id === selectedId) : undefined;
  const localMissing = !localLook.followHost
    && localLook.petId !== null
    && pets.length > 0
    && !pets.some((candidate) => candidate.id === localLook.petId);
  lookNote.hidden = !localMissing;
  lookNote.textContent = t(lang, "look.localMissing");
  const petValue = selectedPet?.name
    ?? selectedId
    ?? (pets.length === 0 ? t(lang, "look.noPets") : t(lang, "look.notSelected"));
  const layoutLabel = t(lang, appearance.layout.mode === "free" ? "look.layoutFree" : "look.layoutStack");
  const summary: Array<[string, string]> = [
    [t(lang, "look.clock"), `${appearance.clock.scale}%`],
    [t(lang, "look.petSize"), `${appearance.pet.scale}%`],
    [t(lang, "look.layout"), `${layoutLabel} · ${appearance.layout.gap}`],
    [t(lang, "look.pet"), petValue],
  ];
  lookSummary.replaceChildren(...summary.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  openStudioButton.textContent = t(lang, "look.openStudio");
  openStudioButton.disabled = false;
  resetLookButton.textContent = t(lang, "look.reset");
  openLookButton.textContent = t(lang, "live.editLook");
  lookStorageNotice.hidden = !localWriteFailed;
  lookStorageNotice.textContent = t(lang, "look.storageDenied");
  renderPetList();
}

let applyToken = 0;

async function applyPet(requested: string | null): Promise<void> {
  const token = ++applyToken;
  const hadPets = pets.length > 0;
  if (!hadPets) await loadPets();
  if (token !== applyToken) return;
  // Re-resolve after the catalog loads so a missing local pet falls back to the
  // host pet; never pick the first gallery entry on its behalf.
  const id = requested && pets.some((candidate) => candidate.id === requested) ? requested : currentPetId();
  const pet = id ? pets.find((candidate) => candidate.id === id) : undefined;
  if (pet && pet.id === petId && stage.stage.dataset.petReady === "true") return;
  petId = pet?.id ?? null;
  stage.stage.dataset.petId = pet?.id ?? "fallback";
  stage.stage.dataset.petReady = "false";
  renderDebug();
  if (pet) {
    try {
      await renderer.load(pet.spriteUrl);
      if (token !== applyToken) return;
      stage.stage.dataset.petReady = "true";
    } catch {
      if (token !== applyToken) return;
      petId = null;
      stage.stage.dataset.petId = "fallback";
      stage.stage.dataset.petReady = "false";
    }
  } else {
    stage.stage.dataset.petReady = "true";
  }
  if (token !== applyToken) return;
  renderPetList();
  renderDebug();
  // A late catalog load turns the id shown in the Look summary into a real name.
  if (!hadPets && pets.length > 0) renderLook(currentAppearance());
}

function applyLook(force = false): void {
  // An open Studio is a modal draft: host snapshots and system appearance
  // changes must not repaint the page or the Studio preview underneath. The
  // Studio's own save forces the page to the saved look before it closes.
  if (!force && document.getElementById("studio")) return;
  const appearance = currentAppearance();
  applyStage(stage, appearance);
  renderer.setReducedMotion(resolveMotion(appearance.motion) === "reduced");
  renderClock(appearance);
  renderSessions(appearance);
  applyPet(currentPetId());
  renderLook(appearance);
  renderDebug();
}

function applySnapshot(snapshot: Snapshot): void {
  current = snapshot;
  hostAppearance = normalizeAppearance(snapshot.appearance);
  hostPet = snapshot.activePet;
  hostInfo = snapshot.host;
  renderer.setState(snapshot.pet as PetState);
  applyLook();
  renderLive();
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
  connText.textContent = t(lang, CONN_KEYS[connStatus]);
  connEl.dataset.state = connStatus;
}

function renderLive(): void {
  liveConnection.textContent = hostInfo
    ? `${t(lang, CONN_KEYS[connStatus])} · ${hostInfo.os}`
    : t(lang, CONN_KEYS[connStatus]);
}

function wakeLabel(status: WakeStatus | null): string {
  return status ? t(lang, WAKE_KEYS[status]) : t(lang, "wake.unknown");
}

function renderWake(): void {
  wakeInfo.textContent = `${t(lang, "wake.prefix")}${wakeLabel(wakeStatus)}`;
}

function renderDebug(): void {
  debugComputerLabel.textContent = t(lang, "about.computer");
  debugVersionLabel.textContent = t(lang, "about.bridgeVersion");
  debugConnectionLabel.textContent = t(lang, "about.connection");
  debugSecureLabel.textContent = t(lang, "debug.secure");
  debugWakeLabel.textContent = t(lang, "debug.wake");
  debugPetLabel.textContent = t(lang, "debug.pet");
  debugLanguageLabel.textContent = t(lang, "debug.language");
  debugComputerValue.textContent = hostInfo ? `${hostInfo.os} ${hostInfo.osVersion}` : "—";
  debugVersion.textContent = hostInfo?.bridgeVersion ?? "—";
  debugConn.textContent = t(lang, CONN_KEYS[connStatus]);
  debugSecure.textContent = t(lang, window.isSecureContext ? "debug.yes" : "debug.no");
  debugWake.textContent = wakeLabel(wakeStatus);
  debugPet.textContent = petId ?? stage.stage.dataset.petId ?? t(lang, "debug.none");
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
  langLabel.textContent = t(lang, "about.language");
  translateStatic();
  for (const tab of tabs) {
    const name = tab.dataset.tab as TabName | undefined;
    if (name) tab.textContent = t(lang, TAB_KEYS[name]);
  }
  showTab(activeTab, sheet.dataset.open === "true");
  stage.clock.setAttribute("aria-label", t(lang, "look.clock"));
  renderConnection();
  renderLive();
  renderWake();
  const appearance = currentAppearance();
  renderClock(appearance);
  renderSessions(appearance);
  renderLook(appearance);
  renderDebug();
  if (installHintShown) installHintTextEl.textContent = installHintText();
}

function boot(): void {
  stripTokenFromAddressBar();
  const stageLayout = () => {
    const wide = window.matchMedia("(min-aspect-ratio: 1/1) and (min-width: 600px)").matches;
    document.body.dataset.layout = wide ? "wide" : "folded";
  };
  stageLayout();
  window.addEventListener("resize", stageLayout);
  applyLanguage(initialLang(), false);
  watchSystemAppearance(() => applyLook());
  followHost.addEventListener("change", () => setFollowHost(followHost.checked));
  resetLookButton.addEventListener("click", () => saveLocal({ v: 1, followHost: true, overrides: {}, petId: null }));
  openStudioButton.addEventListener("click", () => {
    const selectedId = currentPetId();
    const selectedPet = selectedId ? pets.find((candidate) => candidate.id === selectedId) : undefined;
    openStudio({
      appearance: currentAppearance(),
      pet: selectedPet
        ? { id: selectedPet.id, name: selectedPet.name, spriteUrl: selectedPet.spriteUrl }
        : null,
      lang,
      scope: "phone",
      // A phone Studio save is local-only: persist the sparse diff against the
      // host look and turn follow-host off. The host is never written.
      onSave: async (next) => {
        const nextLocal: LocalLook = {
          v: 1,
          followHost: false,
          overrides: diffAppearance(hostAppearance, next),
          petId: localLook.petId,
        };
        localLook = nextLocal;
        localWriteFailed = !writeLocalLook(nextLocal);
        applyLook(true);
      },
    });
  });
  tabs.forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab as TabName)));
  tabList.addEventListener("keydown", (event) => {
    const index = tabs.findIndex((tab) => tab.dataset.tab === activeTab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    showTab(target.dataset.tab as TabName);
    target.focus();
  });
  sheetHandle.addEventListener("click", toggleSheet);
  scrim.addEventListener("click", closeSheet);
  openLookButton.addEventListener("click", () => showTab("look"));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // The Studio overlay owns Escape while it is open: yielding here keeps one
    // Escape from dismissing both the topmost dialog and the sheet underneath.
    if (document.getElementById("studio")) return;
    if (sheet.dataset.open === "true") closeSheet();
  });
  petSearch.addEventListener("input", renderPetList);
  langSelect.addEventListener("change", () => {
    const value = langSelect.value;
    if (isLang(value)) applyLanguage(value, true);
  });
  showTab("live", false);

  setInterval(() => {
    const appearance = currentAppearance();
    renderClock(appearance);
    renderSessions(appearance);
    document.body.classList.toggle("quiet", isQuiet(current?.quietHours ?? null, new Date()));
  }, 1000);

  fetch("/api/state").then((res) => (res.ok ? res.json() : null)).then((snapshot) => { if (snapshot) applySnapshot(snapshot as Snapshot); }).catch(() => undefined);

  connectState((snapshot) => applySnapshot(snapshot as Snapshot), (status) => {
    connStatus = status;
    renderConnection();
    renderLive();
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
