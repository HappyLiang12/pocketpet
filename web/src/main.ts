import "./style.css";
import { PetRenderer, type PetState } from "./sprite.js";
import { connectState } from "./ws.js";

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
const canvas = byId<HTMLCanvasElement>("pet");
const renderer = new PetRenderer(canvas);
renderer.start();
let current: Snapshot | null = null;

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

function applySnapshot(snapshot: Snapshot): void {
  current = snapshot;
  renderer.setState(snapshot.pet as PetState);
  renderSessions();
}

function boot(): void {
  applyLayout();
  window.addEventListener("resize", applyLayout);
  renderClock();
  setInterval(() => { renderClock(); renderSessions(); }, 1000);

  fetch("/api/state").then((res) => (res.ok ? res.json() : null)).then((snapshot) => { if (snapshot) applySnapshot(snapshot as Snapshot); }).catch(() => undefined);

  connectState((snapshot) => applySnapshot(snapshot as Snapshot), (status) => {
    connEl.textContent = status === "open" ? "已連線" : status === "closed" ? "已斷線" : "連線中";
    connEl.dataset.state = status;
  });
}

boot();
