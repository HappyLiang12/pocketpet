import "./style.css";
import { PetRenderer, type PetState } from "./sprite.js";
import { connectState } from "./ws.js";
import { filterPets, type PetSummary } from "./catalog.js";
import { isQuiet } from "./quiet.js";
import { WAKE_LABELS, keepAwake } from "./wake.js";

interface Session { key: string; agent: string; project: string; phase: string; tool?: string; startedAt: number; lastEventAt: number; }
interface Snapshot { now: number; pet: string; sessions: Session[]; activePet: string | null; sleepAfterMinutes: number; quietHours: { start: string; end: string } | null; }

const AGENT_LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", opencode: "OpenCode", pi: "Pi", qoder: "Qoder" };
const PHASE_LABEL: Record<string, string> = { started: "開始", working: "工作中", waiting: "等待中", review: "待審", done: "完成", failed: "失敗", idle: "閒置" };

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
const renderer = new PetRenderer(canvas);
renderer.start();

let current: Snapshot | null = null;
let pets: PetSummary[] = [];
let petId: string | null = null;
let activeFromServer: string | null | undefined = undefined;

function renderClock(): void {
  const now = new Date();
  timeEl.textContent = new Intl.DateTimeFormat("zh-Hant", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  dateEl.textContent = new Intl.DateTimeFormat("zh-Hant", { month: "long", day: "numeric", weekday: "short" }).format(now);
}

function applyLayout(): void {
  const wide = window.matchMedia("(min-aspect-ratio: 1/1) and (min-width: 600px)").matches;
  document.body.dataset.layout = wide ? "wide" : "folded";
}

function renderSessions(): void {
  if (!current) return;
  chipsEl.replaceChildren(...current.sessions.map((session) => {
    const chip = document.createElement("span");
    chip.className = `chip${session.phase === "waiting" ? " waiting" : ""}`;
    chip.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} · ${PHASE_LABEL[session.phase] ?? session.phase}`;
    return chip;
  }));
  sessionsEl.replaceChildren(...current.sessions.map((session) => {
    const card = document.createElement("article");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = `${AGENT_LABEL[session.agent] ?? session.agent} — ${session.project}`;
    const meta = document.createElement("p");
    const minutes = Math.max(0, Math.round((Date.now() - session.startedAt) / 60_000));
    meta.textContent = `${PHASE_LABEL[session.phase] ?? session.phase} · ${minutes} 分鐘`;
    const tool = document.createElement("p");
    tool.className = "tool";
    tool.textContent = session.tool ? `工具：${session.tool}` : "";
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
}

function applySnapshot(snapshot: Snapshot): void {
  current = snapshot;
  renderer.setState(snapshot.pet as PetState);
  renderSessions();
  if (snapshot.activePet !== activeFromServer) {
    activeFromServer = snapshot.activePet;
    void applyPet(snapshot.activePet);
  }
}

function boot(): void {
  applyLayout();
  window.addEventListener("resize", applyLayout);
  renderClock();
  setInterval(() => {
    renderClock();
    renderSessions();
    document.body.classList.toggle("quiet", isQuiet(current?.quietHours ?? null, new Date()));
  }, 1000);

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
    connEl.textContent = status === "open" ? "已連線" : status === "closed" ? "已斷線" : "連線中";
    connEl.dataset.state = status;
  });
  keepAwake((status) => {
    wakeInfo.textContent = `螢幕長亮：${WAKE_LABELS[status]}`;
  });
}

boot();
