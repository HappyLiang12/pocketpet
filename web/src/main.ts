import "./style.css";
import { PetRenderer, type PetState } from "./sprite.js";
import { connectState } from "./ws.js";

interface Session { key: string; agent: string; project: string; phase: string; tool?: string; startedAt: number; lastEventAt: number; }
interface Snapshot { now: number; pet: string; sessions: Session[]; activePet: string | null; sleepAfterMinutes: number; quietHours: { start: string; end: string } | null; }
interface PetSummary { id: string; name: string; spriteUrl: string; }

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
    petList.replaceChildren(...pets.map((pet) => {
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
  } catch {
    return;
  }
}

async function selectPet(id: string): Promise<void> {
  const response = await fetch("/api/active-pet", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  if (!response.ok) return;
  await applyPet(id);
}

async function applyPet(id: string | null): Promise<void> {
  if (pets.length === 0) await loadPets();
  const pet = pets.find((candidate) => candidate.id === id) ?? pets[0];
  petId = pet?.id ?? null;
  stage.dataset.petId = pet?.id ?? "fallback";
  stage.dataset.petReady = "false";
  if (pet) {
    try {
      await renderer.load(pet.spriteUrl);
      stage.dataset.petReady = "true";
    } catch {
      stage.dataset.petReady = "false";
    }
  } else {
    stage.dataset.petReady = "true";
  }
  await loadPets();
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
  setInterval(() => { renderClock(); renderSessions(); }, 1000);

  gear.addEventListener("click", () => {
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) void loadPets();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") drawer.hidden = true; });

  fetch("/api/state").then((res) => (res.ok ? res.json() : null)).then((snapshot) => { if (snapshot) applySnapshot(snapshot as Snapshot); }).catch(() => undefined);

  connectState((snapshot) => applySnapshot(snapshot as Snapshot), (status) => {
    connEl.textContent = status === "open" ? "已連線" : status === "closed" ? "已斷線" : "連線中";
    connEl.dataset.state = status;
  });
}

boot();
